<script lang="ts">
  import type { AppStore } from '../state/store'
  import type { CoordType, Size, ViewTransform } from '../state/types'
  import type { ToolRegistry } from '../tools/tool-registry'
  import { withEqualAspect } from '../core/transform'
  import { clearSampleCache } from '../render/curve-renderer'
  import { type ViewRangeInput, exactView } from '../render/viewport'
  import { DocFormatError, deserializeDocument, serializeDocument } from '../state/serialize'
  import ExportPanel from './ExportPanel.svelte'

  let {
    store,
    canUndo,
    canRedo,
    getStageSize,
    registry,
    mode,
    onModeChange,
  }: {
    store: AppStore
    canUndo: boolean
    canRedo: boolean
    getStageSize: () => Size
    registry: ToolRegistry
    mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook'
    onModeChange: (mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook') => void
  } = $props()

  let currentView = $state<ViewTransform | null>(null)
  $effect(() => {
    currentView = store.getView()
    return store.subscribe((state) => {
      currentView = state.view
    })
  })

  let activeToolId = $state<string | null>(null)
  $effect(() => {
    const sync = (): void => {
      activeToolId = registry.getActive()?.id ?? null
    }
    sync()
    return registry.subscribe(sync)
  })

  let showView = $state(false)
  let showExport = $state(false)
  let range = $state<ViewRangeInput>({ minX: -10, maxX: 10, minY: -5, maxY: 5 })
  let viewError = $state('')
  let ioError = $state('')
  let fileInput: HTMLInputElement | undefined = $state()

  /** 当前模式下的工具（「选择」按钮两模式共有） */
  const visibleTools = $derived(
    registry.getTools().filter((tool) => (tool.group ?? 'plot') === mode),
  )

  function toggleViewPanel(): void {
    showView = !showView
    viewError = ''
    if (showView) {
      const view = store.getView()
      if (view.coordType === 'log' && view.centerX > 0 && view.centerY > 0) {
        // 对数下以「±2 个十倍程」预填，避免线性范围（可能含非正数）
        range = {
          minX: 10 ** (Math.log10(view.centerX) - 2),
          maxX: 10 ** (Math.log10(view.centerX) + 2),
          minY: 10 ** (Math.log10(view.centerY) - 2),
          maxY: 10 ** (Math.log10(view.centerY) + 2),
        }
      } else {
        range = {
          minX: view.centerX - 10,
          maxX: view.centerX + 10,
          minY: view.centerY - 5,
          maxY: view.centerY + 5,
        }
      }
    }
  }

  function applyRange(): void {
    const size = getStageSize()
    if (size.width <= 0 || size.height <= 0) return
    viewError = ''
    const next = exactView(store.getView(), size, range)
    if (next === store.getView()) {
      viewError = '范围无效：需要 min < max，且对数坐标下必须为正数'
      return
    }
    store.setView(next)
  }

  function addMarker(): void {
    const view = store.getView()
    store.addMarker(view.centerX, view.centerY)
  }

  function setCoordType(value: string): void {
    // 中心/轴位置在对数坐标下非正时由 store.setView → sanitizeView 统一归一化
    store.setView({ ...store.getView(), coordType: value as CoordType })
  }

  function exportJson(): void {
    ioError = ''
    const json = serializeDocument(store.getDoc(), store.getView())
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'math-drawing.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importJson(event: Event): Promise<void> {
    ioError = ''
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const { doc, view } = deserializeDocument(text)
      store.loadState(doc, view)
      clearSampleCache()
    } catch (error) {
      ioError =
        error instanceof DocFormatError ? `导入失败：${error.message}` : '导入失败：无法读取文件'
    } finally {
      input.value = ''
    }
  }
</script>

<div class="toolbar" role="toolbar" aria-label="工具条">
  <div class="mode-switch" role="tablist" aria-label="界面模式">
    <button
      type="button"
      role="tab"
      data-testid="mode-plot"
      aria-selected={mode === 'plot'}
      class:active={mode === 'plot'}
      onclick={() => onModeChange('plot')}>函数绘图</button
    >
    <button
      type="button"
      role="tab"
      data-testid="mode-graph"
      aria-selected={mode === 'graph'}
      class:active={mode === 'graph'}
      onclick={() => onModeChange('graph')}>图论绘图</button
    >
    <button
      type="button"
      role="tab"
      data-testid="mode-stats"
      aria-selected={mode === 'stats'}
      class:active={mode === 'stats'}
      onclick={() => onModeChange('stats')}>统计与数据</button
    >
    <button
      type="button"
      role="tab"
      data-testid="mode-space"
      aria-selected={mode === 'space'}
      class:active={mode === 'space'}
      onclick={() => onModeChange('space')}>3D 与场</button
    >
    <button
      type="button"
      role="tab"
      data-testid="mode-advanced"
      aria-selected={mode === 'advanced'}
      class:active={mode === 'advanced'}
      onclick={() => onModeChange('advanced')}>进阶</button
    >
    <button
      type="button"
      role="tab"
      data-testid="mode-notebook"
      aria-selected={mode === 'notebook'}
      class:active={mode === 'notebook'}
      onclick={() => onModeChange('notebook')}>Notebook</button
    >
  </div>
  <span class="divider"></span>
  <div class="tool-group" role="radiogroup" aria-label="分析工具">
    <button
      type="button"
      data-testid="tool-none"
      class:active={activeToolId === null}
      title="选择/平移（默认）"
      onclick={() => registry.activate(null)}>选择</button
    >
    {#each visibleTools as tool (tool.id)}
      <button
        type="button"
        data-testid={`tool-${tool.id}`}
        class:active={activeToolId === tool.id}
        onclick={() => registry.activate(tool.id)}>{tool.name}</button
      >
    {/each}
  </div>
  <span class="divider"></span>
  <button type="button" data-testid="view-settings" onclick={toggleViewPanel}>视图设置</button>
  {#if mode === 'plot'}
    <!-- 坐标相关控件仅函数绘图模式（图论模式隐藏） -->
    <button
      type="button"
      data-testid="toggle-equal"
      aria-pressed={currentView?.equalAspect ?? true}
      class:active={currentView?.equalAspect ?? true}
      title="等比模式：锁定 x/y 比例（圆看起来是圆）"
      onclick={() => store.setView(withEqualAspect(store.getView(), !store.getView().equalAspect))}
    >
      等比{currentView?.equalAspect ? ' ✓' : ''}
    </button>
    <label class="select-label">
      坐标
      <select
        data-testid="select-coord"
        value={currentView?.coordType ?? 'rect'}
        onchange={(e) => setCoordType((e.currentTarget as HTMLSelectElement).value)}
      >
        <option value="rect">直角</option>
        <option value="polar">极坐标网格</option>
        <option value="log">对数</option>
      </select>
    </label>
    <button
      type="button"
      data-testid="toggle-axis"
      aria-pressed={currentView?.axisVisible ?? true}
      class:active={currentView?.axisVisible ?? true}
      onclick={() =>
        store.setView({ ...store.getView(), axisVisible: !store.getView().axisVisible })}
    >
      坐标轴
    </button>
  {/if}

  {#if showView}
    <div class="view-panel" data-testid="view-panel">
      <div class="range-row">
        <span>x ∈ [</span>
        <input data-testid="view-min-x" type="number" step="any" bind:value={range.minX} />
        <span>,</span>
        <input data-testid="view-max-x" type="number" step="any" bind:value={range.maxX} />
        <span>]</span>
      </div>
      <div class="range-row">
        <span>y ∈ [</span>
        <input data-testid="view-min-y" type="number" step="any" bind:value={range.minY} />
        <span>,</span>
        <input data-testid="view-max-y" type="number" step="any" bind:value={range.maxY} />
        <span>]</span>
      </div>
      <button type="button" data-testid="view-apply" onclick={applyRange}>应用</button>
      {#if viewError}
        <div class="error" data-testid="view-error">{viewError}</div>
      {/if}
    </div>
  {/if}

  <span class="spacer"></span>

  <button type="button" data-testid="export-json" onclick={exportJson}>导出 JSON</button>
  <button type="button" data-testid="import-json-button" onclick={() => fileInput?.click()}>
    导入 JSON
  </button>
  <button
    type="button"
    data-testid="export-open"
    class:active={showExport}
    onclick={() => (showExport = !showExport)}>导出…</button
  >
  <input
    class="hidden-file"
    data-testid="import-json"
    type="file"
    accept="application/json,.json"
    bind:this={fileInput}
    onchange={importJson}
  />
  {#if ioError}
    <span class="error" data-testid="io-error">{ioError}</span>
  {/if}

  <span class="divider"></span>

  {#if mode === 'plot'}
    <button type="button" data-testid="add-marker" onclick={addMarker}>添加标记点</button>
  {/if}
  <button
    type="button"
    data-testid="undo"
    title="撤销（Ctrl+Z）"
    disabled={!canUndo}
    onclick={() => store.undo()}>撤销</button
  >
  <button
    type="button"
    data-testid="redo"
    title="重做（Ctrl+Shift+Z）"
    disabled={!canRedo}
    onclick={() => store.redo()}>重做</button
  >

  {#if showExport}
    <ExportPanel {store} {mode} {getStageSize} onClose={() => (showExport = false)} />
  {/if}
</div>

<style>
  .toolbar {
    position: relative;
    flex-wrap: wrap;
  }

  .toolbar button.active {
    border-color: var(--accent);
    color: var(--accent);
  }

  .mode-switch {
    display: flex;
    gap: 0;
  }

  .mode-switch button {
    font-weight: 600;
  }

  .mode-switch button:first-child {
    border-radius: 6px 0 0 6px;
  }

  .mode-switch button:last-child {
    border-radius: 0 6px 6px 0;
  }

  .mode-switch button.active {
    background: rgba(37, 99, 235, 0.08);
  }

  .tool-group {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .select-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--text-dim);
  }

  .toolbar select {
    font: inherit;
    font-size: 13px;
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }

  .spacer {
    flex: 1;
  }

  .divider {
    width: 1px;
    height: 20px;
    background: var(--border);
  }

  .view-panel {
    position: absolute;
    top: 100%;
    left: 12px;
    z-index: 10;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgb(0 0 0 / 8%);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-dim);
  }

  .range-row input {
    font: inherit;
    font-size: 13px;
    width: 84px;
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 5px;
  }

  .hidden-file {
    display: none;
  }

  .error {
    color: #dc2626;
    font-size: 12px;
    max-width: 320px;
  }
</style>
