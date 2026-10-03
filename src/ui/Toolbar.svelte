<script lang="ts">
  import type { AppStore } from '../state/store'
  import type { CoordType, Size, ViewTransform } from '../state/types'
  import type { ToolRegistry } from '../tools/tool-registry'
  import { withEqualAspect } from '../core/transform'
  import { clearSampleCache } from '../render/curve-renderer'
  import { type ViewRangeInput, exactView } from '../render/viewport'
  import { DocFormatError, deserializeDocument, serializeDocument } from '../state/serialize'
  import ExportPanel from './ExportPanel.svelte'
  import { themeState, toggleTheme } from './theme.svelte'
  import { markSaved } from './save-state.svelte'
  import { togglePresentation } from '../teaching/presentation.svelte'
  import type { Component } from 'svelte'
  import ChartColumn from '@lucide/svelte/icons/chart-column'
  import CircleDot from '@lucide/svelte/icons/circle-dot'
  import Crosshair from '@lucide/svelte/icons/crosshair'
  import FolderOpen from '@lucide/svelte/icons/folder-open'
  import FunctionSquare from '@lucide/svelte/icons/function-square'
  import GitMerge from '@lucide/svelte/icons/git-merge'
  import Grid2x2 from '@lucide/svelte/icons/grid-2x2'
  import Keyboard from '@lucide/svelte/icons/keyboard'
  import MapPin from '@lucide/svelte/icons/map-pin'
  import MonitorPlay from '@lucide/svelte/icons/monitor-play'
  import Moon from '@lucide/svelte/icons/moon'
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2'
  import PanelRight from '@lucide/svelte/icons/panel-right'
  import PenLine from '@lucide/svelte/icons/pen-line'
  import Redo2 from '@lucide/svelte/icons/redo-2'
  import Ruler from '@lucide/svelte/icons/ruler'
  import Save from '@lucide/svelte/icons/save'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import Sigma from '@lucide/svelte/icons/sigma'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Sun from '@lucide/svelte/icons/sun'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import Upload from '@lucide/svelte/icons/upload'
  import Waves from '@lucide/svelte/icons/waves'
  import Waypoints from '@lucide/svelte/icons/waypoints'

  /** 工具 id → 图标（未映射的回退为指针图标） */
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

  let {
    store,
    canUndo,
    canRedo,
    getStageSize,
    registry,
    mode,
    onModeChange,
    sidebarCollapsed,
    onToggleSidebar,
    onOpenExamples,
    onOpenShortcuts,
  }: {
    store: AppStore
    canUndo: boolean
    canRedo: boolean
    getStageSize: () => Size
    registry: ToolRegistry
    mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook' | 'matrix'
    onModeChange: (
      mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook' | 'matrix',
    ) => void
    sidebarCollapsed: boolean
    onToggleSidebar: () => void
    onOpenExamples: () => void
    onOpenShortcuts: () => void
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

<header class="topbar" role="toolbar" aria-label="工具条">
  <div class="brand">
    <span class="brand-mark"><FunctionSquare size={15} strokeWidth={2.2} /></span>
    <span class="brand-name">Math Drawing</span>
  </div>
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
      onclick={() => onModeChange('advanced')}>数学专题</button
    >
    <button
      type="button"
      role="tab"
      data-testid="mode-matrix"
      aria-selected={mode === 'matrix'}
      class:active={mode === 'matrix'}
      onclick={() => onModeChange('matrix')}>矩阵</button
    >
    <button
      type="button"
      role="tab"
      data-testid="mode-notebook"
      aria-selected={mode === 'notebook'}
      class:active={mode === 'notebook'}
      onclick={() => onModeChange('notebook')}>笔记本</button
    >
  </div>
  <div class="top-actions">
    <button
      type="button"
      class="ibtn"
      data-testid="open-examples"
      title="示例项目：从示例开始"
      onclick={onOpenExamples}><Sparkles size={17} /></button
    >
    <button
      type="button"
      class="ibtn"
      data-testid="shortcuts-help"
      title="快捷键提示"
      onclick={onOpenShortcuts}><Keyboard size={17} /></button
    >
    <button
      type="button"
      class="ibtn"
      data-testid="enter-presentation"
      title="课堂演示模式（放大展示，Esc 退出）"
      onclick={() => void togglePresentation()}><MonitorPlay size={17} /></button
    >
    <button
      type="button"
      class="ibtn"
      data-testid="toggle-theme"
      title="切换浅色 / 深色主题"
      onclick={toggleTheme}
      >{#if themeState.theme === 'light'}<Moon size={17} />{:else}<Sun size={17} />{/if}</button
    >
    <span class="divider"></span>
    <button
      type="button"
      class="ibtn"
      data-testid="undo"
      title="撤销（Ctrl+Z）"
      disabled={!canUndo}
      onclick={() => store.undo()}><Undo2 size={17} /></button
    >
    <button
      type="button"
      class="ibtn"
      data-testid="redo"
      title="重做（Ctrl+Shift+Z）"
      disabled={!canRedo}
      onclick={() => store.redo()}><Redo2 size={17} /></button
    >
    <span class="divider"></span>
    <button
      type="button"
      class="ibtn"
      data-testid="toggle-sidebar"
      class:active={sidebarCollapsed}
      title={sidebarCollapsed ? '展开编辑面板' : '收起编辑面板'}
      onclick={onToggleSidebar}><PanelRight size={17} /></button
    >
  </div>
</header>

<div class="dock">
  <div class="tool-group" role="radiogroup" aria-label="分析工具">
    <button
      type="button"
      class="dock-tool"
      data-testid="tool-none"
      class:active={activeToolId === null}
      title="选择/平移（默认）"
      onclick={() => registry.activate(null)}
      ><MousePointer2 size={16} /><span class="lbl">选择</span></button
    >
    {#each visibleTools as tool (tool.id)}
      {@const ToolIcon = toolIcon(tool.id)}
      <button
        type="button"
        class="dock-tool"
        data-testid={`tool-${tool.id}`}
        class:active={activeToolId === tool.id}
        onclick={() => registry.activate(tool.id)}
      >
        <ToolIcon size={16} />
        <span class="lbl">{tool.name === '追踪游标' ? '追踪' : tool.name}</span>
      </button>
    {/each}
  </div>
  <span class="divider"></span>
  <button type="button" class="dock-tool" data-testid="view-settings" onclick={toggleViewPanel}
    ><Settings2 size={16} /><span class="lbl">视图设置</span></button
  >
  {#if mode === 'plot'}
    <!-- 坐标相关控件仅函数绘图模式（图论模式隐藏） -->
    <button
      type="button"
      class="dock-tool"
      data-testid="toggle-equal"
      aria-pressed={currentView?.equalAspect ?? true}
      class:active={currentView?.equalAspect ?? true}
      title="等比模式：锁定 x/y 比例（圆看起来是圆）"
      onclick={() => store.setView(withEqualAspect(store.getView(), !store.getView().equalAspect))}
    >
      <Ruler size={16} /><span class="lbl">等比{currentView?.equalAspect ? ' ✓' : ''}</span>
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
      class="dock-tool"
      data-testid="toggle-axis"
      aria-pressed={currentView?.axisVisible ?? true}
      class:active={currentView?.axisVisible ?? true}
      onclick={() =>
        store.setView({ ...store.getView(), axisVisible: !store.getView().axisVisible })}
    >
      <Grid2x2 size={16} /><span class="lbl">坐标轴</span>
    </button>
    <button type="button" class="dock-tool" data-testid="add-marker" onclick={addMarker}
      ><MapPin size={16} /><span class="lbl">标记点</span></button
    >
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

  <button type="button" class="dock-tool file" data-testid="export-json" onclick={exportJson}
    ><Save size={16} /><span class="lbl">保存项目</span></button
  >
  <button
    type="button"
    class="dock-tool file"
    data-testid="import-json-button"
    onclick={() => fileInput?.click()}
  >
    <FolderOpen size={16} /><span class="lbl">打开项目</span>
  </button>
  <button
    type="button"
    class="dock-tool file"
    data-testid="export-open"
    class:active={showExport}
    onclick={() => (showExport = !showExport)}
    ><Upload size={16} /><span class="lbl">导出…</span></button
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

  {#if showExport}
    <ExportPanel {store} {mode} {getStageSize} onClose={() => (showExport = false)} />
  {/if}
</div>

<style>
  /* ---------- 顶部玻璃栏（v2.6 画布优先） ---------- */
  .topbar {
    position: relative;
    z-index: 40;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    row-gap: 4px;
    padding: 7px 12px;
    background: var(--card);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 4px;
  }

  .brand-mark {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff;
    box-shadow: 0 1px 3px rgb(37 99 235 / 40%);
  }

  .brand-name {
    font-weight: 650;
    font-size: 13.5px;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .mode-switch {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 3px;
  }

  .mode-switch button {
    font: inherit;
    font-size: 12.5px;
    padding: 5px 11px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
    white-space: nowrap;
  }

  .mode-switch button:hover {
    color: var(--text);
  }

  .mode-switch button.active {
    background: var(--bg-panel);
    border-color: var(--border);
    color: var(--text);
    font-weight: 600;
    box-shadow: 0 1px 3px rgb(24 24 27 / 8%);
  }

  .top-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .ibtn {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    border: none;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
  }

  .ibtn:hover:not(:disabled) {
    background: var(--bg);
    color: var(--text);
  }

  .ibtn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .ibtn.active {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 6px;
    flex: none;
  }

  /* ---------- 底部浮动工具坞 ---------- */
  .dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 16px;
    margin: 0 auto;
    width: fit-content;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 4px;
    max-width: calc(100vw - 32px);
    padding: 6px 8px;
    background: var(--card);
    backdrop-filter: blur(14px);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: var(--shadow-pop);
  }

  .tool-group {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-wrap: wrap;
  }

  .dock-tool {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 48px;
    min-width: 46px;
    padding: 0 7px;
    border: none;
    border-radius: 11px;
    background: none;
    color: var(--text-dim);
    font: inherit;
    cursor: pointer;
  }

  .dock-tool.file {
    padding: 0 10px;
  }

  .dock-tool .lbl {
    font-size: 10px;
    line-height: 1;
    white-space: nowrap;
  }

  .dock-tool:hover {
    background: var(--bg);
    color: var(--text);
  }

  .dock-tool.active {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 2px 8px rgb(37 99 235 / 35%);
  }

  .dock-tool.active:hover {
    color: #fff;
  }

  .select-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-dim);
    padding: 0 6px;
  }

  .dock select {
    font: inherit;
    font-size: 12.5px;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
  }

  /* 视图设置面板：从工具坞向上展开 */
  .view-panel {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 0;
    z-index: 30;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow-pop);
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
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }

  .hidden-file {
    display: none;
  }

  .error {
    color: #dc2626;
    font-size: 12px;
    max-width: 320px;
  }

  /* 导出面板：从工具坞右下方上移为浮动卡片 */
  :global(.export-panel) {
    position: fixed;
    right: 16px;
    bottom: 122px;
    top: auto;
    max-height: min(70vh, 640px);
    overflow-y: auto;
  }

  /* 窄窗口：模式切换换行、工具坞贴底 */
  @media (max-width: 920px) {
    .dock {
      bottom: 12px;
    }
  }
</style>
