/**
 * ex(n,H) 小 n 精确搜索（v3.6）：在 n ≤ 7 的图集上逐图判定禁图包含，取最大边数。
 */
import { ATLAS_MAX_N, atlasGraphs, type AtlasGraph } from './atlas'
import { containsPattern, type SimpleGraph } from './containment'
import { knownExtremalValue, turanLowerBound } from './patterns'

export type PatternMode = 'subgraph' | 'induced'

export interface ExtremalSearchResult {
  n: number
  mode: PatternMode
  patternLabel: string
  scanned: number
  freeCount: number
  maxEdges: number
  extremalCount: number
  /** 展示用极图（最多 12 个） */
  extremal: AtlasGraph[]
  known: ReturnType<typeof knownExtremalValue>
  lowerBound: ReturnType<typeof turanLowerBound>
  readMs: number
  note: string
}

export function extremalSearch(
  n: number,
  pattern: SimpleGraph,
  mode: PatternMode,
  patternLabel: string,
): ExtremalSearchResult {
  const size = Math.round(n)
  if (size < 1 || size > ATLAS_MAX_N) {
    throw new Error(`图集支持 n = 1..${ATLAS_MAX_N}（更大 n 请使用 Turán 构造）`)
  }
  const started = performance.now()
  const graphs = atlasGraphs(size)
  let maxEdges = -1
  let extremalCount = 0
  let freeCount = 0
  const extremal: AtlasGraph[] = []
  for (const graph of graphs) {
    if (containsPattern(graph, pattern, mode === 'induced')) {
      continue
    }
    freeCount++
    if (graph.m > maxEdges) {
      maxEdges = graph.m
      extremal.length = 0
      extremal.push(graph)
      extremalCount = 1
    } else if (graph.m === maxEdges) {
      extremalCount++
      if (extremal.length < 12) extremal.push(graph)
    }
  }
  const known = mode === 'subgraph' ? knownExtremalValue(pattern, size) : null
  const lowerBound = mode === 'subgraph' ? turanLowerBound(pattern, size) : null
  const readMs = performance.now() - started
  return {
    n: size,
    mode,
    patternLabel,
    scanned: graphs.length,
    freeCount,
    maxEdges,
    extremalCount,
    extremal,
    known,
    lowerBound,
    readMs,
    note: `扫描 ${graphs.length} 个非同构图（${readMs.toFixed(1)} ms），其中 ${freeCount} 个不含禁图。`,
  }
}
