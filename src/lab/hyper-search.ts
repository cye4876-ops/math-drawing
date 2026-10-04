/**
 * 超图条件搜索（v2.7）：浏览器版“逐层扩展”式精确搜索。
 * 对应原实验台 hypergraph_search.py 的流程与语义：
 * - 目标层完整结束才确认全部并列极值 / 最小反例；
 * - 普通包含（deletion-closed）可在生成期剪枝；诱导包含只在完整候选上检查（不提前剪枝）；
 * - 同构按保色关联图去重（原顶点与超边两类都保留、含孤立点）；
 * - 预算按 DFS 节点计；耗尽标记为未完成。
 * 相对 genbg 智能版的差异：生成单位是标号超边集，规模建议控制在 r=2/3 且 n ≤ 6–7。
 */
import { evaluateClaim, type ClaimNode } from './claims'
import {
  builtinHyperPattern,
  findHyperPattern,
  hyperAreIsomorphic,
  hyperClaimGetter,
  hyperDegrees,
  hyperFingerprint,
  hyperIsConnected,
  hyperIsLinear,
  hyperMatchingNumber,
  hyperMaxCodegree,
  hyperUniformity,
  hyperWeakIndependence,
  normalizeHypergraph,
  type LabHypergraph,
} from './hypergraph'
import {
  hyperOrderPlan,
  parseHyperClaim,
  validateHyperSpec,
  type HyperOrderPlan,
  type HyperSpec,
} from './hyper-spec'

export const HYPER_SEARCH_ALGORITHM = 'browser-layer-dfs-v1'

export class HyperSearchStop extends Error {
  constructor(readonly reason: 'cancelled' | 'time_limit' | 'graph_limit') {
    super(reason)
  }
}

export interface HyperSearchProgress {
  n: number
  currentM: number | null
  checked: number
  feasible: number
  violations: number
  nodes: number
  elapsed: number
}

export interface HyperSearchHooks {
  onProgress?: (progress: HyperSearchProgress) => void
  poll?: () => 'cancelled' | null
  now?: () => number
}

export interface HyperCheckRecord {
  label: string
  passed: boolean
  /** 命中禁超图时的顶点/超边映射（供逐条核验） */
  vertexMap?: number[]
  edgeMap?: number[]
}

export interface HyperCandidateRecord {
  n: number
  m: number
  edges: number[][]
  fingerprint: string
  degrees: number[]
  uniform: number | null
  linear: boolean
  connected: boolean
  nu: number
  tau: number
  alpha: number
  checks: HyperCheckRecord[]
  /** 反例候选固定为 false；其他目标为 null */
  claimHolds: boolean | null
}

export interface HyperLayerRecord {
  minEdges: number
  maxEdges: number
  complete: boolean
  checked: number
  feasible: number
}

/** 每阶共享的收集器（避免跨作用域引用） */
interface HyperLayerContext {
  order: HyperOrderRecord
  buckets: Map<string, HyperCandidateRecord[]>
  violationClasses: Map<string, LabHypergraph[]>
  getBest: () => number | null
  setBest: (value: number | null) => void
}

export interface HyperOrderRecord {
  n: number
  checked: number
  feasible: number
  violations: number
  complete: boolean
  best: number | null
  candidateCount: number
  candidates: HyperCandidateRecord[]
  layers: HyperLayerRecord[]
  coverage: 'enumeration' | 'maximum_edge_layer' | 'minimum_counterexample_layer' | 'empty_by_bound'
  plan: HyperOrderPlan
}

export type HyperTermination =
  'exhausted' | 'cancelled' | 'time_limit' | 'graph_limit' | 'minimum_counterexample_complete'

export interface HyperSearchResult {
  spec: HyperSpec
  orders: HyperOrderRecord[]
  checked: number
  feasible: number
  violations: number
  nodes: number
  elapsed: number
  termination: HyperTermination
  complete: boolean
  candidateCount: number
  algorithm: string
  evidence: 'verified_counterexample' | 'finite_exhaustive' | 'incomplete_search'
  coverage: 'objective' | 'enumeration'
  budgetUnit: string
  scope: string
  spectralScope: string
}

/** 逐项复核（顺序与原版 _matches 风格一致） */
export function hyperMatches(
  h: LabHypergraph,
  spec: HyperSpec,
  patterns: ReadonlyArray<{ name: string; graph: LabHypergraph; custom: boolean }>,
): { ok: boolean; checks: HyperCheckRecord[] } {
  const checks: HyperCheckRecord[] = []
  const deg = hyperDegrees(h)
  const minDeg = deg.length === 0 ? 0 : Math.min(...deg)
  const maxDeg = deg.length === 0 ? 0 : Math.max(...deg)
  checks.push({ label: '顶点数', passed: h.n >= spec.nMin && h.n <= spec.nMax })
  const uniform = hyperUniformity(h)
  checks.push({
    label: `一致阶数 r = ${spec.r}`,
    passed: h.edges.length === 0 ? true : uniform === spec.r, // 空超图也属于该一致类
  })
  if (spec.minDegree !== null)
    checks.push({ label: '最小度下限', passed: minDeg >= spec.minDegree })
  if (spec.maxDegree !== null)
    checks.push({ label: '最大度上限', passed: maxDeg <= spec.maxDegree })
  if (spec.minEdges !== null)
    checks.push({ label: '超边数下限', passed: h.edges.length >= spec.minEdges })
  if (spec.maxEdges !== null)
    checks.push({ label: '超边数上限', passed: h.edges.length <= spec.maxEdges })
  if (spec.maxCodegree !== null) {
    checks.push({ label: '最大共度上限', passed: hyperMaxCodegree(h) <= spec.maxCodegree })
  }
  if (spec.linear !== 'any') {
    checks.push({ label: '线性', passed: hyperIsLinear(h) === (spec.linear === 'yes') })
  }
  if (spec.connected !== 'any') {
    checks.push({ label: '连通性', passed: hyperIsConnected(h) === (spec.connected === 'yes') })
  }
  if (!checks.every((check) => check.passed)) return { ok: false, checks }
  for (const pattern of patterns) {
    const mapping =
      pattern.graph.n <= h.n ? findHyperPattern(h, pattern.graph, spec.forbiddenMode) : null
    if (mapping) {
      const edgeMap = pattern.graph.edges.map((edge) =>
        edge.reduce((acc, v) => acc | (1 << mapping[v]!), 0),
      )
      checks.push({ label: `不含 ${pattern.name}`, passed: false, vertexMap: mapping, edgeMap })
      return { ok: false, checks }
    }
    checks.push({ label: `不含 ${pattern.name}`, passed: true })
  }
  return { ok: true, checks }
}

/** 生成期增量检查（普通包含）：新超边是否与既有超边联合产生模式命中 */
function patternHitWithEdge(
  n: number,
  edgeMasks: ReadonlySet<number>,
  pattern: LabHypergraph,
  newEdge: readonly number[],
): boolean {
  const r = newEdge.length
  for (const targetEdge of pattern.edges) {
    if (targetEdge.length !== r) continue
    for (const permutation of permutationsOf(r)) {
      const mapping = new Array<number>(pattern.n).fill(-1)
      const used = new Set<number>()
      for (let i = 0; i < r; i++) {
        mapping[targetEdge[i]!] = newEdge[permutation[i]!]!
        used.add(newEdge[permutation[i]!]!)
      }
      const remaining = [...Array(pattern.n).keys()].filter((v) => mapping[v]! < 0)
      if (backtrack(remaining, 0)) return true

      function backtrack(list: number[], index: number): boolean {
        if (index === list.length) {
          for (const edge of pattern.edges) {
            let mask = 0
            for (const v of edge) mask |= 1 << mapping[v]!
            if (!edgeMasks.has(mask)) return false
          }
          return true
        }
        const v = list[index]!
        for (let candidate = 0; candidate < n; candidate++) {
          if (used.has(candidate)) continue
          mapping[v] = candidate
          used.add(candidate)
          let ok = true
          for (const edge of pattern.edges) {
            if (!edge.includes(v)) continue
            if (edge.some((w) => mapping[w]! < 0)) continue
            let mask = 0
            for (const w of edge) mask |= 1 << mapping[w]!
            if (!edgeMasks.has(mask)) {
              ok = false
              break
            }
          }
          if (ok && backtrack(list, index + 1)) return true
          mapping[v] = -1
          used.delete(candidate)
        }
        return false
      }
    }
  }
  return false
}

function permutationsOf(size: number): number[][] {
  const result: number[][] = []
  const current: number[] = []
  const used = new Array<boolean>(size).fill(false)
  const walk = (): void => {
    if (current.length === size) {
      result.push([...current])
      return
    }
    for (let i = 0; i < size; i++) {
      if (used[i]) continue
      used[i] = true
      current.push(i)
      walk()
      current.pop()
      used[i] = false
    }
  }
  walk()
  return result
}

export function runHyperSearch(
  specInput: HyperSpec,
  hooks: HyperSearchHooks = {},
): HyperSearchResult {
  const spec = validateHyperSpec(specInput)
  const now = hooks.now ?? (() => performance.now() / 1000)
  const start = now()
  const patterns = [
    ...spec.forbidden.map((key) => ({
      name: key === 'K4_3' ? 'K₄³（4 点完全 3 一致）' : '三元松三角形（012、234、450）',
      graph: builtinHyperPattern(key),
      custom: false,
    })),
    ...spec.customForbidden.map((pattern) => ({
      name: pattern.title,
      graph: normalizeHypergraph({ n: pattern.n, edges: pattern.edges }),
      custom: true,
    })),
  ]
  const claim: ClaimNode | null = spec.objective === 'counterexample' ? parseHyperClaim(spec) : null

  let checked = 0
  let feasible = 0
  let violations = 0
  let nodes = 0
  let lastEmit = 0
  let termination: HyperTermination = 'exhausted'
  const orders: HyperOrderRecord[] = []
  let currentN = spec.nMin
  let currentM: number | null = null

  function limits(): void {
    if (hooks.poll?.() === 'cancelled') throw new HyperSearchStop('cancelled')
    if (now() - start >= spec.timeLimit) throw new HyperSearchStop('time_limit')
    if (nodes >= spec.nodeBudget) throw new HyperSearchStop('graph_limit')
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
      const plan = hyperOrderPlan(n, spec)
      const order: HyperOrderRecord = {
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
        plan,
      }
      orders.push(order)
      if (plan.impossible) {
        order.complete = true
        order.coverage = 'empty_by_bound'
        progress(true)
        continue
      }
      const buckets = new Map<string, HyperCandidateRecord[]>()
      const violationClasses = new Map<string, LabHypergraph[]>()
      let best: number | null = null
      const context: HyperLayerContext = {
        order,
        buckets,
        violationClasses,
        getBest: () => best,
        setBest: (value) => {
          best = value
        },
      }

      const allEdgeSets = rSubsets(n, spec.r)
      const edgeValues: number[] = []
      if (plan.mode === 'descending_edges') {
        for (let m = plan.edgeMax; m >= plan.edgeMin; m--) edgeValues.push(m)
      } else {
        for (let m = plan.edgeMin; m <= plan.edgeMax; m++) edgeValues.push(m)
      }

      for (const m of edgeValues) {
        limits()
        currentM = m
        const layer: HyperLayerRecord = {
          minEdges: m,
          maxEdges: m,
          complete: false,
          checked: 0,
          feasible: 0,
        }
        order.layers.push(layer)
        progress(true)
        runHyperLayer(n, m, allEdgeSets, layer, context)
        layer.complete = true
        progress(true)
        if (
          order.candidateCount > 0 &&
          (plan.mode === 'descending_edges' || plan.mode === 'ascending_counterexample')
        ) {
          order.coverage =
            plan.mode === 'descending_edges' ? 'maximum_edge_layer' : 'minimum_counterexample_layer'
          break
        }
      }
      order.complete = true
      currentM = null
      progress(true)
      if (claim && order.candidateCount > 0) {
        termination = 'minimum_counterexample_complete'
        break
      }
    }

    function runHyperLayer(
      n: number,
      m: number,
      allEdgeSets: number[][],
      layer: HyperLayerRecord,
      context: HyperLayerContext,
    ): void {
      if (m > allEdgeSets.length) return
      const edgeMasks = new Set<number>()
      const degree = new Array<number>(n).fill(0)
      const pairCount = new Array<number>(n * n).fill(0)
      const effMaxDegree = spec.maxDegree
      const codegreeLimit =
        spec.linear === 'yes'
          ? spec.maxCodegree === null
            ? 1
            : Math.min(spec.maxCodegree, 1)
          : spec.maxCodegree
      const gapPrune = spec.minDegree !== null
      let deficitSum = gapPrune ? n * spec.minDegree! : 0
      const prunePatterns =
        spec.forbiddenMode === 'subgraph' ? patterns.map((pattern) => pattern.graph) : []
      const r = spec.r
      const chosenEdges: number[][] = []

      function maskOf(edge: readonly number[]): number {
        let mask = 0
        for (const v of edge) mask |= 1 << v
        return mask
      }

      function canAdd(edge: number[], chosenCount: number): boolean {
        if (effMaxDegree !== null) {
          for (const v of edge) {
            if (degree[v]! + 1 > effMaxDegree) return false
          }
        }
        if (codegreeLimit !== null) {
          for (let i = 0; i < edge.length; i++) {
            for (let j = i + 1; j < edge.length; j++) {
              if (pairCount[edge[i]! * n + edge[j]!]! + 1 > codegreeLimit) return false
            }
          }
        }
        if (gapPrune) {
          let nextDeficit = deficitSum
          for (const v of edge) {
            if (degree[v]! < spec.minDegree!) nextDeficit--
          }
          if (nextDeficit > r * (m - chosenCount - 1)) return false
        }
        for (const pattern of prunePatterns) {
          if (patternHitWithEdge(n, edgeMasks, pattern, edge)) return false
        }
        return true
      }

      function applyAdd(edge: number[]): void {
        edgeMasks.add(maskOf(edge))
        chosenEdges.push(edge)
        if (gapPrune) {
          for (const v of edge) {
            if (degree[v]! < spec.minDegree!) deficitSum--
          }
        }
        for (const v of edge) degree[v]!++
        if (codegreeLimit !== null) {
          for (let i = 0; i < edge.length; i++) {
            for (let j = i + 1; j < edge.length; j++) {
              pairCount[edge[i]! * n + edge[j]!]!++
              pairCount[edge[j]! * n + edge[i]!]!++
            }
          }
        }
      }

      function undoAdd(edge: number[]): void {
        edgeMasks.delete(maskOf(edge))
        chosenEdges.pop()
        for (const v of edge) degree[v]!--
        if (gapPrune) {
          for (const v of edge) {
            if (degree[v]! < spec.minDegree!) deficitSum++
          }
        }
        if (codegreeLimit !== null) {
          for (let i = 0; i < edge.length; i++) {
            for (let j = i + 1; j < edge.length; j++) {
              pairCount[edge[i]! * n + edge[j]!]!--
              pairCount[edge[j]! * n + edge[i]!]!--
            }
          }
        }
      }

      function evaluate(): void {
        checked++
        context.order.checked++
        layer.checked++
        const h = normalizeHypergraph({ n, edges: chosenEdges })
        const check = hyperMatches(h, spec, patterns)
        if (!check.ok) return
        feasible++
        context.order.feasible++
        layer.feasible++

        if (claim) {
          const holds = evaluateClaim(claim, hyperClaimGetter(h, spec.r))
          if (holds) return
          const fp = hyperFingerprint(h)
          const bucket = context.violationClasses.get(fp) ?? []
          for (const existing of bucket) {
            if (hyperAreIsomorphic(h, existing).isomorphic) return
          }
          bucket.push(normalizeHypergraph({ n, edges: chosenEdges.map((edge) => [...edge]) }))
          context.violationClasses.set(fp, bucket)
          violations++
          context.order.violations++
          recordCandidate(-m, check.checks, false)
          return
        }
        recordCandidate(m, check.checks, null)
      }

      function recordCandidate(
        value: number,
        checks: HyperCheckRecord[],
        claimHolds: boolean | null,
      ): void {
        const current = context.getBest()
        if (current === null || value > current + 1e-9) {
          context.setBest(value)
          // 反例目标记录为正的反例边数（与原版 order.best 一致）
          context.order.best = claimHolds === false ? -value : value
          context.order.candidates.length = 0
          context.order.candidateCount = 0
          context.buckets.clear()
        } else if (value < current - 1e-9) {
          return
        }
        const h = normalizeHypergraph({ n, edges: chosenEdges })
        const fp = hyperFingerprint(h)
        const bucket = context.buckets.get(fp) ?? []
        for (const existing of bucket) {
          const other = normalizeHypergraph({ n: existing.n, edges: existing.edges })
          if (hyperAreIsomorphic(h, other).isomorphic) return
        }
        const nu = hyperMatchingNumber(h)
        const weak = hyperWeakIndependence(h)
        const record: HyperCandidateRecord = {
          n,
          m: h.edges.length,
          edges: h.edges.map((edge) => [...edge]),
          fingerprint: fp,
          degrees: hyperDegrees(h),
          uniform: hyperUniformity(h),
          linear: hyperIsLinear(h),
          connected: hyperIsConnected(h),
          nu: nu.value,
          tau: weak.tau,
          alpha: weak.alpha,
          checks,
          claimHolds,
        }
        bucket.push(record)
        context.buckets.set(fp, bucket)
        context.order.candidates.push(record)
        context.order.candidateCount++
      }

      function dfs(index: number, chosenCount: number): void {
        nodes++
        if ((nodes & 1023) === 0) {
          limits()
          progress()
        }
        if (chosenCount === m) {
          evaluate()
          return
        }
        if (allEdgeSets.length - index < m - chosenCount) return
        const edge = allEdgeSets[index]!
        if (canAdd(edge, chosenCount)) {
          applyAdd(edge)
          dfs(index + 1, chosenCount + 1)
          undoAdd(edge)
        }
        dfs(index + 1, chosenCount)
      }

      dfs(0, 0)
    }
  } catch (error) {
    if (error instanceof HyperSearchStop) {
      termination = error.reason
    } else {
      throw error
    }
  }

  const complete = termination === 'exhausted' || termination === 'minimum_counterexample_complete'
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
    algorithm: HYPER_SEARCH_ALGORITHM,
    evidence:
      violations > 0
        ? 'verified_counterexample'
        : complete
          ? 'finite_exhaustive'
          : 'incomplete_search',
    coverage: orders.some(
      (order) =>
        order.coverage === 'maximum_edge_layer' ||
        order.coverage === 'minimum_counterexample_layer',
    )
      ? 'objective'
      : 'enumeration',
    budgetUnit: '尝试选择一条超边的 DFS 节点；含被约束拒绝的分支',
    scope: '简单 r 一致超图；全部 n 个原顶点（含孤立点）；保色同构去重',
    spectralScope: 'BBᵀ 关联矩阵谱；不表示超图张量谱',
  }
}

function rSubsets(n: number, r: number): number[][] {
  const result: number[][] = []
  const current: number[] = []
  const walk = (start: number): void => {
    if (current.length === r) {
      result.push([...current])
      return
    }
    for (let v = start; v <= n - (r - current.length); v++) {
      current.push(v)
      walk(v + 1)
      current.pop()
    }
  }
  walk(0)
  return result
}
