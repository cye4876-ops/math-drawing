/**
 * 禁图包含判定（v2.7）：
 * - 普通包含（subgraph）：存在顶点单射，使禁图每条边都映为主图边（允许额外边）；
 * - 顶点诱导包含（induced）：映射顶点集**内部**的全部边恰等于禁图边集
 *   （不取边的迹；跨界边不影响判定）。
 * 另提供增量检查 containsPatternWithEdge：新加边 (u,v) 是否立即产生某个普通禁图
 * （仅普通包含可在生成过程中提前剪枝；诱导包含只有在完整候选上才能判定）。
 */
import { bitsOf, degrees, edgeCount, hasEdge, type LabGraph } from './graph'

export type PatternMode = 'subgraph' | 'induced'

export interface PatternInfo {
  name: string
  graph: LabGraph
  /** 边表（pattern 顶点对） */
  edges: Array<[number, number]>
  degrees: number[]
}

export function patternInfo(name: string, graph: LabGraph): PatternInfo {
  const edges: Array<[number, number]> = []
  for (let u = 0; u < graph.n; u++) {
    for (const v of bitsOf(graph.adj[u]!)) {
      if (v > u) edges.push([u, v])
    }
  }
  return { name, graph, edges, degrees: degrees(graph) }
}

/**
 * 禁图是否包含于 g；返回映射（pattern 顶点 → g 顶点）或 null。
 * 普通包含只要求禁图边存在；诱导包含要求恰等于（内部边完全一致）。
 */
export function findPattern(g: LabGraph, pattern: PatternInfo, mode: PatternMode): number[] | null {
  const p = pattern.graph
  if (p.n > g.n) return null
  if (mode === 'subgraph' && pattern.edges.length > edgeCount(g)) return null
  const gDeg = degrees(g)
  // 顶点顺序：度大优先
  const order = [...Array(p.n).keys()].sort(
    (x, y) => pattern.degrees[y]! - pattern.degrees[x]! || x - y,
  )
  const mapping = new Array<number>(p.n).fill(-1)
  const used = new Uint8Array(g.n)

  function compatible(pi: number, gv: number): boolean {
    if (mode === 'subgraph') {
      if (gDeg[gv]! < pattern.degrees[pi]!) return false
    }
    for (let w = 0; w < p.n; w++) {
      const gw = mapping[w]!
      if (gw < 0) continue
      const pEdge = hasEdge(p, pi, w)
      const gEdge = hasEdge(g, gv, gw)
      if (mode === 'subgraph') {
        if (pEdge && !gEdge) return false
      } else if (pEdge !== gEdge) {
        return false
      }
    }
    return true
  }

  function backtrack(index: number): boolean {
    if (index === order.length) return true
    const pi = order[index]!
    for (let gv = 0; gv < g.n; gv++) {
      if (used[gv]) continue
      if (!compatible(pi, gv)) continue
      mapping[pi] = gv
      used[gv] = 1
      if (backtrack(index + 1)) return true
      mapping[pi] = -1
      used[gv] = 0
    }
    return false
  }

  return backtrack(0) ? mapping : null
}

/**
 * 增量检查：把新边 (u,v) 映到禁图的某条边上，其余顶点可否扩展成完整普通包含。
 * 仅用于“普通包含”模式的生成期剪枝。
 */
export function containsPatternWithEdge(
  g: LabGraph,
  pattern: PatternInfo,
  u: number,
  v: number,
): boolean {
  const p = pattern.graph
  if (p.n > g.n) return false
  const gDeg = degrees(g)
  // 若禁图无任何度数不小于端点的图，快速失败
  for (const [pi, pj] of pattern.edges) {
    for (const orientation of [0, 1] as const) {
      const a = orientation === 0 ? pi : pj
      const b = orientation === 0 ? pj : pi
      if (tryMap(a, u, b, v)) return true
    }
  }
  return false

  function tryMap(a: number, gu: number, b: number, gv: number): boolean {
    if (gDeg[gu]! < pattern.degrees[a]!) return false
    if (gDeg[gv]! < pattern.degrees[b]!) return false
    const mapping = new Array<number>(p.n).fill(-1)
    const used = new Uint8Array(g.n)
    mapping[a] = gu
    mapping[b] = gv
    used[gu] = 1
    used[gv] = 1
    const remaining = [...Array(p.n).keys()].filter((i) => i !== a && i !== b)
    remaining.sort((x, y) => pattern.degrees[y]! - pattern.degrees[x]! || x - y)

    function compatible(pi: number, gx: number): boolean {
      if (gDeg[gx]! < pattern.degrees[pi]!) return false
      for (let w = 0; w < p.n; w++) {
        const gw = mapping[w]!
        if (gw < 0) continue
        if (hasEdge(p, pi, w) && !hasEdge(g, gx, gw)) return false
      }
      return true
    }

    function backtrack(index: number): boolean {
      if (index === remaining.length) return true
      const pi = remaining[index]!
      for (let gx = 0; gx < g.n; gx++) {
        if (used[gx]) continue
        if (!compatible(pi, gx)) continue
        mapping[pi] = gx
        used[gx] = 1
        if (backtrack(index + 1)) return true
        mapping[pi] = -1
        used[gx] = 0
      }
      return false
    }

    return backtrack(0)
  }
}
