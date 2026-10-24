<script lang="ts">
  /**
   * 3D 检查器（v3.12）：
   * 选中对象摘要、场分析、视图预设、色标、探针、切平面、二重积分与导出。
   * 从 SpacePanel 的长表单中拆出，右侧独立滚动。
   */
  import type { AppStore } from '../state/store'
  import type { AppState, Field3D, SpaceObject, Surface3D } from '../state/types'
  import { COLORMAP_NAMES, sampleColormap, type ColormapName } from '../render3d/colormaps'
  import { compileDerivative, compileExpr } from '../render3d/compile'
  import { tangentPlaneAt } from '../render3d/tangent'
  import { doubleIntegral } from '../math/numeric/double-integral'
  import {
    getCamera,
    getCameraPresetRequest,
    getClipAxis,
    getClipValue,
    getColormapName,
    getContourCount,
    getGifFps,
    getGifFrames,
    getSelectedSpaceId,
    getSpaceRevision,
    getTangentPoint,
    isProbeEnabled,
    isSpaceExporting,
    isTangentEnabled,
    requestCameraPreset,
    requestSpaceExport,
    setCamera,
    setClipAxis,
    setClipValue,
    setColormapName,
    setContourCount,
    setGifFps,
    setGifFrames,
    setIntegralRegion,
    setProbeEnabled,
    setShading,
    setTangentEnabled,
    getShading,
  } from '../state/space-state.svelte'

  let { store }: { store: AppStore } = $props()

  let appState = $state<AppState | null>(null)
  $effect(() => {
    appState = store.getState()
    return store.subscribe((state) => {
      appState = state
    })
  })

  function isSpaceObject(object: { type: string }): boolean {
    return (
      object.type === 'surface3d' ||
      object.type === 'curve3d' ||
      object.type === 'field3d' ||
      object.type === 'ode2d'
    )
  }

  const objects = $derived(
    ((appState?.doc.objects.filter(isSpaceObject) ?? []) as SpaceObject[]).slice().reverse(),
  )
  const selected = $derived(
    objects.find((object) => object.id === getSelectedSpaceId()) ?? objects[0] ?? null,
  )
  const field = $derived(selected && selected.type === 'field3d' ? (selected as Field3D) : null)
  const surface = $derived(
    selected && selected.type === 'surface3d' ? (selected as Surface3D) : null,
  )

  const TYPE_LABELS: Record<string, string> = {
    surface3d: '曲面',
    curve3d: '空间曲线',
    field3d: '向量场',
    ode2d: 'ODE 解',
  }

  function patch(id: string, fields: Record<string, unknown>): void {
    store.updateSpaceObject(id, fields)
  }

  const view = $derived.by(() => {
    void getSpaceRevision()
    void getCameraPresetRequest()
    return {
      camera: getCamera(),
      shading: getShading(),
      colormap: getColormapName(),
      contours: getContourCount(),
      clipAxis: getClipAxis(),
      clipValue: getClipValue(),
      probe: isProbeEnabled(),
    }
  })

  const quality = $derived.by(() => {
    const object = selected
    if (!object) return 'standard'
    if (object.type === 'surface3d') {
      return object.resolution <= 64 ? 'draft' : object.resolution >= 128 ? 'fine' : 'standard'
    }
    if (object.type === 'field3d') {
      return object.divisions <= 5 ? 'draft' : object.divisions >= 10 ? 'fine' : 'standard'
    }
    if (object.type === 'curve3d') {
      return object.steps <= 600 ? 'draft' : object.steps >= 2000 ? 'fine' : 'standard'
    }
    return object.steps <= 250 ? 'draft' : object.steps >= 600 ? 'fine' : 'standard'
  })

  function setQuality(level: 'draft' | 'standard' | 'fine'): void {
    const object = selected
    if (!object) return
    if (object.type === 'surface3d') {
      patch(object.id, { resolution: level === 'draft' ? 48 : level === 'fine' ? 160 : 96 })
    } else if (object.type === 'field3d') {
      patch(object.id, { divisions: level === 'draft' ? 5 : level === 'fine' ? 12 : 8 })
    } else if (object.type === 'curve3d') {
      patch(object.id, { steps: level === 'draft' ? 600 : level === 'fine' ? 2400 : 1200 })
    } else {
      patch(object.id, { steps: level === 'draft' ? 200 : level === 'fine' ? 800 : 400 })
    }
  }

  const colormapGradient = $derived.by(() => {
    const stops: string[] = []
    for (let i = 0; i <= 8; i++) {
      const [r, g, b] = sampleColormap(view.colormap, i / 8)
      stops.push(`rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`)
    }
    return `linear-gradient(90deg, ${stops.join(', ')})`
  })

  const objectColor = $derived(selected && 'color' in selected ? selected.color : '#334155')

  const colorbar = $derived.by(() => {
    // 向量场按 colorMode 独立着色，不受曲面 shading 影响
    if (field) return field.colorMode === 'none' ? objectColor : colormapGradient
    return view.shading === 'solid' ? objectColor : colormapGradient
  })

  const colorbarLabel = $derived.by(() => {
    if (field) {
      if (field.colorMode === 'magnitude') return '低 → 高（|F|）'
      if (field.colorMode === 'divergence') return '低 → 高（∇·F）'
      if (field.colorMode === 'curl') return '低 → 高（|∇×F|）'
      return '单色'
    }
    if (view.shading === 'solid') return '单色'
    if (view.shading === 'normal') return '法向 → RGB'
    return '低 → 高（高度 z）'
  })

  const tangentInfo = $derived.by(() => {
    void getSpaceRevision()
    if (!isTangentEnabled()) return null
    const target = objects.find(
      (object): object is Surface3D =>
        object.type === 'surface3d' && object.kind === 'explicit' && object.visible,
    )
    if (!target) return null
    const f = compileExpr(target.expr, ['x', 'y'])
    const dfx = compileDerivative(target.expr, 'x', ['x', 'y'])
    const dfy = compileDerivative(target.expr, 'y', ['x', 'y'])
    if (!f || !dfx || !dfy) return null
    const [x0, y0] = getTangentPoint()
    try {
      const plane = tangentPlaneAt(
        (x, y) => f(x, y),
        (x, y) => dfx(x, y),
        (x, y) => dfy(x, y),
        x0,
        y0,
      )
      return { surface: target.name, x0, y0, z0: plane.z0, fx: plane.fx, fy: plane.fy }
    } catch {
      return null
    }
  })

  function format(value: number): string {
    if (!Number.isFinite(value)) return '—'
    return Math.abs(value) < 1e5 ? value.toPrecision(5) : value.toExponential(3)
  }

  let integralExpr = $state('x^2 + y^2')
  let integralX0 = $state(-1)
  let integralX1 = $state(1)
  let integralY0 = $state(-1)
  let integralY1 = $state(1)
  let integralMessage = $state('')
  let integralError = $state('')

  function runIntegral(): void {
    integralError = ''
    integralMessage = ''
    const f = compileExpr(integralExpr, ['x', 'y'])
    if (!f) {
      integralError = '表达式无法解析（变量为 x、y）'
      return
    }
    const x0 = Number(integralX0)
    const x1 = Number(integralX1)
    const y0 = Number(integralY0)
    const y1 = Number(integralY1)
    if (![x0, x1, y0, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) {
      integralError = '积分范围需满足 x₁ > x₀ 且 y₁ > y₀'
      return
    }
    const result = doubleIntegral((x, y) => f(x, y), x0, x1, y0, y1)
    setIntegralRegion({ x0, x1, y0, y1 })
    const reliability =
      result.invalidSamples > 0 ? `；${result.invalidSamples} 个采样非有限，结果不可靠` : ''
    integralMessage = `∬f dA ≈ ${format(result.value)}（区域 x∈[${x0}, ${x1}]，y∈[${y0}, ${y1}]；${result.samples} 采样${reliability}）`
  }

  function clearIntegral(): void {
    setIntegralRegion(null)
    integralMessage = ''
    integralError = ''
  }
</script>

<div class="space-inspector" data-testid="space-inspector">
  <section class="group">
    <div class="group-title">选中对象</div>
    {#if selected}
      <div class="object-card">
        <div class="object-name">{selected.name}</div>
        <div class="object-meta">{TYPE_LABELS[selected.type] ?? selected.type}</div>
        <label class="check">
          <input
            type="checkbox"
            data-testid="space-inspect-visible"
            checked={selected.visible}
            onchange={(event) =>
              patch(selected.id, {
                visible: (event.currentTarget as HTMLInputElement).checked,
              })}
          />
          在画布中显示
        </label>
      </div>
    {:else}
      <p class="hint">从左侧添加对象后，这里显示选中对象的属性与分析控制。</p>
    {/if}

    {#if selected}
      <div class="quality-row">
        <span class="dim">质量</span>
        {#each [['draft', '草稿'], ['standard', '标准'], ['fine', '精细']] as [id, label] (id)}
          <button
            type="button"
            class:active={quality === id}
            data-testid={`space-quality-${id}`}
            onclick={() => setQuality(id as 'draft' | 'standard' | 'fine')}>{label}</button
          >
        {/each}
      </div>
    {/if}

    {#if surface?.kind === 'implicit'}
      <label class="slider-row">
        <span>等值面 F =</span>
        <input
          type="range"
          min="-5"
          max="5"
          step="0.1"
          data-testid="space-iso-value"
          value={surface.isoValue ?? 0}
          onchange={(event) =>
            patch(surface.id, {
              isoValue: Number((event.currentTarget as HTMLInputElement).value),
            })}
        />
        <b>{format(surface.isoValue ?? 0)}</b>
      </label>
    {/if}

    {#if field}
      <div class="field-grid">
        <label>
          <span>场着色</span>
          <select
            data-testid="space-inspect-field-colormode"
            value={field.colorMode}
            onchange={(event) =>
              patch(field.id, { colorMode: (event.currentTarget as HTMLSelectElement).value })}
          >
            <option value="none">单色</option>
            <option value="magnitude">模长 |F|</option>
            <option value="divergence">散度 ∇·F</option>
            <option value="curl">旋度 |∇×F|</option>
          </select>
        </label>
        <label>
          <span>箭头密度</span>
          <input
            type="range"
            min="3"
            max="14"
            step="1"
            data-testid="space-inspect-field-divisions"
            value={field.divisions}
            onchange={(event) =>
              patch(field.id, {
                divisions: Number((event.currentTarget as HTMLInputElement).value),
              })}
          />
        </label>
        <label>
          <span>箭头比例</span>
          <input
            type="range"
            min="0.2"
            max="2"
            step="0.05"
            data-testid="space-inspect-field-scale"
            value={field.scale}
            onchange={(event) =>
              patch(field.id, {
                scale: Number((event.currentTarget as HTMLInputElement).value),
              })}
          />
        </label>
        <label>
          <span>流线种子</span>
          <input
            type="range"
            min="0"
            max="40"
            step="1"
            data-testid="space-inspect-field-seeds"
            value={field.streamSeeds}
            onchange={(event) =>
              patch(field.id, {
                streamSeeds: Number((event.currentTarget as HTMLInputElement).value),
              })}
          />
        </label>
      </div>
    {/if}
  </section>

  <section class="group">
    <div class="group-title">视图</div>
    <div class="view-presets">
      {#each [['iso', '等轴'], ['top', '俯视'], ['front', '前视'], ['side', '侧视']] as [preset, label] (preset)}
        <button
          type="button"
          data-testid={`space-view-${preset}`}
          onclick={() => requestCameraPreset(preset as 'iso' | 'top' | 'front' | 'side')}
          >{label}</button
        >
      {/each}
      <button
        type="button"
        data-testid="space-reset-camera"
        onclick={() => requestSpaceExport('reset')}>重置</button
      >
    </div>
    <div class="view-grid">
      <label>
        <span>相机</span>
        <select
          data-testid="space-camera"
          value={view.camera}
          onchange={(event) =>
            setCamera((event.currentTarget as HTMLSelectElement).value as 'persp' | 'ortho')}
        >
          <option value="persp">透视</option>
          <option value="ortho">正交</option>
        </select>
      </label>
      <label>
        <span>着色</span>
        <select
          data-testid="space-shading"
          value={view.shading}
          onchange={(event) =>
            setShading(
              (event.currentTarget as HTMLSelectElement).value as 'solid' | 'height' | 'normal',
            )}
        >
          <option value="solid">单色</option>
          <option value="height">高度</option>
          <option value="normal">法向</option>
        </select>
      </label>
      <label>
        <span>色图</span>
        <select
          data-testid="space-colormap"
          value={view.colormap}
          onchange={(event) =>
            setColormapName((event.currentTarget as HTMLSelectElement).value as ColormapName)}
        >
          {#each COLORMAP_NAMES as name (name)}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </label>
      <label class="slider-label">
        <span>等高线</span>
        <input
          type="range"
          min="0"
          max="12"
          step="1"
          data-testid="space-contours"
          value={view.contours}
          onchange={(event) =>
            setContourCount(Number((event.currentTarget as HTMLInputElement).value))}
        />
        <b>{view.contours === 0 ? '关' : view.contours}</b>
      </label>
    </div>
    <div class="colorbar" data-testid="space-colorbar">
      <div class="colorbar-bar" style:background={colorbar}></div>
      <div class="colorbar-labels"><span>低</span><span>{colorbarLabel}</span><span>高</span></div>
    </div>
  </section>

  <section class="group">
    <div class="group-title">分析</div>
    <div class="clip-row">
      <span>裁剪平面</span>
      <select
        data-testid="space-clip-axis"
        value={view.clipAxis}
        onchange={(event) =>
          setClipAxis((event.currentTarget as HTMLSelectElement).value as 'off' | 'x' | 'y' | 'z')}
      >
        <option value="off">关闭</option>
        <option value="x">x 方向</option>
        <option value="y">y 方向</option>
        <option value="z">z 方向</option>
      </select>
      <input
        type="range"
        min="-10"
        max="10"
        step="0.5"
        data-testid="space-clip-value"
        value={view.clipValue}
        disabled={view.clipAxis === 'off'}
        onchange={(event) => setClipValue(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <b>{view.clipValue.toFixed(1)}</b>
    </div>
    <label class="check">
      <input
        type="checkbox"
        data-testid="space-probe-toggle"
        checked={view.probe}
        onchange={(event) => setProbeEnabled((event.currentTarget as HTMLInputElement).checked)}
      />
      画布探针（悬停曲面读取三维坐标）
    </label>
    <label class="check">
      <input
        type="checkbox"
        data-testid="space-tangent"
        checked={isTangentEnabled()}
        onchange={(event) => setTangentEnabled((event.currentTarget as HTMLInputElement).checked)}
      />
      切平面（曲面上拖动移动切点）
    </label>
    {#if tangentInfo}
      <div class="readout" data-testid="tangent-readout">
        <div class="dim">切点（{tangentInfo.surface}）</div>
        <div>f({format(tangentInfo.x0)}, {format(tangentInfo.y0)}) = {format(tangentInfo.z0)}</div>
        <div data-testid="tangent-dx">∂f/∂x = {format(tangentInfo.fx)}</div>
        <div data-testid="tangent-dy">∂f/∂y = {format(tangentInfo.fy)}</div>
      </div>
    {/if}
  </section>

  <section class="group">
    <div class="group-title">二重积分 ∬f dA</div>
    <label class="input-row">
      <span>f(x, y) =</span>
      <input
        type="text"
        data-testid="integral-f"
        placeholder="如 x^2 + y^2"
        bind:value={integralExpr}
      />
    </label>
    <div class="range-row">
      <span>x ∈</span>
      <input type="number" step="any" data-testid="integral-x0" bind:value={integralX0} />
      <span>～</span>
      <input type="number" step="any" data-testid="integral-x1" bind:value={integralX1} />
      <span>y ∈</span>
      <input type="number" step="any" data-testid="integral-y0" bind:value={integralY0} />
      <span>～</span>
      <input type="number" step="any" data-testid="integral-y1" bind:value={integralY1} />
    </div>
    <div class="button-row">
      <button type="button" data-testid="integral-run" onclick={runIntegral}>计算</button>
      <button type="button" data-testid="integral-clear" onclick={clearIntegral}>清除</button>
    </div>
    {#if integralError}
      <div class="error" data-testid="integral-error">{integralError}</div>
    {/if}
    {#if integralMessage}
      <div class="readout" data-testid="integral-result">{integralMessage}</div>
    {/if}
  </section>

  <section class="group">
    <div class="group-title">导出</div>
    <div class="slider-row">
      <span>GIF 帧数</span>
      <input
        type="range"
        min="12"
        max="72"
        step="4"
        data-testid="space-gif-frames"
        value={getGifFrames()}
        oninput={(event) => setGifFrames(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <b>{getGifFrames()}</b>
    </div>
    <div class="slider-row">
      <span>播放速度</span>
      <input
        type="range"
        min="2"
        max="30"
        step="1"
        data-testid="space-gif-fps"
        value={getGifFps()}
        oninput={(event) => setGifFps(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <b>{getGifFps()} fps</b>
    </div>
    <div class="button-row">
      <button
        type="button"
        data-testid="space-export-png"
        disabled={isSpaceExporting()}
        onclick={() => requestSpaceExport('png')}>截图 PNG</button
      >
      <button
        type="button"
        data-testid="space-export-gif"
        disabled={isSpaceExporting()}
        onclick={() => requestSpaceExport('gif')}
        >{isSpaceExporting() ? '导出中…' : '旋转 GIF'}</button
      >
    </div>
  </section>
</div>

<style>
  .space-inspector {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--bg-panel);
  }

  .group-title {
    color: var(--text-dim);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .object-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .object-name {
    font-weight: 650;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .object-meta,
  .dim {
    color: var(--text-dim);
    font-size: 11px;
  }

  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.5;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
  }

  .clip-row {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-dim);
    font-size: 11px;
  }

  .clip-row select {
    flex: 0 0 auto;
  }

  .clip-row input[type='range'] {
    flex: 1;
    min-width: 0;
  }

  .clip-row b {
    min-width: 30px;
    color: var(--text);
    text-align: right;
  }

  .check input {
    width: 13px;
    height: 13px;
    margin: 0;
  }

  .quality-row,
  .view-presets,
  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  button {
    font: inherit;
    font-size: 11px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }

  button:hover:not(:disabled),
  button.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }

  button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .view-grid,
  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .view-grid label,
  .field-grid label,
  .input-row,
  .slider-row,
  .slider-label {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    color: var(--text-dim);
    font-size: 11px;
  }

  .view-grid label,
  .field-grid label {
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
  }

  select,
  input[type='text'],
  input[type='number'] {
    min-width: 0;
    padding: 4px 5px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 11px;
  }

  input[type='range'] {
    min-width: 0;
    flex: 1;
  }

  .slider-label b,
  .slider-row b {
    min-width: 30px;
    color: var(--text);
    font-weight: 600;
    text-align: right;
  }

  .colorbar {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .colorbar-bar {
    height: 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  .colorbar-labels {
    display: flex;
    justify-content: space-between;
    color: var(--text-dim);
    font-size: 10px;
  }

  .range-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 14px minmax(0, 1fr);
    align-items: center;
    gap: 4px 5px;
    color: var(--text-dim);
    font-size: 11px;
  }

  .range-row input {
    width: 100%;
  }

  .readout {
    padding: 6px 8px;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 7px;
    background: var(--accent-soft);
    font-size: 11px;
    line-height: 1.6;
  }

  .error {
    color: var(--danger);
    font-size: 11px;
    line-height: 1.4;
  }
</style>
