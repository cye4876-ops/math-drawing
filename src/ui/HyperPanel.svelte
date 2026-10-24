<script lang="ts">
  /**
   * 超图与彩虹实验室面板（v3.4 / v3.5）：
   * 超图族生成 / 四视图 / 精确不变量 / Property B / JSON 编辑 / 对偶；
   * 彩虹子图搜索 / Gallai 检测 / 反拉姆齐小 n / 超图彩虹匹配。
   */
  import {
    hyperLab,
    clearExtraPatterns,
    clearHyperWitness,
    generateHyperDoc,
    loadHyperTuranWitness,
    loadRamseyToRainbow,
    regenerateRainbow,
    regenerateHyperSeed,
    replaceHyperDoc,
    resetExtremalFilters,
    runExtremalSearch,
    runHyperTuran,
    runTriangleRamsey,
    runTuranConstruction,
    setCustomFormat,
    setExtremalComplement,
    setExtremalFilterBoolean,
    setExtremalMaxDegree,
    setExtremalMode,
    setExtremalN,
    setExtremalPattern,
    setHyperTab,
    setHyperView,
    setRainbowGraph,
    setRainbowN,
    setTuranParts,
    showExtremalGraph,
    showSaturationGraph,
    toggleExtraPattern,
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
    HYPER_TURAN_LABELS,
    HYPER_TURAN_PATTERNS,
    formatHyperWitness,
  } from '../extremal/hyper-turan'
  import { PATTERN_PRESETS } from '../extremal/patterns'
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
  const extremal = $derived(hyperLab.extremal)
  const extraPresets = $derived(
    PATTERN_PRESETS.filter((preset) => preset.id !== extremal.patternId),
  )
  const selectedCandidate = $derived(extremal.result?.extremal[extremal.selectedExtremal] ?? null)
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
  <div class="panel-header">超图、彩虹与极值（v3.4 – v3.7）</div>
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
    <button
      type="button"
      class:active={hyperLab.tab === 'extremal'}
      data-testid="hyper-tab-extremal"
      onclick={() => setHyperTab('extremal')}>极值计算台</button
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
  {:else if hyperLab.tab === 'rainbow'}
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
  {:else}
    <div class="section">
      <div class="section-title">ex(n,F) 精确搜索（n ≤ 7 图集）</div>
      <div class="row wrap">
        <span class="dim">n</span>
        <input
          class="num"
          type="number"
          min="1"
          max="7"
          data-testid="extremal-n"
          value={extremal.n}
          oninput={(event) => setExtremalN(Number((event.currentTarget as HTMLInputElement).value))}
        />
        <select
          data-testid="extremal-pattern"
          value={extremal.patternId}
          onchange={(event) => setExtremalPattern((event.currentTarget as HTMLSelectElement).value)}
        >
          {#each PATTERN_PRESETS as preset (preset.id)}
            <option value={preset.id}>{preset.label}</option>
          {/each}
          <option value="custom">自定义禁图…</option>
        </select>
        <select
          data-testid="extremal-mode"
          value={extremal.mode}
          onchange={(event) =>
            setExtremalMode(
              (event.currentTarget as HTMLSelectElement).value as typeof extremal.mode,
            )}
        >
          <option value="subgraph">普通子图</option>
          <option value="induced">诱导子图</option>
        </select>
        <button type="button" data-testid="extremal-run" onclick={runExtremalSearch}>计算 ex</button
        >
      </div>

      <div class="row wrap">
        <span class="dim">附加禁图</span>
        {#each extraPresets as preset (preset.id)}
          <button
            type="button"
            class="chip"
            class:active={extremal.extraPatternIds.includes(preset.id)}
            data-testid={`extremal-extra-${preset.id}`}
            onclick={() => toggleExtraPattern(preset.id)}>{preset.label}</button
          >
        {/each}
        {#if extremal.extraPatternIds.length > 0}
          <button type="button" data-testid="extremal-extra-clear" onclick={clearExtraPatterns}
            >清空附加</button
          >
        {/if}
      </div>

      <div class="row wrap">
        <label class="check">
          <input
            type="checkbox"
            data-testid="extremal-complement"
            checked={extremal.complement}
            onchange={(event) =>
              setExtremalComplement((event.currentTarget as HTMLInputElement).checked)}
          />取补图
        </label>
        <span class="dim">结构约束</span>
        <label class="check">
          <input
            type="checkbox"
            data-testid="extremal-filter-connected"
            checked={extremal.filters.connected}
            onchange={(event) =>
              setExtremalFilterBoolean(
                'connected',
                (event.currentTarget as HTMLInputElement).checked,
              )}
          />连通
        </label>
        <label class="check">
          <input
            type="checkbox"
            data-testid="extremal-filter-bipartite"
            checked={extremal.filters.bipartite}
            onchange={(event) =>
              setExtremalFilterBoolean(
                'bipartite',
                (event.currentTarget as HTMLInputElement).checked,
              )}
          />二部
        </label>
        <label class="check">
          <input
            type="checkbox"
            data-testid="extremal-filter-planar"
            checked={extremal.filters.planar}
            onchange={(event) =>
              setExtremalFilterBoolean('planar', (event.currentTarget as HTMLInputElement).checked)}
          />平面
        </label>
        <label class="check">
          <input
            type="checkbox"
            data-testid="extremal-filter-triangle-free"
            checked={extremal.filters.triangleFree}
            onchange={(event) =>
              setExtremalFilterBoolean(
                'triangleFree',
                (event.currentTarget as HTMLInputElement).checked,
              )}
          />无三角形
        </label>
        <span class="dim">Δ ≤</span>
        <input
          class="num"
          type="number"
          min="0"
          max="7"
          data-testid="extremal-filter-max-degree"
          value={extremal.filters.maxDegree}
          oninput={(event) =>
            setExtremalMaxDegree(Number((event.currentTarget as HTMLInputElement).value))}
        />
        <button type="button" data-testid="extremal-filter-reset" onclick={resetExtremalFilters}
          >重置约束</button
        >
      </div>

      {#if extremal.patternId === 'custom'}
        <div class="row wrap">
          <select
            data-testid="extremal-custom-format"
            value={extremal.customFormat}
            onchange={(event) =>
              setCustomFormat(
                (event.currentTarget as HTMLSelectElement).value as typeof extremal.customFormat,
              )}
          >
            <option value="edges">边表</option>
            <option value="graph6">graph6</option>
          </select>
          <input
            class="grow"
            data-testid="extremal-custom"
            placeholder={extremal.customFormat === 'edges'
              ? '0-1, 1-2；多张图用分号分隔'
              : 'Bw; C~（多个 graph6 用空白/分号分隔）'}
            value={extremal.customEdges}
            oninput={(event) =>
              (extremal.customEdges = (event.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <div class="hint">
          边表格式：`0-1, 1-2`；多张禁图用分号或换行分隔。graph6 支持 n ≤ 7，可粘贴 nauty
          格式字符串。
        </div>
      {/if}
      {#if extremal.customError}
        <div class="error" data-testid="extremal-error">{extremal.customError}</div>
      {/if}
      {#if extremal.result}
        {#if extremal.result.maxEdges >= 0}
          <div class="line" data-testid="extremal-result">
            ex({extremal.result.n}, {extremal.result.patternLabel}) =
            <b>{extremal.result.maxEdges}</b>
            · {extremal.result.mode === 'subgraph' ? '普通子图' : '诱导子图'} ·
            {extremal.result.patternCount} 张禁图 · 扫描
            {extremal.result.scanned} 个非同构图（{extremal.result.freeCount} 个不含禁图）
          </div>
        {:else}
          <div class="line" data-testid="extremal-result">
            没有满足结构约束的 H-free 图；ex 无定义。
          </div>
        {/if}
        <div class="hint">{extremal.result.note}</div>
        <div class="hint" data-testid="extremal-filter-result">
          结构约束：{extremal.result.filterLabel} · 筛去 {extremal.result.filteredOut} 个 · 满足约束
          {extremal.result.eligible} 个
        </div>
        {#if extremal.result.known}
          <div class="hint" data-testid="extremal-formula">{extremal.result.known.formula}</div>
        {:else if extremal.result.lowerBound}
          <div class="hint" data-testid="extremal-formula">
            Turán 构造下界：T{extremal.result.lowerBound.parts}(n) =
            {extremal.result.lowerBound.edges}（该构造同时不含所有选中禁图）
          </div>
        {/if}
        {#if extremal.result.filterLabel === '无'}
          <div class="hint" data-testid="extremal-asymptotic">
            渐近：χ_min = {extremal.result.asymptotic.familyChromatic}，π(F) =
            {extremal.result.asymptotic.familyDensity.toFixed(3)}；{extremal.result.asymptotic.note}
          </div>
        {/if}
        {#if selectedCandidate}
          <div class="line" data-testid="extremal-maximality">
            {#if selectedCandidate.maximality.maximal}
              极大性证书：<b>通过</b>（结构约束内 {selectedCandidate.maximality.addableEdges}
              条可加入边都会产生禁图
              {#if selectedCandidate.maximality.blockedByFilters > 0}
                ；另有 {selectedCandidate.maximality.blockedByFilters} 条被约束阻止
              {/if}）
            {:else}
              非极大：缺失边 ({selectedCandidate.maximality.witnessEdge?.join(',') ?? '?'})
              加入后仍不含禁图
            {/if}
          </div>
          {#if selectedCandidate.stability}
            <div class="hint" data-testid="extremal-stability">
              稳定性：χ = {selectedCandidate.stability.chromatic}，{selectedCandidate.stability
                .note}
            </div>
          {/if}
        {/if}
        <div class="hint">{extremal.previewNote}</div>
        {#if extremal.result.extremal.length > 0}
          <div class="row wrap">
            {#each extremal.result.extremal as graph, index (graph.graph6)}
              <button
                type="button"
                class:active={extremal.selectedExtremal === index}
                data-testid={`extremal-graph-${index}`}
                onclick={() => showExtremalGraph(index)}>极图 #{index + 1}</button
              >
            {/each}
          </div>
          <div class="hint">
            共 {extremal.result.extremalCount} 个极图；按钮最多展示前
            {extremal.result.extremal.length} 个。
          </div>
        {/if}
        {#if extremal.result.saturation}
          <div class="line" data-testid="extremal-saturation">
            sat({extremal.result.n}, {extremal.result.patternLabel}) =
            {#if extremal.result.saturation.value === null}
              <b>未找到</b>
            {:else}
              <b>{extremal.result.saturation.value}</b>
            {/if}
            · {extremal.result.saturation.count} 个最小饱和图
          </div>
          <div class="hint">{extremal.result.saturation.note}</div>
          {#if extremal.result.saturation.examples.length > 0}
            <div class="row wrap">
              {#each extremal.result.saturation.examples as graph, index (graph.graph6)}
                <button
                  type="button"
                  data-testid={`extremal-sat-${index}`}
                  onclick={() => showSaturationGraph(index)}
                  >饱和图 #{index + 1}（{graph.m} 边）</button
                >
              {/each}
            </div>
          {/if}
        {/if}
      {/if}
    </div>

    <div class="section">
      <div class="section-title">Turán 构造对照</div>
      <div class="row wrap">
        <span class="dim">部数 r</span>
        <input
          class="num"
          type="number"
          min="1"
          max="7"
          data-testid="extremal-turan-r"
          value={extremal.turanParts}
          oninput={(event) =>
            setTuranParts(Number((event.currentTarget as HTMLInputElement).value))}
        />
        <button type="button" data-testid="extremal-turan" onclick={runTuranConstruction}
          >构造 T_r(n)</button
        >
      </div>
      {#if extremal.turanMessage}
        <div class="line" data-testid="extremal-turan-result">{extremal.turanMessage}</div>
      {/if}
      <div class="hint">
        平衡完全 r 部图给出 Turán 定理的上界；切换“普通子图”并禁 K{extremal.turanParts + 1} 可核对精确搜索是否达到该构造。
      </div>
    </div>

    <div class="section">
      <div class="section-title">Ramsey R(3,3) 小证书</div>
      <div class="row wrap">
        <span class="dim">n</span>
        <input
          class="num"
          type="number"
          min="3"
          max="6"
          data-testid="ramsey-n"
          value={extremal.ramseyN}
          oninput={(event) =>
            (extremal.ramseyN = Math.max(
              3,
              Math.min(6, Number((event.currentTarget as HTMLInputElement).value) || 3),
            ))}
        />
        <button type="button" data-testid="ramsey-run" onclick={runTriangleRamsey}
          >穷举 2-着色</button
        >
        <button
          type="button"
          data-testid="ramsey-load"
          disabled={!extremal.ramsey?.colors}
          onclick={loadRamseyToRainbow}>载入彩虹画布</button
        >
      </div>
      {#if extremal.ramsey}
        <div class="line" data-testid="ramsey-result">
          K{extremal.ramsey.n}：
          {#if extremal.ramsey.exists}
            存在 <b>{extremal.ramsey.canonicalCount}</b> 个首边固定的无单色三角形 2-着色（颜色互换后
            {extremal.ramsey.totalCount} 个）
          {:else}
            <b>不存在</b>无单色三角形的 2-着色
          {/if}
        </div>
        <div class="hint">{extremal.ramsey.note}</div>
        <div class="hint">{extremal.previewNote}</div>
      {/if}
    </div>

    <div class="section">
      <div class="section-title">3-一致超图 Turán（禁 K₄³ / 松三角形）</div>
      <div class="row wrap">
        <span class="dim">n</span>
        <input
          class="num"
          type="number"
          min="4"
          max="6"
          data-testid="hyperex-n"
          value={extremal.hyperN}
          oninput={(event) =>
            (extremal.hyperN = Math.max(
              4,
              Math.min(6, Number((event.currentTarget as HTMLInputElement).value) || 4),
            ))}
        />
        <select
          data-testid="hyperex-pattern"
          value={extremal.hyperPattern}
          onchange={(event) =>
            (extremal.hyperPattern = (event.currentTarget as HTMLSelectElement)
              .value as typeof extremal.hyperPattern)}
        >
          {#each HYPER_TURAN_PATTERNS as patternId (patternId)}
            <option value={patternId}>{HYPER_TURAN_LABELS[patternId]}</option>
          {/each}
        </select>
        <button type="button" data-testid="hyperex-run" onclick={runHyperTuran}>搜索极值</button>
        <button
          type="button"
          data-testid="hyperex-load"
          disabled={!extremal.hyperResult?.witness.length}
          onclick={loadHyperTuranWitness}>载入超图实验室</button
        >
      </div>
      {#if extremal.hyperResult}
        <div class="line" data-testid="hyperex-result">
          ex₃({extremal.hyperResult.n}, {HYPER_TURAN_LABELS[extremal.hyperResult.pattern]}) =
          <b>{extremal.hyperResult.maxEdges}</b>
          · 禁例 {extremal.hyperResult.instances} 个 · {extremal.hyperResult.nodes} 个搜索节点
        </div>
        <div class="hint">{extremal.hyperResult.note}</div>
        <div class="hint">
          极值超边：{formatHyperWitness(extremal.hyperResult.witness)}
        </div>
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
  .chip {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
  }
  .chip.active {
    border-color: #4c7dff;
    background: rgba(76, 125, 255, 0.16);
    color: var(--text);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-dim);
    cursor: pointer;
  }
  .check input {
    width: 13px;
    height: 13px;
    margin: 0;
  }
  .grow {
    flex: 1;
    min-width: 180px;
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
