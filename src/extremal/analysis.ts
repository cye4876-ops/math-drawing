/**
 * 极值计算的附加分析（v3.7）：
 * - 极大性证书：逐条缺失边检查加入后是否产生禁图（证明 H-饱和/极大，而非最大）；
 * - 饱和数 sat(n,F)：最小边数的 H-饱和图；
 * - 稳定性：与 Turán 下界构造 T_{χ(F)−1}(n) 的边差、度序列差与同构性；
 * - 渐近信息：Erdős–Stone 密度；二部禁图归入 KST 型（π=0）。
 */
import { atlasGraphs, type AtlasGraph } from './atlas'
import { areIsomorphic, containsPattern, graphDegrees, type SimpleGraph } from './containment'
import { DEFAULT_HOST_FILTERS, passesHostFilters, type HostFilters } from './filters'
import { chromaticNumber, turanGraph } from './patterns'

export interface MaximalityCertificate {
  /** 在结构约束内，所有可加入边都会产生禁图（完全图也视为极大） */
  maximal: boolean
  missingEdges: number
  /** 加入后仍满足结构约束的缺失边数 */
  addableEdges: number
  /** 加入后会产生禁图的缺失边数（只统计可加入边） */
  breakingEdges: number
  /** 因结构约束而不能加入的缺失边数 */
  blockedByFilters: number
  /** 第一个反例：加入它仍不含禁图 */
  witnessEdge: [number, number] | null
}

export interface StabilityInfo {
  parts: number
  chromatic: number
  referenceEdges: number
  /** 极图边数 − T_r(n) 边数 */
  edgeGap: number
  /** 排序后度序列的 L1 距离 */
  degreeGap: number
  isomorphicToTuran: boolean
  note: string
}

export interface SaturationResult {
  value: number | null
  examples: AtlasGraph[]
  count: number
  note: string
}

export interface AsymptoticInfo {
  familyDensity: number
  familyChromatic: number
  bipartite: boolean
  perPattern: Array<{ label: string; chromatic: number; density: number }>
  note: string
}

function addEdge(graph: SimpleGraph, u: number, v: number): SimpleGraph {
  const adj = [...graph.adj]
  adj[u]! |= 1 << v
  adj[v]! |= 1 << u
  return { n: graph.n, adj }
}

export function isPatternFree(
  graph: SimpleGraph,
  patterns: SimpleGraph[],
  induced: boolean,
): boolean {
  return !patterns.some((pattern) => containsPattern(graph, pattern, induced))
}

/** 极大性证书：对每条缺失边做一次“加边后是否仍 H-free”的检查 */
export function maximalityCertificate(
  graph: SimpleGraph,
  patterns: SimpleGraph[],
  induced: boolean,
  filters: HostFilters = DEFAULT_HOST_FILTERS,
): MaximalityCertificate {
  let missingEdges = 0
  let addableEdges = 0
  let breakingEdges = 0
  let blockedByFilters = 0
  let witnessEdge: [number, number] | null = null
  for (let u = 0; u < graph.n; u++) {
    for (let v = u + 1; v < graph.n; v++) {
      if (((graph.adj[u]! >> v) & 1) === 1) continue
      missingEdges++
      const next = addEdge(graph, u, v)
      if (!passesHostFilters(next, filters)) {
        blockedByFilters++
        continue
      }
      addableEdges++
      if (isPatternFree(next, patterns, induced)) {
        if (!witnessEdge) witnessEdge = [u, v]
      } else {
        breakingEdges++
      }
    }
  }
  return {
    maximal: addableEdges === breakingEdges,
    missingEdges,
    addableEdges,
    breakingEdges,
    blockedByFilters,
    witnessEdge,
  }
}

/**
 * 饱和数：最小边数的 H-饱和图（H-free，且加任意缺失边都会产生 H）。
 * 与 ex(n,H) 的“最大”相对，是极值图论里另一条常见目标。
 */
export function saturationSearch(
  n: number,
  patterns: SimpleGraph[],
  induced: boolean,
  filters: HostFilters,
): SaturationResult {
  let value: number | null = null
  let count = 0
  const examples: AtlasGraph[] = []
  for (const graph of atlasGraphs(n)) {
    if (!passesHostFilters(graph, filters)) continue
    if (!isPatternFree(graph, patterns, induced)) continue
    if (value !== null && graph.m > value) continue
    if (!maximalityCertificate(graph, patterns, induced, filters).maximal) continue
    if (value === null || graph.m < value) {
      value = graph.m
      count = 1
      examples.length = 0
      examples.push(graph)
    } else {
      count++
      if (examples.length < 12) examples.push(graph)
    }
  }
  return {
    value,
    examples,
    count,
    note:
      value === null
        ? '没有找到 H-饱和图（可能禁图规模超过宿主阶数，或结构约束过强）。'
        : `在 ${n} 个顶点上找到 ${count} 个最小 H-饱和图，最小边数 sat = ${value}。`,
  }
}

/** 与 Turán 下界构造 T_{χ(H)−1}(n) 的稳定性对照 */
export function stabilityInfo(graph: AtlasGraph, pattern: SimpleGraph): StabilityInfo | null {
  const chromatic = chromaticNumber(pattern)
  if (chromatic < 3) return null
  const parts = chromatic - 1
  const turan = turanGraph(graph.n, parts)
  const referenceEdges = turan.edges.length
  const graphDegreeList = [...graph.degrees].sort((a, b) => a - b)
  const turanDegreeList = graphDegrees(turan.graph).sort((a, b) => a - b)
  let degreeGap = 0
  for (let index = 0; index < graphDegreeList.length; index++) {
    degreeGap += Math.abs((graphDegreeList[index] ?? 0) - (turanDegreeList[index] ?? 0))
  }
  const isomorphicToTuran = areIsomorphic(graph, turan.graph)
  return {
    parts,
    chromatic,
    referenceEdges,
    edgeGap: graph.m - referenceEdges,
    degreeGap,
    isomorphicToTuran,
    note: isomorphicToTuran
      ? `与 T${parts}(${graph.n}) 同构：达到 Turán 下界构造。`
      : `与 T${parts}(${graph.n})：边差 ${graph.m - referenceEdges}，度序列 L1 距离 ${degreeGap}。`,
  }
}

/** Erdős–Stone / KST 渐近信息；不冒充有限 n 的精确 ex */
export function asymptoticInfo(
  patterns: Array<{ graph: SimpleGraph; label: string }>,
): AsymptoticInfo {
  const perPattern = patterns.map(({ graph, label }) => {
    const chromatic = chromaticNumber(graph)
    return {
      label,
      chromatic,
      density: chromatic <= 2 ? 0 : 1 - 1 / (chromatic - 1),
    }
  })
  const familyChromatic = Math.min(...perPattern.map((item) => item.chromatic))
  const familyDensity = familyChromatic <= 2 ? 0 : 1 - 1 / (familyChromatic - 1)
  const bipartite = familyChromatic <= 2
  return {
    familyDensity,
    familyChromatic,
    bipartite,
    perPattern,
    note: bipartite
      ? '存在二部禁图：Turán 密度 π(F) = 0；有限 n 的精确值需查 KST 型界或枚举，不能由渐近式直接给出。'
      : `Erdős–Stone：π(F) = 1 − 1/(χ_min − 1) = ${familyDensity.toFixed(3)}（渐近密度，非有限 n 精确值）。`,
  }
}
