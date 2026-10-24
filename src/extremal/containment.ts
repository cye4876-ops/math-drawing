/**
 * 小图禁图包含判定（v3.6）：子图同构 / 顶点诱导子图同构。
 * 规模：宿主 n ≤ 7、禁图 ≤ 6，回溯即可；带度数与已映射邻接剪枝。
 */
export interface SimpleGraph {
  n: number
  /** 位掩码邻接 */
  adj: number[]
}

export interface PreparedPattern {
  graph: SimpleGraph
  degrees: number[]
  /** 度数降序的映射顺序 */
  order: number[]
  edgeCount: number
}

export function preparePattern(pattern: SimpleGraph): PreparedPattern {
  const degrees = graphDegrees(pattern)
  const order = Array.from({ length: pattern.n }, (_, index) => index).sort(
    (a, b) => degrees[b]! - degrees[a]! || a - b,
  )
  return {
    graph: pattern,
    degrees,
    order,
    edgeCount: degrees.reduce((sum, value) => sum + value, 0) / 2,
  }
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

/** 预计算禁图度数/映射顺序后的包含判定；宿主度数可复用 */
export function containsPrepared(
  host: SimpleGraph,
  pattern: PreparedPattern,
  induced = false,
  hostDegrees: number[] = graphDegrees(host),
): boolean {
  const patternGraph = pattern.graph
  if (patternGraph.n === 0) return true
  if (patternGraph.n > host.n) return false
  const hostEdgeCount = hostDegrees.reduce((sum, value) => sum + value, 0) / 2
  if (pattern.edgeCount > hostEdgeCount) return false
  const mapping = new Array<number>(patternGraph.n).fill(-1)
  const used = new Uint8Array(host.n)

  const compatible = (patternVertex: number, hostVertex: number): boolean => {
    for (let other = 0; other < patternGraph.n; other++) {
      const mapped = mapping[other]!
      if (mapped < 0) continue
      const patternEdge = (patternGraph.adj[patternVertex]! >> other) & 1
      const hostEdge = (host.adj[hostVertex]! >> mapped) & 1
      if (patternEdge === 1 && hostEdge === 0) return false
      if (induced && patternEdge === 0 && hostEdge === 1) return false
    }
    return true
  }

  const search = (position: number): boolean => {
    if (position === pattern.order.length) return true
    const patternVertex = pattern.order[position]!
    const minimumDegree = pattern.degrees[patternVertex]!
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

/** 是否含禁图（便利包装；批量搜索请用 preparePattern + containsPrepared） */
export function containsPattern(host: SimpleGraph, pattern: SimpleGraph, induced = false): boolean {
  return containsPrepared(host, preparePattern(pattern), induced)
}

/** 同构判定（n ≤ 8 的暴力回溯；用于稳定性对照） */
export function areIsomorphic(a: SimpleGraph, b: SimpleGraph): boolean {
  if (a.n !== b.n || edgeCountOf(a) !== edgeCountOf(b)) return false
  if (a.n === 0) return true
  return containsPattern(a, b) && containsPattern(b, a)
}
