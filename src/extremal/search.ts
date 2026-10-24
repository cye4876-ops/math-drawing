/**
 * ex(n,F) 小 n 精确搜索（v3.6 / v3.7）：
 * 支持多禁图集合、宿主结构约束、极大性证书、饱和数、稳定性与渐近信息。
 */
import { ATLAS_MAX_N, atlasGraphs, type AtlasGraph } from './atlas'
import {
  asymptoticInfo,
  maximalityCertificate,
  saturationSearch,
  stabilityInfo,
  type AsymptoticInfo,
  type MaximalityCertificate,
  type SaturationResult,
  type StabilityInfo,
} from './analysis'
import { containsPattern, type SimpleGraph } from './containment'
import {
  DEFAULT_HOST_FILTERS,
  describeHostFilters,
  hasActiveHostFilters,
  passesHostFilters,
  type HostFilters,
} from './filters'
import { formatPatternLabel, knownExtremalValue, turanLowerBoundForPatterns } from './patterns'

export type PatternMode = 'subgraph' | 'induced'

export interface ExtremalPatternSpec {
  graph: SimpleGraph
  label: string
}

export interface ExtremalSearchOptions {
  n: number
  patterns: ExtremalPatternSpec[]
  mode: PatternMode
  filters?: HostFilters
  /** 是否计算饱和数（较大扫描；界面开启，旧调用默认关闭） */
  analyses?: boolean
  /** 多禁图不套用单图闭式公式 */
  allowKnownFormula?: boolean
}

export interface ExtremalCandidate extends AtlasGraph {
  maximality: MaximalityCertificate
  stability: StabilityInfo | null
}

export interface ExtremalSearchResult {
  n: number
  mode: PatternMode
  patternLabel: string
  patternLabels: string[]
  patternCount: number
  filters: HostFilters
  filterLabel: string
  scanned: number
  eligible: number
  filteredOut: number
  freeCount: number
  maxEdges: number
  extremalCount: number
  /** 全部极图（同构图集已按图集非重构组织） */
  extremal: ExtremalCandidate[]
  known: ReturnType<typeof knownExtremalValue>
  lowerBound: ReturnType<typeof turanLowerBoundForPatterns>
  asymptotic: AsymptoticInfo
  saturation: SaturationResult | null
  readMs: number
  note: string
}

export function extremalSearchMulti(options: ExtremalSearchOptions): ExtremalSearchResult {
  const size = Math.round(options.n)
  if (size < 1 || size > ATLAS_MAX_N) {
    throw new Error(`图集支持 n = 1..${ATLAS_MAX_N}（更大 n 请使用 Turán 构造）`)
  }
  if (options.patterns.length === 0) throw new Error('请至少选择一张禁图')
  const filters = options.filters ?? DEFAULT_HOST_FILTERS
  const patterns = options.patterns.map((item) => item.graph)
  const induced = options.mode === 'induced'
  const started = performance.now()
  const graphs = atlasGraphs(size)
  let maxEdges = -1
  let extremalCount = 0
  let freeCount = 0
  let eligible = 0
  const extremal: AtlasGraph[] = []
  for (const graph of graphs) {
    if (!passesHostFilters(graph, filters)) continue
    eligible++
    if (isForbidden(graph)) continue
    freeCount++
    if (graph.m > maxEdges) {
      maxEdges = graph.m
      extremal.length = 0
      extremal.push(graph)
      extremalCount = 1
    } else if (graph.m === maxEdges) {
      extremalCount++
      extremal.push(graph)
    }
  }

  function isForbidden(graph: SimpleGraph): boolean {
    return patterns.some((pattern) => containsPattern(graph, pattern, induced))
  }

  const singlePattern = options.patterns.length === 1 ? patterns[0]! : null
  const singleLabel = options.patterns.length === 1 ? options.patterns[0]!.label : null
  const stabilityPattern = singlePattern && options.mode === 'subgraph' ? singlePattern : null
  const candidates: ExtremalCandidate[] = extremal.map((graph) => ({
    ...graph,
    maximality: maximalityCertificate(graph, patterns, induced, filters),
    stability: stabilityPattern ? stabilityInfo(graph, stabilityPattern) : null,
  }))
  const known =
    options.mode === 'subgraph' &&
    singlePattern &&
    options.allowKnownFormula !== false &&
    !hasActiveHostFilters(filters)
      ? knownExtremalValue(singlePattern, size)
      : null
  const lowerBound =
    options.mode === 'subgraph' && !hasActiveHostFilters(filters)
      ? turanLowerBoundForPatterns(patterns, size)
      : null
  const asymptotic = asymptoticInfo(options.patterns)
  const saturation = options.analyses ? saturationSearch(size, patterns, induced, filters) : null
  const readMs = performance.now() - started
  const filterLabel = describeHostFilters(filters)
  const patternLabels = options.patterns.map((item) => item.label)
  const patternLabel = formatPatternLabel(patternLabels)
  const note =
    maxEdges < 0
      ? `扫描 ${graphs.length} 个非同构图，但没有满足结构约束的 H-free 图。`
      : `扫描 ${graphs.length} 个非同构图（结构约束筛去 ${graphs.length - eligible} 个，${freeCount} 个不含禁图，${readMs.toFixed(
          1,
        )} ms）。`
  return {
    n: size,
    mode: options.mode,
    patternLabel,
    patternLabels,
    patternCount: options.patterns.length,
    filters,
    filterLabel,
    scanned: graphs.length,
    eligible,
    filteredOut: graphs.length - eligible,
    freeCount,
    maxEdges,
    extremalCount,
    extremal: candidates,
    known,
    lowerBound,
    asymptotic,
    saturation,
    readMs,
    note: singleLabel ? note : `${note}禁图集合：${patternLabel}。`,
  }
}

/** 兼容 v3.6 单禁图调用 */
export function extremalSearch(
  n: number,
  pattern: SimpleGraph,
  mode: PatternMode,
  patternLabel: string,
): ExtremalSearchResult {
  return extremalSearchMulti({
    n,
    patterns: [{ graph: pattern, label: patternLabel }],
    mode,
    allowKnownFormula: true,
  })
}
