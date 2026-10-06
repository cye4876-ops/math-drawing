<script lang="ts">
  /**
   * 图论实验台舞台（v2.7）：
   * 普通图搜索结果 / 超图分析·搜索 / 超图比较 / 档案详情。
   * 候选卡片可点击查看详情（复核明细、谱、见证）；图候选可一键送入绘图模式。
   */
  import CandidateGraph from './CandidateGraph.svelte'
  import HypergraphSVG from './HypergraphSVG.svelte'
  import {
    labState,
    getExperimentById,
    resumeGraphSearchAction,
  } from '../../state/lab-state.svelte'
  import { parseGraph6 } from '../../lab/graph6'
  import { GraphInvariants, girthOf } from '../../lab/invariants'
  import { isPlanar } from '../../lab/planarity'
  import { automorphismGroup } from '../../lab/automorphism'
  import {
    buildSageVerificationScript,
    sageInputFromExperiment,
    sageInputFromResult,
  } from '../../lab/sage-export'

  let {
    active,
    onOpenGraph,
  }: {
    /** 是否处于实验台模式（常驻挂载，非激活时隐藏） */
    active: boolean
    /** 把图候选送入绘图模式（App 负责创建图对象并切换模式） */
    onOpenGraph: (payload: { name: string; n: number; edges: Array<[number, number]> }) => void
  } = $props()

  // —— 档案存储形状（与 archive.ts 的裁剪形态对应） ——
  interface StoredCandidateGraph {
    n: number
    m: number
    graph6: string
    degrees: number[]
    edges: Array<[number, number]>
    rho: number | null
    objectiveValue?: number | null
    claimHolds: boolean | null
    checks: Array<{ label: string; passed: boolean }>
  }
  interface StoredCandidateHyper {
    n: number
    m: number
    edges: number[][]
    degrees: number[]
    nu: number
    tau: number
    alpha: number
    claimHolds: boolean | null
    checks: Array<{ label: string; passed: boolean }>
  }
  interface StoredGraphOrder {
    n: number
    best: number | null
    candidateCount: number
    coverage: string
    complete: boolean
    candidates: StoredCandidateGraph[]
  }
  interface StoredHyperOrder {
    n: number
    best: number | null
    candidateCount: number
    coverage: string
    complete: boolean
    candidates: StoredCandidateHyper[]
  }

  const viewingExperiment = $derived.by(() => {
    void labState.archiveVersion
    return getExperimentById(labState.viewingExperimentId)
  })

  const viewingGraphOrders = $derived(
    viewingExperiment && viewingExperiment.kind === 'graph'
      ? (viewingExperiment.orders as unknown as StoredGraphOrder[])
      : null,
  )
  const viewingHyperOrders = $derived(
    viewingExperiment && viewingExperiment.kind === 'hypergraph'
      ? (viewingExperiment.orders as unknown as StoredHyperOrder[])
      : null,
  )

  /** 选中的图候选：优先档案详情，其次实时结果 */
  const selectedGraphCandidate = $derived.by(() => {
    const selection = labState.selectedGraph
    if (!selection) return null
    if (viewingGraphOrders) {
      const order = viewingGraphOrders[selection.orderIndex]
      const candidate = order?.candidates[selection.candidateIndex]
      return order && candidate ? { order, candidate } : null
    }
    const result = labState.graphResult
    if (!result) return null
    const order = result.orders[selection.orderIndex]
    const candidate = order?.candidates[selection.candidateIndex]
    return order && candidate ? { order, candidate } : null
  })

  const selectedHyperCandidate = $derived.by(() => {
    const selection = labState.selectedHyper
    if (!selection) return null
    if (viewingHyperOrders) {
      const order = viewingHyperOrders[selection.orderIndex]
      const candidate = order?.candidates[selection.candidateIndex]
      return order && candidate ? { order, candidate } : null
    }
    const result = labState.hyperResult
    if (!result) return null
    const order = result.orders[selection.orderIndex]
    const candidate = order?.candidates[selection.candidateIndex]
    return order && candidate ? { order, candidate } : null
  })

  const selectedGraphSpectra = $derived.by(() => {
    const selected = selectedGraphCandidate
    if (!selected || !('graph6' in selected.candidate)) return null
    try {
      const graph = parseGraph6(selected.candidate.graph6)
      const values = new GraphInvariants(graph)
      return {
        A: values.spectrum('A'),
        L: values.spectrum('L'),
        Q: values.spectrum('Q'),
        rho: values.rho(),
        q: values.q(),
        lambda2: values.lambda2(),
        omega: values.get('omega') as number,
        alpha: values.get('alpha') as number,
        nu: values.get('nu') as number,
        triangles: values.get('triangles') as number,
      }
    } catch {
      return null
    }
  })

  function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '—'
    if (Math.abs(value) < 1e-9) return '0'
    return Math.abs(value) > 1e6 || Math.abs(value) < 1e-4
      ? value.toExponential(4)
      : value.toFixed(6)
  }

  const selectedGraphAut = $derived.by(() => {
    const selected = selectedGraphCandidate
    if (!selected || !('graph6' in selected.candidate)) return null
    try {
      return automorphismGroup(parseGraph6((selected.candidate as StoredCandidateGraph).graph6))
    } catch {
      return null
    }
  })
  function formatEigenvalues(values: number[], limit = 6): string {
    const head = values.slice(0, limit).map(formatNumber).join('，')
    return values.length > limit ? `${head}，…` : head
  }

  function coverageLabel(coverage: string): string {
    switch (coverage) {
      case 'optimal_edge_layer':
        return '目标层完整（已确认全部并列极值）'
      case 'minimum_counterexample_layer':
        return '最小反例层完整'
      case 'maximum_edge_layer':
        return '最大超边层完整'
      case 'empty_by_bound':
        return '边界判定为空（数学界排除）'
      case 'objective_layers':
        return '目标层'
      default:
        return '逐图枚举'
    }
  }

  function terminationLabel(termination: string): string {
    switch (termination) {
      case 'exhausted':
        return '范围穷举完成'
      case 'minimum_counterexample_complete':
        return '已确认最小反例（所选范围）'
      case 'first_counterexample_order_exhausted':
        return '最小反例阶数完成'
      case 'graph_limit':
        return '生成预算耗尽（未完成）'
      case 'time_limit':
        return '时间预算耗尽（未完成）'
      case 'cancelled':
        return '已取消（未完成）'
      default:
        return termination
    }
  }

  function evidenceLabel(evidence: string): string {
    switch (evidence) {
      case 'verified_counterexample':
        return '已复核反例'
      case 'finite_optimum':
        return '已证最优（同构类完整）'
      case 'finite_exhaustive':
        return '已找齐（有限范围穷举完成）'
      default:
        return '未完成（预算耗尽/取消）'
    }
  }

  /** 谱/整数目标符号：按目标的数学定义标注候选值 */
  function objectiveSymbol(objective: string): string {
    switch (objective) {
      case 'max_spectral_radius':
        return 'ρ(A)'
      case 'max_signless_laplacian_radius':
        return 'q(Q)'
      case 'max_algebraic_connectivity':
        return 'λ₂(L)'
      case 'max_matching':
        return 'ν'
      case 'max_independence':
        return 'α'
      case 'max_clique':
        return 'ω'
      default:
        return 'ρ'
    }
  }

  function openGraphCandidate(): void {
    const selected = selectedGraphCandidate
    if (!selected || !('graph6' in selected.candidate)) return
    onOpenGraph({
      name: `${viewingExperiment?.title ?? labState.graphSpec.title} · n=${selected.candidate.n} · m=${selected.candidate.m}`,
      n: selected.candidate.n,
      edges: (selected.candidate.edges as Array<[number, number]>).map(
        ([u, v]) => [u, v] as [number, number],
      ),
    })
  }

  async function copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      labState.archiveNotice = '已复制 graph6'
    } catch {
      labState.archiveNotice = '复制失败（浏览器限制）'
    }
  }

  /** v3.1：导出 Sage 复算脚本（优先档案，其次实时结果）——浏览器 ↔ 第五版交接 */
  function downloadSageScript(): void {
    const viewing = viewingExperiment
    const input =
      (viewing && viewing.kind === 'graph' ? sageInputFromExperiment(viewing) : null) ??
      (labState.graphResult ? sageInputFromResult(labState.graphResult) : null)
    if (!input) return
    const text = buildSageVerificationScript(input)
    const blob = new Blob([text], { type: 'text/x-python;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'math-drawing-verify.py'
    anchor.click()
    URL.revokeObjectURL(url)
    labState.archiveNotice = '已导出 Sage 复算脚本（math-drawing-verify.py）'
  }

  /** 汇总行的结构标签：二部/连通/正则/围长（基于首个候选） */
  function structureLabel(candidate: { graph6: string; degrees: number[] } | undefined): string {
    if (!candidate) return '—'
    try {
      const graph = parseGraph6(candidate.graph6)
      const values = new GraphInvariants(graph)
      const parts = [values.get('bipartite') ? '二部' : '非二部']
      parts.push(values.get('connected') ? '连通' : '不连通')
      parts.push(isPlanar(graph) ? '平面' : '非平面')
      const degrees = candidate.degrees
      if (degrees.length > 0 && degrees.every((value) => value === degrees[0])) {
        parts.push(`${degrees[0]}-正则`)
      }
      const girth = girthOf(graph)
      if (Number.isFinite(girth)) parts.push(`围长 ${girth}`)
      return parts.join(' · ')
    } catch {
      return '—'
    }
  }
</script>

{#snippet summaryTable(
  rows: Array<{
    n: number
    best: number | null
    candidateCount: number
    complete: boolean
    candidates: Array<{ graph6: string; degrees: number[] }>
  }>,
)}
  <details class="summary" data-testid="lab-summary-table">
    <summary>各阶汇总（{rows.length} 阶）</summary>
    <table class="summary-table">
      <thead>
        <tr>
          <th>n</th>
          <th>最优值</th>
          <th>候选</th>
          <th>状态</th>
          <th>代表度序列</th>
          <th>结构</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as order, rowIndex (order.n + ':' + rowIndex)}
          <tr>
            <td>{order.n}</td>
            <td>{order.best === null ? '—' : formatNumber(order.best)}</td>
            <td>{order.candidateCount}</td>
            <td>{order.complete ? '✓ 完成' : '未完成'}</td>
            <td class="mono">{order.candidates[0]?.degrees.join(' ') ?? '—'}</td>
            <td>{structureLabel(order.candidates[0])}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
{/snippet}

<div class="lab-view" class:inactive={!active} data-testid="lab-view">
  {#if viewingExperiment}
    <div class="strip">
      <div class="strip-main">
        <strong>档案：{viewingExperiment.title}</strong>
        <span class="badge" class:ok={viewingExperiment.complete}>
          {viewingExperiment.complete ? '完整' : '未完成'}
        </span>
        <span class="dim">
          {viewingExperiment.kind === 'graph' ? '普通图' : '超图'} ·
          {new Date(viewingExperiment.createdAt).toLocaleString('zh-CN', { hour12: false })} · 算法 {viewingExperiment.algorithm}
          · 候选 {viewingExperiment.candidateCount} · 用时 {viewingExperiment.elapsed}s
        </span>
      </div>
      <div class="strip-actions">
        {#if viewingExperiment.kind === 'graph'}
          <button type="button" data-testid="lab-archive-sage-export" onclick={downloadSageScript}
            >导出 Sage 复算脚本</button
          >
        {/if}
        {#if viewingExperiment.kind === 'graph' && !viewingExperiment.complete}
          <button
            type="button"
            data-testid="lab-archive-resume"
            title="沿用已完成阶，只重算其余阶数（阶数级续算）"
            onclick={() => resumeGraphSearchAction()}>继续计算</button
          >
        {/if}
        <button type="button" onclick={() => (labState.viewingExperimentId = null)}>关闭档案</button
        >
      </div>
    </div>
    {#if viewingExperiment.notes}
      <div class="notes-readonly">笔记:{viewingExperiment.notes}</div>
    {/if}
    {#if viewingExperiment.kind === 'graph' && viewingGraphOrders}
      {@render summaryTable(viewingGraphOrders)}
    {/if}
    {#if viewingGraphOrders}
      {#each viewingGraphOrders as order, orderIndex (order.n)}
        <section class="order">
          <header>
            <strong>n = {order.n}</strong>
            {#if order.best !== null}<span class="dim">最优值 {formatNumber(order.best)}</span>{/if}
            <span class="dim">{coverageLabel(order.coverage)} · 候选 {order.candidateCount}</span>
          </header>
          <div class="cards">
            {#each order.candidates as candidate, candidateIndex (candidateIndex)}
              <button
                type="button"
                class="card"
                class:selected={labState.selectedGraph?.orderIndex === orderIndex &&
                  labState.selectedGraph?.candidateIndex === candidateIndex}
                onclick={() => (labState.selectedGraph = { orderIndex, candidateIndex })}
              >
                <CandidateGraph
                  n={candidate.n}
                  edges={candidate.edges}
                  size={150}
                  color="#0ea5e9"
                />
                <span class="card-meta">m = {candidate.m} · graph6 {candidate.graph6}</span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
    {#if viewingHyperOrders}
      {#each viewingHyperOrders as order, orderIndex (order.n)}
        <section class="order">
          <header>
            <strong>n = {order.n}</strong>
            {#if order.best !== null}<span class="dim">最优值 {formatNumber(order.best)}</span>{/if}
            <span class="dim">{coverageLabel(order.coverage)} · 候选 {order.candidateCount}</span>
          </header>
          <div class="cards">
            {#each order.candidates as candidate, candidateIndex (candidateIndex)}
              <button
                type="button"
                class="card"
                class:selected={labState.selectedHyper?.orderIndex === orderIndex &&
                  labState.selectedHyper?.candidateIndex === candidateIndex}
                onclick={() => (labState.selectedHyper = { orderIndex, candidateIndex })}
              >
                <HypergraphSVG n={candidate.n} edges={candidate.edges} width={260} />
                <span class="card-meta"
                  >m = {candidate.m} · ν={candidate.nu} τ={candidate.tau} α={candidate.alpha}</span
                >
              </button>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  {:else if labState.tab === 'search'}
    {#if labState.graphResult}
      {@const result = labState.graphResult}
      <div class="strip">
        <div class="strip-main">
          <strong>{result.spec.title}</strong>
          <span class="badge" class:ok={result.complete}
            >{result.complete ? terminationLabel(result.termination) : '未完成'}</span
          >
          <span class="badge">{evidenceLabel(result.evidence)}</span>
          <span class="dim">
            检查 {result.checked.toLocaleString()} · 可行 {result.feasible.toLocaleString()} · 反例 {result.violations}{#if result.uncertainViolations > 0}
              · 未判定（精度不足）{result.uncertainViolations}{/if}
            · 候选 {result.candidateCount} · 节点 {result.nodes.toLocaleString()} · 用时 {result.elapsed}s
          </span>
        </div>
        <div class="strip-actions">
          <button type="button" data-testid="lab-sage-export" onclick={downloadSageScript}
            >导出 Sage 复算脚本</button
          >
          {#if !result.complete}
            <button
              type="button"
              data-testid="lab-graph-resume"
              title="沿用已完成阶，只重算其余阶数（阶数级续算）"
              onclick={() => resumeGraphSearchAction()}>继续计算（跳过已完成阶）</button
            >
            <span class="warn"
              >未完成：{terminationLabel(result.termination)}（不视为已证最优）</span
            >
          {/if}
        </div>
      </div>
      <div class="evi-line" data-testid="lab-evidence-line">
        <span class="dim"
          >结构枚举：{coverageLabel(result.coverage)}；谱比较：{result.spectralComparison}</span
        >
      </div>
      {@render summaryTable(result.orders)}
      {#each result.orders as order, orderIndex (order.n)}
        <section class="order">
          <header>
            <strong>n = {order.n}</strong>
            {#if order.best !== null}<span class="dim">最优值 {formatNumber(order.best)}</span>{/if}
            <span class="dim">{coverageLabel(order.coverage)} · 候选 {order.candidateCount}</span>
          </header>
          {#if order.candidateCount === 0}
            <div class="dim empty">
              {order.coverage === 'empty_by_bound'
                ? '按数学界判定为空'
                : order.complete
                  ? '该阶数范围内没有满足条件的图'
                  : '该阶数未完成'}
            </div>
          {/if}
          <div class="cards">
            {#each order.candidates as candidate, candidateIndex (candidate.graph6 + candidateIndex)}
              <button
                type="button"
                class="card"
                data-testid="lab-candidate"
                class:selected={labState.selectedGraph?.orderIndex === orderIndex &&
                  labState.selectedGraph?.candidateIndex === candidateIndex}
                onclick={() => (labState.selectedGraph = { orderIndex, candidateIndex })}
              >
                <CandidateGraph n={candidate.n} edges={candidate.edges} size={150} />
                <span class="card-meta">
                  m = {candidate.m}{candidate.rho !== null
                    ? ` · ${objectiveSymbol(result.spec.objective)} ≈ ${formatNumber(candidate.rho)}`
                    : candidate.objectiveValue !== null && candidate.objectiveValue !== undefined
                      ? ` · ${objectiveSymbol(result.spec.objective)} = ${Number.isInteger(candidate.objectiveValue) ? candidate.objectiveValue : formatNumber(candidate.objectiveValue)}`
                      : ''}
                </span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
      {#if result.candidateCount === 0}
        <div class="dim">整个范围内没有找到候选；请检查条件或扩大范围。</div>
      {/if}
    {:else if labState.graphRunning}
      <div class="dim big">搜索运行中…（进度显示在左侧面板）</div>
    {:else}
      <div class="dim big">
        输入条件（或点击左侧入门模板），然后点击“开始搜索”。<br />
        结果：全部并列极值（同构类）或最小反例；普通/诱导禁图含义见左侧。
      </div>
    {/if}
  {:else if labState.tab === 'hyper'}
    {#if labState.analysis}
      {@const analysis = labState.analysis}
      <div class="strip">
        <div class="strip-main">
          <strong>超图分析</strong>
          <span class="dim">
            n = {analysis.n} · m = {analysis.m} · 秩 {analysis.rank} ·
            {analysis.uniform !== null ? `${analysis.uniform} 一致` : '非一致'}
          </span>
        </div>
      </div>
      <div class="analysis-grid">
        <div class="analysis-col">
          <table class="params">
            <tbody>
              <tr
                ><td>最小度 δ / 最大度 Δ</td><td>{analysis.minDegree} / {analysis.maxDegree}</td
                ></tr
              >
              <tr><td>最大共度</td><td>{analysis.maxCodegree}</td></tr>
              <tr><td>线性</td><td>{analysis.linear ? '是' : '否'}</td></tr>
              <tr><td>连通</td><td>{analysis.connected ? '是' : '否'}</td></tr>
              <tr><td>正则</td><td>{analysis.regular ? '是' : '否'}</td></tr>
              <tr>
                <td>匹配数 ν</td>
                <td
                  >{analysis.nu}（最大匹配：{analysis.nuWitness
                    .map((edge) => `[${edge.join(' ')}]`)
                    .join(' ')}）</td
                >
              </tr>
              <tr
                ><td>覆盖数 τ</td><td
                  >{analysis.tau}（最小覆盖顶点：{analysis.tauWitness.join(' ') || '—'}）</td
                ></tr
              >
              <tr
                ><td>弱独立数 α</td><td
                  >{analysis.alpha}（最大弱独立集：{analysis.alphaWitness.join(' ') || '—'}）</td
                ></tr
              >
            </tbody>
          </table>
          <div class="spectrum">
            <span class="dim">BBᵀ 特征多项式（整数系数，降幂）</span>
            <code>{analysis.spectrum.coefficients.join('  ')}</code>
            <span class="dim">特征值（降序前 8）</span>
            <code>{formatEigenvalues(analysis.spectrum.eigenvalues, 8)}</code>
            <em class="hint">BBᵀ 是关联矩阵谱，不是邻接张量谱；α = n − τ。</em>
          </div>
        </div>
        <div class="analysis-col">
          <HypergraphSVG n={analysis.n} edges={analysis.edges} width={340} />
        </div>
      </div>
    {/if}
    {#if labState.hyperResult}
      {@const result = labState.hyperResult}
      <div class="strip">
        <div class="strip-main">
          <strong>{result.spec.title}</strong>
          <span class="badge" class:ok={result.complete}
            >{result.complete ? terminationLabel(result.termination) : '未完成'}</span
          >
          <span class="badge">{evidenceLabel(result.evidence)}</span>
          <span class="dim">
            检查 {result.checked.toLocaleString()} · 可行 {result.feasible} · 反例 {result.violations}{#if result.uncertainViolations > 0}
              · 未判定（精度不足）{result.uncertainViolations}{/if}
            · 候选 {result.candidateCount} · 节点 {result.nodes.toLocaleString()} · 用时 {result.elapsed}s
          </span>
        </div>
      </div>
      {#each result.orders as order, orderIndex (order.n)}
        <section class="order">
          <header>
            <strong>n = {order.n}</strong>
            {#if order.best !== null}<span class="dim">最优值 {formatNumber(order.best)}</span>{/if}
            <span class="dim">{coverageLabel(order.coverage)} · 候选 {order.candidateCount}</span>
          </header>
          {#if order.candidateCount === 0 && order.complete}
            <div class="dim empty">
              {order.coverage === 'empty_by_bound'
                ? '按数学界判定为空'
                : '该阶数范围内没有满足条件的超图'}
            </div>
          {/if}
          <div class="cards">
            {#each order.candidates as candidate, candidateIndex (candidateIndex)}
              <button
                type="button"
                class="card"
                data-testid="lab-hyper-candidate"
                class:selected={labState.selectedHyper?.orderIndex === orderIndex &&
                  labState.selectedHyper?.candidateIndex === candidateIndex}
                onclick={() => (labState.selectedHyper = { orderIndex, candidateIndex })}
              >
                <HypergraphSVG n={candidate.n} edges={candidate.edges} width={260} />
                <span class="card-meta"
                  >m = {candidate.m} · ν={candidate.nu} τ={candidate.tau} α={candidate.alpha}</span
                >
              </button>
            {/each}
          </div>
        </section>
      {/each}
    {:else if labState.hyperRunning}
      <div class="dim big">超图搜索运行中…</div>
    {:else if !labState.analysis}
      <div class="dim big">
        输入超边列表（或选择内置构造）进行分析，或填写条件开始极值与反例搜索。
      </div>
    {/if}
  {:else if labState.tab === 'compare'}
    {#if labState.compareResult}
      {@const comparison = labState.compareResult}
      <div class="strip">
        <div class="strip-main">
          <strong>超图比较</strong>
          <span class="badge" class:ok={comparison.isomorphic}
            >{comparison.isomorphic ? '同构' : '不同构'}</span
          >
          <span class="badge" class:ok={comparison.cospectral}
            >{comparison.cospectral ? 'BBᵀ 同谱' : '不同谱'}</span
          >
          {#if comparison.isomorphic && comparison.mapping}
            <span class="dim">
              顶点映射 {comparison.mapping.vertices.join('→')} · 超边映射 {comparison.mapping.edges.join(
                '→',
              )}
              {comparison.mappingVerified ? '（已逐边复核）' : ''}
            </span>
          {/if}
        </div>
      </div>
      <div class="analysis-grid">
        <div class="analysis-col">
          <table class="params">
            <thead>
              <tr><td></td><td>A</td><td>B</td><td>差（B−A）</td></tr>
            </thead>
            <tbody>
              {#each comparison.parameterRows as row (row.label)}
                <tr>
                  <td>{row.label}</td>
                  <td>{row.left}</td>
                  <td>{row.right}</td>
                  <td>{row.delta}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <em class="hint">{comparison.spectrumNote}</em>
        </div>
        <div class="analysis-col">
          <div class="compare-pair">
            <div>
              <span class="dim">A</span>
              <HypergraphSVG n={comparison.left.n} edges={comparison.left.edges} width={260} />
            </div>
            <div>
              <span class="dim">B</span>
              <HypergraphSVG n={comparison.right.n} edges={comparison.right.edges} width={260} />
            </div>
          </div>
        </div>
      </div>
    {:else}
      <div class="dim big">在左侧输入 A、B 两个超图（或从构造库填入）后点击“比较”。</div>
    {/if}
  {:else}
    <div class="dim big">档案在左侧面板管理；点击“查看”可在此显示记录详情。</div>
  {/if}

  {#if labState.tab === 'search' && selectedGraphCandidate && 'graph6' in selectedGraphCandidate.candidate}
    {@const candidate = selectedGraphCandidate.candidate as StoredCandidateGraph}
    <aside class="detail" data-testid="lab-detail">
      <header>
        <strong>候选详情 n={candidate.n} · m={candidate.m}</strong>
        <button type="button" onclick={() => (labState.selectedGraph = null)}>关闭</button>
      </header>
      <div class="detail-body">
        <CandidateGraph n={candidate.n} edges={candidate.edges} size={200} />
        <div class="detail-meta">
          <div>graph6：<code>{candidate.graph6}</code></div>
          <div>度序列：{candidate.degrees.join(' ')}</div>
          {#if selectedGraphSpectra}
            <div class="detail-spectra">
              <div>
                ρ(A) ≈ {formatNumber(selectedGraphSpectra.rho)} · q(Q) ≈ {formatNumber(
                  selectedGraphSpectra.q,
                )} · λ₂(L) ≈ {formatNumber(selectedGraphSpectra.lambda2)}
              </div>
              <div>
                ω = {selectedGraphSpectra.omega} · α = {selectedGraphSpectra.alpha} · ν = {selectedGraphSpectra.nu}
                · 三角形 = {selectedGraphSpectra.triangles}
              </div>
              <div class="dim">A 特征多项式（整数系数，降幂）</div>
              <code>{selectedGraphSpectra.A.coefficients.join('  ')}</code>
              <div class="dim">A 特征值（降序）</div>
              <code>{formatEigenvalues(selectedGraphSpectra.A.eigenvalues)}</code>
              <div class="dim">L 特征多项式</div>
              <code>{selectedGraphSpectra.L.coefficients.join('  ')}</code>
              <div class="dim">Q 特征多项式</div>
              <code>{selectedGraphSpectra.Q.coefficients.join('  ')}</code>
            </div>
          {/if}
          <div class="detail-aut" data-testid="lab-detail-aut">
            <div class="dim">自同构群 |Aut(G)|（保持邻接的置换；连接群论）</div>
            {#if selectedGraphAut}
              <div>|Aut(G)| = {selectedGraphAut.order}</div>
              <div>
                顶点轨道（{selectedGraphAut.orbits.length} 条）：{selectedGraphAut.orbits
                  .map((orbit) => `{${orbit.join(',')}}`)
                  .join(' ')}
              </div>
              <div>
                稳定子：v = {selectedGraphAut.orbits[0]?.[0] ?? 0} → |Stab| = {selectedGraphAut
                  .stabilizerSizes[selectedGraphAut.orbits[0]?.[0] ?? 0]}
                （|Aut| = |orbit| · |Stab|）
              </div>
              {#if selectedGraphAut.sampleGenerators.length > 0}
                <div class="dim">生成元样本（≤4 个非恒等置换，0 起点）：</div>
                <code
                  >{selectedGraphAut.sampleGenerators.map((p) => `(${p.join('')})`).join(' ')}</code
                >
              {/if}
            {:else}
              <div class="dim">
                超出自同构枚举预算（n 较大或对称性强）；C₅ → 10、Petersen → 120 已由单测核验。
              </div>
            {/if}
          </div>
        </div>
        <ul class="checks">
          {#each candidate.checks as check (check.label)}
            <li class:passed={check.passed}>{check.passed ? '✓' : '✗'} {check.label}</li>
          {/each}
        </ul>
        <div class="detail-actions">
          <button
            type="button"
            class="btn-primary"
            data-testid="lab-open-graph"
            onclick={openGraphCandidate}
          >
            在绘图中打开
          </button>
          <button type="button" onclick={() => void copyText(candidate.graph6)}>复制 graph6</button>
        </div>
      </div>
    </aside>
  {/if}

  {#if labState.tab === 'hyper' && selectedHyperCandidate && 'edges' in selectedHyperCandidate.candidate && !('graph6' in selectedHyperCandidate.candidate)}
    {@const candidate = selectedHyperCandidate.candidate as StoredCandidateHyper}
    <aside class="detail" data-testid="lab-hyper-detail">
      <header>
        <strong>超图候选 n={candidate.n} · m={candidate.m}</strong>
        <button type="button" onclick={() => (labState.selectedHyper = null)}>关闭</button>
      </header>
      <div class="detail-body">
        <HypergraphSVG n={candidate.n} edges={candidate.edges} width={300} />
        <div class="detail-meta">
          <div>超边：{candidate.edges.map((edge) => `{${edge.join(',')}}`).join(' ')}</div>
          <div>度序列：{candidate.degrees.join(' ')}</div>
          <div>ν = {candidate.nu} · τ = {candidate.tau} · α = {candidate.alpha}</div>
        </div>
        <ul class="checks">
          {#each candidate.checks as check (check.label)}
            <li class:passed={check.passed}>{check.passed ? '✓' : '✗'} {check.label}</li>
          {/each}
        </ul>
      </div>
    </aside>
  {/if}
</div>

<style>
  .lab-view {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: 14px 16px 120px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 13px;
    background: var(--canvas-bg);
  }
  .lab-view.inactive {
    display: none;
  }
  .strip {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
    flex-wrap: wrap;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 8px 12px;
    position: sticky;
    top: -14px;
    z-index: 3;
    backdrop-filter: blur(10px);
  }
  .strip-main {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
  }
  .dim {
    color: var(--text-dim);
    font-size: 12px;
  }
  .dim.big {
    font-size: 14px;
    line-height: 1.8;
    padding: 40px 0;
    text-align: center;
  }
  .warn {
    color: #d97706;
    font-size: 12px;
  }
  .evi-line {
    margin: -4px 0 4px;
    padding: 0 4px;
  }
  .summary {
    margin: 0 0 6px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
    padding: 6px 10px;
    font-size: 12px;
  }
  .summary summary {
    cursor: pointer;
    color: var(--text-dim);
  }
  .summary-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
  }
  .summary-table th,
  .summary-table td {
    border: 1px solid var(--border);
    padding: 2px 8px;
    text-align: left;
    color: var(--text-dim);
  }
  .summary-table th {
    font-weight: 500;
  }
  .badge {
    font-size: 11px;
    border-radius: 999px;
    padding: 1px 8px;
    border: 1px solid var(--border);
    color: var(--text-dim);
    white-space: nowrap;
  }
  .badge.ok {
    color: #16a34a;
    border-color: #16a34a;
  }
  .order {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .order > header {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .order .empty {
    padding: 4px 0;
  }
  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--card);
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .card:hover {
    border-color: var(--accent);
  }
  .card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft, rgba(37, 99, 235, 0.2));
  }
  .card-meta {
    font-size: 11.5px;
    color: var(--text-dim);
  }
  .analysis-grid {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }
  .analysis-col {
    flex: 1;
    min-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  table.params {
    border-collapse: collapse;
    font-size: 12.5px;
    width: 100%;
  }
  table.params td {
    border: 1px solid var(--border);
    padding: 4px 8px;
    text-align: left;
  }
  .spectrum {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }
  .spectrum code,
  .detail-meta code {
    font-size: 11.5px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 3px 6px;
    word-break: break-all;
  }
  .hint {
    font-size: 11px;
    color: var(--text-dim);
  }
  .compare-pair {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .notes-readonly {
    font-size: 12px;
    color: var(--text-dim);
  }
  .detail {
    position: fixed;
    right: 18px;
    top: 70px;
    bottom: 110px;
    width: 360px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow-pop, 0 12px 40px rgba(0, 0, 0, 0.18));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 20;
    backdrop-filter: blur(14px);
  }
  .detail > header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
  }
  .detail-body {
    padding: 10px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .detail-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12.5px;
  }
  .detail-spectra {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12.5px;
  }
  .checks li {
    color: #dc2626;
  }
  .checks li.passed {
    color: #16a34a;
  }
  .detail-actions {
    display: flex;
    gap: 6px;
  }
  button {
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel);
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  button:hover {
    border-color: var(--accent);
  }
  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  /* 窄视口：详情回到文档流（避免固定浮窗遮挡左侧面板/结果） */
  @media (max-width: 1100px) {
    .detail {
      position: static;
      width: auto;
      max-width: 640px;
      bottom: auto;
      top: auto;
      right: auto;
      margin-top: 4px;
    }
  }
</style>
