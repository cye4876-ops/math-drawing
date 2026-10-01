<script lang="ts">
  /**
   * 3D 与场面板（v0.8）：对象添加（预设）、列表、参数编辑、视图选项（相机/着色/色图/等高线）、
   * 切平面控制与读数（偏导来自符号求导）、导出（PNG / 旋转 GIF）。
   */
  import type { AppStore } from '../state/store'
  import type { AppState, Curve3D, Field3D, Ode2D, SpaceObject, Surface3D } from '../state/types'
  import { COLORMAP_NAMES, type ColormapName } from '../render3d/colormaps'
  import {
    CURVE3D_PRESETS,
    FIELD3D_PRESETS,
    ODE2D_PRESETS,
    SURFACE_PRESETS,
    createCurve3D,
    createField3D,
    createOde2D,
    createSurface3D,
  } from '../render3d/objects'
  import { compileDerivative, compileExpr } from '../render3d/compile'
  import { tangentPlaneAt } from '../render3d/tangent'
  import {
    getCamera,
    getColormapName,
    getContourCount,
    getGifFps,
    getGifFrames,
    getShading,
    getSpaceRevision,
    getTangentPoint,
    isSpaceExporting,
    isTangentEnabled,
    requestSpaceExport,
    setCamera,
    setColormapName,
    setContourCount,
    setGifFps,
    setGifFrames,
    setShading,
    setTangentEnabled,
  } from '../state/space-state.svelte'

  let { store }: { store: AppStore } = $props()

  // store 为普通类：订阅驱动响应（同其他面板模式）
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

  let selectedId = $state<string | null>(null)
  const selected = $derived(
    objects.find((object) => object.id === selectedId) ?? objects[0] ?? null,
  )

  // ---------- 添加 ----------
  let addKind = $state<'surface' | 'curve' | 'field' | 'ode'>('surface')
  let presetIndex = $state(0)

  const presetLabels = $derived.by(() => {
    if (addKind === 'surface') return SURFACE_PRESETS.map((preset) => preset.label)
    if (addKind === 'curve') return CURVE3D_PRESETS.map((preset) => preset.label)
    if (addKind === 'field') return FIELD3D_PRESETS.map((preset) => preset.label)
    return ODE2D_PRESETS.map((preset) => preset.label)
  })

  function addSelected(): void {
    const index = Math.min(presetIndex, presetLabels.length - 1)
    let created: SpaceObject | null = null
    if (addKind === 'surface') {
      const preset = SURFACE_PRESETS[index]
      if (preset) created = store.addSpaceObject(createSurface3D(preset.surface))
    } else if (addKind === 'curve') {
      const preset = CURVE3D_PRESETS[index]
      if (preset) created = store.addSpaceObject(createCurve3D(preset.curve))
    } else if (addKind === 'field') {
      const preset = FIELD3D_PRESETS[index]
      if (preset) created = store.addSpaceObject(createField3D(preset.field))
    } else {
      const preset = ODE2D_PRESETS[index]
      if (preset) created = store.addSpaceObject(createOde2D(preset.ode))
    }
    if (created) selectedId = created.id
  }

  function patch(id: string, patchFields: Record<string, unknown>): void {
    store.updateSpaceObject(id, patchFields)
  }

  function numberValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value)
  }

  // ---------- 切平面读数（偏导 = 符号求导） ----------
  const tangentInfo = $derived.by(() => {
    void getSpaceRevision()
    if (!isTangentEnabled()) return null
    const surface = objects.find(
      (object): object is Surface3D =>
        object.type === 'surface3d' && object.kind === 'explicit' && object.visible,
    )
    if (!surface) return null
    const f = compileExpr(surface.expr, ['x', 'y'])
    const dfx = compileDerivative(surface.expr, 'x', ['x', 'y'])
    const dfy = compileDerivative(surface.expr, 'y', ['x', 'y'])
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
      return { surface: surface.name, x0, y0, z0: plane.z0, fx: plane.fx, fy: plane.fy }
    } catch {
      return null
    }
  })

  function format(value: number): string {
    if (!Number.isFinite(value)) return '—'
    return Math.abs(value) < 1e5 ? value.toPrecision(5) : value.toExponential(3)
  }
</script>

<aside class="space-panel" data-testid="space-panel">
  <div class="section-title">3D 与场</div>

  <div class="section">
    <div class="row">
      <select
        data-testid="space-add-kind"
        value={addKind}
        onchange={(event) => {
          addKind = (event.currentTarget as HTMLSelectElement).value as typeof addKind
          presetIndex = 0
        }}
      >
        <option value="surface">曲面</option>
        <option value="curve">空间曲线</option>
        <option value="field">向量场</option>
        <option value="ode">ODE 解曲线</option>
      </select>
      <select
        data-testid="space-add-preset"
        value={presetIndex}
        onchange={(event) =>
          (presetIndex = Number((event.currentTarget as HTMLSelectElement).value))}
      >
        {#each presetLabels as label, index (label)}
          <option value={index}>{label}</option>
        {/each}
      </select>
      <button type="button" data-testid="space-add" onclick={addSelected}>添加</button>
    </div>
  </div>

  <div class="section">
    <div class="section-title">对象</div>
    {#if objects.length === 0}
      <div class="hint" data-testid="space-empty">
        暂无 3D 对象：从上方预设添加（曲面 / 曲线 / 场 / ODE）
      </div>
    {:else}
      <div class="object-list" data-testid="space-object-list">
        {#each objects as object, index (object.id)}
          <div class="object-row" class:selected={selected?.id === object.id}>
            <input
              type="checkbox"
              checked={object.visible}
              data-testid={`space-visible-${index}`}
              title="显示/隐藏"
              onchange={(event) =>
                patch(object.id, { visible: (event.currentTarget as HTMLInputElement).checked })}
            />
            <button
              type="button"
              class="object-name"
              data-testid={`space-object-${index}`}
              onclick={() => (selectedId = object.id)}
            >
              <span class="badge"
                >{object.type === 'surface3d'
                  ? '面'
                  : object.type === 'curve3d'
                    ? '线'
                    : object.type === 'field3d'
                      ? '场'
                      : 'ODE'}</span
              >
              {object.name}
            </button>
            <button
              type="button"
              class="remove"
              data-testid={`space-remove-${index}`}
              onclick={() => {
                if (selectedId === object.id) selectedId = null
                store.removeSpaceObject(object.id)
              }}>×</button
            >
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if selected}
    <div class="section">
      <div class="section-title">参数</div>
      {#if selected.type === 'surface3d'}
        {@const surface = selected as Surface3D}
        <div class="row">
          <span class="dim">f</span>
          <input
            class="expr"
            data-testid="space-expr"
            value={surface.expr}
            onchange={(event) =>
              patch(surface.id, { expr: (event.currentTarget as HTMLInputElement).value })}
          />
        </div>
        {#if surface.kind === 'parametric'}
          <div class="row">
            <span class="dim">y(u,v)</span>
            <input
              class="expr"
              data-testid="space-expr2"
              value={surface.expr2 ?? ''}
              onchange={(event) =>
                patch(surface.id, { expr2: (event.currentTarget as HTMLInputElement).value })}
            />
          </div>
          <div class="row">
            <span class="dim">z(u,v)</span>
            <input
              class="expr"
              data-testid="space-expr3"
              value={surface.expr3 ?? ''}
              onchange={(event) =>
                patch(surface.id, { expr3: (event.currentTarget as HTMLInputElement).value })}
            />
          </div>
        {/if}
        {#if surface.kind !== 'polyhedron'}
          <div class="row">
            <span class="dim">范围</span>
            <input
              type="number"
              step="0.5"
              data-testid="space-xmin"
              value={surface.xMin}
              onchange={(event) => patch(surface.id, { xMin: numberValue(event) })}
            />
            <input
              type="number"
              step="0.5"
              data-testid="space-xmax"
              value={surface.xMax}
              onchange={(event) => patch(surface.id, { xMax: numberValue(event) })}
            />
            <input
              type="number"
              step="0.5"
              data-testid="space-ymin"
              value={surface.yMin}
              onchange={(event) => patch(surface.id, { yMin: numberValue(event) })}
            />
            <input
              type="number"
              step="0.5"
              data-testid="space-ymax"
              value={surface.yMax}
              onchange={(event) => patch(surface.id, { yMax: numberValue(event) })}
            />
          </div>
        {/if}
        <div class="row">
          <span class="dim">分辨率</span>
          <input
            type="range"
            min="8"
            max="256"
            step="4"
            data-testid="space-resolution"
            value={surface.resolution}
            onchange={(event) => patch(surface.id, { resolution: numberValue(event) })}
          />
          <span class="value">{surface.resolution}</span>
        </div>
        <div class="row">
          <span class="dim">透明度</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            data-testid="space-opacity"
            value={surface.opacity}
            onchange={(event) => patch(surface.id, { opacity: numberValue(event) })}
          />
          <input
            type="color"
            data-testid="space-color"
            value={surface.color}
            onchange={(event) =>
              patch(surface.id, { color: (event.currentTarget as HTMLInputElement).value })}
          />
        </div>
      {:else if selected.type === 'curve3d'}
        {@const curve = selected as Curve3D}
        {#if curve.kind === 'parametric'}
          <div class="row">
            <span class="dim">x(t)</span>
            <input
              class="expr"
              data-testid="space-curve-expr"
              value={curve.expr}
              onchange={(event) =>
                patch(curve.id, { expr: (event.currentTarget as HTMLInputElement).value })}
            />
          </div>
          <div class="row">
            <span class="dim">y(t)</span>
            <input
              class="expr"
              data-testid="space-curve-expr2"
              value={curve.expr2 ?? ''}
              onchange={(event) =>
                patch(curve.id, { expr2: (event.currentTarget as HTMLInputElement).value })}
            />
          </div>
          <div class="row">
            <span class="dim">z(t)</span>
            <input
              class="expr"
              data-testid="space-curve-expr3"
              value={curve.expr3 ?? ''}
              onchange={(event) =>
                patch(curve.id, { expr3: (event.currentTarget as HTMLInputElement).value })}
            />
          </div>
          <div class="row">
            <span class="dim">t ∈</span>
            <input
              type="number"
              step="0.5"
              data-testid="space-tmin"
              value={curve.tMin}
              onchange={(event) => patch(curve.id, { tMin: numberValue(event) })}
            />
            <input
              type="number"
              step="0.5"
              data-testid="space-tmax"
              value={curve.tMax}
              onchange={(event) => patch(curve.id, { tMax: numberValue(event) })}
            />
          </div>
        {/if}
        <div class="row">
          <span class="dim">采样/步数</span>
          <input
            type="number"
            min="10"
            max="80000"
            step="50"
            data-testid="space-curve-steps"
            value={curve.steps}
            onchange={(event) => patch(curve.id, { steps: numberValue(event) })}
          />
        </div>
      {:else if selected.type === 'field3d'}
        {@const field = selected as Field3D}
        <div class="row">
          <span class="dim">空间</span>
          <select
            data-testid="space-field-space"
            value={field.space}
            onchange={(event) =>
              patch(field.id, { space: (event.currentTarget as HTMLSelectElement).value })}
          >
            <option value="space">3D 场</option>
            <option value="plane">平面场（z = 0）</option>
          </select>
          <span class="dim">着色</span>
          <select
            data-testid="space-field-colormode"
            value={field.colorMode}
            onchange={(event) =>
              patch(field.id, { colorMode: (event.currentTarget as HTMLSelectElement).value })}
          >
            <option value="none">无（单色）</option>
            <option value="divergence">散度 ∇·F</option>
            <option value="curl">旋度 |∇×F|</option>
          </select>
        </div>
        <div class="row">
          <span class="dim">F</span>
          <input
            class="expr"
            data-testid="space-field-expr"
            value={field.expr}
            onchange={(event) =>
              patch(field.id, { expr: (event.currentTarget as HTMLInputElement).value })}
          />
          <input
            class="expr"
            data-testid="space-field-expr2"
            value={field.expr2 ?? ''}
            onchange={(event) =>
              patch(field.id, { expr2: (event.currentTarget as HTMLInputElement).value })}
          />
          {#if field.space === 'space'}
            <input
              class="expr"
              data-testid="space-field-expr3"
              value={field.expr3 ?? ''}
              onchange={(event) =>
                patch(field.id, { expr3: (event.currentTarget as HTMLInputElement).value })}
            />
          {/if}
        </div>
        <div class="row">
          <span class="dim">范围</span>
          <input
            type="number"
            step="0.5"
            data-testid="space-field-xmin"
            value={field.xMin}
            onchange={(event) => patch(field.id, { xMin: numberValue(event) })}
          />
          <input
            type="number"
            step="0.5"
            data-testid="space-field-xmax"
            value={field.xMax}
            onchange={(event) => patch(field.id, { xMax: numberValue(event) })}
          />
          <input
            type="number"
            step="0.5"
            data-testid="space-field-ymin"
            value={field.yMin}
            onchange={(event) => patch(field.id, { yMin: numberValue(event) })}
          />
          <input
            type="number"
            step="0.5"
            data-testid="space-field-ymax"
            value={field.yMax}
            onchange={(event) => patch(field.id, { yMax: numberValue(event) })}
          />
        </div>
        <div class="row">
          <span class="dim">每轴箭头</span>
          <input
            type="range"
            min="2"
            max="20"
            step="1"
            data-testid="space-field-divisions"
            value={field.divisions}
            onchange={(event) => patch(field.id, { divisions: numberValue(event) })}
          />
          <span class="value">{field.divisions}</span>
          <span class="dim">长度</span>
          <input
            type="range"
            min="0.3"
            max="3"
            step="0.1"
            data-testid="space-field-scale"
            value={field.scale}
            onchange={(event) => patch(field.id, { scale: numberValue(event) })}
          />
        </div>
        <div class="row">
          <span class="dim">流线种子</span>
          <input
            type="range"
            min="0"
            max="36"
            step="1"
            data-testid="space-field-streamseeds"
            value={field.streamSeeds}
            onchange={(event) => patch(field.id, { streamSeeds: numberValue(event) })}
          />
          <span class="value">{field.streamSeeds}</span>
        </div>
      {:else}
        {@const ode = selected as Ode2D}
        <div class="row">
          <span class="dim">y′ = f(x, y)</span>
          <input
            class="expr"
            data-testid="space-ode-expr"
            value={ode.expr}
            onchange={(event) =>
              patch(ode.id, { expr: (event.currentTarget as HTMLInputElement).value })}
          />
        </div>
        <div class="row">
          <span class="dim">初值</span>
          <input
            type="number"
            step="0.1"
            data-testid="space-ode-x0"
            value={ode.x0}
            onchange={(event) => patch(ode.id, { x0: numberValue(event) })}
          />
          <input
            type="number"
            step="0.1"
            data-testid="space-ode-y0"
            value={ode.y0}
            onchange={(event) => patch(ode.id, { y0: numberValue(event) })}
          />
          <span class="dim">到 x =</span>
          <input
            type="number"
            step="0.5"
            data-testid="space-ode-xend"
            value={ode.xEnd}
            onchange={(event) => patch(ode.id, { xEnd: numberValue(event) })}
          />
        </div>
        <div class="row">
          <span class="dim">步数</span>
          <input
            type="number"
            min="2"
            max="2000"
            step="1"
            data-testid="space-ode-steps"
            value={ode.steps}
            onchange={(event) => patch(ode.id, { steps: numberValue(event) })}
          />
          <label class="check">
            <input
              type="checkbox"
              data-testid="space-ode-dirfield"
              checked={ode.directionField}
              onchange={(event) =>
                patch(ode.id, {
                  directionField: (event.currentTarget as HTMLInputElement).checked,
                })}
            />
            方向场
          </label>
        </div>
      {/if}
    </div>
  {/if}

  <div class="section">
    <div class="section-title">视图</div>
    <div class="row">
      <span class="dim">相机</span>
      <select
        data-testid="space-camera"
        value={getCamera()}
        onchange={(event) =>
          setCamera((event.currentTarget as HTMLSelectElement).value as 'persp' | 'ortho')}
      >
        <option value="persp">透视</option>
        <option value="ortho">正交</option>
      </select>
      <span class="dim">着色</span>
      <select
        data-testid="space-shading"
        value={getShading()}
        onchange={(event) =>
          setShading(
            (event.currentTarget as HTMLSelectElement).value as 'solid' | 'height' | 'normal',
          )}
      >
        <option value="solid">单色</option>
        <option value="height">高度（z 值 × 色图）</option>
        <option value="normal">法向</option>
      </select>
      <select
        data-testid="space-colormap"
        value={getColormapName()}
        onchange={(event) =>
          setColormapName((event.currentTarget as HTMLSelectElement).value as ColormapName)}
      >
        {#each COLORMAP_NAMES as name (name)}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </div>
    <div class="row">
      <span class="dim">等高线</span>
      <input
        type="range"
        min="0"
        max="12"
        step="1"
        data-testid="space-contours"
        value={getContourCount()}
        onchange={(event) =>
          setContourCount(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <span class="value">{getContourCount() === 0 ? '关' : getContourCount()}</span>
    </div>
    <div class="row">
      <label class="check">
        <input
          type="checkbox"
          data-testid="space-tangent"
          checked={isTangentEnabled()}
          onchange={(event) => setTangentEnabled((event.currentTarget as HTMLInputElement).checked)}
        />
        切平面
      </label>
      <button
        type="button"
        data-testid="space-reset-camera"
        onclick={() => requestSpaceExport('reset')}
      >
        重置视角
      </button>
    </div>
    {#if tangentInfo}
      <div class="tangent-readout" data-testid="tangent-readout">
        <div class="dim">切点（{tangentInfo.surface}）</div>
        <div>f({format(tangentInfo.x0)}, {format(tangentInfo.y0)}) = {format(tangentInfo.z0)}</div>
        <div data-testid="tangent-dx">∂f/∂x = {format(tangentInfo.fx)}</div>
        <div data-testid="tangent-dy">∂f/∂y = {format(tangentInfo.fy)}</div>
      </div>
    {/if}
  </div>

  <div class="section">
    <div class="row">
      <span class="dim">GIF 帧数</span>
      <input
        type="range"
        min="12"
        max="72"
        step="4"
        data-testid="space-gif-frames"
        value={getGifFrames()}
        oninput={(event) => setGifFrames(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <span class="value">{getGifFrames()}</span>
      <span class="dim">播放速度</span>
      <input
        type="range"
        min="2"
        max="30"
        step="1"
        data-testid="space-gif-fps"
        value={getGifFps()}
        oninput={(event) => setGifFps(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <span class="value">{getGifFps()} fps</span>
    </div>
    <div class="row">
      <button
        type="button"
        data-testid="space-export-png"
        disabled={isSpaceExporting()}
        onclick={() => requestSpaceExport('png')}
      >
        截图 PNG
      </button>
      <button
        type="button"
        data-testid="space-export-gif"
        disabled={isSpaceExporting()}
        onclick={() => requestSpaceExport('gif')}
      >
        {isSpaceExporting() ? '导出中…' : '旋转 GIF'}
      </button>
      {#if isSpaceExporting()}
        <span class="dim">正在取帧，完成后自动恢复视角</span>
      {/if}
    </div>
  </div>
</aside>

<style>
  .space-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-title {
    font-size: 12px;
    color: var(--text-dim);
    margin-top: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
  }

  .dim {
    color: var(--text-dim);
  }

  .value {
    font-variant-numeric: tabular-nums;
    min-width: 28px;
  }

  input.expr {
    flex: 1;
    min-width: 90px;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
  }

  input[type='number'] {
    width: 62px;
  }

  .object-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 150px;
    overflow: auto;
  }

  .object-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .object-row.selected .object-name {
    border-color: var(--accent);
    color: var(--accent);
  }

  .object-name {
    flex: 1;
    text-align: left;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: #e2e8f0;
    color: #475569;
  }

  .remove {
    color: #b91c1c;
    padding: 0 6px;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .tangent-readout {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    background: #fffbeb;
  }

  .hint {
    font-size: 12px;
    color: var(--text-dim);
  }
</style>
