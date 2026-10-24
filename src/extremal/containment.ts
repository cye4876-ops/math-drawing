/**
 * 小图禁图包含判定（v3.6）：子图同构 / 顶点诱导子图同构。
 * 规模：宿主 n ≤ 7、禁图 ≤ 6，回溯即可；带度数与已映射邻接剪枝。
 */
export interface SimpleGraph {
  n: number
  /** 位掩码邻接 */
  adj: number[]
}

export function simpleGraphFromEdges(n: number, edges: Array<[number, number]>): SimpleGraph {
  if (!Number.isInteger(n) || n < 1) throw new Error('顶点数须为正整数')
  const adj = new Array<number>(n).fill(0)
  for (const [a, b] of edges) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) {
      throw new Error('边端点须在 0..n−1 内')
    }
    if (a === b) continue
    adj[a]! |= 1 << b
    adj[b]! |= 1 << a
  }
  return { n, adj }
}

export function graphDegrees(graph: SimpleGraph): number[] {
  return graph.adj.map((mask) => {
    let x = mask
    let count = 0
    while (x !== 0) {
      x &= x - 1
      count++
    }
    return count
  })
}

export function edgeCountOf(graph: SimpleGraph): number {
  return graphDegrees(graph).reduce((sum, value) => sum + value, 0) / 2
}

/**
 * 是否含禁图：
 * - induced=false：普通子图（边单射，允许宿主在映射点集内外有额外边）；
 * - induced=true：映射点集诱导出的子图恰为禁图（非边也必须对应非边）。
 */
export function containsPattern(host: SimpleGraph, pattern: SimpleGraph, induced = false): boolean {
  if (pattern.n === 0) return true
  if (pattern.n > host.n) return false
  if (!induced && edgeCountOf(pattern) > edgeCountOf(host)) return false
  const hostDegrees = graphDegrees(host)
  const patternDegrees = graphDegrees(pattern)
  const order = Array.from({ length: pattern.n }, (_, index) => index).sort(
    (a, b) => patternDegrees[b]! - patternDegrees[a]! || a - b,
  )
  const mapping = new Array<number>(pattern.n).fill(-1)
  const used = new Uint8Array(host.n)

  const compatible = (patternVertex: number, hostVertex: number): boolean => {
    for (let other = 0; other < pattern.n; other++) {
      const mapped = mapping[other]!
      if (mapped < 0) continue
      const patternEdge = (pattern.adj[patternVertex]! >> other) & 1
      const hostEdge = (host.adj[hostVertex]! >> mapped) & 1
      if (patternEdge === 1 && hostEdge === 0) return false
      if (induced && patternEdge === 0 && hostEdge === 1) return false
    }
    return true
  }

  const search = (position: number): boolean => {
    if (position === order.length) return true
    const patternVertex = order[position]!
    const minimumDegree = patternDegrees[patternVertex]!
    for (let hostVertex = 0; hostVertex < host.n; hostVertex++) {
      if (used[hostVertex]) continue
      if (hostDegrees[hostVertex]! < minimumDegree) continue
      if (!compatible(patternVertex, hostVertex)) continue
      mapping[patternVertex] = hostVertex
      used[hostVertex] = 1
      if (search(position + 1)) return true
      used[hostVertex] = 0
      mapping[patternVertex] = -1
    }
    return false
  }
  return search(0)
}
