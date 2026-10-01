<script lang="ts">
  /**
   * 导出面板（v0.6）：PNG / SVG / TikZ / 动画（GIF·WebM）/ 分享链接。
   * 所有导出读取当前文档快照；动画源为图算法步骤流（确定性逐帧渲染）。
   */
  import { ALGORITHMS } from '../graph/algorithms'
  import { exportPngBlob } from '../export/png'
  import { buildSvg } from '../export/svg'
  import { buildTikz } from '../export/tikz'
  import { buildAlgorithmFrames, exportAnimation } from '../export/animation'
  import { buildShareUrl, SHARE_LENGTH_WARN } from '../export/url-state'
  import { downloadBlob, downloadText, timestampName } from '../export/download'
  import type { ExportRange } from '../export/frame'
  import type { AppStore } from '../state/store'
  import type { GraphObject } from '../state/types'

  let {
    store,
    mode,
    getStageSize,
    onClose,
  }: {
    store: AppStore
    mode: 'plot' | 'graph'
    getStageSize: () => { width: number; height: number }
    onClose: () => void
  } = $props()

  let tab = $state<'png' | 'svg' | 'tikz' | 'animation' | 'share'>('png')
  let status = $state('')
  let busy = $state(false)

  // 共用：范围
  let rangeKind = $state<ExportRange['kind']>('view')
  let region = $state({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 })

  // PNG
  let pngScale = $state(2)
  let pngTransparent = $state(false)

  // SVG
  let svgWidth = $state(1200)
  let svgHeight = $state(800)
  let svgTransparent = $state(false)

  // TikZ
  let tikzStandalone = $state(true)
  let tikzSamples = $state(200)

  // 动画
  let animationFormat = $state<'gif' | 'webm'>('gif')
  let algorithmId = $state('bfs')
  let startLabel = $state('')
  let fps = $state(4)
  let animationWidth = $state(640)

  // 分享
  let shareUrl = $state('')

  const graph = $derived.by((): GraphObject | null => {
    const item = store.getState().doc.objects.find((object) => object.type === 'graph')
    return (item as GraphObject | undefined) ?? null
  })

  function currentRange(): ExportRange {
    if (rangeKind === 'view') return { kind: 'view' }
    if (rangeKind === 'content') return { kind: 'content' }
    return { kind: 'region', ...region }
  }

  function fail(error: unknown): void {
    status = `导出失败：${error instanceof Error ? error.message : String(error)}`
  }

  async function doPng(): Promise<void> {
    busy = true
    status = ''
    try {
      const size = getStageSize()
      const blob = await exportPngBlob(store.getDoc(), mode, store.getView(), size, {
        scale: pngScale,
        transparent: pngTransparent,
        range: currentRange(),
      })
      downloadBlob(blob, timestampName('png'))
      status = `已导出 PNG（${Math.round(size.width * pngScale)}×${Math.round(size.height * pngScale)} · ${(blob.size / 1024).toFixed(0)} KB）`
    } catch (error) {
      fail(error)
    } finally {
      busy = false
    }
  }

  function doSvg(): void {
    status = ''
    try {
      const svg = buildSvg(store.getDoc(), mode, store.getView(), {
        width: Math.max(100, Math.round(svgWidth)),
        height: Math.max(100, Math.round(svgHeight)),
        range: currentRange(),
        background: svgTransparent ? null : '#ffffff',
      })
      downloadText(svg, timestampName('svg'), 'image/svg+xml')
      status = `已导出 SVG（${(svg.length / 1024).toFixed(1)} KB 文本）`
    } catch (error) {
      fail(error)
    }
  }

  function doTikz(): void {
    status = ''
    try {
      const result = buildTikz(store.getDoc(), mode, store.getView(), {
        range: currentRange(),
        size: getStageSize(),
        standalone: tikzStandalone,
        samples: tikzSamples,
      })
      downloadText(result.tex, timestampName('tex'), 'text/x-tex')
      status =
        result.skipped.length > 0
          ? `已导出 TikZ；${result.skipped.length} 条内容被跳过：${result.skipped.map((item) => item.name).join('、')}`
          : '已导出 TikZ（可直接编译）'
    } catch (error) {
      fail(error)
    }
  }

  async function doAnimation(): Promise<void> {
    busy = true
    status = ''
    try {
      if (!graph) {
        status = '动画导出需要一张图：请先在图面板生成或输入图'
        return
      }
      const startId = graph.nodes.find((node) => node.label === startLabel)?.id
      const frames = buildAlgorithmFrames(graph, { algorithmId, startId })
      if (frames.length === 0) {
        status = '该算法没有可播放的步骤'
        return
      }
      const stage = getStageSize()
      const width = Math.min(900, Math.max(200, Math.round(animationWidth)))
      const aspect = stage.width > 0 ? stage.height / stage.width : 0.66
      const size = { width, height: Math.round(width * aspect) }
      const blob = await exportAnimation(store.getDoc(), store.getView(), frames, {
        fps,
        size,
        format: animationFormat,
      })
      downloadBlob(blob, timestampName(animationFormat))
      status = `已导出 ${animationFormat.toUpperCase()}（${frames.length} 帧 · ${size.width}×${size.height} · ${(blob.size / 1024).toFixed(0)} KB）`
    } catch (error) {
      fail(error)
    } finally {
      busy = false
    }
  }

  async function doShare(): Promise<void> {
    status = ''
    try {
      const url = buildShareUrl(location.href, {
        doc: store.getDoc(),
        view: store.getView(),
        mode,
      })
      shareUrl = url
      let message = `链接长度 ${url.length} 字符`
      if (url.length > SHARE_LENGTH_WARN) message += '（较长，部分平台可能截断）'
      try {
        await navigator.clipboard.writeText(url)
        status = `分享链接已复制到剪贴板（${message}）`
      } catch {
        status = `已生成分享链接（${message}）——自动复制不可用，请手动复制下方文本`
      }
    } catch (error) {
      fail(error)
    }
  }
</script>

<div class="export-panel" data-testid="export-panel">
  <div class="panel-head">
    <span class="title">导出与分享</span>
    <button type="button" data-testid="export-close" class="close" onclick={onClose}>✕</button>
  </div>

  <div class="tabs" role="tablist">
    {#each [['png', 'PNG'], ['svg', 'SVG'], ['tikz', 'TikZ'], ['animation', '动画'], ['share', '分享']] as const as item (item[0])}
      <button
        type="button"
        role="tab"
        data-testid={`export-tab-${item[0]}`}
        class:active={tab === item[0]}
        onclick={() => (tab = item[0])}>{item[1]}</button
      >
    {/each}
  </div>

  {#if tab !== 'animation' && tab !== 'share'}
    <div class="row">
      <span class="dim-label">范围</span>
      <select data-testid="export-range" bind:value={rangeKind}>
        <option value="view">当前视窗</option>
        <option value="content">自动包含全部内容</option>
        <option value="region">指定数学区域</option>
      </select>
    </div>
    {#if rangeKind === 'region'}
      <div class="row region">
        <span class="dim-label">x：</span>
        <input type="number" step="any" data-testid="export-region-xmin" bind:value={region.xMin} />
        <span>~</span>
        <input type="number" step="any" data-testid="export-region-xmax" bind:value={region.xMax} />
        <span class="dim-label">y：</span>
        <input type="number" step="any" data-testid="export-region-ymin" bind:value={region.yMin} />
        <span>~</span>
        <input type="number" step="any" data-testid="export-region-ymax" bind:value={region.yMax} />
      </div>
    {/if}
  {/if}

  {#if tab === 'png'}
    <div class="row">
      <span class="dim-label">分辨率</span>
      <select data-testid="export-png-scale" bind:value={pngScale}>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
      </select>
      <label class="check">
        <input type="checkbox" data-testid="export-png-transparent" bind:checked={pngTransparent} />
        透明背景
      </label>
    </div>
    <button type="button" class="run" data-testid="export-png-run" disabled={busy} onclick={doPng}>
      导出 PNG
    </button>
  {:else if tab === 'svg'}
    <div class="row">
      <span class="dim-label">尺寸</span>
      <input
        type="number"
        min="100"
        step="100"
        data-testid="export-svg-width"
        bind:value={svgWidth}
      />
      <span>×</span>
      <input
        type="number"
        min="100"
        step="100"
        data-testid="export-svg-height"
        bind:value={svgHeight}
      />
      <label class="check">
        <input type="checkbox" data-testid="export-svg-transparent" bind:checked={svgTransparent} />
        透明背景
      </label>
    </div>
    <button type="button" class="run" data-testid="export-svg-run" onclick={doSvg}>导出 SVG</button>
  {:else if tab === 'tikz'}
    <div class="row">
      <span class="dim-label">采样数</span>
      <input
        type="number"
        min="50"
        max="2000"
        step="50"
        data-testid="export-tikz-samples"
        bind:value={tikzSamples}
      />
      <label class="check">
        <input type="checkbox" data-testid="export-tikz-standalone" bind:checked={tikzStandalone} />
        完整可编译文档
      </label>
    </div>
    <div class="hint">
      函数曲线输出符号形式（如 \addplot &#123;sin(deg(x))&#125;;），图输出 \node / \draw
    </div>
    <button type="button" class="run" data-testid="export-tikz-run" onclick={doTikz}
      >导出 .tex</button
    >
  {:else if tab === 'animation'}
    <div class="row">
      <span class="dim-label">格式</span>
      <select data-testid="export-animation-format" bind:value={animationFormat}>
        <option value="gif">GIF</option>
        <option value="webm">WebM 视频</option>
      </select>
      <span class="dim-label">帧率</span>
      <select data-testid="export-animation-fps" bind:value={fps}>
        <option value={2}>2</option>
        <option value={4}>4</option>
        <option value={6}>6</option>
        <option value={8}>8</option>
      </select>
    </div>
    <div class="row">
      <span class="dim-label">算法</span>
      <select data-testid="export-animation-algorithm" bind:value={algorithmId}>
        {#each ALGORITHMS as item (item.id)}
          <option value={item.id}>{item.name}</option>
        {/each}
      </select>
      <span class="dim-label">起点</span>
      <select data-testid="export-animation-start" bind:value={startLabel}>
        <option value="">（第一个顶点）</option>
        {#each graph?.nodes ?? [] as node (node.id)}
          <option value={node.label}>{node.label}</option>
        {/each}
      </select>
    </div>
    <div class="row">
      <span class="dim-label">宽度</span>
      <input
        type="number"
        min="200"
        max="900"
        step="40"
        data-testid="export-animation-width"
        bind:value={animationWidth}
      />
      <span class="hint">像素（GIF 建议 ≤ 640）</span>
    </div>
    {#if !graph}
      <div class="hint">当前没有图：动画源为图算法演示，请先在图面板生成一张图</div>
    {/if}
    <button
      type="button"
      class="run"
      data-testid="export-animation-run"
      disabled={busy || !graph}
      onclick={doAnimation}
    >
      {busy ? '导出中…' : `导出 ${animationFormat.toUpperCase()}`}
    </button>
  {:else}
    <div class="hint">
      分享链接把完整文档（曲线、图、视图、模式）压缩编码进 URL，打开即完整还原；无需后端。
    </div>
    <button type="button" class="run" data-testid="export-share-run" onclick={doShare}>
      生成并复制分享链接
    </button>
    {#if shareUrl}
      <textarea class="share-url" data-testid="export-share-url" readonly rows="3"
        >{shareUrl}</textarea
      >
    {/if}
  {/if}

  {#if status !== ''}
    <div class="status" data-testid="export-status">{status}</div>
  {/if}
</div>

<style>
  .export-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 8px;
    z-index: 30;
    width: 430px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    font-size: 13px;
  }

  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .title {
    font-weight: 600;
  }

  .close {
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-dim);
  }

  .tabs {
    display: flex;
    gap: 4px;
  }

  .tabs button.active {
    border-color: var(--accent);
    color: var(--accent);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .row label {
    color: var(--text-dim);
  }

  .dim-label {
    color: var(--text-dim);
  }

  .row.region input {
    width: 70px;
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .run {
    align-self: flex-start;
    padding: 4px 12px;
  }

  .hint {
    color: var(--text-dim);
    font-size: 12px;
  }

  .share-url {
    width: 100%;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    resize: vertical;
  }

  .status {
    font-size: 12px;
    color: var(--accent);
  }
</style>
