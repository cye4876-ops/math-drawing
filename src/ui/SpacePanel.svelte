<script lang="ts">
  /**
   * 3D 与场面板（v0.8）：对象添加（预设）、列表、参数编辑、视图选项（相机/着色/色图/等高线）、
   * 切平面控制与读数（偏导来自符号求导）、导出（PNG / 旋转 GIF）。
   */
  import type { AppStore } from '../state/store'
  import { tick } from 'svelte'
  import type {
    AppState,
    Curve3D,
    DocState,
    Field3D,
    Ode2D,
    SceneObject,
    SpaceObject,
    Surface3D,
  } from '../state/types'
  import {
    CURVE3D_PRESETS,
    FIELD3D_PRESETS,
    ODE2D_PRESETS,
    SURFACE_PRESETS,
    createCurve3D,
    createField3D,
    createOde2D,
    createSurface3D,
    getPresetDefinition,
    presetBinding,
    presetDefaults,
    type PresetDefinition,
  } from '../render3d/objects'
  import { probeImplicitSurface } from '../render3d/implicit-probe'
  import { parseSpaceEquation } from '../core/space-equation'
  import { setSelectedSpaceId } from '../state/space-state.svelte'

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
  $effect(() => {
    setSelectedSpaceId(selected?.id ?? null)
  })

  /** v3.1.3：选中隐式曲面时探测 F = 0 在范围内是否有解（空曲面警告） */
  const implicitProbe = $derived.by(() => {
    const object = selected
    if (!object || object.type !== 'surface3d' || object.kind !== 'implicit') return null
    return probeImplicitSurface(object.expr, {
      xMin: object.xMin,
      xMax: object.xMax,
      yMin: object.yMin,
      yMax: object.yMax,
      zMin: object.zMin,
      zMax: object.zMax,
    })
  })

  // ---------- 添加 ----------
  let addKind = $state<'surface' | 'curve' | 'field' | 'ode' | 'custom'>('surface')
  let presetId = $state('')

  /** v3.1.1：自定义方程输入与实时识别结果 */
  let customInput = $state('')
  let customInputEl: HTMLInputElement | null = $state(null)
  const customResult = $derived(
    addKind === 'custom' && customInput.trim() !== '' ? parseSpaceEquation(customInput) : null,
  )

  /** v3.1.2：快捷输入（同 2D 曲线面板；inside=true 时光标置于括号内） */
  const CUSTOM_FN_SNIPPETS: { key: string; label: string; text: string; inside: boolean }[] = [
    { key: 'sin', label: 'sin()', text: 'sin()', inside: true },
    { key: 'cos', label: 'cos()', text: 'cos()', inside: true },
    { key: 'tan', label: 'tan()', text: 'tan()', inside: true },
    { key: 'ln', label: 'ln()', text: 'ln()', inside: true },
    { key: 'exp', label: 'exp()', text: 'exp()', inside: true },
    { key: 'sqrt', label: '√', text: 'sqrt()', inside: true },
    { key: 'abs', label: '|x|', text: 'abs()', inside: true },
    { key: 'pow2', label: 'x²', text: '^2', inside: false },
    { key: 'pi', label: 'π', text: 'pi', inside: false },
  ]

  const CUSTOM_VAR_SNIPPETS: { key: string; label: string; title: string; text: string }[] = [
    { key: 'x', label: 'x', title: '变量 x', text: 'x' },
    { key: 'y', label: 'y', title: '变量 y', text: 'y' },
    { key: 'z', label: 'z', title: '变量 z（隐式曲面）', text: 'z' },
    { key: 'u', label: 'u', title: '参数曲面参数 u', text: 'u' },
    { key: 'v', label: 'v', title: '参数曲面参数 v', text: 'v' },
    { key: 't', label: 't', title: '空间曲线参数 t', text: 't' },
    { key: 'semi', label: '；分段', title: '分号分隔 x=f(t); y=g(t); z=h(t)', text: '; ' },
  ]

  async function insertCustomSnippet(text: string, inside: boolean): Promise<void> {
    const target = customInputEl
    if (!target) return
    const start = target.selectionStart ?? customInput.length
    const end = target.selectionEnd ?? start
    customInput = customInput.slice(0, start) + text + customInput.slice(end)
    await tick()
    target.focus()
    const caret = start + (inside ? text.length - 1 : text.length)
    target.setSelectionRange(caret, caret)
  }

  const presetOptions = $derived.by((): { id: string; label: string }[] => {
    if (addKind === 'surface')
      return SURFACE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))
    if (addKind === 'curve')
      return CURVE3D_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))
    if (addKind === 'field')
      return FIELD3D_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))
    return ODE2D_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))
  })

  /** 当前选中的预设 id（切换类别后回落该类第一个） */
  const effectivePresetId = $derived(
    presetOptions.some((option) => option.id === presetId)
      ? presetId
      : (presetOptions[0]?.id ?? ''),
  )

  function addSelected(): void {
    if (addKind === 'custom') {
      const resolved = parseSpaceEquation(customInput)
      if (!resolved.ok) return
      const created =
        resolved.target === 'surface'
          ? store.addSpaceObject(createSurface3D(resolved.fields))
          : store.addSpaceObject(createCurve3D(resolved.fields))
      selectedId = created.id
      customInput = ''
      return
    }
    const id = effectivePresetId
    let created: SpaceObject | null = null
    if (addKind === 'surface') {
      const preset = SURFACE_PRESETS.find((item) => item.id === id)
      if (preset) {
        const binding = presetBinding(preset)
        created = store.addSpaceObject(
          createSurface3D({
            ...preset.surface(presetDefaults(preset.params)),
            ...(binding ? { template: binding } : {}),
          }),
        )
      }
    } else if (addKind === 'curve') {
      const preset = CURVE3D_PRESETS.find((item) => item.id === id)
      if (preset) {
        const binding = presetBinding(preset)
        created = store.addSpaceObject(
          createCurve3D({
            ...preset.curve(presetDefaults(preset.params)),
            ...(binding ? { template: binding } : {}),
          }),
        )
      }
    } else if (addKind === 'field') {
      const preset = FIELD3D_PRESETS.find((item) => item.id === id)
      if (preset) {
        const binding = presetBinding(preset)
        created = store.addSpaceObject(
          createField3D({
            ...preset.field(presetDefaults(preset.params)),
            ...(binding ? { template: binding } : {}),
          }),
        )
      }
    } else {
      const preset = ODE2D_PRESETS.find((item) => item.id === id)
      if (preset) created = store.addSpaceObject(createOde2D(preset.ode()))
    }
    if (created) selectedId = created.id
  }

  function patch(id: string, patchFields: Record<string, unknown>): void {
    store.updateSpaceObject(id, patchFields)
  }

  function numberValue(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value)
  }

  // ---------- 预设参数滑块（拖动 preview，松手一步撤销） ----------
  const selectedTemplate = $derived.by(() => {
    const object = selected
    if (!object || !('template' in object) || !object.template) return null
    return object.template
  })

  const selectedDefinition = $derived.by(() => {
    const object = selected
    if (!object || !selectedTemplate) return null
    return getPresetDefinition(object.type, selectedTemplate.presetId)
  })

  let paramBefore: DocState | null = null

  function onParamInput(
    objectId: string,
    definition: PresetDefinition,
    key: string,
    value: number,
  ): void {
    const object = objects.find((item) => item.id === objectId)
    if (!object || !('template' in object) || !object.template) return
    if (paramBefore === null) paramBefore = store.getDoc()
    const params = { ...object.template.params, [key]: value }
    const generated = definition.generate(params)
    const binding = { presetId: definition.id, params }
    store.preview((doc) => ({
      objects: doc.objects.map((current) =>
        current.id === objectId
          ? ({ ...current, ...generated, template: binding } as unknown as SceneObject)
          : current,
      ),
    }))
  }

  /** 参数拖动结束：把拖动前快照追认为一步撤销 */
  function onParamCommit(): void {
    if (paramBefore !== null) {
      store.commitPreview(paramBefore)
      paramBefore = null
    }
  }

  function formatParam(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toPrecision(4)
  }

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
          presetId = ''
        }}
      >
        <option value="surface">曲面</option>
        <option value="curve">空间曲线</option>
        <option value="field">向量场</option>
        <option value="ode">ODE 解曲线</option>
        <option value="custom">自定义方程（自动识别）</option>
      </select>
      {#if addKind === 'custom'}
        <input
          class="custom-input"
          data-testid="space-custom-input"
          type="text"
          placeholder="如 z = x^2 − y^2 、x^2 + y^2 + z^2 = 1 、x = cos(t); y = sin(t); z = t/5"
          bind:value={customInput}
          bind:this={customInputEl}
          onkeydown={(event) => {
            if (event.key === 'Enter') addSelected()
          }}
        />
      {:else}
        <select
          data-testid="space-add-preset"
          value={effectivePresetId}
          onchange={(event) => (presetId = (event.currentTarget as HTMLSelectElement).value)}
        >
          {#each presetOptions as option (option.id)}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select>
      {/if}
      <button type="button" class="btn-primary" data-testid="space-add" onclick={addSelected}
        >添加</button
      >
    </div>
    {#if addKind === 'custom'}
      <div class="fn-chips" role="group" aria-label="常用函数快捷插入">
        {#each CUSTOM_FN_SNIPPETS as snippet (snippet.key)}
          <button
            type="button"
            class="fn-chip"
            data-testid={`space-fn-chip-${snippet.key}`}
            title={`插入 ${snippet.text}`}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => void insertCustomSnippet(snippet.text, snippet.inside)}
            >{snippet.label}</button
          >
        {/each}
      </div>
      <div class="fn-chips" role="group" aria-label="变量与分隔符快捷插入">
        {#each CUSTOM_VAR_SNIPPETS as snippet (snippet.key)}
          <button
            type="button"
            class="fn-chip"
            data-testid={`space-var-chip-${snippet.key}`}
            title={snippet.title}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => void insertCustomSnippet(snippet.text, false)}>{snippet.label}</button
          >
        {/each}
      </div>
    {/if}
    {#if addKind === 'custom' && customResult}
      {#if customResult.ok}
        <div class="custom-note" data-testid="space-custom-note">✓ {customResult.note}</div>
      {:else}
        <div class="custom-error" data-testid="space-custom-note">✗ {customResult.error}</div>
      {/if}
    {/if}
  </div>

  <div class="section">
    <div class="section-title">对象</div>
    {#if objects.length === 0}
      <div class="hint" data-testid="space-empty">
        暂无 3D 对象：从上方预设添加（曲面 / 曲线 / 场 / ODE），或选「自定义方程」直接粘贴方程
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
            <span class="badge"
              >{object.type === 'surface3d'
                ? '面'
                : object.type === 'curve3d'
                  ? '线'
                  : object.type === 'field3d'
                    ? '场'
                    : 'ODE'}</span
            >
            <input
              class="object-name"
              data-testid={`space-object-${index}`}
              value={object.name}
              title="点击选中对象；名称可直接编辑"
              onfocus={() => (selectedId = object.id)}
              onclick={() => (selectedId = object.id)}
              onchange={(event) =>
                patch(object.id, { name: (event.currentTarget as HTMLInputElement).value })}
            />
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
      {#if selectedTemplate && selectedDefinition?.params && selectedDefinition.params.length > 0}
        <div class="section-title">预设参数（{selectedDefinition.label}）</div>
        {#each selectedDefinition.params as param (param.key)}
          <div class="row">
            <span class="dim">{param.label}</span>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              data-testid={`space-param-${param.key}`}
              value={selectedTemplate.params[param.key] ?? param.default}
              oninput={(event) =>
                onParamInput(
                  selected!.id,
                  selectedDefinition!,
                  param.key,
                  Number((event.currentTarget as HTMLInputElement).value),
                )}
              onchange={onParamCommit}
            />
            <span class="value"
              >{formatParam(selectedTemplate.params[param.key] ?? param.default)}</span
            >
          </div>
        {/each}
      {/if}
      <div class="section-title editor-title" data-testid="space-editor-title">
        编辑：{selected.name}
      </div>
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
        {#if surface.kind === 'implicit' && implicitProbe && implicitProbe.status !== 'ok'}
          <div class="implicit-warning" data-testid="space-implicit-warning">
            {#if implicitProbe.status === 'empty'}
              ⚠ 未找到 F = 0 的曲面：表达式在当前范围内恒{implicitProbe.min > 0 ? '正' : '负'}
              （F ∈ [{format(implicitProbe.min)}, {format(implicitProbe.max)}]），方程可能无解。
              如要画等值面，可写成「表达式 = 常数」（如 sqrt(x^2 + y^2 + z^2) =
              2）；也可调整范围或改用 z = f(x, y) 写法。
            {:else}
              ⚠ 未找到 F = 0 的曲面：采样点全部为非有限值（检查定义域、除法与开方）。
            {/if}
          </div>
        {/if}
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
            <option value="magnitude">模长 |F|</option>
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
</aside>

<style>
  .space-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
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
    min-width: 0;
    font-size: 12px;
    padding: 1px 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .object-name:hover {
    border-color: var(--border);
  }

  .editor-title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .implicit-warning {
    margin: 4px 0 2px;
    font-size: 12px;
    line-height: 1.5;
    color: #b45309;
    background: rgba(251, 191, 36, 0.14);
    border: 1px solid rgba(180, 83, 9, 0.35);
    border-radius: 6px;
    padding: 6px 8px;
  }

  .badge {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--bg-elevated);
    color: var(--text-dim);
  }

  .remove {
    color: #fca5a5;
    padding: 0 6px;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .custom-input {
    flex: 1 1 100%;
    min-width: 0;
  }

  .fn-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }

  .fn-chips .fn-chip {
    padding: 1px 7px;
    font-size: 12px;
    border-radius: 10px;
    color: var(--text-dim);
  }

  .fn-chips .fn-chip:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .custom-note {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-dim);
  }

  .custom-error {
    margin-top: 6px;
    font-size: 12px;
    color: #fca5a5;
  }

  .hint {
    font-size: 12px;
    color: var(--text-dim);
  }
</style>
