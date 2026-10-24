<script lang="ts">
  /**
   * 超图与彩虹实验室面板（v3.4 / v3.5）：
   * 超图族生成 / 四视图 / 精确不变量 / Property B / JSON 编辑 / 对偶；
   * 彩虹子图搜索 / Gallai 检测 / 反拉姆齐小 n / 超图彩虹匹配。
   */
  import {
    hyperLab,
    clearHyperWitness,
    generateHyperDoc,
    regenerateRainbow,
    regenerateHyperSeed,
    replaceHyperDoc,
    setHyperTab,
    setHyperView,
    setRainbowGraph,
    setRainbowN,
  } from '../state/hyper-state.svelte'
  import { analyzeHypergraphDoc } from '../hypergraph/analysis'
  import {
    docToJson,
    dualHypergraph,
    incidentEdgeIndices,
    parseHypergraphJson,
  } from '../hypergraph/model'
  import { HYPER_PRESETS } from '../hypergraph/presets'
  import { findRainbowHyperMatching, maxRainbowHyperMatching } from '../hypergraph/rainbow'
  import {
    RAINBOW_PATTERNS,
    antiRamsey,
    coloredGraphFromGraph,
    completeGraphWithColoring,
    findRainbowCopies,
    gallaiProbe,
    rainbowPatternById,
    rainbowPatternLabel,
  } from '../graph/rainbow'
  import type { GraphObject } from '../graph/model'
  import type { AppStore } from '../state/store'
  import { downloadText } from '../export/download'

  let { store }: { store: AppStore } = $props()

  const doc = $derived(hyperLab.doc)
  const analysis = $derived(analyzeHypergraphDoc(doc))
  const rainbow = $derived(hyperLab.rainbow)
  const pattern = $derived(rainbowPatternById(rainbow.patternId))
  const rainbowColorCount = $derived(new Set(rainbow.graph.edges.map((edge) => edge.color)).size)
  const canonicalJson = $derived(docToJson(hyperLab.doc))
  let jsonDraft = $state<string | null>(null)
  let jsonError = $state('')
  let dualNotice = $state('')
  let rainbowNotice = $state('')
  const jsonText = $derived(jsonDraft ?? canonicalJson)

  const selectionInfo = $derived.by(() => {
    const selected = hyperLab.selected
    if (!selected) return null
    if (selected.kind === 'vertex') {
      const vertex = doc.vertices[selected.index]
      if (!vertex) return null
      const incident = incidentEdgeIndices(doc, selected.index)
      return {
        title: `顶点 ${vertex.label}`,
        lines: [
          `度 = ${incident.length}`,
          `关联超边：${incident.map((index) => doc.edges[index]?.label ?? '?').join('、') || '无'}`,
        ],
      }
    }
    const edge = doc.edges[selected.index]
    if (!edge) return null
    const members = edge.members
      .map((id) => doc.vertices.find((vertex) => vertex.id === id)?.label ?? '?')
      .join(' ')
    return {
      title: `超边 ${edge.label}`,
      lines: [`大小 = ${edge.members.length}`, `成员：${members}`, `权重 = ${edge.weight}`],
    }
  })

  function formatBool(value: boolean): string {
    return value ? '是' : '否'
  }

  function generate(): void {
    generateHyperDoc(hyperLab.preset, hyperLab.n, hyperLab.r, hyperLab.seed)
    jsonDraft = null
    jsonError = ''
    dualNotice = ''
  }

  function applyJson(): void {
    try {
      const parsed = parseHypergraphJson(jsonText)
      replaceHyperDoc(parsed)
      jsonDraft = null
      jsonError = ''
      dualNotice = ''
    } catch (error) {
      jsonError = error instanceof Error ? error.message : '导入失败'
    }
  }

  function exportJson(): void {
    downloadText(jsonText, 'hypergraph.json', 'application/json')
  }

  function showMatching(): void {
    hyperLab.coloring = null
    hyperLab.witness = {
      kind: 'matching',
      edges: [...analysis.matching.witness],
      vertices: [],
      label: `最大匹配 ν = ${analysis.matching.value}`,
    }
  }

  function showTransversal(): void {
    hyperLab.coloring = null
    hyperLab.witness = {
      kind: 'transversal',
      edges: [],
      vertices: [...analysis.transversal.witness],
      label: `最小横截 τ = ${analysis.transversal.value}`,
    }
  }

  function showPropertyB(): void {
    if (analysis.propertyB.colorable) {
      hyperLab.coloring = analysis.propertyB.coloring ? [...analysis.propertyB.coloring] : null
      hyperLab.witness = {
        kind: 'propertyB',
        edges: [],
        vertices: [],
        label: '2-着色见证',
      }
    } else {
      hyperLab.coloring = null
      hyperLab.witness = {
        kind: 'propertyB',
        edges: [],
        vertices: [],
        label: '不可 2-着色',
      }
    }
  }

  function loadDual(): void {
    const dual = dualHypergraph(doc)
    dualNotice = `对偶超图已载入：n' = ${dual.vertices.length}，m' = ${dual.edges.length}。`
    replaceHyperDoc(dual)
    jsonDraft = null
    hyperLab.witness = { kind: 'none', edges: [], vertices: [], label: '' }
    hyperLab.coloring = null
  }

  function loadCurrentGraph(): void {
    const graph = store.getState().doc.objects.find((object) => object.type === 'graph') as
      GraphObject | undefined
    if (!graph) {
      rainbowNotice = '当前文档没有图对象：请先在「图论绘图」中创建图。'
      return
    }
    if (graph.nodes.length < 3 || graph.nodes.length > 6) {
      rainbowNotice = `当前图有 ${graph.nodes.length} 个顶点；彩虹实验室支持 3–6 个顶点（Kₙ 小 n 穷举）。`
      return
    }
    setRainbowGraph(coloredGraphFromGraph(graph))
    rainbowNotice = `已读取「${graph.name}」：${graph.nodes.length} 顶点 / ${graph.edges.length} 条边。`
  }

  function runRainbowSearch(): void {
    const result = findRainbowCopies(rainbow.graph, pattern, 100)
    rainbow.copies = result.copies
    rainbow.selectedCopy = 0
    rainbow.searchNote = result.note
    rainbow.searchComplete = result.complete
  }

  function runGallai(): void {
    const probe = gallaiProbe(rainbow.graph, 500)
    rainbow.gallai = {
      gallai: probe.gallai,
      count: probe.triangles.length,
      complete: probe.complete,
    }
    if (probe.triangles.length > 0) {
      rainbow.copies = probe.triangles
      rainbow.selectedCopy = 0
      rainbow.searchNote = `检测到 ${probe.triangles.length}${probe.complete ? '' : '+'} 个彩虹三角形`
      rainbow.searchComplete = probe.complete
    }
  }

  function runAnti(): void {
    const result = antiRamsey(rainbow.n, pattern, { maxNodes: 500_000, maxMs: 1500 })
    rainbow.anti = result
    rainbow.antiMessage = result.note
  }

  function applyAnti(): void {
    const result = rainbow.anti
    if (!result) return
    rainbow.graph = completeGraphWithColoring(result.n, result.colors)
    rainbow.copies = []
    rainbow.selectedCopy = 0
    rainbow.gallai = null
    rainbow.searchNote = ''
    rainbow.antiMessage = `已把 ${result.value} 色见证着色应用到画布（无彩虹 ${rainbowPatternLabel(result.pattern)}）。`
  }

  function runHyperTarget(): void {
    rainbow.hyperResult = findRainbowHyperMatching(doc, rainbow.hyperSize)
  }

  function runHyperMax(): void {
    rainbow.hyperResult = maxRainbowHyperMatching(doc)
  }

  function copyLabels(copyIndex: number): string {
    const copy = rainbow.copies[copyIndex]
    if (!copy) return ''
    return copy.vertices.map((index) => rainbow.graph.labels[index] ?? '?').join(' → ')
  }

  function edgeLabels(edgeIndices: number[]): string {
    return edgeIndices.map((index) => doc.edges[index]?.label ?? '?').join('、')
  }
</script>

<aside class="hyper-panel" data-testid="hyper-panel">
  <div class="panel-header">超图与彩虹（v3.4 / v3.5）</div>
  <div class="tabs" role="tablist" aria-label="实验室子视图">
    <button
      type="button"
      class:active={hyperLab.tab === 'hypergraph'}
      data-testid="hyper-tab-graph"
      onclick={() => setHyperTab('hypergraph')}>超图实验室</button
    >
    <button
      type="button"
      class:active={hyperLab.tab === 'rainbow'}
      data-testid="hyper-tab-rainbow"
      onclick={() => setHyperTab('rainbow')}>彩虹 / 反拉姆齐</button
    >
  </div>

  {#if hyperLab.tab === 'hypergraph'}
    <div class="section">
      <div class="section-title">超图族</div>
      <div class="row wrap">
        <select
          data-testid="hyper-preset"
          value={hyperLab.preset}
          onchange={(event) =>
            (hyperLab.preset = (event.currentTarget as HTMLSelectElement)
              .value as typeof hyperLab.preset)}
        >
          {#each HYPER_PRESETS as item (item.id)}
            <option value={item.id}>{item.label}</option>
          {/each}
        </select>
        <span class="dim">n</span>
        <input
          class="num"
          type="number"
          min="1"
          max="12"
          data-testid="hyper-n"
          value={hyperLab.n}
          oninput={(event) =>
            (hyperLab.n = Number((event.currentTarget as HTMLInputElement).value))}
        />
        <span class="dim">r</span>
        <input
          class="num"
          type="number"
          min="1"
          max="12"
          data-testid="hyper-r"
          value={hyperLab.r}
          oninput={(event) =>
            (hyperLab.r = Number((event.currentTarget as HTMLInputElement).value))}
        />
        <button type="button" data-testid="hyper-generate" onclick={generate}>生成</button>
        <button type="button" data-testid="hyper-random" onclick={regenerateHyperSeed}
          >随机换种</button
        >
      </div>
      {#if hyperLab.error}
        <div class="error" data-testid="hyper-error">{hyperLab.error}</div>
      {/if}
      <div class="row wrap">
        {#each [['set', '集合视图'], ['bipartite', '二部图'], ['section', '2-截面'], ['line', '线图']] as [view, label] (view)}
          <button
            type="button"
            data-testid={`hyper-view-${view}`}
            class:active={hyperLab.view === view}
            onclick={() => setHyperView(view as typeof hyperLab.view)}>{label}</button
          >
        {/each}
      </div>
    </div>

    <div class="section">
      <div class="section-title">结构概览</div>
      <div class="grid" data-testid="hyper-summary">
        <span>顶点 n</span><b>{analysis.n}</b>
        <span>超边 m</span><b>{analysis.m}</b>
        <span>秩 rank</span><b>{analysis.rank}</b>
        <span>一致</span><b>{analysis.uniform ?? '否'}</b>
        <span>线性</span><b>{formatBool(analysis.linear)}</b>
        <span>正则</span><b>{formatBool(analysis.regular)}</b>
        <span>连通</span><b>{formatBool(analysis.connected)}</b>
        <span>连通分量</span><b>{analysis.components.length}</b>
        <span>最大共度</span><b>{analysis.maxCodegree}</b>
        <span>度 Δ / δ</span><b>{analysis.maxDegree} / {analysis.minDegree}</b>
      </div>
      <div class="hint">
        2-截面边数 {analysis.twoSectionPairs.length} · 线图边数 {analysis.lineGraphEdges.length} · 对偶
        n' = {analysis.dual.n}、m' = {analysis.dual.m}
      </div>
      <div class="row wrap">
        <button type="button" data-testid="hyper-matching" onclick={showMatching}
          >标记最大匹配</button
        >
        <button type="button" data-testid="hyper-transversal" onclick={showTransversal}
          >标记最小横截</button
        >
        <button type="button" data-testid="hyper-propertyb" onclick={showPropertyB}
          >Property B 见证</button
        >
        <button type="button" data-testid="hyper-dual-load" onclick={loadDual}>载入对偶图</button>
        <button type="button" data-testid="hyper-witness-clear" onclick={clearHyperWitness}
          >清除标记</button
        >
      </div>
      <div class="line" data-testid="hyper-matching-result">
        最大匹配 ν = <b>{analysis.matching.value}</b>；见证：{edgeLabels(
          analysis.matching.witness,
        ) || '—'}
      </div>
      <div class="line" data-testid="hyper-transversal-result">
        最小横截 τ = <b>{analysis.transversal.value}</b>；见证：{analysis.transversal.witness
          .map((index) => doc.vertices[index]?.label ?? '?')
          .join('、') || '—'}；独立数 α = {analysis.independence.value}
      </div>
      <div class="line" data-testid="hyper-propertyb-result">
        {#if analysis.propertyB.colorable}
          Property B：<b>可 2-着色</b>（{analysis.propertyB.coloring?.join('')}）
        {:else}
          Property B：<b>不可 2-着色</b>（任何 2-着色都含单色超边）
        {/if}
      </div>
      {#if dualNotice}
        <div class="hint" data-testid="hyper-dual-result">{dualNotice}</div>
      {/if}
      {#if hyperLab.witness.kind !== 'none'}
        <div class="badge" data-testid="hyper-witness-label">{hyperLab.witness.label}</div>
      {/if}
    </div>

    <div class="section">
      <div class="section-title">选中对象</div>
      {#if selectionInfo}
        <div class="selection" data-testid="hyper-selection">
          <strong>{selectionInfo.title}</strong>
          {#each selectionInfo.lines as line (line)}
            <div>{line}</div>
          {/each}
        </div>
      {:else}
        <div class="hint">在画布上点击顶点或超边查看度、关联与成员。</div>
      {/if}
    </div>

    <div class="section">
      <div class="section-title">JSON 编辑（紧凑格式）</div>
      <textarea
        class="json"
        data-testid="hyper-json"
        value={jsonText}
        oninput={(event) => (jsonDraft = (event.currentTarget as HTMLTextAreaElement).value)}
        spellcheck="false"></textarea>
      <div class="row wrap">
        <button type="button" data-testid="hyper-json-apply" onclick={applyJson}>应用</button>
        <button type="button" data-testid="hyper-json-export" onclick={exportJson}>导出 JSON</button
        >
      </div>
      {#if jsonError}
        <div class="error" data-testid="hyper-json-error">{jsonError}</div>
      {/if}
      <div class="hint">支持 {'{n, edges}'} 紧凑格式，或含 vertices/成员 id 的完整文档。</div>
    </div>
  {:else}
    <div class="section">
      <div class="section-title">着色完全图 Kₙ</div>
      <div class="row wrap">
        <span class="dim">n</span>
        <input
          class="num"
          type="number"
          min="3"
          max="6"
          data-testid="rainbow-n"
          value={rainbow.n}
          oninput={(event) => setRainbowN(Number((event.currentTarget as HTMLInputElement).value))}
        />
        <select
          data-testid="rainbow-preset"
          value={rainbow.preset}
          onchange={(event) => {
            regenerateRainbow(
              (event.currentTarget as HTMLSelectElement).value as typeof rainbow.preset,
            )
          }}
        >
          <option value="rainbow">全不同色</option>
          <option value="gallai">Gallai（无彩虹三角形）</option>
          <option value="random3">确定性 3 色</option>
        </select>
        <button type="button" data-testid="rainbow-generate" onclick={() => regenerateRainbow()}
          >重新生成</button
        >
        <button type="button" data-testid="rainbow-load-graph" onclick={loadCurrentGraph}
          >读取当前图</button
        >
      </div>
      {#if rainbowNotice}
        <div class="hint" data-testid="rainbow-source-note">{rainbowNotice}</div>
      {/if}
      <div class="hint">
        当前：{rainbow.graph.n} 顶点 / {rainbow.graph.edges.length} 条边 / {rainbowColorCount} 种颜色
      </div>
    </div>

    <div class="section">
      <div class="section-title">彩虹子图搜索</div>
      <div class="row wrap">
        <select
          data-testid="rainbow-pattern"
          value={rainbow.patternId}
          onchange={(event) => {
            rainbow.patternId = (event.currentTarget as HTMLSelectElement).value
            rainbow.copies = []
            rainbow.searchNote = ''
          }}
        >
          {#each RAINBOW_PATTERNS as item (item.id)}
            <option value={item.id}>{item.label}</option>
          {/each}
        </select>
        <button type="button" data-testid="rainbow-run" onclick={runRainbowSearch}
          >查找彩虹副本</button
        >
      </div>
      <div class="line" data-testid="rainbow-result">
        目标 {rainbowPatternLabel(pattern)}：<b>{rainbow.copies.length}</b> 个
        {#if !rainbow.searchComplete && rainbow.copies.length > 0}<span class="warn"
            >（未穷尽）</span
          >{/if}
      </div>
      {#if rainbow.searchNote}
        <div class="hint">{rainbow.searchNote}</div>
      {/if}
      {#if rainbow.copies.length > 0}
        <div class="copy-list" data-testid="rainbow-table">
          {#each Array.from({ length: Math.min(24, rainbow.copies.length) }, (_value, i) => i) as index (index)}
            <button
              type="button"
              class="copy-row"
              class:active={rainbow.selectedCopy === index}
              data-testid={`rainbow-copy-${index}`}
              onclick={() => (rainbow.selectedCopy = index)}
            >
              {copyLabels(index)}
            </button>
          {/each}
        </div>
        {#if rainbow.copies.length > 24}
          <div class="hint">仅列出前 24 条；画布只高亮当前选中项。</div>
        {/if}
      {/if}
    </div>

    <div class="section">
      <div class="section-title">Gallai 着色 / 反拉姆齐</div>
      <div class="row wrap">
        <button type="button" data-testid="rainbow-gallai" onclick={runGallai}
          >检测彩虹三角形</button
        >
        <button type="button" data-testid="rainbow-anti-run" onclick={runAnti}>
          计算 ar({rainbow.n}, {rainbowPatternLabel(pattern)})
        </button>
        <button
          type="button"
          data-testid="rainbow-anti-apply"
          disabled={!rainbow.anti}
          onclick={applyAnti}>应用见证着色</button
        >
      </div>
      {#if rainbow.gallai}
        <div class="line" data-testid="rainbow-gallai-result">
          {#if rainbow.gallai.gallai}
            <b>Gallai 着色</b>：无彩虹三角形。
          {:else}
            <b>含彩虹三角形</b>：{rainbow.gallai.count}
            {#if !rainbow.gallai.complete}（已截断）{/if} 个。
          {/if}
        </div>
      {/if}
      {#if rainbow.anti}
        <div class="line" data-testid="rainbow-anti-result">
          ar({rainbow.anti.n}, {rainbowPatternLabel(rainbow.anti.pattern)}) =
          <b>{rainbow.anti.value}</b>
          {#if !rainbow.anti.complete}<span class="warn">（下界）</span>{/if}
        </div>
        <div class="hint">{rainbow.anti.note}</div>
      {:else if rainbow.antiMessage}
        <div class="hint">{rainbow.antiMessage}</div>
      {/if}
    </div>

    <div class="section">
      <div class="section-title">超图彩虹匹配（当前超图）</div>
      <div class="row wrap">
        <span class="dim">目标大小</span>
        <input
          class="num"
          type="number"
          min="1"
          max="12"
          data-testid="rainbow-hyper-size"
          value={rainbow.hyperSize}
          oninput={(event) =>
            (rainbow.hyperSize = Number((event.currentTarget as HTMLInputElement).value))}
        />
        <button type="button" data-testid="rainbow-hyper-run" onclick={runHyperTarget}>查找</button>
        <button type="button" data-testid="rainbow-hyper-max" onclick={runHyperMax}>最大</button>
      </div>
      {#if rainbow.hyperResult}
        <div class="line" data-testid="rainbow-hyper-result">
          {#if rainbow.hyperResult.witnesses.length > 0}
            彩虹匹配大小 <b>{rainbow.hyperResult.size}</b>：{edgeLabels(
              rainbow.hyperResult.witnesses[0] ?? [],
            )}
          {:else}
            无大小为 {rainbow.hyperResult.size} 的彩虹匹配
          {/if}
        </div>
        <div class="hint">{rainbow.hyperResult.note}</div>
      {/if}
    </div>
  {/if}
</aside>

<style>
  .hyper-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .panel-header {
    font-weight: 600;
  }
  .tabs {
    display: flex;
    gap: 4px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
  }
  .tabs button {
    flex: 1;
    font: inherit;
    font-size: 12px;
    padding: 5px 6px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
  }
  .tabs button.active {
    background: var(--bg-panel);
    border-color: var(--border);
    color: var(--text);
    font-weight: 600;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-dim);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row.wrap {
    flex-wrap: wrap;
  }
  .row button.active {
    border-color: #4c7dff;
    background: rgba(76, 125, 255, 0.16);
  }
  .dim {
    font-size: 11px;
    color: var(--text-dim);
  }
  .num {
    width: 56px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 10px;
    font-size: 12px;
  }
  .grid span {
    color: var(--text-dim);
  }
  .line {
    font-size: 12px;
    line-height: 1.6;
  }
  .hint {
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.6;
  }
  .error {
    font-size: 11px;
    color: #f87171;
    white-space: pre-wrap;
  }
  .warn {
    color: #fbbf24;
  }
  .badge {
    align-self: flex-start;
    font-size: 11px;
    border: 1px solid rgba(251, 191, 36, 0.5);
    background: rgba(251, 191, 36, 0.12);
    color: #fcd34d;
    border-radius: 6px;
    padding: 2px 7px;
  }
  .selection {
    font-size: 12px;
    border: 1px solid rgba(76, 125, 255, 0.4);
    background: rgba(76, 125, 255, 0.1);
    border-radius: 6px;
    padding: 7px 9px;
    line-height: 1.7;
  }
  .json {
    min-height: 130px;
    resize: vertical;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 11px;
    line-height: 1.5;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    padding: 6px;
  }
  .copy-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 180px;
    overflow-y: auto;
  }
  .copy-row {
    text-align: left;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 4px;
    border: 1px solid transparent;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
  }
  .copy-row:hover {
    color: var(--text);
  }
  .copy-row.active {
    border-color: rgba(251, 191, 36, 0.5);
    background: rgba(251, 191, 36, 0.12);
    color: #fcd34d;
  }
</style>
