/**
 * 图论实验台内部图模型（v2.7）：n ≤ 31 的无向简单图，邻接用 32 位整数位掩码。
 * 与文档层 GraphObject（可变、带坐标/样式）分离：这里是纯结构的计算对象，
 * 供搜索枚举（含高频增删边）与不变量计算使用。
 */

/** 实验室图：adj[v] 为与 v 相邻顶点的位掩码（无自环、对称） */
export interface LabGraph {
  n: number
  adj: number[]
}

/** 位掩码上限：n ≤ 31（JS 位运算为 32 位有符号） */
export const MAX_LAB_N = 31

export function bit(i: number): number {
  return 1 << i
}

/** 统计 32 位整数中 1 的个数 */
export function popcount(value: number): number {
  let x = value
  x -= (x >> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333)
  x = (x + (x >> 4)) & 0x0f0f0f0f
  return (x * 0x01010101) >> 24
}

/** 从位掩码枚举元素（升序） */
export function bitsOf(mask: number): number[] {
  const result: number[] = []
  let m = mask
  while (m !== 0) {
    const low = m & -m
    result.push(31 - Math.clz32(low))
    m ^= low
  }
  return result
}

export function emptyGraph(n: number): LabGraph {
  return { n, adj: new Array<number>(n).fill(0) }
}

export function hasEdge(g: LabGraph, u: number, v: number): boolean {
  return ((g.adj[u]! >> v) & 1) === 1
}

/** 就地加边（调用方保证 u≠v 且无重边） */
export function addEdgeAt(g: LabGraph, u: number, v: number): void {
  g.adj[u]! |= bit(v)
  g.adj[v]! |= bit(u)
}

/** 就地删边 */
export function removeEdgeAt(g: LabGraph, u: number, v: number): void {
  g.adj[u]! &= ~bit(v)
  g.adj[v]! &= ~bit(u)
}

/** 以边表建图（自动去重、忽略自环由调用方校验） */
export function fromEdges(n: number, edges: readonly (readonly [number, number])[]): LabGraph {
  const g = emptyGraph(n)
  for (const [u, v] of edges) {
    if (u !== v) addEdgeAt(g, u, v)
  }
  return g
}

/** 追加一条边返回新图（不修改原图） */
export function withEdge(g: LabGraph, u: number, v: number): LabGraph {
  const copy = cloneGraph(g)
  addEdgeAt(copy, u, v)
  return copy
}

export function cloneGraph(g: LabGraph): LabGraph {
  return { n: g.n, adj: [...g.adj] }
}

/** 邻接表 */
export function neighbors(g: LabGraph, v: number): number[] {
  return bitsOf(g.adj[v]!)
}

/** 边表（升序 u<v，按 u 再按 v） */
export function edgeList(g: LabGraph): Array<[number, number]> {
  const result: Array<[number, number]> = []
  for (let u = 0; u < g.n; u++) {
    for (const v of bitsOf(g.adj[u]!)) {
      if (v > u) result.push([u, v])
    }
  }
  return result
}

export function edgeCount(g: LabGraph): number {
  let total = 0
  for (let v = 0; v < g.n; v++) total += popcount(g.adj[v]!)
  return total >> 1
}

export function degrees(g: LabGraph): number[] {
  const result = new Array<number>(g.n)
  for (let v = 0; v < g.n; v++) result[v] = popcount(g.adj[v]!)
  return result
}

/** 度序列（降序） */
export function degreeSequence(g: LabGraph): number[] {
  return degrees(g).sort((a, b) => b - a)
}

export function degreeMin(g: LabGraph): number {
  if (g.n === 0) return 0
  let min = Infinity
  for (const d of degrees(g)) min = Math.min(min, d)
  return min
}

export function degreeMax(g: LabGraph): number {
  let max = 0
  for (const d of degrees(g)) max = Math.max(max, d)
  return max
}

export function isRegular(g: LabGraph): boolean {
  const seq = degrees(g)
  return seq.every((d) => d === seq[0])
}

/** 连通性（含孤立点；n=0 视为连通，n≥1 按标准定义） */
export function isConnected(g: LabGraph): boolean {
  if (g.n <= 1) return true
  const seen = new Uint8Array(g.n)
  let queue = [0]
  seen[0] = 1
  let count = 1
  while (queue.length > 0) {
    const next: number[] = []
    for (const u of queue) {
      for (const v of bitsOf(g.adj[u]!)) {
        if (!seen[v]) {
          seen[v] = 1
          count++
          next.push(v)
        }
      }
    }
    queue = next
  }
  return count === g.n
}

/** 连通分量个数（含孤立点） */
export function componentCount(g: LabGraph): number {
  const seen = new Uint8Array(g.n)
  let count = 0
  for (let start = 0; start < g.n; start++) {
    if (seen[start]) continue
    count++
    const stack = [start]
    seen[start] = 1
    while (stack.length > 0) {
      const u = stack.pop()!
      for (const v of bitsOf(g.adj[u]!)) {
        if (!seen[v]) {
          seen[v] = 1
          stack.push(v)
        }
      }
    }
  }
  return count
}

/** 二分判定（BFS 二着色；结果数组 0/1，返回 null 表示非二分） */
export function bipartiteColoring(g: LabGraph): number[] | null {
  const color = new Array<number>(g.n).fill(-1)
  for (let start = 0; start < g.n; start++) {
    if (color[start] !== -1) continue
    color[start] = 0
    const queue = [start]
    while (queue.length > 0) {
      const u = queue.shift()!
      for (const v of bitsOf(g.adj[u]!)) {
        if (color[v] === -1) {
          color[v] = 1 - color[u]!
          queue.push(v)
        } else if (color[v] === color[u]) {
          return null
        }
      }
    }
  }
  return color
}

export function isBipartite(g: LabGraph): boolean {
  return bipartiteColoring(g) !== null
}

/** 三角形数（每个三角形经三条边各计一次，除以 3） */
export function triangleCount(g: LabGraph): number {
  let total = 0
  for (let u = 0; u < g.n; u++) {
    for (const v of bitsOf(g.adj[u]!)) {
      if (v <= u) continue
      total += popcount(g.adj[u]! & g.adj[v]!)
    }
  }
  return total / 3
}

/** 补图（保留孤立点） */
export function complement(g: LabGraph): LabGraph {
  const result = emptyGraph(g.n)
  for (let u = 0; u < g.n; u++) {
    for (let v = u + 1; v < g.n; v++) {
      if (!hasEdge(g, u, v)) addEdgeAt(result, u, v)
    }
  }
  return result
}

export function completeGraph(n: number): LabGraph {
  const g = emptyGraph(n)
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) addEdgeAt(g, u, v)
  }
  return g
}

export function cycleGraph(n: number): LabGraph {
  const g = emptyGraph(n)
  if (n >= 3) {
    for (let i = 0; i < n; i++) addEdgeAt(g, i, (i + 1) % n)
  } else if (n === 2) {
    addEdgeAt(g, 0, 1)
  }
  return g
}

export function pathGraph(n: number): LabGraph {
  const g = emptyGraph(n)
  for (let i = 0; i + 1 < n; i++) addEdgeAt(g, i, i + 1)
  return g
}

/** 完全二部图：左部 0..a−1、右部 a..a+b−1 */
export function completeBipartiteGraph(a: number, b: number): LabGraph {
  const g = emptyGraph(a + b)
  for (let u = 0; u < a; u++) {
    for (let v = a; v < a + b; v++) addEdgeAt(g, u, v)
  }
  return g
}

/** 平衡完全 r 部图（Turán 图 T(n, r)）：部大小按 n // r（前 n%r 部各多 1 个） */
export function turanGraph(n: number, r: number): LabGraph {
  const g = emptyGraph(n)
  const sizes: number[] = []
  const base = Math.floor(n / r)
  const extra = n % r
  for (let i = 0; i < r; i++) sizes.push(base + (i < extra ? 1 : 0))
  const part: number[] = []
  for (let i = 0; i < r; i++) {
    for (let k = 0; k < sizes[i]!; k++) part.push(i)
  }
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) {
      if (part[u] !== part[v]) addEdgeAt(g, u, v)
    }
  }
  return g
}

/** Petersen 图：外 5 圈 0-4，内五角星 5-9（i ~ i+2 mod 5），辐条 i ~ i+5 */
export function petersenGraph(): LabGraph {
  const g = emptyGraph(10)
  for (let i = 0; i < 5; i++) {
    addEdgeAt(g, i, (i + 1) % 5)
    addEdgeAt(g, 5 + i, 5 + ((i + 2) % 5))
    addEdgeAt(g, i, 5 + i)
  }
  return g
}

/** 随机置换顶点（用于测试同构不变性） */
export function permuteGraph(g: LabGraph, permutation: readonly number[]): LabGraph {
  const result = emptyGraph(g.n)
  for (const [u, v] of edgeList(g)) {
    addEdgeAt(result, permutation[u]!, permutation[v]!)
  }
  return result
}

/** 顶点导出子图诱导的边判定辅助：subset 的位掩码形式 */
export function maskOf(vertices: readonly number[]): number {
  let mask = 0
  for (const v of vertices) mask |= bit(v)
  return mask
}
