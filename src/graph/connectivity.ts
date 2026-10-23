/**
 * 点连通度 κ 与边连通度 λ（v3.2，Menger 定理视角）：
 * - λ = min_t maxflow(s, t)（单位边容量，固定源点 s=0）；
 * - κ = 节点拆分网络上的最小割（in/out 容量 1，源汇不拆，边容量 ∞）。
 * 约定：按无向简单图处理；不连通图 κ = λ = 0；规模上限 120 个顶点。
 */
import type { GraphObject } from './model'

const INF = 1e9
const MAX_NODES = 120

class Dinic {
  private readonly to: number[] = []
  private readonly cap: number[] = []
  private readonly next: number[][] = []
  private level: number[] = []
  private iter: number[] = []

  constructor(private readonly n: number) {
    for (let i = 0; i < n; i++) this.next.push([])
  }

  addEdge(u: number, v: number, capacity: number): void {
    this.next[u]!.push(this.to.length)
    this.to.push(v)
    this.cap.push(capacity)
    this.next[v]!.push(this.to.length)
    this.to.push(u)
    this.cap.push(0)
  }

  private bfs(s: number, t: number): boolean {
    this.level = new Array<number>(this.n).fill(-1)
    this.level[s] = 0
    const queue = [s]
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]!
      for (const id of this.next[u]!) {
        if (this.cap[id]! > 0 && this.level[this.to[id]!] === -1) {
          this.level[this.to[id]!] = this.level[u]! + 1
          queue.push(this.to[id]!)
        }
      }
    }
    return this.level[t] !== -1
  }

  private dfs(u: number, t: number, limit: number): number {
    if (u === t) return limit
    for (; this.iter[u]! < this.next[u]!.length; this.iter[u]!++) {
      const id = this.next[u]![this.iter[u]!]!
      const v = this.to[id]!
      if (this.cap[id]! > 0 && this.level[v] === this.level[u]! + 1) {
        const flow = this.dfs(v, t, Math.min(limit, this.cap[id]!))
        if (flow > 0) {
          this.cap[id]! -= flow
          this.cap[id ^ 1]! += flow
          return flow
        }
      }
    }
    return 0
  }

  maxFlow(s: number, t: number): number {
    let flow = 0
    while (this.bfs(s, t)) {
      this.iter = new Array<number>(this.n).fill(0)
      for (;;) {
        const pushed = this.dfs(s, t, INF)
        if (pushed === 0) break
        flow += pushed
      }
    }
    return flow
  }
}

interface Simple {
  n: number
  adj: number[][]
}

function buildSimple(graph: GraphObject): Simple {
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const sets = Array.from({ length: n }, () => new Set<number>())
  for (const edge of graph.edges) {
    const u = index.get(edge.source)
    const v = index.get(edge.target)
    if (u === undefined || v === undefined || u === v) continue
    sets[u]!.add(v)
    sets[v]!.add(u)
  }
  return { n, adj: sets.map((set) => [...set].sort((a, b) => a - b)) }
}

function isConnected(simple: Simple): boolean {
  if (simple.n === 0) return true
  const seen = new Array<boolean>(simple.n).fill(false)
  seen[0] = true
  const queue = [0]
  for (let head = 0; head < queue.length; head++) {
    for (const v of simple.adj[queue[head]!]!) {
      if (!seen[v]) {
        seen[v] = true
        queue.push(v)
      }
    }
  }
  return seen.every(Boolean)
}

function edgeConnectivity(simple: Simple): number {
  const s = 0
  let best = Infinity
  for (let t = 1; t < simple.n; t++) {
    const dinic = new Dinic(simple.n)
    for (let u = 0; u < simple.n; u++) {
      for (const v of simple.adj[u]!) {
        if (u < v) {
          dinic.addEdge(u, v, 1)
          dinic.addEdge(v, u, 1)
        }
      }
    }
    best = Math.min(best, dinic.maxFlow(s, t))
    if (best === 0) break
  }
  return Number.isFinite(best) ? best : 0
}

function vertexConnectivity(simple: Simple): number {
  const n = simple.n
  const s = 0
  let best = Infinity
  for (let t = 1; t < n; t++) {
    const dinic = new Dinic(2 * n)
    for (let v = 0; v < n; v++) {
      const inNode = 2 * v
      const outNode = 2 * v + 1
      const capacity = v === s || v === t ? INF : 1
      dinic.addEdge(inNode, outNode, capacity)
    }
    for (let u = 0; u < n; u++) {
      for (const v of simple.adj[u]!) {
        if (u < v) {
          // 与源/汇相连的边每条只能承载一条路径（容量 1）；内部边容量 ∞（由顶点容量限流）
          const capacity = u === s || v === s || u === t || v === t ? 1 : INF
          dinic.addEdge(2 * u + 1, 2 * v, capacity)
          dinic.addEdge(2 * v + 1, 2 * u, capacity)
        }
      }
    }
    best = Math.min(best, dinic.maxFlow(2 * s + 1, 2 * t))
    if (best === 0) break
  }
  return Number.isFinite(best) ? best : 0
}

export interface ConnectivityResult {
  vertex: number | null
  edge: number | null
  note: string
}

export function computeConnectivity(graph: GraphObject): ConnectivityResult {
  const simple = buildSimple(graph)
  if (simple.n === 0) {
    return { vertex: null, edge: null, note: '空图：无连通度定义。' }
  }
  if (simple.n === 1) {
    return { vertex: 0, edge: 0, note: '单点图：κ = λ = 0。' }
  }
  if (simple.n > MAX_NODES) {
    return { vertex: null, edge: null, note: `顶点数超过 ${MAX_NODES}，已跳过连通度计算。` }
  }
  if (!isConnected(simple)) {
    return { vertex: 0, edge: 0, note: '图不连通：κ = λ = 0（Menger 定理意义下）。' }
  }
  const edge = edgeConnectivity(simple)
  const vertex = vertexConnectivity(simple)
  return {
    vertex,
    edge,
    note: `点连通度 κ = ${vertex}，边连通度 λ = ${edge}（Menger：κ ≤ λ ≤ 最小度 ${Math.min(
      ...simple.adj.map((list) => list.length),
    )}）。`,
  }
}

/** 围长（最短环长度）；森林返回 Infinity */
export function girthOf(graph: GraphObject): number {
  const simple = buildSimple(graph)
  let best = Infinity
  for (let u = 0; u < simple.n; u++) {
    for (const v of simple.adj[u]!) {
      if (v <= u) continue
      // 删边 (u,v) 后 BFS 求 u→v 最短距离
      const dist = new Array<number>(simple.n).fill(-1)
      dist[u] = 0
      const queue = [u]
      for (let head = 0; head < queue.length; head++) {
        const x = queue[head]!
        for (const y of simple.adj[x]!) {
          if ((x === u && y === v) || (x === v && y === u)) continue
          if (dist[y] === -1) {
            dist[y] = dist[x]! + 1
            queue.push(y)
          }
        }
      }
      if (dist[v] !== -1) best = Math.min(best, dist[v]! + 1)
    }
  }
  return best
}

/** 直径（不连通返回 null） */
export function diameterOf(graph: GraphObject): number | null {
  const simple = buildSimple(graph)
  if (simple.n === 0) return null
  let diameter = 0
  for (let s = 0; s < simple.n; s++) {
    const dist = new Array<number>(simple.n).fill(-1)
    dist[s] = 0
    const queue = [s]
    for (let head = 0; head < queue.length; head++) {
      const x = queue[head]!
      for (const y of simple.adj[x]!) {
        if (dist[y] === -1) {
          dist[y] = dist[x]! + 1
          queue.push(y)
        }
      }
    }
    for (const distValue of dist) {
      if (distValue === -1) return null
      diameter = Math.max(diameter, distValue)
    }
  }
  return diameter
}
