<script lang="ts">
  /** 三栏工作台（v3.10）：右侧检查器，集中工具、视图与项目操作 */
  import type { Component } from 'svelte'
  import type { AppStore } from '../state/store'
  import type { AppMode } from './modes'
  import { MODE_LABELS } from './modes'
  import type { CoordType, Size, ViewTransform } from '../state/types'
  import type { ToolRegistry } from '../tools/tool-registry'
  import { withEqualAspect } from '../core/transform'
  import { clearSampleCache } from '../render/curve-renderer'
  import { type ViewRangeInput, exactView } from '../render/viewport'
  import { DocFormatError, deserializeDocument, serializeDocument } from '../state/serialize'
  import ExportPanel from './ExportPanel.svelte'
  import ToolsPanel from './ToolsPanel.svelte'
  import ExtremalResultPanel from './ExtremalResultPanel.svelte'
  import { hyperLab } from '../state/hyper-state.svelte'
  import { markSaved } from './save-state.svelte'
  import ChartColumn from '@lucide/svelte/icons/chart-column'
  import CircleDot from '@lucide/svelte/icons/circle-dot'
  import Crosshair from '@lucide/svelte/icons/crosshair'
  import FolderOpen from '@lucide/svelte/icons/folder-open'
  import GitMerge from '@lucide/svelte/icons/git-merge'
  import Grid2x2 from '@lucide/svelte/icons/grid-2x2'
  import MapPin from '@lucide/svelte/icons/map-pin'
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2'
  import PenLine from '@lucide/svelte/icons/pen-line'
  import Ruler from '@lucide/svelte/icons/ruler'
  import Save from '@lucide/svelte/icons/save'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import Sigma from '@lucide/svelte/icons/sigma'
  import Upload from '@lucide/svelte/icons/upload'
  import Waves from '@lucide/svelte/icons/waves'
  import Waypoints from '@lucide/svelte/icons/waypoints'

  const TOOL_ICONS: Record<string, Component> = {
    trace: Crosshair,
    tangent: PenLine,
    roots: CircleDot,
    intersection: GitMerge,
    integral: Sigma,
    riemann: ChartColumn,
    taylor: Waves,
    graph: Waypoints,
    'stats-probe': Crosshair,
  }

  function toolIcon(toolId: string): Component {
    return TOOL_ICONS[toolId] ?? MousePointer2
  }

  const MODE_HINTS: Record<AppMode, string> = {
    plot: '在左侧输入曲线；画布拖动平移，滚轮缩放，右侧工具用于分析。',
    graph: '在左侧生成或编辑图；右侧「图编辑」可建点、连边、拖动与删除。',
    lab: '在左侧设置实验并运行；候选结果与复核明细显示在画布中。',
    hyper: '在左侧切换超图、彩虹与极值；画布点击对象查看详情。',
    stats: '在左侧粘贴 CSV 或生成样本；画布上用统计探针读数。',
    space: '在左侧添加曲面、曲线或场；画布拖动旋转，滚轮缩放。',
    advanced: '在左侧选择复变、数论或代数专题，画布展示图形与推导。',
    matrix: '在左侧输入矩阵并计算；画布实时显示对应的线性变换。',
    notebook: '在左侧管理单元与依赖；画布中编辑并运行笔记本。',
  }

  let {
    store,
    registry,
    mode,
    getStageSize,
    onOpenGraph,
  }: {
    store: AppStore
    registry: ToolRegistry
    mode: AppMode
    getStageSize: () => Size
    onOpenGraph?: (payload: { name: string; n: number; edges: Array<[number, number]> }) => void
  } = $props()

  const extremalInspector = $derived(mode === 'hyper' && hyperLab.tab === 'extremal')

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

  const visibleTools = $derived(
    registry.getTools().filter((tool) => (tool.group ?? 'plot') === mode),
  )

  let showView = $state(false)
  let showExport = $state(false)
  let range = $state<ViewRangeInput>({ minX: -10, maxX: 10, minY: -5, maxY: 5 })
  let viewError = $state('')
  let ioError = $state('')
  let fileInput: HTMLInputElement | undefined = $state()

  function toggleViewPanel(): void {
    showView = !showView
    viewError = ''
    if (!showView) return
    const view = store.getView()
    if (view.coordType === 'log' && view.centerX > 0 && view.centerY > 0) {
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
    markSaved(store)
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
      markSaved(store)
    } catch (error) {
      ioError =
        error instanceof DocFormatError ? `导入失败：${error.message}` : '导入失败：无法读取文件'
    } finally {
      input.value = ''
    }
  }
</script>

<aside
  class="inspector"
  class:wide={extremalInspector}
  data-testid="inspector-panel"
  aria-label="检查器"
>
  <div class="inspector-head">
    <div>
      <strong>检查器</strong>
      <span>{MODE_LABELS[mode]}</span>
    </div>
  </div>

  {#if extremalInspector}
    <ExtremalResultPanel {onOpenGraph} />
  {:else}
    <div class="hint-card">
      <strong>{MODE_LABELS[mode]}</strong>
      <p>{MODE_HINTS[mode]}</p>
    </div>
  {/if}

  <ToolsPanel {registry} />

  {#if mode === 'plot' || mode === 'graph' || mode === 'stats'}
    <section class="group" aria-label="画布工具">
      <div class="group-title">画布工具</div>
      <div class="tool-grid">
        <button
          type="button"
          class="tool-btn"
          data-testid="tool-none"
          class:active={activeToolId === null}
          title="选择/平移（默认）"
          onclick={() => registry.activate(null)}
        >
          <MousePointer2 size={16} />
          <span>选择</span>
        </button>
        {#each visibleTools as tool (tool.id)}
          {@const Icon = toolIcon(tool.id)}
          <button
            type="button"
            class="tool-btn"
            data-testid={`tool-${tool.id}`}
            class:active={activeToolId === tool.id}
            title={tool.name}
            onclick={() => registry.activate(tool.id)}
          >
            <Icon size={16} />
            <span>{tool.name === '追踪游标' ? '追踪' : tool.name}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="group" aria-label="视图">
      <div class="group-title">视图</div>
      <button
        type="button"
        class="row-btn"
        data-testid="view-settings"
        onclick={toggleViewPanel}
        aria-expanded={showView}
      >
        <Settings2 size={15} />
        <span>视图设置</span>
        <span class="chevron">{showView ? '−' : '+'}</span>
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
          <button type="button" class="apply-btn" data-testid="view-apply" onclick={applyRange}
            >应用</button
          >
          {#if viewError}
            <div class="error" data-testid="view-error">{viewError}</div>
          {/if}
        </div>
      {/if}

      {#if mode === 'plot'}
        <button
          type="button"
          class="row-btn"
          data-testid="toggle-equal"
          aria-pressed={currentView?.equalAspect ?? true}
          class:active={currentView?.equalAspect ?? true}
          title="等比模式：锁定 x/y 比例（圆看起来是圆）"
          onclick={() =>
            store.setView(withEqualAspect(store.getView(), !store.getView().equalAspect))}
        >
          <Ruler size={15} />
          <span>等比{currentView?.equalAspect ? ' ✓' : ''}</span>
        </button>
        <label class="select-row">
          <span>坐标</span>
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
          class="row-btn"
          data-testid="toggle-axis"
          aria-pressed={currentView?.axisVisible ?? true}
          class:active={currentView?.axisVisible ?? true}
          onclick={() =>
            store.setView({ ...store.getView(), axisVisible: !store.getView().axisVisible })}
        >
          <Grid2x2 size={15} />
          <span>坐标轴</span>
        </button>
        <button type="button" class="row-btn" data-testid="add-marker" onclick={addMarker}>
          <MapPin size={15} />
          <span>标记点</span>
        </button>
      {/if}
    </section>
  {/if}

  <section class="group" aria-label="项目">
    <div class="group-title">项目</div>
    <div class="file-actions">
      <button
        type="button"
        class="file-btn"
        data-testid="export-json"
        title="保存项目为 JSON"
        onclick={exportJson}
      >
        <Save size={15} /><span>保存项目</span>
      </button>
      <button
        type="button"
        class="file-btn"
        data-testid="import-json-button"
        title="打开项目 JSON"
        onclick={() => fileInput?.click()}
      >
        <FolderOpen size={15} /><span>打开项目</span>
      </button>
      <button
        type="button"
        class="file-btn"
        data-testid="export-open"
        class:active={showExport}
        disabled={mode === 'hyper'}
        title={mode === 'hyper' ? '超图/彩虹为独立视图：请用面板 JSON 导出或截图' : '导出…'}
        onclick={() => (showExport = !showExport)}
      >
        <Upload size={15} /><span>导出…</span>
      </button>
    </div>
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
  </section>

  <div class="inspector-foot">
    <span>三栏工作台 · 检查器</span>
  </div>
</aside>

{#if showExport}
  <ExportPanel {store} {mode} {getStageSize} onClose={() => (showExport = false)} />
{/if}

<style>
  .inspector {
    width: 292px;
    flex: 0 0 292px;
    min-height: 0;
    overflow-y: auto;
    background: var(--bg-chrome);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
  }

  .inspector.wide {
    width: 360px;
    flex-basis: 360px;
  }

  .inspector-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 2px 8px;
    border-bottom: 1px solid var(--border);
  }

  .inspector-head strong {
    display: block;
    font-size: 13px;
  }

  .inspector-head span {
    display: block;
    margin-top: 2px;
    color: var(--text-dim);
    font-size: 11px;
  }

  .hint-card {
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--bg);
  }

  .hint-card strong {
    display: block;
    margin-bottom: 3px;
    font-size: 12px;
  }

  .hint-card p {
    margin: 0;
    color: var(--text-dim);
    font-size: 11px;
    line-height: 1.5;
  }

  .group {
    border-top: 1px solid var(--border);
    padding-top: 9px;
  }

  .group-title {
    margin-bottom: 6px;
    color: var(--text-dim);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .tool-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  .tool-btn,
  .row-btn,
  .file-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-width: 0;
    padding: 7px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .tool-btn:hover,
  .row-btn:hover,
  .file-btn:hover:not(:disabled) {
    background: var(--bg);
    border-color: var(--border);
  }

  .tool-btn.active,
  .row-btn.active,
  .file-btn.active {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: color-mix(in srgb, var(--accent) 28%, transparent);
    font-weight: 650;
  }

  .tool-btn span,
  .file-btn span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-btn .chevron {
    margin-left: auto;
    color: var(--text-dim);
    font-size: 14px;
  }

  .select-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    font-size: 12px;
    color: var(--text-dim);
  }

  .select-row select {
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--bg-input);
    color: var(--text);
    font: inherit;
    font-size: 12px;
  }

  .view-panel {
    margin: 4px 0 8px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-dim);
  }

  .range-row input {
    width: 0;
    flex: 1;
    min-width: 0;
    padding: 3px 4px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg-input);
    color: var(--text);
    font: inherit;
    font-size: 11px;
  }

  .apply-btn {
    padding: 4px 8px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .file-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  .file-btn {
    background: var(--bg);
    border-color: var(--border);
    justify-content: center;
  }

  .file-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .hidden-file {
    display: none;
  }

  .error {
    color: var(--danger);
    font-size: 11px;
    line-height: 1.4;
    word-break: break-word;
  }

  .inspector-foot {
    margin-top: auto;
    padding-top: 8px;
    color: var(--text-dim);
    font-size: 10px;
    text-align: center;
    opacity: 0.75;
  }

  @media (max-width: 1280px) {
    .inspector {
      width: 264px;
      flex-basis: 264px;
    }
    .inspector.wide {
      width: 320px;
      flex-basis: 320px;
    }
  }

  @media (max-width: 1100px) {
    .inspector {
      width: 236px;
      flex-basis: 236px;
    }
    .inspector.wide {
      width: 300px;
      flex-basis: 300px;
    }
  }

  @media (max-width: 920px) {
    .inspector,
    .inspector.wide {
      width: 100%;
      flex-basis: auto;
      max-height: 46vh;
      border-left: none;
      border-top: 1px solid var(--border);
    }
  }
</style>
