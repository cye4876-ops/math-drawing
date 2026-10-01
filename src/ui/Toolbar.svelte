<script lang="ts">
  import type { AppStore } from '../state/store'
  import type { CoordType, Size, ViewTransform } from '../state/types'
  import { withEqualAspect } from '../core/transform'
  import { clearSampleCache } from '../render/curve-renderer'
  import { type ViewRangeInput, exactView } from '../render/viewport'
  import { DocFormatError, deserializeDocument, serializeDocument } from '../state/serialize'

  let {
    store,
    canUndo,
    canRedo,
    getStageSize,
  }: {
    store: AppStore
    canUndo: boolean
    canRedo: boolean
    getStageSize: () => Size
  } = $props()

  let currentView = $state<ViewTransform | null>(null)
  $effect(() => {
    currentView = store.getView()
    return store.subscribe((state) => {
      currentView = state.view
    })
  })

  let showView = $state(false)
  let range = $state<ViewRangeInput>({ minX: -10, maxX: 10, minY: -5, maxY: 5 })
  let viewError = $state('')
  let ioError = $state('')
  let fileInput: HTMLInputElement | undefined = $state()

  function toggleViewPanel(): void {
    showView = !showView
    viewError = ''
    if (showView) {
      const view = store.getView()
      range = {
        minX: view.centerX - 10,
        maxX: view.centerX + 10,
        minY: view.centerY - 5,
        maxY: view.centerY + 5,
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
    const view = store.getView()
    const coordType = value as CoordType
    // 切换到对数坐标时，若轴位置为非正数则移到 1（否则轴不可见）
    const axisX = coordType === 'log' && view.axisX <= 0 ? 1 : view.axisX
    const axisY = coordType === 'log' && view.axisY <= 0 ? 1 : view.axisY
    store.setView({ ...view, coordType, axisX, axisY })
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
  <button type="button" data-testid="view-settings" onclick={toggleViewPanel}>视图设置</button>
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
    onclick={() => store.setView({ ...store.getView(), axisVisible: !store.getView().axisVisible })}
  >
    坐标轴
  </button>

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

  <button type="button" data-testid="add-marker" onclick={addMarker}>添加标记点</button>
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
