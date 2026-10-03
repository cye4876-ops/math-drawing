<script lang="ts">
  import { tick } from 'svelte'
  import type { AppStore } from '../state/store'
  import type { AppState, Curve, CurveKind, DocState, LineStyle } from '../state/types'
  import { DEFAULT_PARAMETER_BOUNDS, extractParameters, parse, parseProgram } from '../expr'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import X from '@lucide/svelte/icons/x'

  let { store }: { store: AppStore } = $props()

  let appState = $state<AppState | null>(null)
  $effect(() => {
    appState = store.getState()
    return store.subscribe((state) => {
      appState = state
    })
  })

  let draftKind = $state<CurveKind>('explicit')
  let draftExpr = $state('')
  let draftExpr2 = $state('')

  const curves = $derived(
    (appState?.doc.objects ?? []).filter((object): object is Curve => object.type === 'curve'),
  )

  const KIND_LABELS: Record<CurveKind, string> = {
    explicit: '显函数 y = f(x)',
    implicit: '隐函数 F(x, y) = 0',
    parametric: '参数方程 (x(t), y(t))',
    polar: '极坐标 r(θ)',
  }

  const QUALITY_LABELS: Record<number, string> = {
    1: '低',
    2: '较低',
    3: '标准',
    4: '较高',
    5: '高',
  }

  function parseError(expr: string): string | null {
    if (!expr.trim()) return '表达式为空'
    try {
      parse(expr)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  function curveError(curve: Curve): string | null {
    const first = parseError(curve.expr)
    if (first) return first
    if (curve.kind === 'parametric' && curve.expr2 !== undefined) {
      return parseError(curve.expr2)
    }
    if (curve.kind === 'parametric' && curve.expr2 === undefined) return '缺少 y(t) 表达式'
    return null
  }

  function addCurve(): void {
    const expr = draftExpr.trim()
    const expr2 = draftExpr2.trim()
    if (!expr) return
    if (draftKind === 'parametric') {
      if (!expr2) return
      store.addCurve({ kind: 'parametric', expr, expr2 })
      draftExpr2 = ''
    } else {
      store.addCurve({ kind: draftKind, expr })
    }
    draftExpr = ''
  }

  /** 常用函数快捷插入：在光标处插入片段；inside=true 时光标置于括号内 */
  const FN_SNIPPETS: { key: string; label: string; text: string; inside: boolean }[] = [
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

  let exprInput: HTMLInputElement | null = $state(null)
  let expr2Input: HTMLInputElement | null = $state(null)

  async function insertSnippet(text: string, inside: boolean): Promise<void> {
    const target = document.activeElement === expr2Input ? expr2Input : exprInput
    if (!target) return
    const isSecond = target === expr2Input
    const value = isSecond ? draftExpr2 : draftExpr
    const start = target.selectionStart ?? value.length
    const end = target.selectionEnd ?? start
    const next = value.slice(0, start) + text + value.slice(end)
    if (isSecond) draftExpr2 = next
    else draftExpr = next
    await tick()
    target.focus()
    const caret = start + (inside ? text.length - 1 : text.length)
    target.setSelectionRange(caret, caret)
  }

  function update(id: string, patch: Partial<Omit<Curve, 'id' | 'type'>>): void {
    store.updateCurve(id, patch)
  }

  /** 参数滑块：拖动走 preview（不入历史），松手提交为一步撤销 */
  let paramBefore: DocState | null = null

  function previewParam(id: string, name: string, value: number): void {
    if (paramBefore === null) paramBefore = store.getDoc()
    store.preview((doc) => ({
      objects: doc.objects.map((object) =>
        object.type === 'curve' && object.id === id
          ? { ...object, params: { ...object.params, [name]: value } }
          : object,
      ),
    }))
  }

  function commitParam(): void {
    if (paramBefore !== null) {
      store.commitPreview(paramBefore)
      paramBefore = null
    }
  }

  function formatParam(value: number): string {
    return String(Number(value.toFixed(2)))
  }

  /** 输入反馈（v2.5）：草稿表达式的实时校验与参数识别提示（不阻断添加，错误仍可入列表修正） */
  const draftError = $derived(
    draftExpr.trim() === ''
      ? null
      : draftKind === 'parametric'
        ? (parseError(draftExpr) ??
          (draftExpr2.trim() === '' ? '请输入 y(t) 表达式' : parseError(draftExpr2)))
        : parseError(draftExpr),
  )

  const draftParams = $derived.by(() => {
    if (draftError !== null) return [] as string[]
    try {
      const programs = parseProgram(draftExpr)
      if (draftKind === 'parametric' && draftExpr2.trim() !== '') {
        programs.push(...parseProgram(draftExpr2))
      }
      return extractParameters(programs).map((parameter) => parameter.name)
    } catch {
      return [] as string[]
    }
  })
</script>

<aside class="curve-panel" aria-label="曲线列表">
  <div class="panel-header">
    <span>曲线</span>
    <span class="count">{curves.length}</span>
  </div>

  <div class="add-form">
    <select
      data-testid="curve-kind-select"
      value={draftKind}
      onchange={(e) => (draftKind = (e.currentTarget as HTMLSelectElement).value as CurveKind)}
    >
      {#each Object.entries(KIND_LABELS) as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </select>
    <input
      data-testid="curve-expr-input"
      type="text"
      bind:this={exprInput}
      placeholder={draftKind === 'implicit'
        ? '如 x^2 + y^2 - 4'
        : draftKind === 'polar'
          ? '如 1 + cos(theta)'
          : draftKind === 'parametric'
            ? 'x(t)，如 cos(t)'
            : '如 sin(x)'}
      bind:value={draftExpr}
      onkeydown={(e) => {
        if (e.key === 'Enter') addCurve()
      }}
    />
    {#if draftKind === 'parametric'}
      <input
        data-testid="curve-expr2-input"
        type="text"
        bind:this={expr2Input}
        placeholder="y(t)，如 sin(t)"
        bind:value={draftExpr2}
        onkeydown={(e) => {
          if (e.key === 'Enter') addCurve()
        }}
      />
    {/if}
    <div class="fn-chips" role="group" aria-label="常用函数快捷插入">
      {#each FN_SNIPPETS as snippet (snippet.key)}
        <button
          type="button"
          class="fn-chip"
          data-testid={`fn-chip-${snippet.key}`}
          title={`插入 ${snippet.text}`}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => void insertSnippet(snippet.text, snippet.inside)}>{snippet.label}</button
        >
      {/each}
    </div>
    {#if draftExpr.trim() !== ''}
      {#if draftError}
        <div class="draft-feedback error" data-testid="draft-error">✗ {draftError}</div>
      {:else}
        <div class="draft-feedback ok" data-testid="draft-ok">
          ✓ 表达式有效{draftParams.length > 0
            ? ` · 参数 ${draftParams.join('、')}（添加后用滑块调值）`
            : ''}
        </div>
      {/if}
    {/if}
    <button type="button" class="btn-primary" data-testid="curve-add" onclick={addCurve}
      >添加曲线</button
    >
  </div>

  <div class="curve-items">
    {#each curves as curve, index (curve.id)}
      <div class="curve-item" data-testid="curve-item">
        <div class="row main-row">
          <input
            class="swatch"
            type="color"
            data-testid="curve-color"
            value={curve.color}
            title="曲线颜色"
            onchange={(e) =>
              update(curve.id, { color: (e.currentTarget as HTMLInputElement).value })}
          />
          <input
            class="name"
            type="text"
            value={curve.name}
            title="重命名"
            onchange={(e) =>
              update(curve.id, { name: (e.currentTarget as HTMLInputElement).value })}
          />
          <label class="visible" title="显示/隐藏">
            <input
              type="checkbox"
              data-testid="curve-visible"
              checked={curve.visible}
              onchange={(e) =>
                update(curve.id, { visible: (e.currentTarget as HTMLInputElement).checked })}
            />
          </label>
          <button
            type="button"
            data-testid="curve-up"
            title="上移"
            disabled={index === 0}
            onclick={() => store.moveCurve(curve.id, -1)}><ChevronUp size={14} /></button
          >
          <button
            type="button"
            data-testid="curve-down"
            title="下移"
            disabled={index === curves.length - 1}
            onclick={() => store.moveCurve(curve.id, 1)}><ChevronDown size={14} /></button
          >
          <button
            type="button"
            data-testid="curve-remove"
            title="删除"
            onclick={() => store.removeCurve(curve.id)}><X size={14} /></button
          >
        </div>

        <div class="row expr-row">
          <span class="prefix"
            >{curve.kind === 'parametric'
              ? 'x(t)'
              : curve.kind === 'implicit'
                ? 'F ='
                : curve.kind === 'polar'
                  ? 'r ='
                  : 'y ='}</span
          >
          <input
            class="expr"
            data-testid="curve-expr"
            type="text"
            value={curve.expr}
            onchange={(e) =>
              update(curve.id, { expr: (e.currentTarget as HTMLInputElement).value })}
          />
        </div>
        {#if curve.kind === 'parametric'}
          <div class="row expr-row">
            <span class="prefix">y(t)</span>
            <input
              class="expr"
              data-testid="curve-expr2"
              type="text"
              value={curve.expr2 ?? ''}
              onchange={(e) =>
                update(curve.id, { expr2: (e.currentTarget as HTMLInputElement).value })}
            />
          </div>
        {/if}

        {#if curveError(curve)}
          <div class="error" data-testid="curve-error">{curveError(curve)}</div>
        {/if}

        {#if curve.params && Object.keys(curve.params).length > 0}
          <div class="param-row" data-testid="curve-params">
            {#each Object.entries(curve.params).sort( ([a], [b]) => a.localeCompare(b) ) as [name, value] (name)}
              <label class="param">
                <span class="param-name">{name}</span>
                <input
                  type="range"
                  data-testid={`curve-param-${name}`}
                  min={DEFAULT_PARAMETER_BOUNDS.min}
                  max={DEFAULT_PARAMETER_BOUNDS.max}
                  step={DEFAULT_PARAMETER_BOUNDS.step}
                  {value}
                  oninput={(e) =>
                    previewParam(
                      curve.id,
                      name,
                      Number((e.currentTarget as HTMLInputElement).value),
                    )}
                  onchange={commitParam}
                />
                <span class="param-value" data-testid={`curve-param-value-${name}`}
                  >{formatParam(value)}</span
                >
              </label>
            {/each}
          </div>
        {/if}

        <div class="row options-row">
          <label>
            线型
            <select
              data-testid="curve-linestyle"
              value={curve.lineStyle}
              onchange={(e) =>
                update(curve.id, {
                  lineStyle: (e.currentTarget as HTMLSelectElement).value as LineStyle,
                })}
            >
              <option value="solid">实线</option>
              <option value="dashed">虚线</option>
              <option value="dotted">点线</option>
            </select>
          </label>
          <label>
            精度
            <select
              data-testid="curve-quality"
              value={String(curve.quality)}
              onchange={(e) =>
                update(curve.id, { quality: Number((e.currentTarget as HTMLSelectElement).value) })}
            >
              {#each [1, 2, 3, 4, 5] as q (q)}
                <option value={String(q)}>{QUALITY_LABELS[q]}</option>
              {/each}
            </select>
          </label>
        </div>
      </div>
    {/each}
    {#if curves.length === 0}
      <p class="empty">暂无曲线。在上方输入表达式后点击「添加曲线」。</p>
    {/if}
  </div>
</aside>

<style>
  .curve-panel {
    width: 100%;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    background: var(--bg);
    min-height: 0;
    box-sizing: border-box;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }

  .count {
    color: var(--text-dim);
    font-weight: 400;
  }

  .add-form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
  }

  .add-form input,
  .add-form select,
  .curve-item input,
  .curve-item select {
    font: inherit;
    font-size: 14px;
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--text);
    min-width: 0;
  }

  .add-form button {
    font: inherit;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }

  .add-form button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .fn-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 2px;
  }

  .fn-chips button {
    padding: 1px 7px;
    font-size: 12px;
    border-radius: 10px;
    color: var(--text-dim);
  }

  .fn-chips button:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .curve-items {
    overflow-y: auto;
    padding: 6px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .curve-item {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .row {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .swatch {
    width: 26px;
    height: 24px;
    padding: 1px;
    cursor: pointer;
  }

  .name {
    flex: 1;
  }

  .visible {
    display: flex;
    align-items: center;
  }

  .curve-item button {
    font: inherit;
    font-size: 13px;
    line-height: 1;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    cursor: pointer;
  }

  .curve-item button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .prefix {
    color: var(--text-dim);
    font-size: 13px;
    white-space: nowrap;
  }

  .expr {
    flex: 1;
    font-family: var(--mono);
  }

  .error {
    color: #dc2626;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .param-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 6px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }

  .param {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .param-name {
    width: 14px;
    color: var(--text-dim);
    font-style: italic;
  }

  .param input[type='range'] {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    accent-color: var(--accent);
  }

  .param-value {
    width: 44px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }

  .draft-feedback {
    font-size: 13px;
  }

  .draft-feedback.ok {
    color: var(--success);
  }

  .draft-feedback.error {
    color: #dc2626;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .options-row label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--text-dim);
  }

  .empty {
    color: var(--text-dim);
    font-size: 13px;
    margin: 6px 0;
  }
</style>
