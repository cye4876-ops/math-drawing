/**
 * 二分化数 b(G)（v0.5）：
 * 删除最少几条边可以把图变成二部图；等价于 m − maxcut(G)（自环必删、不参与割）。
 * - n ≤ 20：精确枚举所有划分（固定顶点 0 在一侧，利用左右对称减半），保证最优；
 * - n > 20：多起点贪心局部搜索（逐步翻转顶点直至无改进），exact=false（近似）。
 * 平行边分别计数；孤立点两侧任意。返回需删边 id 与一个最优（或近似最优）划分。
 */
import type { GraphObject } from './model'

export interface BipartizationResult {
  /** b(G)：需要删除的边数（含自环） */
  count: number
  /** 需要删除的边 id（含自环与同侧边） */
  edgeIds: string[]
  /** 划分（节点 id 分居两侧；自环顶点可任意归侧） */
  partition: { left: string[]; right: string[] }
  /** true = 精确最优；false = 贪心近似 */
  exact: boolean
}

interface SimpleEdge {
  id: string
  u: number
  v: number
}

/** 从全左局面出发，逐顶点翻转直到无改进（局部最优）；返回同侧边数 */
function localSearch(n: number, edges: SimpleEdge[], side: Uint8Array): number {
  let same = 0
  for (const edge of edges) if (side[edge.u] === side[edge.v]) same++

  let rounds = 0
  let improved = true
  while (improved && rounds < n + 5) {
    improved = false
    rounds++
    for (let v = 0; v < n; v++) {
      let sameNeighbors = 0
      let crossNeighbors = 0
      for (const edge of edges) {
        if (edge.u === v) {
          if (side[edge.v] === side[v]) sameNeighbors++
          else crossNeighbors++
        } else if (edge.v === v) {
          if (side[edge.u] === side[v]) sameNeighbors++
          else crossNeighbors++
        }
      }
      // 翻转后：原同侧邻居边变跨侧（-same），原跨侧边变同侧（+cross）
      // 同侧边减少 ⇔ same > cross
      if (sameNeighbors > crossNeighbors) {
        side[v] = (side[v] ?? 0) ^ 1
        same += crossNeighbors - sameNeighbors
        improved = true
      }
    }
  }
  return same
}

/** BFS 染色起点（对二分图直接得 0；对一般图给出较轻坏边的初值） */
function bfsStart(n: number, edges: SimpleEdge[]): Uint8Array {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const { u, v } of edges) {
    adj[u]!.push(v)
    adj[v]!.push(u)
  }
  const side = new Uint8Array(Math.max(n, 1))
  const seen = new Array<boolean>(n).fill(false)
  for (let root = 0; root < n; root++) {
    if (seen[root]) continue
    seen[root] = true
    const queue = [root]
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head]!
      for (const next of adj[node]!) {
        if (seen[next]) continue
        seen[next] = true
        side[next] = side[node]! ^ 1
        queue.push(next)
      }
    }
  }
  return side
}

/** 求最小同侧边数，并把最优划分写回 side（0/1） */
function searchPartition(n: number, edges: SimpleEdge[], side: Uint8Array): number {
  if (n <= 20) {
    // 精确：固定顶点 0 在左，枚举其余 n-1 个顶点的侧（2^(n-1)）
    const limit = 1 << Math.max(0, n - 1)
    let bestCount = edges.length
    let bestMask = 0
    for (let mask = 0; mask < limit; mask++) {
      side[0] = 0
      for (let i = 1; i < n; i++) side[i] = (mask >> (i - 1)) & 1
      let same = 0
      for (const edge of edges) if (side[edge.u] === side[edge.v]) same++
      if (same < bestCount) {
        bestCount = same
        bestMask = mask
        if (same === 0) break
      }
    }
    side[0] = 0
    for (let i = 1; i < n; i++) side[i] = (bestMask >> (i - 1)) & 1
    return bestCount
  }

  // 贪心：全左起点 + BFS 染色起点，各做局部搜索取优
  side.fill(0)
  let bestCount = localSearch(n, edges, side)
  let bestSide = side.slice()

  const fromBfs = bfsStart(n, edges)
  side.set(fromBfs)
  const bfsCount = localSearch(n, edges, side)
  if (bfsCount < bestCount) {
    bestCount = bfsCount
    bestSide = side.slice()
  }

  side.set(bestSide)
  return bestCount
}

export function bipartizationNumber(graph: GraphObject): BipartizationResult {
  const n = graph.nodes.length
  const indexById = new Map(graph.nodes.map((node, index) => [node.id, index]))

  const forced: string[] = []
  const simple: SimpleEdge[] = []
  for (const edge of graph.edges) {
    const u = indexById.get(edge.source)
    const v = indexById.get(edge.target)
    if (u === undefined || v === undefined) continue
    if (u === v) forced.push(edge.id)
    else simple.push({ id: edge.id, u, v })
  }

  const side = new Uint8Array(Math.max(n, 1))
  if (n > 0) searchPartition(n, simple, side)
  const sameEdgeIds = simple.filter((edge) => side[edge.u] === side[edge.v]).map((e) => e.id)

  const left: string[] = []
  const right: string[] = []
  graph.nodes.forEach((node, index) => {
    if (side[index] === 0) left.push(node.id)
    else right.push(node.id)
  })

  return {
    count: forced.length + sameEdgeIds.length,
    edgeIds: [...forced, ...sameEdgeIds],
    partition: { left, right },
    exact: n <= 20,
  }
}
