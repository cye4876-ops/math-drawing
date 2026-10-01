<script lang="ts">
  /**
   * Notebook 视图（v1.0，第七模式主区）：
   * 单元格列表（拖拽排序）+ 顶栏（标题 / 添加 / 全部运行 / 执行与保存状态 / 变量总览）。
   */
  import { formatResult } from '../notebook/model'
  import {
    addCell,
    getExecutionMs,
    getNotebook,
    getRunResult,
    getSaveState,
    moveCellTo,
    runAll,
    scheduleRun,
    setNotebookTitle,
  } from '../state/notebook-state.svelte'
  import type { AppStore } from '../state/store'
  import NotebookCellView from './NotebookCellView.svelte'

  let {
    active,
    store,
    onOpenMode,
  }: {
    active: boolean
    store: AppStore
    onOpenMode: (mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook') => void
  } = $props()

  let dragIndex = $state<number | null>(null)
  let dragOverIndex = $state<number | null>(null)

  // 编辑（深结构）→ 防抖执行：300ms 后全量重跑（级联更新）
  $effect(() => {
    JSON.stringify(getNotebook())
    scheduleRun()
  })

  function variablesText(): string {
    const entries = Object.entries(getRunResult().scope)
    if (entries.length === 0) return '无变量'
    return entries.map(([name, value]) => `${name}=${formatResult(value)}`).join('、')
  }

  function saveLabel(): string {
    const state = getSaveState()
    return state === 'saved' ? '已保存' : state === 'saving' ? '保存中…' : '保存失败'
  }
</script>

<div class="notebook-view" class:hidden={!active} data-testid="notebook-view">
  <div class="nb-header">
    <input
      class="nb-title"
      data-testid="notebook-title"
      value={getNotebook().title}
      oninput={(event) => setNotebookTitle(event.currentTarget.value)}
    />
    <span class="nb-meta" data-testid="notebook-meta">
      {getNotebook().cells.length} 格 · 执行 {getExecutionMs()} ms · {saveLabel()}
    </span>
    <span class="spacer"></span>
    <button type="button" data-testid="notebook-add-markdown" onclick={() => addCell('markdown')}
      >+ 文本</button
    >
    <button type="button" data-testid="notebook-add-figure" onclick={() => addCell('figure')}
      >+ 图形</button
    >
    <button type="button" data-testid="notebook-add-compute" onclick={() => addCell('compute')}
      >+ 计算</button
    >
    <button type="button" data-testid="notebook-add-data" onclick={() => addCell('data')}
      >+ 数据</button
    >
    <button type="button" class="run-all" data-testid="notebook-run-all" onclick={() => runAll()}>
      全部运行
    </button>
  </div>
  <div class="nb-vars" data-testid="notebook-vars">变量：{variablesText()}</div>
  <div class="nb-cells" data-testid="notebook-cells" role="list">
    {#each getNotebook().cells as cell, index (cell.id)}
      <div
        class="nb-drag-wrap"
        class:drag-over={dragOverIndex === index}
        draggable="true"
        role="listitem"
        aria-label={`单元格 ${index + 1}`}
        ondragstart={(event) => {
          dragIndex = index
          event.dataTransfer?.setData('text/plain', String(index))
        }}
        ondragover={(event) => {
          event.preventDefault()
          dragOverIndex = index
        }}
        ondragleave={() => {
          if (dragOverIndex === index) dragOverIndex = null
        }}
        ondrop={(event) => {
          event.preventDefault()
          if (dragIndex !== null && dragIndex !== index) moveCellTo(dragIndex, index)
          dragIndex = null
          dragOverIndex = null
        }}
        ondragend={() => {
          dragIndex = null
          dragOverIndex = null
        }}
      >
        <NotebookCellView {cell} {index} {store} {onOpenMode} />
      </div>
    {/each}
    {#if getNotebook().cells.length === 0}
      <div class="nb-empty" data-testid="notebook-empty">
        空白 Notebook——用上方按钮添加「文本 / 图形 / 计算 / 数据」单元格开始。
      </div>
    {/if}
  </div>
</div>

<style>
  .notebook-view {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    background: #eef1f7;
    padding: 0 0 40px 0;
  }
  .notebook-view.hidden {
    visibility: hidden;
    pointer-events: none;
  }
  .nb-header {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: #ffffff;
    border-bottom: 1px solid #d8dfeb;
  }
  .nb-title {
    font-size: 16px;
    font-weight: 600;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 4px 8px;
    min-width: 160px;
    max-width: 320px;
    background: transparent;
    color: #1d2b42;
  }
  .nb-title:hover,
  .nb-title:focus {
    border-color: #d8dfeb;
    background: #fbfcfe;
  }
  .nb-meta {
    font-size: 12px;
    color: #7a8aa8;
    white-space: nowrap;
  }
  .nb-header .spacer {
    flex: 1;
  }
  .nb-header button {
    font-size: 12px;
    padding: 4px 10px;
  }
  .nb-header .run-all {
    background: #2c4a7c;
    color: #fff;
    border-color: #2c4a7c;
  }
  .nb-vars {
    padding: 6px 18px;
    font-size: 12px;
    color: #31507c;
    background: #f3f6fb;
    border-bottom: 1px solid #e3e9f3;
    font-family: ui-monospace, monospace;
  }
  .nb-cells {
    max-width: 980px;
    margin: 0 auto;
    padding: 14px 16px 0 16px;
  }
  .nb-drag-wrap {
    border-radius: 10px;
  }
  .nb-drag-wrap.drag-over {
    outline: 2px dashed #6f93c9;
    outline-offset: 2px;
  }
  .nb-empty {
    text-align: center;
    color: #7a8aa8;
    padding: 60px 20px;
    background: #ffffff;
    border: 1px dashed #c4d2e8;
    border-radius: 10px;
  }
</style>
