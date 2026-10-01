<script lang="ts">
  /**
   * Notebook 侧栏面板（v1.0）：状态、导出（HTML/PDF/Markdown/LaTeX/JSON）、
   * 教学（示例库 / 题目模式 / 演示模式 / 参数动画）、插件（加载与面板）。
   */
  import { downloadBlob, downloadText } from '../export/download'
  import { buildNotebookHtml } from '../notebook/export-html'
  import { buildNotebookLatex } from '../notebook/export-latex'
  import { exportNotebookMarkdownZip } from '../notebook/export-markdown'
  import { printNotebookPdf } from '../notebook/export-pdf'
  import { formatResult } from '../notebook/model'
  import { loadPluginFromFile, loadPluginFromUrl, type PluginLoadResult } from '../plugin/loader'
  import {
    getLoadedPlugins,
    getPluginCellTypes,
    getPluginViews,
    getRegistryRevision,
  } from '../plugin/registry.svelte'
  import {
    addPluginCell,
    exportNotebookJson,
    getExecutionMs,
    getNotebook,
    getRunResult,
    getSaveState,
    loadNotebookJson,
    newNotebook,
    runAll,
  } from '../state/notebook-state.svelte'
  import type { AppStore } from '../state/store'
  import { TEACHING_EXAMPLES, type TeachingExample } from '../teaching/examples'
  import { recordParamAnimation } from '../teaching/param-animation'
  import { isPresentationMode, togglePresentation } from '../teaching/presentation.svelte'
  import { TEACHING_PROBLEMS } from '../teaching/problems'
  import type { ToolRegistry } from '../tools/tool-registry'

  let {
    store,
    registry,
    mode,
    onOpenMode,
    onPluginsChanged,
  }: {
    store: AppStore
    registry: ToolRegistry
    mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook'
    onOpenMode: (mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook') => void
    onPluginsChanged: () => void
  } = $props()

  let busy = $state('')
  let exportMessage = $state('')

  function tidyFilename(name: string, extension: string): string {
    return `${(name || 'notebook').replace(/[\\/:*?"<>|]/g, '_')}.${extension}`
  }

  // ---------- 导出 ----------

  async function exportHtml(): Promise<void> {
    busy = 'html'
    exportMessage = ''
    try {
      const html = await buildNotebookHtml(getNotebook(), getRunResult())
      downloadBlob(
        new Blob([html], { type: 'text/html' }),
        tidyFilename(getNotebook().title, 'html'),
      )
      exportMessage = 'HTML 已导出（单文件，双击可打开；图形可缩放/平移）'
    } finally {
      busy = ''
    }
  }

  async function printPdf(): Promise<void> {
    busy = 'pdf'
    exportMessage = ''
    try {
      await printNotebookPdf(getNotebook(), getRunResult())
      exportMessage = '已打开打印视图——在打印对话框中选择「另存为 PDF」'
    } finally {
      busy = ''
    }
  }

  async function exportMarkdown(): Promise<void> {
    busy = 'markdown'
    exportMessage = ''
    try {
      const { blob, filename } = await exportNotebookMarkdownZip(getNotebook(), getRunResult())
      downloadBlob(blob, filename)
      exportMessage = 'Markdown（含图片目录）已打包为 zip'
    } finally {
      busy = ''
    }
  }

  function exportLatex(): void {
    exportMessage = ''
    try {
      const tex = buildNotebookLatex(getNotebook(), getRunResult())
      downloadText(tex, tidyFilename(getNotebook().title, 'tex'))
      exportMessage = 'LaTeX 已导出（建议用 xelatex 编译以支持中文）'
    } catch (error) {
      exportMessage = `LaTeX 导出失败：${(error as Error).message}`
    }
  }

  function saveJson(): void {
    downloadText(
      exportNotebookJson(),
      tidyFilename(getNotebook().title, 'json'),
      'application/json',
    )
  }

  let importInput: HTMLInputElement | undefined = $state()

  async function importJson(event: Event): Promise<void> {
    exportMessage = ''
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      loadNotebookJson(await file.text())
      exportMessage = 'Notebook 已载入'
    } catch (error) {
      exportMessage = `载入失败：${(error as Error).message}`
    } finally {
      input.value = ''
    }
  }

  // ---------- 教学：示例 / 题目 / 演示 / 参数动画 ----------

  function applyExample(example: TeachingExample): void {
    example.apply(store, { activateTool: (id) => registry.activate(id) })
    onOpenMode(example.mode)
  }

  let problemId = $state(TEACHING_PROBLEMS[0]!.id)
  let tolerance = $state(TEACHING_PROBLEMS[0]!.defaultTolerance)
  let problemResult = $state<{ pass: boolean; detail: string } | null>(null)
  const selectedProblem = $derived(
    TEACHING_PROBLEMS.find((problem) => problem.id === problemId) ?? TEACHING_PROBLEMS[0]!,
  )

  function selectProblem(id: string): void {
    problemId = id
    const problem = TEACHING_PROBLEMS.find((item) => item.id === id)
    tolerance = problem?.defaultTolerance ?? 0.01
    problemResult = null
  }

  function checkProblem(): void {
    problemResult = selectedProblem.check(
      { doc: store.getDoc(), view: store.getView(), mode },
      tolerance,
    )
  }

  let animParam = $state('a')
  let animFrom = $state(0)
  let animTo = $state(6.2832)
  let animFrames = $state(24)
  let animFps = $state(8)
  let animWidth = $state(640)
  let animMessage = $state('')

  function recordAnimation(): void {
    busy = 'animation'
    animMessage = ''
    try {
      const result = recordParamAnimation(store, {
        parameter: animParam.trim() || 'a',
        from: animFrom,
        to: animTo,
        frames: animFrames,
        fps: animFps,
        width: animWidth,
      })
      downloadBlob(result.blob, result.filename)
      animMessage = `已导出 GIF（${result.frameCount} 帧）——曲线表达式中的 ${animParam || 'a'} 被逐帧扫描`
    } catch (error) {
      animMessage = `录制失败：${(error as Error).message}`
    } finally {
      busy = ''
    }
  }

  // ---------- 插件 ----------

  let pluginUrl = $state('/plugins/example-logistic.js')
  let pluginMessage = $state('')
  let pluginError = $state('')
  let pluginFileInput: HTMLInputElement | undefined = $state()
  let pluginViewsHost: HTMLDivElement | undefined = $state()

  function handlePluginResult(result: PluginLoadResult): void {
    if (result.ok) {
      pluginMessage = `已加载 ${result.name} v${result.version}${result.logs.length > 0 ? `（${result.logs.join('；')}）` : ''}`
      onPluginsChanged()
    } else {
      pluginError = `${result.name}：${result.error ?? '未知错误'}`
    }
  }

  async function loadPluginUrl(): Promise<void> {
    pluginMessage = ''
    pluginError = ''
    handlePluginResult(await loadPluginFromUrl(pluginUrl.trim()))
  }

  async function loadPluginFile(event: Event): Promise<void> {
    pluginMessage = ''
    pluginError = ''
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    handlePluginResult(await loadPluginFromFile(file))
    input.value = ''
  }

  // 插件面板渲染（注册表修订号变化即重建；重建 = 清理，见 docs/plugin-api.md）
  function renderPluginViews(revision: number): void {
    const host = pluginViewsHost
    if (!host) return
    host.dataset['revision'] = String(revision) // 修订号同步到 DOM（调试/测试可观测）
    host.textContent = ''
    for (const view of getPluginViews()) {
      const box = document.createElement('div')
      box.className = 'plugin-view-box'
      const title = document.createElement('div')
      title.className = 'plugin-view-title'
      title.textContent = view.title
      box.append(title)
      const content = document.createElement('div')
      content.dataset['pluginView'] = view.id
      box.append(content)
      host.append(box)
      try {
        view.render(content, { store })
      } catch (error) {
        content.textContent = `插件面板渲染失败：${(error as Error).message}`
      }
    }
  }

  $effect(() => {
    renderPluginViews(getRegistryRevision())
  })

  const variables = $derived(Object.entries(getRunResult().scope))

  // 插件列表随注册表修订刷新（加载插件后即时出现）
  const loadedPlugins = $derived.by(() => {
    getRegistryRevision()
    return getLoadedPlugins()
  })
  const pluginCellTypes = $derived.by(() => {
    getRegistryRevision()
    return getPluginCellTypes()
  })
</script>

<aside class="notebook-panel" data-testid="notebook-panel">
  <div class="section-title">Notebook（v1.0）</div>

  <div class="section">
    <div class="row">
      <span class="dim">状态</span>
      <span class="value" data-testid="notebook-status">
        {getNotebook().cells.length} 格 · {getExecutionMs()} ms ·
        {getSaveState() === 'saved'
          ? '已保存'
          : getSaveState() === 'saving'
            ? '保存中…'
            : '保存失败'}
      </span>
    </div>
    <div class="row wrap">
      <button type="button" data-testid="notebook-run-all-panel" onclick={() => runAll()}
        >全部运行</button
      >
      <button type="button" data-testid="notebook-new" onclick={() => newNotebook()}>新建</button>
    </div>
    {#if variables.length > 0}
      <div class="var-list" data-testid="notebook-variables">
        {#each variables as [name, value] (name)}
          <span class="var-chip">{name} = {formatResult(value)}</span>
        {/each}
      </div>
    {/if}
  </div>

  <div class="section">
    <div class="section-title">导出</div>
    <div class="row wrap">
      <button
        type="button"
        data-testid="notebook-export-html"
        disabled={busy !== ''}
        onclick={exportHtml}
      >
        导出 HTML
      </button>
      <button
        type="button"
        data-testid="notebook-print-pdf"
        disabled={busy !== ''}
        onclick={printPdf}
      >
        打印 / PDF
      </button>
      <button
        type="button"
        data-testid="notebook-export-markdown"
        disabled={busy !== ''}
        onclick={exportMarkdown}
      >
        导出 Markdown
      </button>
      <button type="button" data-testid="notebook-export-latex" onclick={exportLatex}
        >导出 LaTeX</button
      >
      <button type="button" data-testid="notebook-save-json" onclick={saveJson}>保存 JSON</button>
      <button
        type="button"
        data-testid="notebook-import-json-button"
        onclick={() => importInput?.click()}
      >
        载入 JSON
      </button>
      <input
        class="hidden-file"
        type="file"
        accept="application/json,.json"
        data-testid="notebook-import-json"
        bind:this={importInput}
        onchange={importJson}
      />
    </div>
    {#if exportMessage}
      <div class="hint" data-testid="notebook-export-message">{exportMessage}</div>
    {/if}
  </div>

  <div class="section">
    <div class="section-title">教学示例库</div>
    <div class="example-list">
      {#each TEACHING_EXAMPLES as example (example.id)}
        <button
          type="button"
          class="example-item"
          data-testid={`example-${example.id}`}
          title={example.description}
          onclick={() => applyExample(example)}
        >
          <span class="example-title">{example.title}</span>
          <span class="example-desc">{example.description}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="section">
    <div class="section-title">题目模式</div>
    <div class="row">
      <span class="dim">题目</span>
      <select
        data-testid="problem-select"
        value={problemId}
        onchange={(event) => selectProblem(event.currentTarget.value)}
      >
        {#each TEACHING_PROBLEMS as problem (problem.id)}
          <option value={problem.id}>{problem.title}</option>
        {/each}
      </select>
    </div>
    <div class="hint" data-testid="problem-prompt">{selectedProblem.prompt}</div>
    <div class="row">
      <span class="dim">容差</span>
      <input
        type="number"
        step="any"
        class="tolerance"
        data-testid="problem-tolerance"
        value={String(tolerance)}
        oninput={(event) => {
          // 容差归一化：>0 且 ≤1（防 0/负数/Infinity 破坏判定）
          const next = Number(event.currentTarget.value) || 0
          tolerance = Math.max(1e-9, Math.min(1, next))
        }}
      />
      <button type="button" data-testid="problem-check" onclick={checkProblem}>检查</button>
    </div>
    {#if problemResult}
      <div
        class={problemResult.pass ? 'problem-pass' : 'problem-fail'}
        data-testid="problem-result"
      >
        {problemResult.pass ? '✓ ' : '✗ '}{problemResult.detail}
      </div>
    {/if}
  </div>

  <div class="section">
    <div class="section-title">演示与动画</div>
    <div class="row wrap">
      <button
        type="button"
        data-testid="toggle-presentation"
        onclick={() => void togglePresentation()}
      >
        {isPresentationMode() ? '退出演示模式' : '演示模式（全屏投影）'}
      </button>
    </div>
    <div class="hint">
      参数动画：把当前绘图按参数值逐帧渲染为 GIF（参数缺省时曲线中可如 a*sin(x) 使用）。
    </div>
    <div class="row">
      <span class="dim">参数名</span>
      <input
        class="param"
        data-testid="anim-param"
        value={animParam}
        oninput={(event) => (animParam = event.currentTarget.value)}
      />
      <span class="dim">帧数</span>
      <input
        type="number"
        class="param"
        data-testid="anim-frames"
        value={String(animFrames)}
        oninput={(event) =>
          (animFrames = Math.max(2, Math.min(120, Number(event.currentTarget.value) || 2)))}
      />
    </div>
    <div class="row">
      <span class="dim">从</span>
      <input
        type="number"
        step="any"
        class="param"
        value={String(animFrom)}
        oninput={(event) => (animFrom = Number(event.currentTarget.value) || 0)}
      />
      <span class="dim">到</span>
      <input
        type="number"
        step="any"
        class="param"
        value={String(animTo)}
        oninput={(event) => (animTo = Number(event.currentTarget.value) || 0)}
      />
      <span class="dim">fps</span>
      <input
        type="number"
        class="param narrow"
        value={String(animFps)}
        oninput={(event) =>
          (animFps = Math.max(1, Math.min(30, Number(event.currentTarget.value) || 8)))}
      />
    </div>
    <div class="row">
      <button
        type="button"
        data-testid="anim-record"
        disabled={busy !== ''}
        onclick={recordAnimation}
      >
        录制 GIF
      </button>
      {#if animMessage}<span class="hint" data-testid="anim-message">{animMessage}</span>{/if}
    </div>
  </div>

  <div class="section">
    <div class="section-title">插件</div>
    <div class="row">
      <input
        class="param wide"
        data-testid="plugin-url"
        value={pluginUrl}
        oninput={(event) => (pluginUrl = event.currentTarget.value)}
      />
      <button type="button" data-testid="plugin-load" onclick={() => void loadPluginUrl()}
        >加载</button
      >
    </div>
    <div class="row wrap">
      <button
        type="button"
        data-testid="plugin-file-button"
        onclick={() => pluginFileInput?.click()}
      >
        从文件加载…
      </button>
      <input
        class="hidden-file"
        type="file"
        accept=".js,text/javascript"
        data-testid="plugin-file"
        bind:this={pluginFileInput}
        onchange={loadPluginFile}
      />
    </div>
    {#if pluginMessage}<div class="plugin-ok" data-testid="plugin-message">
        {pluginMessage}
      </div>{/if}
    {#if pluginError}<div class="plugin-error" data-testid="plugin-error">{pluginError}</div>{/if}
    {#if loadedPlugins.length > 0}
      <div class="plugin-list" data-testid="plugin-list">
        {#each loadedPlugins as plugin (plugin.url + plugin.name)}
          <span class="plugin-chip">{plugin.name} v{plugin.version}</span>
        {/each}
      </div>
    {/if}
    {#if pluginCellTypes.length > 0}
      <div class="row wrap">
        <span class="dim">插件格</span>
        {#each pluginCellTypes as cellType (cellType.id)}
          <button
            type="button"
            data-testid={`plugin-cell-add-${cellType.id}`}
            onclick={() => addPluginCell(cellType.id, cellType.createData())}
          >
            + {cellType.label}
          </button>
        {/each}
      </div>
    {/if}
    <div class="plugin-views" bind:this={pluginViewsHost} data-testid="plugin-views"></div>
  </div>
</aside>

<style>
  .notebook-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    overflow-y: auto;
    min-width: 0;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 7px;
    border-top: 1px solid #e3e9f3;
    padding-top: 8px;
  }
  .section-title {
    font-size: 12px;
    letter-spacing: 2px;
    color: #8fa3c2;
    text-transform: uppercase;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row.wrap {
    flex-wrap: wrap;
  }
  .row .dim {
    color: #8fa3c2;
    font-size: 12px;
    white-space: nowrap;
  }
  .row .value {
    font-size: 12px;
    color: #c7d4ea;
    font-family: ui-monospace, monospace;
  }
  .row input.param {
    width: 72px;
    font-family: ui-monospace, monospace;
    min-width: 0;
  }
  .row input.param.wide {
    flex: 1;
  }
  .row input.param.narrow {
    width: 46px;
  }
  .row input.tolerance {
    width: 76px;
    font-family: ui-monospace, monospace;
  }
  .row select {
    flex: 1;
    min-width: 0;
  }
  .row button {
    font-size: 12px;
    padding: 3px 10px;
    white-space: nowrap;
  }
  .hint {
    font-size: 11px;
    color: #6f819f;
    line-height: 1.5;
  }
  .var-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .var-chip {
    font-size: 11px;
    font-family: ui-monospace, monospace;
    background: #1d2b42;
    border: 1px solid #31507c;
    color: #cfe0f8;
    border-radius: 999px;
    padding: 2px 10px;
  }
  .example-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .example-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    padding: 6px 10px;
  }
  .example-title {
    font-size: 13px;
  }
  .example-desc {
    font-size: 11px;
    color: #6f819f;
    white-space: normal;
    line-height: 1.4;
  }
  .problem-pass {
    font-size: 12px;
    color: #1f6b3d;
    background: #e2f5e9;
    border: 1px solid #bcdfc8;
    border-radius: 8px;
    padding: 6px 10px;
    line-height: 1.5;
  }
  .problem-fail {
    font-size: 12px;
    color: #8a5a12;
    background: #fdf3e0;
    border: 1px solid #eed9b4;
    border-radius: 8px;
    padding: 6px 10px;
    line-height: 1.5;
  }
  .plugin-ok {
    font-size: 12px;
    color: #1f6b3d;
  }
  .plugin-error {
    font-size: 12px;
    color: #b3261e;
    background: #fdecea;
    border: 1px solid #f6c9c4;
    border-radius: 8px;
    padding: 6px 10px;
  }
  .plugin-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .plugin-chip {
    font-size: 11px;
    background: #e6eefb;
    border: 1px solid #c4d2e8;
    color: #31507c;
    border-radius: 999px;
    padding: 2px 10px;
  }
  .plugin-views :global(.plugin-view-box) {
    border: 1px dashed #c4d2e8;
    border-radius: 8px;
    padding: 8px;
    margin-top: 6px;
  }
  .plugin-views :global(.plugin-view-title) {
    font-size: 12px;
    color: #4a5d80;
    margin-bottom: 4px;
  }
  .hidden-file {
    display: none;
  }
</style>
