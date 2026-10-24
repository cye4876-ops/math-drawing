<script lang="ts">
  /**
   * 图分析面板（v3.2）：中心性 / 社区发现 / 连通度 / 围长与直径 / 自同构计数。
   * 着色通过 onHighlight 的 fills 通道直接覆盖节点填充色（不修改文档）。
   */
  import type { GraphObject } from '../graph/model'
  import type { SceneHighlight } from '../render/element-registry'
  import {
    CENTRALITY_LABELS,
    computeCentrality,
    type CentralityMetric,
    type CentralityResult,
  } from '../graph/centrality'
  import { detectCommunities, type CommunityResult } from '../graph/community'
  import {
    computeConnectivity,
    diameterOf,
    girthOf,
    type ConnectivityResult,
  } from '../graph/connectivity'
  import { countAutomorphisms, type AutomorphismResult } from '../graph/isomorphism'
  import { computeGraphStats, filterNodeIndices, type GraphStats } from '../graph/stats'

  let {
    graph,
    onHighlight,
  }: {
    graph: GraphObject
    onHighlight: (highlight: SceneHighlight | null) => void
  } = $props()

  let metric = $state<CentralityMetric>('betweenness')
  let centrality = $state<CentralityResult | null>(null)
  let community = $state<CommunityResult | null>(null)
  let connectivity = $state<ConnectivityResult | null>(null)
  let invariants = $state<{ girth: number; diameter: number | null } | null>(null)
  let automorphism = $state<AutomorphismResult | null>(null)
  let stats = $state<GraphStats | null>(null)
  let filterKind = $state<'degree' | 'community' | 'centrality'>('degree')
  let filterValue = $state(2)
  let filterInfo = $state('')

  // 图结构变化时清空旧结果，避免把上一张图的数值配到当前图上
  let lastKey = $state('')
  $effect(() => {
    const key = `${graph.id}:${graph.nodes.length}:${graph.edges.length}`
    if (key !== lastKey) {
      lastKey = key
      centrality = null
      community = null
      connectivity = null
      invariants = null
      automorphism = null
      stats = null
      filterInfo = ''
    }
  })

  function formatValue(value: number): string {
    if (!Number.isFinite(value)) return '—'
    if (Math.abs(value) >= 1000) return value.toFixed(1)
    return Math.abs(value) >= 1 ? value.toFixed(3) : value.toFixed(4)
  }

  function runCentrality(): void {
    centrality = computeCentrality(graph, metric)
  }

  const COMMUNITY_PALETTE = [
    '#f97316',
    '#22d3ee',
    '#a3e635',
    '#e879f9',
    '#facc15',
    '#60a5fa',
    '#fb7185',
    '#34d399',
  ]

  function applyCentralityColors(): void {
    if (!centrality || graph.nodes.length === 0) return
    const values = centrality.values
    const min = Math.min(...values)
    const max = Math.max(...values)
    const fills: Record<string, string> = {}
    graph.nodes.forEach((node, index) => {
      const t = max > min ? ((values[index] ?? 0) - min) / (max - min) : 0.5
      fills[node.id] = `hsl(${Math.round(215 - 200 * t)} 85% 52%)`
    })
    onHighlight({ fills })
  }

  function applyCommunityColors(): void {
    if (!community) return
    const fills: Record<string, string> = {}
    graph.nodes.forEach((node, index) => {
      const group = community!.communityOf[index] ?? 0
      fills[node.id] = COMMUNITY_PALETTE[group % COMMUNITY_PALETTE.length]!
    })
    onHighlight({ fills })
  }

  function clearColors(): void {
    onHighlight(null)
  }

  function runCommunity(): void {
    community = detectCommunities(graph)
  }

  function runConnectivity(): void {
    connectivity = computeConnectivity(graph)
  }

  function runInvariants(): void {
    invariants = { girth: girthOf(graph), diameter: diameterOf(graph) }
  }

  function runAutomorphism(): void {
    automorphism = countAutomorphisms(graph)
  }

  function runStats(): void {
    stats = computeGraphStats(graph)
  }

  function applyFilter(): void {
    if (graph.nodes.length === 0) return
    let matched: number[]
    let description: string
    if (filterKind === 'degree') {
      const result = filterNodeIndices(graph, { kind: 'degree', min: filterValue })
      matched = result.matched
      description = result.description
    } else if (filterKind === 'community') {
      if (!community) community = detectCommunities(graph)
      const result = filterNodeIndices(graph, {
        kind: 'community',
        communities: community.communityOf,
        community: filterValue,
      })
      matched = result.matched
      description = result.description
    } else {
      if (!centrality) centrality = computeCentrality(graph, metric)
      const result = filterNodeIndices(graph, {
        kind: 'centrality',
        values: centrality.values,
        top: filterValue,
      })
      matched = result.matched
      description = result.description
    }
    const picked = new Set(matched)
    const fills: Record<string, string> = {}
    graph.nodes.forEach((node, index) => {
      fills[node.id] = picked.has(index) ? '#2563eb' : '#cbd5e1'
    })
    onHighlight({ fills })
    filterInfo = description
  }

  function clearFilter(): void {
    onHighlight(null)
    filterInfo = ''
  }

  const topRows = $derived(centrality ? centrality.ranking.slice(0, 12) : [])
</script>

<div class="graph-analysis" data-testid="graph-analysis-panel">
  <div class="section-title">中心性（NetworkX 对齐）</div>
  <div class="row">
    <select
      data-testid="analysis-metric"
      value={metric}
      onchange={(event) =>
        (metric = (event.currentTarget as HTMLSelectElement).value as CentralityMetric)}
    >
      {#each Object.entries(CENTRALITY_LABELS) as [value, label] (value)}
        <option {value}>{label}</option>
      {/each}
    </select>
    <button type="button" data-testid="analysis-run" onclick={runCentrality}>计算</button>
    <button
      type="button"
      data-testid="analysis-color"
      disabled={!centrality}
      onclick={applyCentralityColors}>按值着色</button
    >
    <button type="button" data-testid="analysis-clear" onclick={clearColors}>清除着色</button>
  </div>
  {#if centrality}
    <table class="analysis-table" data-testid="analysis-table">
      <thead>
        <tr><th>#</th><th>顶点</th><th>值</th></tr>
      </thead>
      <tbody>
        {#each topRows as row, index (row.id)}
          <tr>
            <td>{index + 1}</td>
            <td class="mono">{row.label}</td>
            <td>{formatValue(row.value)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <div class="hint" data-testid="analysis-note">{centrality.note}</div>
  {:else}
    <div class="hint">选择指标后点击「计算」；着色只覆盖画面显示，不改文档颜色。</div>
  {/if}

  <div class="section-title">社区发现（Louvain）</div>
  <div class="row">
    <button type="button" data-testid="community-run" onclick={runCommunity}>检测社区</button>
    <button
      type="button"
      data-testid="community-color"
      disabled={!community}
      onclick={applyCommunityColors}>按社区着色</button
    >
  </div>
  {#if community}
    <div class="line" data-testid="community-info">
      社区数 <b>{community.count}</b> · 模块度 Q = <b>{community.modularity.toFixed(4)}</b>
    </div>
    <div class="hint">{community.note}</div>
  {:else}
    <div class="hint">Louvain：本地移动 + 聚合；无向、可加权（边权求和）。</div>
  {/if}

  <div class="section-title">连通度 / 围长 / 直径</div>
  <div class="row">
    <button type="button" data-testid="connectivity-run" onclick={runConnectivity}
      >计算 κ / λ</button
    >
    <button type="button" data-testid="invariants-run" onclick={runInvariants}
      >计算围长 / 直径</button
    >
  </div>
  {#if connectivity}
    <div class="line" data-testid="connectivity-result">
      点连通度 κ = <b>{connectivity.vertex ?? '—'}</b> · 边连通度 λ =
      <b>{connectivity.edge ?? '—'}</b>
    </div>
    <div class="hint">{connectivity.note}</div>
  {/if}
  {#if invariants}
    <div class="line" data-testid="invariants-result">
      围长 = <b>{Number.isFinite(invariants.girth) ? invariants.girth : '∞（森林）'}</b> · 直径 =
      <b>{invariants.diameter ?? '—（不连通）'}</b>
    </div>
  {/if}

  <div class="section-title">同构与自同构</div>
  <div class="row">
    <button type="button" data-testid="automorphism-run" onclick={runAutomorphism}
      >计算 |Aut(G)|</button
    >
  </div>
  {#if automorphism}
    <div class="line" data-testid="automorphism-count">
      |Aut(G)| = <b>{automorphism.count}</b>
      {#if !automorphism.complete}<span class="chip warn">未完成</span>{/if}
    </div>
    <div class="hint">{automorphism.note}</div>
  {:else}
    <div class="hint">颜色细化（1-WL）+ 回溯；同构判定与自同构共用搜索（预算保护）。</div>
  {/if}

  <div class="section-title">统计与过滤（Gephi 式）</div>
  <div class="row">
    <button type="button" data-testid="stats-run" onclick={runStats}>计算统计</button>
  </div>
  {#if stats}
    <div class="stats-grid" data-testid="stats-result">
      <span>顶点 n</span><b>{stats.n}</b>
      <span>边 m</span><b>{stats.m}</b>
      <span>密度</span><b>{stats.density.toFixed(4)}</b>
      <span>平均度</span><b>{stats.avgDegree.toFixed(3)}</b>
      <span>最大 / 最小度</span><b>{stats.maxDegree} / {stats.minDegree}</b>
      <span>孤立点</span><b>{stats.isolated}</b>
      <span>连通分量</span><b>{stats.components}</b>
    </div>
  {/if}
  <div class="row">
    <select
      data-testid="filter-kind"
      value={filterKind}
      onchange={(event) =>
        (filterKind = (event.currentTarget as HTMLSelectElement).value as
          'degree' | 'community' | 'centrality')}
    >
      <option value="degree">度数 ≥</option>
      <option value="community">社区 =</option>
      <option value="centrality">中心性前 k</option>
    </select>
    <input
      class="num"
      type="number"
      min="0"
      data-testid="filter-value"
      value={filterValue}
      oninput={(event) => (filterValue = Number((event.currentTarget as HTMLInputElement).value))}
    />
    <button type="button" data-testid="filter-apply" onclick={applyFilter}>应用过滤</button>
    <button type="button" data-testid="filter-clear" onclick={clearFilter}>清除</button>
  </div>
  {#if filterInfo}
    <div class="line" data-testid="filter-info">命中：{filterInfo}</div>
  {/if}
  <div class="hint">
    过滤只改画面填充色（匹配深蓝、其余浅灰）；社区/中心性缺数据时会先自动计算。
  </div>
</div>

<style>
  .graph-analysis {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .analysis-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .analysis-table th,
  .analysis-table td {
    border-bottom: 1px solid var(--border);
    padding: 2px 4px;
    text-align: left;
  }

  .analysis-table th {
    color: var(--text-dim);
    font-weight: 500;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 10px;
    font-size: 12px;
  }

  .stats-grid span {
    color: var(--text-dim);
  }

  .num {
    width: 64px;
  }

  .mono {
    font-family: ui-monospace, Consolas, monospace;
  }

  .line {
    font-size: 12px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-dim);
  }

  .chip.warn {
    font-size: 11px;
    border-radius: 8px;
    padding: 0 6px;
    background: rgba(251, 191, 36, 0.18);
    color: #b45309;
  }
</style>
