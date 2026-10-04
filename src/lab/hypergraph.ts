/**
 * 超图模型与分析（v2.7）：对应原实验台的 graphlab/hypergraph.py + hypergraph_spec.py 的可移植部分。
 * - 简单超图：显式顶点数（保留孤立点）、非空、无重复边、单边内无重复顶点；
 * - 关联二部图（圆点=原顶点、方块=超边）用于同构：**保色同构**（原顶点只映原顶点、超边只映超边）；
 * - 参数：度/共度/秩/一致性/线性/连通/正则；精确匹配数 ν、覆盖数 τ、弱独立数 α（含见证，α = n − τ）；
 * - 谱：0/1 关联矩阵 B 的整数 Gram 矩阵 BBᵀ 的精确特征多项式与数值特征值
 *   （它是关联矩阵谱，不是邻接张量谱）；
 * - 禁超图包含：普通包含（顶点单射、完整超边映为超边）与顶点诱导包含
 *   （映射顶点集内部的完整超边恰等于禁图超边；跨界边忽略、不取迹）；
 * - 比较：并排参数（B−A）、保色同构判定与映射复核、BBᵀ 精确同谱判定。
 */
import { rat, type ClaimValue } from './claims'
import { charPolyCoefficients, toNumberMatrix, type IntMatrix } from './charpoly'
import { addEdgeAt, emptyGraph, type LabGraph } from './graph'
import { areIsomorphic, fingerprint } from './iso'
import { jacobiEigenSymmetric } from '../graph/spectral'

export class HyperError extends Error {}

/** 规范化超图：n 显式；edges 每条升序；边列表按字典序；无重复边 */
export interface LabHypergraph {
  n: number
  edges: number[][]
}

/** 分析输入（含可选实验条件的复核） */
export interface HypergraphInput {
  n: number
  edges: number[][]
}

export const HYPER_MAX_N = 20
export const HYPER_MAX_EDGES = 80

export const FANO_EDGES: number[][] = [
  [0, 1, 2],
  [0, 3, 4],
  [0, 5, 6],
  [1, 3, 5],
  [1, 4, 6],
  [2, 3, 6],
  [2, 4, 5],
]

/** 内置禁超图（仅 r=3 搜索）：K₄³ 与三元松三角形 */
export const HYPER_PATTERNS = ['K4_3', 'loose_triangle'] as const
export type HyperPatternKey = (typeof HYPER_PATTERNS)[number]

export const HYPER_PATTERN_NAMES: Record<HyperPatternKey, string> = {
  K4_3: 'K₄³（4 点完全 3 一致）',
  loose_triangle: '三元松三角形（012、234、450）',
}

export function builtinHyperPattern(key: HyperPatternKey): LabHypergraph {
  if (key === 'K4_3') {
    return normalizeHypergraph({
      n: 4,
      edges: [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ],
    })
  }
  return normalizeHypergraph({
    n: 6,
    edges: [
      [0, 1, 2],
      [2, 3, 4],
      [4, 5, 0],
    ],
  })
}

function normalizeEdges(n: number, edges: readonly (readonly number[])[]): number[][] {
  return edges
    .map((edge) => [...edge].sort((a, b) => a - b))
    .sort((a, b) => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) return a[i]! - b[i]!
      }
      return a.length - b.length
    })
}

export function normalizeHypergraph(input: HypergraphInput): LabHypergraph {
  return { n: input.n, edges: normalizeEdges(input.n, input.edges) }
}

/** 输入校验（移植自 validate_hypergraph_input；错误消息保持中文风格） */
export function validateHypergraphInput(payload: unknown): LabHypergraph {
  if (typeof payload !== 'object' || payload === null) throw new HyperError('超图输入须为对象')
  const record = payload as { n?: unknown; edges?: unknown }
  const n = record.n
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > HYPER_MAX_N) {
    throw new HyperError(`分析顶点数须为 1–${HYPER_MAX_N} 的整数`)
  }
  const edges = record.edges ?? []
  if (!Array.isArray(edges) || edges.length > HYPER_MAX_EDGES) {
    throw new HyperError('超边表须为列表，最多 80 条超边')
  }
  const normalized: number[][] = []
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length === 0) throw new HyperError('每条超边须为非空顶点列表')
    const seen = new Set<number>()
    for (const vertex of edge) {
      if (typeof vertex !== 'number' || !Number.isInteger(vertex) || vertex < 0 || vertex >= n) {
        throw new HyperError('超边顶点标签须为 0 到 n−1 的整数')
      }
      if (seen.has(vertex)) throw new HyperError('一条超边不能重复包含同一顶点')
      seen.add(vertex)
    }
    normalized.push([...edge].sort((a, b) => a - b))
  }
  const sorted = normalizeEdges(n, normalized)
  for (let i = 1; i < sorted.length; i++) {
    if (
      sorted[i]!.length === sorted[i - 1]!.length &&
      sorted[i]!.every((v, k) => v === sorted[i - 1]![k])
    ) {
      throw new HyperError('简单超图不允许重复超边')
    }
  }
  return { n, edges: sorted }
}

/** 内置构造：空 / 完全 r 一致 / 含顶点 0 的星 / 不交超边 / Fano */
export function constructHypergraph(
  family: 'empty' | 'complete' | 'star' | 'matching' | 'fano',
  n: number,
  r: number,
): LabHypergraph {
  if (family === 'fano') return normalizeHypergraph({ n: 7, edges: FANO_EDGES })
  if (n < 1 || n > HYPER_MAX_N) throw new HyperError(`分析顶点数须为 1–${HYPER_MAX_N}`)
  if (r < 1 || r > n) throw new HyperError('构造超边大小须为 1 到 n')
  const edges: number[][] = []
  if (family === 'complete' || family === 'star') {
    const combinations: number[][] = []
    const build = (start: number, current: number[]): void => {
      if (current.length === r) {
        combinations.push([...current])
        return
      }
      for (let v = start; v < n; v++) {
        current.push(v)
        build(v + 1, current)
        current.pop()
      }
    }
    build(0, [])
    for (const edge of combinations) {
      if (family === 'complete' || edge.includes(0)) edges.push(edge)
      if (edges.length > HYPER_MAX_EDGES) {
        throw new HyperError('构造超过 80 条超边的分析上限，请缩小顶点数或超边大小')
      }
    }
  } else if (family === 'matching') {
    for (let start = 0; start + r <= n; start += r) {
      edges.push([...Array(r).keys()].map((k) => start + k))
    }
  }
  return normalizeHypergraph({ n, edges })
}

/** ---------- 基础量 ---------- */

export function hyperDegrees(h: LabHypergraph): number[] {
  const deg = new Array<number>(h.n).fill(0)
  for (const edge of h.edges) for (const v of edge) deg[v]!++
  return deg
}

/** 顶点对的共度矩阵（只算上三角；返回读取函数） */
export function hyperPairCodegrees(h: LabHypergraph): number[][] {
  const matrix = Array.from({ length: h.n }, () => new Array<number>(h.n).fill(0))
  for (const edge of h.edges) {
    for (let i = 0; i < edge.length; i++) {
      for (let j = i + 1; j < edge.length; j++) {
        matrix[edge[i]!]![edge[j]!]!++
        matrix[edge[j]!]![edge[i]!]!++
      }
    }
  }
  return matrix
}

export function hyperMaxCodegree(h: LabHypergraph): number {
  const matrix = hyperPairCodegrees(h)
  let max = 0
  for (let i = 0; i < h.n; i++) {
    for (let j = i + 1; j < h.n; j++) max = Math.max(max, matrix[i]![j]!)
  }
  return max
}

export function hyperRank(h: LabHypergraph): number {
  let rank = 0
  for (const edge of h.edges) rank = Math.max(rank, edge.length)
  return rank
}

/** 一致性：所有超边同大小 → 返回该 r；否则 null（非一致） */
export function hyperUniformity(h: LabHypergraph): number | null {
  if (h.edges.length === 0) return null
  const r = h.edges[0]!.length
  return h.edges.every((edge) => edge.length === r) ? r : null
}

export function hyperIsLinear(h: LabHypergraph): boolean {
  return hyperMaxCodegree(h) <= 1
}

/** 连通性（含所有原顶点；孤立点不被忽略；单点空超图约定连通） */
export function hyperIsConnected(h: LabHypergraph): boolean {
  if (h.n <= 1) return true
  // 顶点通过「同一条超边」相连；BFS
  const seen = new Uint8Array(h.n)
  seen[0] = 1
  const stack = [0]
  let count = 1
  const incident = new Map<number, number[]>()
  h.edges.forEach((edge, index) => {
    for (const v of edge) {
      const list = incident.get(v) ?? []
      list.push(index)
      incident.set(v, list)
    }
  })
  while (stack.length > 0) {
    const v = stack.pop()!
    for (const edgeIndex of incident.get(v) ?? []) {
      for (const u of h.edges[edgeIndex]!) {
        if (!seen[u]) {
          seen[u] = 1
          count++
          stack.push(u)
        }
      }
    }
  }
  return count === h.n
}

export function hyperIsRegular(h: LabHypergraph): boolean {
  const deg = hyperDegrees(h)
  return deg.every((d) => d === deg[0])
}

/** 关联二部图：0..n−1 原顶点（色 0）、n..n+m−1 超边点（色 1） */
export function incidenceGraph(h: LabHypergraph): { graph: LabGraph; colors: number[] } {
  const m = h.edges.length
  const g = emptyGraph(h.n + m)
  h.edges.forEach((edge, index) => {
    const edgeNode = h.n + index
    for (const v of edge) addEdgeAt(g, v, edgeNode)
  })
  const colors = [...new Array<number>(h.n).fill(0), ...new Array<number>(m).fill(1)]
  return { graph: g, colors }
}

export function hyperFingerprint(h: LabHypergraph): string {
  const { graph, colors } = incidenceGraph(h)
  return fingerprint(graph, colors)
}

export function hyperAreIsomorphic(
  a: LabHypergraph,
  b: LabHypergraph,
): { isomorphic: boolean; mapping: { vertices: number[]; edges: number[] } | null } {
  if (a.n !== b.n || a.edges.length !== b.edges.length) return { isomorphic: false, mapping: null }
  const ga = incidenceGraph(a)
  const gb = incidenceGraph(b)
  const result = areIsomorphic(ga.graph, gb.graph, { colorsA: ga.colors, colorsB: gb.colors })
  if (!result.isomorphic || !result.mapping) return { isomorphic: false, mapping: null }
  const vertices = result.mapping.slice(0, a.n)
  const edges = result.mapping.slice(a.n)
  return { isomorphic: true, mapping: { vertices, edges } }
}

/** ---------- 精确不变量 ---------- */

/** 匹配数 ν：最大两两不交超边集（回溯 + 排序剪枝） */
export function hyperMatchingNumber(h: LabHypergraph): { value: number; witness: number[] } {
  const m = h.edges.length
  const masks = h.edges.map((edge) => {
    let mask = 0
    for (const v of edge) mask |= 1 << v
    return mask
  })
  let best = 0
  let bestWitness: number[] = []
  const chosen: number[] = []
  function backtrack(index: number, used: number): void {
    if (chosen.length + (m - index) <= best) return
    if (index === m) {
      if (chosen.length > best) {
        best = chosen.length
        bestWitness = [...chosen]
      }
      return
    }
    const mask = masks[index]!
    if ((mask & used) === 0) {
      chosen.push(index)
      backtrack(index + 1, used | mask)
      chosen.pop()
    }
    backtrack(index + 1, used)
  }
  backtrack(0, 0)
  return { value: best, witness: bestWitness }
}

/** 弱独立数 α：最大不含任何完整超边的顶点集；覆盖数 τ = n − α，见证互补 */
export function hyperWeakIndependence(h: LabHypergraph): {
  alpha: number
  alphaWitness: number[]
  tau: number
  tauWitness: number[]
} {
  const edgeMasks = h.edges.map((edge) => {
    let mask = 0
    for (const v of edge) mask |= 1 << v
    return mask
  })
  let best = 0
  let bestSet = 0
  function backtrack(v: number, included: number): void {
    // 剪枝：当前 + 剩余 ≤ best
    if (popcountLocal(included) + (h.n - v) <= best) return
    if (v === h.n) {
      const size = popcountLocal(included)
      if (size > best && edgeMasks.every((mask) => (mask & included) !== mask)) {
        best = size
        bestSet = included
      }
      return
    }
    backtrack(v + 1, included | (1 << v))
    backtrack(v + 1, included)
  }
  backtrack(0, 0)
  const alphaWitness = [...Array(h.n).keys()].filter((v) => (bestSet >> v) & 1)
  const tauWitness = [...Array(h.n).keys()].filter((v) => !((bestSet >> v) & 1))
  return { alpha: best, alphaWitness, tau: h.n - best, tauWitness }
}

function popcountLocal(value: number): number {
  let x = value
  let count = 0
  while (x !== 0) {
    x &= x - 1
    count++
  }
  return count
}

/** BBᵀ 关联矩阵谱 */
export interface HyperSpectrum {
  matrix: number[][]
  coefficientsBig: bigint[]
  coefficients: string[]
  eigenvalues: number[]
  vectors: number[][]
}

export function hyperBBtSpectrum(h: LabHypergraph): HyperSpectrum {
  const n = h.n
  const codegrees = hyperPairCodegrees(h)
  const deg = hyperDegrees(h)
  const intMatrix: IntMatrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return BigInt(deg[i]!)
      return BigInt(codegrees[i]![j]!)
    }),
  )
  const coefficientsBig = charPolyCoefficients(intMatrix)
  const { values, vectors } = jacobiEigenSymmetric(toNumberMatrix(intMatrix))
  return {
    matrix: toNumberMatrix(intMatrix),
    coefficientsBig,
    coefficients: coefficientsBig.map(String),
    eigenvalues: values,
    vectors,
  }
}

/** ---------- 禁超图包含 ---------- */

export type PatternMode = 'subgraph' | 'induced'

/**
 * 禁超图包含判定：返回顶点映射（禁图顶点 → 主图顶点）或 null。
 * 普通包含：存在顶点单射，使禁图每条完整超边都映为主超图超边；允许额外超边。
 * 顶点诱导包含：映射顶点集内部的全部完整超边恰等于映射后的禁图超边；跨界边忽略。
 */
export function findHyperPattern(
  h: LabHypergraph,
  pattern: LabHypergraph,
  mode: PatternMode,
): number[] | null {
  if (pattern.n > h.n) return null
  const hostEdgeMasks = new Set<number>()
  for (const edge of h.edges) {
    let mask = 0
    for (const v of edge) mask |= 1 << v
    hostEdgeMasks.add(mask)
  }
  const patternEdgeMasks = pattern.edges.map((edge) => {
    let mask = 0
    for (const v of edge) mask |= 1 << v
    return mask
  })
  const mapping = new Array<number>(pattern.n).fill(-1)
  const used = new Uint8Array(h.n)
  const order = [...Array(pattern.n).keys()]

  function mappedVertexMask(): number {
    let mask = 0
    for (let v = 0; v < pattern.n; v++) {
      if (mapping[v]! >= 0) mask |= 1 << mapping[v]!
    }
    return mask
  }

  function edgeSatisfied(patternMask: number): boolean {
    let hostMask = 0
    for (let v = 0; v < pattern.n; v++) {
      if ((patternMask >> v) & 1) {
        const mapped = mapping[v]!
        if (mapped < 0) return true // 未映射完整：暂不判定（由回溯继续）
        hostMask |= 1 << mapped
      }
    }
    return hostEdgeMasks.has(hostMask)
  }

  function compatible(v: number, candidate: number): boolean {
    mapping[v] = candidate
    for (const patternMask of patternEdgeMasks) {
      if ((patternMask >> v) & 1) {
        if (!edgeSatisfied(patternMask)) {
          mapping[v] = -1
          return false
        }
      }
    }
    mapping[v] = -1
    return true
  }

  function inducedExact(): boolean {
    const vertexMask = mappedVertexMask()
    const expected = new Set<number>()
    for (const patternMask of patternEdgeMasks) {
      let hostMask = 0
      for (let v = 0; v < pattern.n; v++) {
        if ((patternMask >> v) & 1) hostMask |= 1 << mapping[v]!
      }
      expected.add(hostMask)
    }
    // 诱导：映射顶点集内部的完整超边集合恰等于映射后的禁图超边
    for (const hostMask of hostEdgeMasks) {
      if ((hostMask & vertexMask) === hostMask && hostMask !== 0) {
        if (!expected.has(hostMask)) return false
      }
    }
    return true
  }

  function backtrack(index: number): boolean {
    if (index === order.length) {
      if (mode === 'induced' && !inducedExact()) return false
      return true
    }
    const v = order[index]!
    for (let candidate = 0; candidate < h.n; candidate++) {
      if (used[candidate]) continue
      if (!compatible(v, candidate)) continue
      mapping[v] = candidate
      used[candidate] = 1
      if (backtrack(index + 1)) return true
      mapping[v] = -1
      used[candidate] = 0
    }
    return false
  }

  return backtrack(0) ? [...mapping] : null
}

/** ---------- 分析结果 ---------- */

export interface HypergraphAnalysis {
  kind: 'hypergraph'
  n: number
  m: number
  edges: number[][]
  degrees: number[]
  minDegree: number
  maxDegree: number
  maxCodegree: number
  rank: number
  uniform: number | null
  linear: boolean
  connected: boolean
  regular: boolean
  nu: number
  nuWitness: number[][]
  tau: number
  tauWitness: number[]
  alpha: number
  alphaWitness: number[]
  spectrum: HyperSpectrum
  /** 三一致超图专用的 τ ≤ ν 检查提示（不做证明，只给数值） */
  notes: string[]
}

export function analyzeHypergraph(payload: HypergraphInput): HypergraphAnalysis {
  const h = validateHypergraphInput(payload)
  const deg = hyperDegrees(h)
  const nu = hyperMatchingNumber(h)
  const weak = hyperWeakIndependence(h)
  return {
    kind: 'hypergraph',
    n: h.n,
    m: h.edges.length,
    edges: h.edges.map((edge) => [...edge]),
    degrees: deg,
    minDegree: deg.length === 0 ? 0 : Math.min(...deg),
    maxDegree: deg.length === 0 ? 0 : Math.max(...deg),
    maxCodegree: hyperMaxCodegree(h),
    rank: hyperRank(h),
    uniform: hyperUniformity(h),
    linear: hyperIsLinear(h),
    connected: hyperIsConnected(h),
    regular: hyperIsRegular(h),
    nu: nu.value,
    nuWitness: nu.witness.map((index) => [...h.edges[index]!]),
    tau: weak.tau,
    tauWitness: weak.tauWitness,
    alpha: weak.alpha,
    alphaWitness: weak.alphaWitness,
    spectrum: hyperBBtSpectrum(h),
    notes: [
      'BBᵀ 是关联矩阵谱，不是邻接张量谱。',
      '弱独立集不完整包含任何超边，因此 α = n − τ。',
      '连通性包含所有原顶点；单顶点空超图约定连通。',
    ],
  }
}

/** 超图 claim 求值器 */
export function hyperClaimGetter(
  h: LabHypergraph,
  rankContext: number | null,
): (name: string) => ClaimValue {
  return (name) => {
    switch (name) {
      case 'nu':
        return rat(BigInt(hyperMatchingNumber(h).value))
      case 'tau':
        return rat(BigInt(hyperWeakIndependence(h).tau))
      case 'alpha':
        return rat(BigInt(hyperWeakIndependence(h).alpha))
      case 'linear':
        return hyperIsLinear(h)
      case 'connected':
        return hyperIsConnected(h)
      case 'regular':
        return hyperIsRegular(h)
      case 'codegree':
        return rat(BigInt(hyperMaxCodegree(h)))
      case 'rank':
        return rat(BigInt(hyperRank(h)))
      case 'r': {
        const uniform = hyperUniformity(h)
        return rat(BigInt(rankContext ?? uniform ?? 0))
      }
      case 'delta':
        return rat(BigInt(Math.min(...hyperDegrees(h))))
      case 'Delta':
        return rat(BigInt(Math.max(...hyperDegrees(h))))
      case 'n':
        return rat(BigInt(h.n))
      case 'm':
        return rat(BigInt(h.edges.length))
      default:
        throw new HyperError(`未知变量：${name}`)
    }
  }
}

/** ---------- 比较 ---------- */

export interface HypergraphComparison {
  left: HypergraphAnalysis
  right: HypergraphAnalysis
  parameterRows: Array<{ label: string; left: string; right: string; delta: string }>
  isomorphic: boolean
  mapping: { vertices: number[]; edges: number[] } | null
  mappingVerified: boolean
  cospectral: boolean
  spectrumNote: string
}

export function compareHypergraphs(
  left: HypergraphInput,
  right: HypergraphInput,
): HypergraphComparison {
  const a = validateHypergraphInput(left)
  const b = validateHypergraphInput(right)
  const analysisLeft = analyzeHypergraph(a)
  const analysisRight = analyzeHypergraph(b)
  const iso = hyperAreIsomorphic(a, b)
  const cospectral =
    analysisLeft.spectrum.coefficients.length === analysisRight.spectrum.coefficients.length &&
    analysisLeft.spectrum.coefficients.every(
      (value, i) => value === analysisRight.spectrum.coefficients[i],
    )

  const numberRows: Array<[string, number, number]> = [
    ['顶点数 n', analysisLeft.n, analysisRight.n],
    ['超边数 m', analysisLeft.m, analysisRight.m],
    ['最小度 δ', analysisLeft.minDegree, analysisRight.minDegree],
    ['最大度 Δ', analysisLeft.maxDegree, analysisRight.maxDegree],
    ['最大共度', analysisLeft.maxCodegree, analysisRight.maxCodegree],
    ['秩（最大超边）', analysisLeft.rank, analysisRight.rank],
    ['匹配数 ν', analysisLeft.nu, analysisRight.nu],
    ['覆盖数 τ', analysisLeft.tau, analysisRight.tau],
    ['弱独立数 α', analysisLeft.alpha, analysisRight.alpha],
  ]
  const parameterRows = numberRows.map(([label, leftValue, rightValue]) => ({
    label,
    left: String(leftValue),
    right: String(rightValue),
    delta: String(rightValue - leftValue),
  }))
  const boolRow = (label: string, x: boolean, y: boolean): (typeof parameterRows)[number] => ({
    label,
    left: x ? '是' : '否',
    right: y ? '是' : '否',
    delta: x === y ? '相同' : '不同',
  })
  parameterRows.push(
    boolRow('线性', analysisLeft.linear, analysisRight.linear),
    boolRow('连通', analysisLeft.connected, analysisRight.connected),
    boolRow('正则', analysisLeft.regular, analysisRight.regular),
    boolRow('一致（同大小）', analysisLeft.uniform !== null, analysisRight.uniform !== null),
  )

  let mappingVerified = false
  if (iso.isomorphic && iso.mapping) {
    // 逐边复核：映射后的超边集合必须与 B 的规范形一致
    const mapped = a.edges
      .map((edge) => edge.map((v) => iso.mapping!.vertices[v]!).sort((x, y) => x - y))
      .map((edge) => edge.join(','))
      .sort()
    const target = b.edges.map((edge) => [...edge].sort((x, y) => x - y).join(',')).sort()
    mappingVerified =
      mapped.length === target.length && mapped.every((value, i) => value === target[i])
  }

  return {
    left: analysisLeft,
    right: analysisRight,
    parameterRows,
    isomorphic: iso.isomorphic,
    mapping: iso.mapping,
    mappingVerified,
    cospectral,
    spectrumNote: 'BBᵀ 整数特征多项式精确比较；同谱不等于同构，也不表示邻接张量同谱。',
  }
}
