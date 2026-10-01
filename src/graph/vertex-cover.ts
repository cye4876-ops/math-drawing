/**
 * 最小点覆盖 τ(G)（v0.5b）：覆盖全部边（含自环）所需的最少顶点数。
 * - 自环：其端点必须入选（预处理强制）；
 * - 顶点数 ≤ 40：精确分支——取未覆盖边 (u,v)，分别尝试选 u 或选 v 回溯；
 *   下界剪枝用剩余边的极大匹配（贪心），上界初值取 2-近似解；
 * - 更大：2-近似（极大匹配两端点），exact=false。
 * 返回大小与一个最优（或近似）解的顶点 id 列表（供面板高亮）。
 */
import type { GraphObject } from './model'

export interface VertexCoverResult {
  size: number
  /** 解的顶点 id（最优或近似） */
  vertices: string[]
  exact: boolean
}

type EdgePair = [number, number]

export function minimumVertexCover(graph: GraphObject): VertexCoverResult {
  const n = graph.nodes.length
  const indexById = new Map(graph.nodes.map((node, i) => [node.id, i]))

  const forced = new Set<number>()
  const edges: EdgePair[] = []
  for (const edge of graph.edges) {
    const u = indexById.get(edge.source)
    const v = indexById.get(edge.target)
    if (u === undefined || v === undefined) continue
    if (u === v) forced.add(u)
    else edges.push([u, v])
  }

  /** 贪心极大匹配的两端点（2-近似；forced 先剔除） */
  function greedyUpper(remaining: EdgePair[]): Set<number> {
    const picked = new Set<number>(forced)
    for (const [u, v] of remaining) {
      if (picked.has(u) || picked.has(v)) continue
      picked.add(u)
      picked.add(v)
    }
    return picked
  }

  const uncovered = edges.filter(([u, v]) => !forced.has(u) && !forced.has(v))

  if (n > 40) {
    const picked = greedyUpper(uncovered)
    return {
      size: picked.size,
      vertices: graph.nodes.filter((_, i) => picked.has(i)).map((node) => node.id),
      exact: false,
    }
  }

  /** 极大匹配基数下界（贪心） */
  function matchingLower(remaining: EdgePair[]): number {
    const used = new Uint8Array(n)
    let count = 0
    for (const [u, v] of remaining) {
      if (used[u] || used[v]) continue
      used[u] = 1
      used[v] = 1
      count++
    }
    return count
  }

  let best = greedyUpper(uncovered)
  const chosen = new Set<number>(forced)

  function search(remaining: EdgePair[]): void {
    if (remaining.length === 0) {
      if (chosen.size < best.size) best = new Set(chosen)
      return
    }
    if (chosen.size + matchingLower(remaining) >= best.size) return
    const [u, v] = remaining[0]!
    for (const pick of [u, v]) {
      chosen.add(pick)
      search(remaining.filter(([a, b]) => a !== pick && b !== pick))
      chosen.delete(pick)
    }
  }

  search(uncovered)

  return {
    size: best.size,
    vertices: graph.nodes.filter((_, i) => best.has(i)).map((node) => node.id),
    exact: true,
  }
}
