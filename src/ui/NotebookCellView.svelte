<script lang="ts">
  /**
   * Notebook 单元格组件（v1.0）：markdown / figure / compute / data / plugin 五种渲染。
   * 编辑直接写入 $state 深代理单元格（notebook-state），执行由防抖调度统一处理。
   */
  import { SPACE_OBJECT_TYPES, renderFrame } from '../export/frame'
  import { ensureKatex } from '../notebook/markdown'
  import { renderMarkdown } from '../notebook/markdown'
  import type { ComputeCell, NotebookCell, PluginCell } from '../notebook/model'
  import { formatResult } from '../notebook/model'
  import {
    duplicateCell,
    getRunResult,
    moveCellTo,
    removeCell,
    scheduleRun,
    toggleCollapse,
  } from '../state/notebook-state.svelte'
  import type { AppStore } from '../state/store'
  import type { DocState, ViewTransform } from '../state/types'
  import { getPluginCellRenderer, getRegistryRevision } from '../plugin/registry.svelte'
  import { latexNode } from './latex-action'

  let {
    cell,
    index,
    store,
    onOpenMode,
  }: {
    cell: NotebookCell
    index: number
    store: AppStore
    onOpenMode: (
      mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook' | 'matrix',
    ) => void
  } = $props()

  const TYPE_LABELS: Record<NotebookCell['type'], string> = {
    markdown: '文本',
    figure: '图形',
    compute: '计算',
    data: '数据',
    plugin: '插件',
  }

  const OPERATIONS: { id: ComputeCell['operation']; label: string }[] = [
    { id: 'evaluate', label: '求值 / 定义变量' },
    { id: 'simplify', label: '化简' },
    { id: 'expand', label: '展开' },
    { id: 'solve', label: '解方程' },
    { id: 'integrate', label: '积分' },
    { id: 'limit', label: '极限' },
    { id: 'inequality', label: '解不等式' },
    { id: 'latex', label: 'LaTeX 源码' },
  ]

  const result = $derived(getRunResult().cells.get(cell.id))

  // ---------- markdown 预览 ----------

  let previewEl: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (cell.type !== 'markdown') return
    const text = cell.collapsed ? '' : cell.text
    const target = previewEl
    if (!target || cell.collapsed) return
    let cancelled = false
    const render = async (): Promise<void> => {
      const katex = await ensureKatex()
      if (cancelled || !target.isConnected) return
      target.innerHTML = renderMarkdown(text, katex ? { katex } : {})
    }
    void render()
    return () => {
      cancelled = true
    }
  })

  // ---------- figure ----------

  let figureCanvas: HTMLCanvasElement | undefined = $state()

  /** 由文档对象推断渲染模式 */
  function inferMode(doc: DocState): 'plot' | 'graph' | 'stats' {
    if (doc.objects.some((object) => object.type === 'graph')) return 'graph'
    if (doc.objects.some((object) => object.type === 'dataset')) return 'stats'
    return 'plot'
  }

  function hasSpaceObjects(doc: DocState | null): boolean {
    if (!doc) return false
    return doc.objects.some((object) =>
      (SPACE_OBJECT_TYPES as readonly string[]).includes(object.type),
    )
  }

  $effect(() => {
    if (cell.type !== 'figure') return
    const canvas = figureCanvas
    const doc = cell.doc
    const view = cell.view
    // 依赖执行结果：变量变化 → 环境参数已同步 → 重绘
    getRunResult()
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!doc || !view) {
      context.fillStyle = '#f3f5f9'
      context.fillRect(0, 0, canvas.width, canvas.height)
      return
    }
    const mode = inferMode(doc)
    const size = { width: canvas.width, height: canvas.height }
    renderFrame(context, doc, mode, view, size, { withGrid: true })
  })

  function captureFigure(): void {
    if (cell.type !== 'figure') return
    const doc = JSON.parse(JSON.stringify(store.getDoc())) as DocState
    const view = { ...store.getView() } as ViewTransform
    cell.doc = doc
    cell.view = view
    if (!cell.caption) cell.caption = '捕获的图形'
    scheduleRun()
  }

  function openFigure(): void {
    if (cell.type !== 'figure' || !cell.doc || !cell.view) return
    store.loadState(JSON.parse(JSON.stringify(cell.doc)), { ...cell.view })
    onOpenMode(inferMode(cell.doc))
  }

  // ---------- plugin 单元格 ----------

  let pluginHost: HTMLDivElement | undefined = $state()

  $effect(() => {
    if (cell.type !== 'plugin') return
    getRegistryRevision()
    const host = pluginHost
    const pluginCell = cell as PluginCell
    const renderer = getPluginCellRenderer(pluginCell.pluginType)
    if (!host || !renderer) return
    let cleanup: (() => void) | undefined
    try {
      cleanup =
        renderer(host, pluginCell, {
          rerun: () => scheduleRun(),
        }) ?? undefined
    } catch (error) {
      host.textContent = `插件单元格渲染失败：${(error as Error).message}`
    }
    return () => {
      try {
        cleanup?.()
      } catch {
        // 忽略清理错误
      }
    }
  })

  function pluginCellType(): string {
    return cell.type === 'plugin' ? (cell as PluginCell).pluginType : ''
  }

  // 插件格渲染器可用性（随注册表修订刷新：先建格后加载插件也能唤起渲染）
  const pluginAvailable = $derived.by(() => {
    getRegistryRevision()
    const type = pluginCellType()
    return type !== '' && getPluginCellRenderer(type) !== null
  })
</script>

<div
  class="nb-cell"
  class:collapsed={cell.collapsed}
  data-testid={`nb-cell-${index}`}
  data-cell-type={cell.type}
>
  <div class="cell-toolbar">
    <span class="type-badge" data-cell-type={cell.type}>{TYPE_LABELS[cell.type]}</span>
    <span class="spacer"></span>
    <button
      type="button"
      title="上移"
      data-testid={`nb-up-${index}`}
      onclick={() => moveCellTo(index, index - 1)}
    >
      ↑
    </button>
    <button
      type="button"
      title="下移"
      data-testid={`nb-down-${index}`}
      onclick={() => moveCellTo(index, index + 2)}
    >
      ↓
    </button>
    <button
      type="button"
      title="折叠/展开"
      data-testid={`nb-collapse-${index}`}
      onclick={() => toggleCollapse(cell.id)}
    >
      {cell.collapsed ? '展开' : '折叠'}
    </button>
    <button
      type="button"
      title="复制"
      data-testid={`nb-duplicate-${index}`}
      onclick={() => duplicateCell(cell.id)}
    >
      复制
    </button>
    <button
      type="button"
      title="删除"
      data-testid={`nb-remove-${index}`}
      onclick={() => removeCell(cell.id)}
    >
      删除
    </button>
  </div>

  {#if !cell.collapsed}
    {#if cell.type === 'markdown'}
      <div class="cell-body">
        <textarea
          class="md-input"
          data-testid={`nb-markdown-${index}`}
          value={cell.text}
          oninput={(event) => {
            cell.text = event.currentTarget.value
          }}></textarea>
        <div class="md-preview" bind:this={previewEl} data-testid={`nb-preview-${index}`}></div>
      </div>
    {:else if cell.type === 'compute'}
      <div class="cell-body">
        <div class="compute-row">
          <input
            class="compute-input"
            data-testid={`nb-compute-${index}`}
            value={cell.source}
            placeholder="a = 2 或 a * sin(0) + 1"
            oninput={(event) => {
              cell.source = event.currentTarget.value
            }}
          />
          <select
            data-testid={`nb-operation-${index}`}
            value={cell.operation}
            onchange={(event) => {
              cell.operation = event.currentTarget.value as ComputeCell['operation']
            }}
          >
            {#each OPERATIONS as operation (operation.id)}
              <option value={operation.id}>{operation.label}</option>
            {/each}
          </select>
          {#if cell.operation === 'limit'}
            <input
              class="limit-input"
              data-testid={`nb-limit-point-${index}`}
              value={cell.limitPoint}
              placeholder="x→"
              oninput={(event) => {
                cell.limitPoint = event.currentTarget.value
              }}
            />
          {/if}
        </div>
        {#if result?.status === 'error'}
          <div class="cell-error" data-testid={`nb-error-${index}`}>{result.error}</div>
        {:else if result?.defined}
          <div class="cell-result" data-testid={`nb-defined-${index}`}>
            已定义 <b>{result.defined.name}</b> = {formatResult(result.defined.value)}
            {#if result.text}<span class="cell-note">（{result.text}）</span>{/if}
          </div>
        {:else if result?.symbolic}
          <div class="cell-symbolic" data-testid={`nb-symbolic-${index}`}>
            {#each result.symbolic.latex as line, lineIndex (lineIndex)}
              <div class="latex-line" use:latexNode={line}></div>
            {/each}
            {#each result.symbolic.text as line, lineIndex (lineIndex)}
              <div class="cell-note">{line}</div>
            {/each}
          </div>
        {:else if result?.status === 'ok' && result.value !== undefined}
          <div class="cell-result" data-testid={`nb-value-${index}`}>
            = {result.text}
            <span class="cell-latex" use:latexNode={result.latex}></span>
          </div>
        {/if}
      </div>
    {:else if cell.type === 'figure'}
      <div class="cell-body">
        <canvas
          class="figure-canvas"
          bind:this={figureCanvas}
          width="720"
          height="380"
          data-testid={`nb-figure-${index}`}
        ></canvas>
        <div class="figure-row">
          <input
            class="caption-input"
            data-testid={`nb-caption-${index}`}
            placeholder="图注"
            value={cell.caption}
            oninput={(event) => {
              cell.caption = event.currentTarget.value
            }}
          />
          <button type="button" data-testid={`nb-capture-${index}`} onclick={captureFigure}>
            捕获当前视图
          </button>
          <button
            type="button"
            data-testid={`nb-open-${index}`}
            disabled={!cell.doc}
            onclick={openFigure}
          >
            打开编辑
          </button>
        </div>
        {#if !cell.doc}
          <div class="cell-note">在任意模式中摆好画面后点击「捕获当前视图」。</div>
        {:else if hasSpaceObjects(cell.doc)}
          <div class="cell-note">
            含 3D 对象：图形格内仅渲染 2D 部分，点击「打开编辑」查看完整场景。
          </div>
        {/if}
      </div>
    {:else if cell.type === 'data'}
      <div class="cell-body">
        <textarea
          class="md-input mono"
          data-testid={`nb-data-${index}`}
          placeholder="x,y&#10;1,1&#10;2,4"
          value={cell.csv}
          oninput={(event) => {
            cell.csv = event.currentTarget.value
          }}></textarea>
        {#if result?.table}
          <div class="table-preview" data-testid={`nb-table-${index}`}>
            <div class="cell-note">
              {result.table.columns.length} 列 × {result.table.rowCount} 行
              {#if result.table.warnings.length > 0}· {result.table.warnings.join('；')}{/if}
            </div>
            <table>
              <thead>
                <tr
                  >{#each result.table.columns as column, columnIndex (columnIndex)}<th>{column}</th
                    >{/each}</tr
                >
              </thead>
              <tbody>
                {#each result.table.preview as row, rowIndex (rowIndex)}
                  <tr>
                    {#each row as value, valueIndex (valueIndex)}
                      <td>{value === null ? '—' : formatResult(value)}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if result.table.rowCount > result.table.preview.length}
              <div class="cell-note">（仅显示前 {result.table.preview.length} 行）</div>
            {/if}
          </div>
        {:else if result?.status === 'error'}
          <div class="cell-error">{result.error}</div>
        {/if}
      </div>
    {:else if cell.type === 'plugin'}
      <div class="cell-body">
        {#if pluginAvailable}
          <div class="plugin-host" bind:this={pluginHost} data-testid={`nb-plugin-${index}`}></div>
        {:else}
          <div class="cell-error" data-testid={`nb-plugin-missing-${index}`}>
            插件单元格「{pluginCellType() || '未指定'}」未注册——请先在右侧「插件」区加载对应插件
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .nb-cell {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    margin: 0 0 10px 0;
    overflow: hidden;
    box-shadow: var(--shadow-card);
  }
  .nb-cell.collapsed {
    opacity: 0.85;
  }
  .cell-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--border);
  }
  .cell-toolbar .spacer {
    flex: 1;
  }
  .cell-toolbar button {
    font-size: 12px;
    padding: 2px 8px;
  }
  .type-badge {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
  }
  .type-badge[data-cell-type='figure'] {
    background: rgba(34, 197, 94, 0.18);
    color: var(--success);
  }
  .type-badge[data-cell-type='compute'] {
    background: rgba(245, 158, 11, 0.18);
    color: #fbbf24;
  }
  .type-badge[data-cell-type='data'] {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
  }
  .cell-body {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .md-input {
    width: 100%;
    min-height: 90px;
    resize: vertical;
    font-family: var(--mono);
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px;
    box-sizing: border-box;
    background: var(--bg-input);
    color: var(--text);
  }
  .md-input.mono {
    min-height: 80px;
  }
  .md-preview {
    border-top: 1px dashed var(--border);
    padding-top: 8px;
    color: var(--text);
    line-height: 1.65;
    font-size: 14px;
    overflow-x: auto;
  }
  .md-preview :global(h1),
  .md-preview :global(h2),
  .md-preview :global(h3),
  .md-preview :global(h4) {
    margin: 0.4em 0;
  }
  .md-preview :global(pre) {
    background: var(--bg-elevated);
    padding: 8px 10px;
    border-radius: 6px;
    overflow-x: auto;
  }
  .md-preview :global(blockquote) {
    border-left: 3px solid var(--border-strong);
    margin: 0.4em 0;
    padding-left: 10px;
    color: var(--text-dim);
  }
  .md-preview :global(.math-fallback) {
    background: rgba(245, 158, 11, 0.15);
    padding: 0 4px;
    border-radius: 4px;
  }
  .compute-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .compute-input {
    flex: 1;
    min-width: 0;
    font-family: var(--mono);
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-input);
    color: var(--text);
  }
  .compute-row select {
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-input);
    color: var(--text);
  }
  .limit-input {
    width: 64px;
    font-family: var(--mono);
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-input);
    color: var(--text);
  }
  .cell-error {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
  }
  .cell-result {
    color: var(--text);
    font-size: 15px;
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cell-note {
    color: var(--text-dim);
    font-size: 12px;
  }
  .cell-symbolic {
    display: flex;
    flex-direction: column;
    gap: 4px;
    color: var(--text);
  }
  .latex-line {
    overflow-x: auto;
    padding: 2px 0;
  }
  .cell-latex {
    display: inline-block;
  }
  .figure-canvas {
    width: 100%;
    height: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-elevated);
  }
  .figure-row {
    display: flex;
    gap: 8px;
  }
  .caption-input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-input);
    color: var(--text);
  }
  .figure-row button {
    font-size: 12px;
    padding: 4px 10px;
  }
  .table-preview table {
    border-collapse: collapse;
    font-size: 13px;
    font-family: ui-monospace, monospace;
  }
  .table-preview th,
  .table-preview td {
    border: 1px solid var(--border);
    padding: 3px 10px;
    text-align: right;
  }
  .table-preview th {
    background: var(--bg-elevated);
  }
  .plugin-host {
    border: 1px dashed var(--border-strong);
    border-radius: 6px;
    padding: 8px;
  }
</style>
