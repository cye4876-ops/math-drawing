/**
 * 普通图条件搜索（v2.7）：浏览器内的精确搜索。
 * 对应原实验台（Sage/nauty 版）search.py 的流程，生成器为客户端 DFS：
 * - 按“边数分层”：边数极值自数学上界向下、反例自少到多、谱目标全区扫描、逐图枚举单遍；
 * - 生成期剪枝：普通禁图（增量包含检查）、二部性（增量二着色）、度界/度序列（安全下界）、
 *   claw（普通）→ Δ≤2；诱导禁图只在完整候选上检查（提前剪枝会漏解）；
 * - 同构去重：稳定精化指纹分桶 + VF2 同构测试，每个同构类保留一个代表；
 * - 预算：DFS 生成节点数上限（默认 500 万）与时间上限，耗尽按原版语义标为未完成；
 * - 目标层完整结束才确认全部并列极值 / 最小反例。
 * 与 Sage/nauty 版的差异：生成单位是标号图（原版按同构类流式输出），
 * “检查量”计数不同；大规模问题请使用原实验台。
 */
import { evaluateClaim, parseClaim, rat, type ClaimNode, type ClaimValue } from './claims'
import { containsPatternWithEdge, findPattern, patternInfo, type PatternInfo } from './containment'
import {
  addEdgeAt,
  cloneGraph,
  degrees,
  edgeCount,
  edgeList,
  emptyGraph,
  isBipartite,
  isConnected,
  removeEdgeAt,
  type LabGraph,
} from './graph'
import { toGraph6 } from './graph6'
import { areIsomorphic, fingerprint } from './iso'
import { GraphInvariants, spectralCannotTie } from './invariants'
import { orderPlan, type OrderPlan } from './planner'
import {
  GRAPH_BOOLEANS,
  GRAPH_VARIABLES,
  patternGraphs,
  validateGraphSpec,
  type GraphSpec,
} from './spec'

/** 算法标识（写入档案，用于标注计算来源与“冻结复算”） */
export const SEARCH_ALGORITHM = 'browser-dfs-v1'

/** 谱值比较容差（数值特征值 ~1e-12；相等保留、单侧剪枝用严格不等） */
export const SPECTRAL_EPS = 1e-9

export class SearchStop extends Error {
  constructor(readonly reason: 'cancelled' | 'time_limit' | 'graph_limit') {
    super(reason)
  }
}

export interface SearchProgress {
  n: number
  currentM: number | null
  checked: number
  feasible: number
  violations: number
  nodes: number
  elapsed: number
}

export interface SearchHooks {
  onProgress?: (progress: SearchProgress) => void
  /** 外部取消：返回 'cancelled' 时停止 */
  poll?: () => 'cancelled' | null
  now?: () => number
}

export interface CheckRecord {
  label: string
  passed: boolean
}

export interface CandidateRecord {
  n: number
  m: number
  graph: LabGraph
  /** 发现时的标号 graph6（浏览器版不做规范标号；同构类经测试去重） */
  graph6: string
  fingerprint: string
  degrees: number[]
  edges: Array<[number, number]>
  /** 谱目标时的数值谱半径 */
  rho: number | null
  /** 逐项复核明细 */
  checks: CheckRecord[]
  /** 反例候选固定为 false（已确认违反猜想）；其他目标为 null */
  claimHolds: boolean | null
}

export interface LayerRecord {
  minEdges: number
  maxEdges: number
  complete: boolean
  checked: number
  feasible: number
}

export interface OrderRecord {
  n: number
  checked: number
  feasible: number
  violations: number
  complete: boolean
  best: number | null
  candidateCount: number
  candidates: CandidateRecord[]
  layers: LayerRecord[]
  coverage:
    | 'enumeration'
    | 'optimal_edge_layer'
    | 'minimum_counterexample_layer'
    | 'objective_layers'
    | 'empty_by_bound'
  spectralEvaluations: number
  spectralPruned: number
  plan: OrderPlan
}

export type SearchTermination =
  | 'exhausted'
  | 'cancelled'
  | 'time_limit'
  | 'graph_limit'
  | 'minimum_counterexample_complete'
  | 'first_counterexample_order_exhausted'

export interface GraphSearchResult {
  spec: GraphSpec
  orders: OrderRecord[]
  checked: number
  feasible: number
  violations: number
  nodes: number
  elapsed: number
  termination: SearchTermination
  complete: boolean
  candidateCount: number
  spectralEvaluations: number
  spectralPruned: number
  algorithm: string
  evidence: 'verified_counterexample' | 'finite_optimum' | 'finite_exhaustive' | 'incomplete_search'
  scope: string
  spectralComparison: string
  coverage: 'objective' | 'enumeration'
}

/** 逐项条件复核（输出顺序与原版 matches() 一致） */
export function matches(
  g: LabGraph,
  spec: GraphSpec,
  patterns: readonly PatternInfo[],
): { ok: boolean; checks: CheckRecord[] } {
  const checks: CheckRecord[] = []
  const deg = degrees(g)
  const minDeg = g.n === 0 ? 0 : Math.min(...deg)
  const maxDeg = g.n === 0 ? 0 : Math.max(...deg)
  checks.push({ label: '顶点数', passed: g.n >= spec.nMin && g.n <= spec.nMax })
  if (spec.minDegree !== null)
    checks.push({ label: '最小度下限', passed: minDeg >= spec.minDegree })
  if (spec.maxDegree !== null)
    checks.push({ label: '最大度上限', passed: maxDeg <= spec.maxDegree })
  const m = edgeCount(g)
  if (spec.minEdges !== null) checks.push({ label: '边数下限', passed: m >= spec.minEdges })
  if (spec.maxEdges !== null) checks.push({ label: '边数上限', passed: m <= spec.maxEdges })
  if (spec.degreeSequence.length > 0) {
    const seq = [...deg].sort((a, b) => b - a)
    checks.push({
      label: '度序列',
      passed:
        seq.length === spec.degreeSequence.length &&
        seq.every((value, i) => value === spec.degreeSequence[i]),
    })
  }
  if (spec.connected !== 'any') {
    checks.push({ label: '连通性', passed: isConnected(g) === (spec.connected === 'yes') })
  }
  if (spec.bipartite !== 'any') {
    checks.push({ label: '二部性', passed: isBipartite(g) === (spec.bipartite === 'yes') })
  }
  if (!checks.every((check) => check.passed)) return { ok: false, checks }
  for (const pattern of patterns) {
    const hit = findPattern(g, pattern, spec.forbiddenMode)
    checks.push({ label: `不含 ${pattern.name}`, passed: hit === null })
    if (hit !== null) return { ok: false, checks }
  }
  return { ok: true, checks }
}

/** 由不变量构造 claim 求值器（整数为精确有理数；ρ、q、λ₂ 为数值） */
export function claimGetter(values: GraphInvariants): (name: string) => ClaimValue {
  return (name) => {
    switch (name) {
      case 'rho':
        return values.rho()
      case 'q':
        return values.q()
      case 'lambda2':
        return values.lambda2()
      default: {
        const value = values.get(name)
        if (typeof value === 'boolean') return value
        return rat(BigInt(value))
      }
    }
  }
}

export function runGraphSearch(specInput: GraphSpec, hooks: SearchHooks = {}): GraphSearchResult {
  const spec = validateGraphSpec(specInput)
  const now = hooks.now ?? (() => performance.now() / 1000)
  const start = now()
  const patternEntries = patternGraphs(spec).map((entry) => ({
    info: patternInfo(entry.name, entry.graph),
    custom: entry.custom,
  }))
  const patterns = patternEntries.map((entry) => entry.info)
  // 普通包含：生成期剪枝用；自定义禁图仅在 ≤7 顶点时参与增量剪枝（其余留完整复核）
  const prunePatterns =
    spec.forbiddenMode === 'subgraph'
      ? patternEntries
          .filter((entry) => !entry.custom || entry.info.graph.n <= 7)
          .map((entry) => entry.info)
      : []
  const claim: ClaimNode | null =
    spec.objective === 'counterexample'
      ? parseClaim(spec.claim, { variables: GRAPH_VARIABLES, booleans: GRAPH_BOOLEANS })
      : null

  let checked = 0
  let feasible = 0
  let violations = 0
  let nodes = 0
  let spectralEvaluations = 0
  let spectralPruned = 0
  let lastEmit = 0
  let termination: SearchTermination = 'exhausted'
  const orders: OrderRecord[] = []
  let currentN = spec.nMin
  let currentM: number | null = null

  function limits(): void {
    if (hooks.poll?.() === 'cancelled') throw new SearchStop('cancelled')
    if (now() - start >= spec.timeLimit) throw new SearchStop('time_limit')
    if (nodes >= spec.nodeBudget) throw new SearchStop('graph_limit')
  }

  function progress(force = false): void {
    const t = now()
    if (force || t - lastEmit > 0.4) {
      hooks.onProgress?.({
        n: currentN,
        currentM,
        checked,
        feasible,
        violations,
        nodes,
        elapsed: Math.round((t - start) * 100) / 100,
      })
      lastEmit = t
    }
  }

  try {
    for (let n = spec.nMin; n <= spec.nMax; n++) {
      currentN = n
      limits()
      const plan = orderPlan(n, spec)
      const order: OrderRecord = {
        n,
        checked: 0,
        feasible: 0,
        violations: 0,
        complete: false,
        best: null,
        candidateCount: 0,
        candidates: [],
        layers: [],
        coverage: 'enumeration',
        spectralEvaluations: 0,
        spectralPruned: 0,
        plan,
      }
      orders.push(order)
      if (plan.impossible) {
        order.complete = true
        order.coverage = 'empty_by_bound'
        progress(true)
        continue
      }

      const buckets = new Map<string, CandidateRecord[]>()
      const violationClasses = new Map<string, LabGraph[]>()
      let best: number | null = null

      const edgeValues: number[] = []
      if (plan.mode === 'descending_edges') {
        for (let m = plan.edgeMax; m >= plan.edgeMin; m--) edgeValues.push(m)
      } else {
        for (let m = plan.edgeMin; m <= plan.edgeMax; m++) edgeValues.push(m)
      }

      for (const m of edgeValues) {
        limits()
        currentM = m
        const layer: LayerRecord = {
          minEdges: m,
          maxEdges: m,
          complete: false,
          checked: 0,
          feasible: 0,
        }
        order.layers.push(layer)
        progress(true)
        runLayer(n, m)
        layer.complete = true
        progress(true)
        if (
          order.candidateCount > 0 &&
          (plan.mode === 'descending_edges' || plan.mode === 'ascending_counterexample')
        ) {
          order.coverage =
            plan.mode === 'descending_edges' ? 'optimal_edge_layer' : 'minimum_counterexample_layer'
          break
        }
      }
      order.complete = true
      currentM = null
      progress(true)
      if (claim && order.candidateCount > 0) {
        termination =
          plan.mode === 'ascending_counterexample'
            ? 'minimum_counterexample_complete'
            : 'first_counterexample_order_exhausted'
        break
      }

      function runLayer(layerN: number, layerM: number): void {
        const pairs: Array<[number, number]> = []
        for (let u = 0; u < layerN; u++) {
          for (let v = u + 1; v < layerN; v++) pairs.push([u, v])
        }
        if (layerM > pairs.length) return

        const effMaxDegree: number | null =
          spec.forbidden.includes('claw') && spec.forbiddenMode === 'subgraph'
            ? Math.min(spec.maxDegree ?? layerN - 1, 2)
            : spec.maxDegree
        const minDeg = spec.minDegree
        const seqTarget = spec.degreeSequence
        const bipartiteYes = spec.bipartite === 'yes'
        const gapPrune = minDeg !== null

        const graph = emptyGraph(layerN)
        const deg = new Array<number>(layerN).fill(0)
        const color = new Array<number>(layerN).fill(-1)
        const colorLog: number[] = []
        const frameMarks: number[] = []
        let deficitSum = minDeg === null ? 0 : layerN * minDeg
        const layer = order.layers[order.layers.length - 1]!

        function canAdd(u: number, v: number, chosenCount: number): boolean {
          const du = deg[u]!
          const dv = deg[v]!
          if (effMaxDegree !== null && (du + 1 > effMaxDegree || dv + 1 > effMaxDegree))
            return false
          if (bipartiteYes) {
            const cu = color[u]!
            const cv = color[v]!
            if (cu >= 0 && cv >= 0 && cu === cv) return false
          }
          if (seqTarget.length > 0) {
            const partial = deg.slice()
            partial[u] = du + 1
            partial[v] = dv + 1
            partial.sort((a, b) => b - a)
            for (let i = 0; i < partial.length; i++) {
              if (partial[i]! > seqTarget[i]!) return false
            }
          }
          if (gapPrune) {
            // 剩余可加边数能否补足缺口（每边至多消 2 点缺口）
            let nextDeficit = deficitSum
            if (du < minDeg!) nextDeficit--
            if (dv < minDeg!) nextDeficit--
            if (nextDeficit > 2 * (layerM - chosenCount - 1)) return false
          }
          for (const pattern of prunePatterns) {
            if (containsPatternWithEdge(graph, pattern, u, v)) return false
          }
          return true
        }

        function applyAdd(u: number, v: number): void {
          addEdgeAt(graph, u, v)
          if (gapPrune) {
            if (deg[u]! < minDeg!) deficitSum--
            if (deg[v]! < minDeg!) deficitSum--
          }
          deg[u]!++
          deg[v]!++
          if (bipartiteYes) {
            if (color[u]! < 0) {
              color[u] = color[v]! < 0 ? 0 : 1 - color[v]!
              colorLog.push(u)
            }
            if (color[v]! < 0) {
              color[v] = 1 - color[u]!
              colorLog.push(v)
            }
          }
        }

        function undoAdd(u: number, v: number): void {
          removeEdgeAt(graph, u, v)
          deg[u]!--
          deg[v]!--
          if (gapPrune) {
            if (deg[u]! < minDeg!) deficitSum++
            if (deg[v]! < minDeg!) deficitSum++
          }
          if (bipartiteYes) {
            const mark = frameMarks.pop()!
            while (colorLog.length > mark) {
              color[colorLog.pop()!] = -1
            }
          }
        }

        function evaluateCandidate(): void {
          checked++
          order.checked++
          layer.checked++
          const check = matches(graph, spec, patterns)
          if (!check.ok) return
          feasible++
          order.feasible++
          layer.feasible++

          if (claim) {
            const values = new GraphInvariants(graph)
            if (evaluateClaim(claim, claimGetter(values))) return // 猜想成立：不是反例
            // 反例按同构类计数（原版 geng 流一个同构类只出现一次）
            const fp = fingerprint(graph)
            const bucket = violationClasses.get(fp) ?? []
            for (const existing of bucket) {
              if (areIsomorphic(graph, existing).isomorphic) return
            }
            bucket.push(cloneGraph(graph))
            violationClasses.set(fp, bucket)
            violations++
            order.violations++
            recordCandidate(-layerM, null, check.checks, false)
            return
          }
          if (spec.objective === 'max_edges') {
            recordCandidate(layerM, null, check.checks, null)
            return
          }
          const current = best
          if (current !== null && spectralCannotTie(graph, current)) {
            spectralPruned++
            order.spectralPruned++
            return
          }
          spectralEvaluations++
          order.spectralEvaluations++
          const rho = new GraphInvariants(graph).rho()
          recordCandidate(rho, rho, check.checks, null)
        }

        function recordCandidate(
          value: number,
          rho: number | null,
          checks: CheckRecord[],
          claimHolds: boolean | null,
        ): void {
          const current = best
          if (current === null || value > current + SPECTRAL_EPS) {
            best = value
            // 反例目标在档案/结果中记录为正的反例边数（与原版 order.best 一致）
            order.best = claimHolds === false ? -value : value
            order.candidates.length = 0
            order.candidateCount = 0
            buckets.clear()
          } else if (value < current - SPECTRAL_EPS) {
            return
          }
          const witness = cloneGraph(graph)
          const fp = fingerprint(witness)
          const bucket = buckets.get(fp) ?? []
          for (const existing of bucket) {
            if (areIsomorphic(witness, existing.graph).isomorphic) return
          }
          const record: CandidateRecord = {
            n: layerN,
            m: edgeCount(witness),
            graph: witness,
            graph6: toGraph6(witness),
            fingerprint: fp,
            degrees: degrees(witness),
            edges: edgeList(witness),
            rho,
            checks,
            claimHolds,
          }
          bucket.push(record)
          buckets.set(fp, bucket)
          order.candidates.push(record)
          order.candidateCount++
        }

        // 递归搜索：按固定边序决定“加入/跳过”，组合数剪枝 + 增量约束剪枝
        function dfs(index: number, chosenCount: number): void {
          nodes++
          if ((nodes & 1023) === 0) {
            limits()
            progress()
          }
          if (chosenCount === layerM) {
            evaluateCandidate()
            return
          }
          if (pairs.length - index < layerM - chosenCount) return
          const [u, v] = pairs[index]!
          if (canAdd(u, v, chosenCount)) {
            frameMarks.push(colorLog.length)
            applyAdd(u, v)
            dfs(index + 1, chosenCount + 1)
            undoAdd(u, v)
          }
          dfs(index + 1, chosenCount)
        }

        dfs(0, 0)
      }
    }
  } catch (error) {
    if (error instanceof SearchStop) {
      termination = error.reason
    } else {
      throw error
    }
  }

  const complete =
    termination === 'exhausted' ||
    termination === 'minimum_counterexample_complete' ||
    termination === 'first_counterexample_order_exhausted'
  const candidateCount = orders.reduce((sum, order) => sum + order.candidateCount, 0)
  return {
    spec,
    orders,
    checked,
    feasible,
    violations,
    nodes,
    elapsed: Math.round((now() - start) * 1000) / 1000,
    termination,
    complete,
    candidateCount,
    spectralEvaluations,
    spectralPruned,
    algorithm: SEARCH_ALGORITHM,
    evidence:
      violations > 0
        ? 'verified_counterexample'
        : complete && orders.some((order) => order.coverage === 'optimal_edge_layer')
          ? 'finite_optimum'
          : complete
            ? 'finite_exhaustive'
            : 'incomplete_search',
    scope: '无向简单图、顶点 0…n−1；孤立点默认允许；同构类保留一个代表（发现标号）',
    spectralComparison: '数值特征值（~1e-12）；比较容差 1e-9；严格小者才剪枝',
    coverage: orders.some(
      (order) => order.coverage !== 'enumeration' && order.coverage !== 'empty_by_bound',
    )
      ? 'objective'
      : 'enumeration',
  }
}
