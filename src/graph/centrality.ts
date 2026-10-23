/**
 * 图中心性套件（v3.2）：对齐 NetworkX 的常用中心性。
 * - degree：度中心性（无向按边数，有向按入+出；归一化 n−1）
 * - closeness：接近中心性（无向/有向均按 BFS 距离；不可达记 0）
 * - betweenness：介数中心性（Brandes；无向图结果除以 2；未归一化）
 * - eigenvector：特征向量中心性（邻接矩阵对称化 A+Aᵀ 后幂迭代，最大值归一为 1）
 * - pageRank：PageRank（阻尼 0.85；悬挂点均匀分配）
 *
 * 约定：边权忽略（按边计数）；有向边按 source→target，无向边双向。
 */
import type { GraphObject } from './model'

export type CentralityMetric = 'degree' | 'closeness' | 'betweenness' | 'eigenvector' | 'pageRank'

export const CENTRALITY_LABELS: Record<CentralityMetric, string> = {
  degree: '度中心性',
  closeness: '接近中心性',
  betweenness: '介数中心性',
  eigenvector: '特征向量中心性',
  pageRank: 'PageRank',
}

export interface CentralityRankingRow {
  id: string
  label: string
  value: number
}

export interface CentralityResult {
  metric: CentralityMetric
  /** 与 graph.nodes 同序 */
  values: number[]
  ranking: CentralityRankingRow[]
  note: string
}

interface BuiltGraph {
  n: number
  ids: string[]
  labels: string[]
  /** 出边邻接（有向按方向，无向双向；去重） */
  out: number[][]
  /** 入边邻接（仅统计有向图的入度用；无向与 out 相同） */
  incoming: number[][]
  directed: boolean
}

function buildGraph(graph: GraphObject): BuiltGraph {
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const outSets = Array.from({ length: n }, () => new Set<number>())
  const inSets = Array.from({ length: n }, () => new Set<number>())
  const directed = graph.edges.some((edge) => edge.directed)
  for (const edge of graph.edges) {
    const u = index.get(edge.source)
    const v = index.get(edge.target)
    if (u === undefined || v === undefined || u === v) continue
    outSets[u]!.add(v)
    inSets[v]!.add(u)
    if (!edge.directed) {
      outSets[v]!.add(u)
      inSets[u]!.add(v)
    }
  }
  return {
    n,
    ids: graph.nodes.map((node) => node.id),
    labels: graph.nodes.map((node) => node.label),
    out: outSets.map((set) => [...set].sort((a, b) => a - b)),
    incoming: inSets.map((set) => [...set].sort((a, b) => a - b)),
    directed,
  }
}

function bfsDistances(built: BuiltGraph, source: number): number[] {
  const dist = new Array<number>(built.n).fill(-1)
  dist[source] = 0
  const queue = [source]
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!
    for (const v of built.out[u]!) {
      if (dist[v] === -1) {
        dist[v] = dist[u]! + 1
        queue.push(v)
      }
    }
  }
  return dist
}

export function degreeCentrality(graph: GraphObject): number[] {
  const built = buildGraph(graph)
  const denominator = Math.max(1, built.n - 1)
  if (!built.directed) return built.out.map((list) => list.length / denominator)
  return built.out.map((list, i) => (list.length + built.incoming[i]!.length) / denominator)
}

export function closenessCentrality(graph: GraphObject): number[] {
  const built = buildGraph(graph)
  const result: number[] = []
  for (let i = 0; i < built.n; i++) {
    const dist = bfsDistances(built, i)
    let reachable = 0
    let sum = 0
    for (let j = 0; j < built.n; j++) {
      if (j === i || dist[j] === -1) continue
      reachable++
      sum += dist[j]!
    }
    result.push(reachable === 0 ? 0 : reachable / sum)
  }
  return result
}

/** Brandes 介数中心性（单位权；无向图结果除以 2） */
export function betweennessCentrality(graph: GraphObject): number[] {
  const built = buildGraph(graph)
  const n = built.n
  const centrality = new Array<number>(n).fill(0)
  for (let s = 0; s < n; s++) {
    const stack: number[] = []
    const preds: number[][] = Array.from({ length: n }, () => [])
    const sigma = new Array<number>(n).fill(0)
    const dist = new Array<number>(n).fill(-1)
    sigma[s] = 1
    dist[s] = 0
    const queue = [s]
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head]!
      stack.push(v)
      for (const w of built.out[v]!) {
        if (dist[w] === -1) {
          dist[w] = dist[v]! + 1
          queue.push(w)
        }
        if (dist[w] === dist[v]! + 1) {
          sigma[w]! += sigma[v]!
          preds[w]!.push(v)
        }
      }
    }
    const delta = new Array<number>(n).fill(0)
    while (stack.length > 0) {
      const w = stack.pop()!
      for (const v of preds[w]!) {
        delta[v]! += (sigma[v]! / sigma[w]!) * (1 + delta[w]!)
      }
      if (w !== s) centrality[w]! += delta[w]!
    }
  }
  return built.directed ? centrality : centrality.map((value) => value / 2)
}

/** 特征向量中心性（对称化邻接矩阵上的幂迭代；最大值归一为 1） */
export function eigenvectorCentrality(graph: GraphObject, iterations = 300): number[] {
  const built = buildGraph(graph)
  const n = built.n
  if (n === 0) return []
  const neighbors: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) neighbors[i]!.push(...built.out[i]!)
  for (let i = 0; i < n; i++) {
    for (const j of built.incoming[i]!) {
      if (!neighbors[i]!.includes(j)) neighbors[i]!.push(j)
    }
  }
  if (neighbors.every((list) => list.length === 0)) return new Array<number>(n).fill(0)
  let vector = new Array<number>(n).fill(1 / Math.sqrt(n))
  for (let step = 0; step < iterations; step++) {
    const next = new Array<number>(n).fill(0)
    for (let i = 0; i < n; i++) {
      // 位移幂迭代（A + I）：避免二部图在 ±λ 两个特征方向间振荡不收敛
      let sum = vector[i]!
      for (const j of neighbors[i]!) sum += vector[j]!
      next[i] = sum
    }
    const norm = Math.hypot(...next)
    if (norm === 0) return new Array<number>(n).fill(0)
    for (let i = 0; i < n; i++) next[i]! /= norm
    let diff = 0
    for (let i = 0; i < n; i++) diff += Math.abs(next[i]! - vector[i]!)
    vector = next
    if (diff < 1e-12) break
  }
  let max = 0
  for (const value of vector) max = Math.max(max, value)
  return max > 0 ? vector.map((value) => value / max) : vector
}

/** PageRank（阻尼 0.85；悬挂点把权重均匀分给所有节点） */
export function pageRank(graph: GraphObject, damping = 0.85, iterations = 200): number[] {
  const built = buildGraph(graph)
  const n = built.n
  if (n === 0) return []
  let vector = new Array<number>(n).fill(1 / n)
  for (let step = 0; step < iterations; step++) {
    const next = new Array<number>(n).fill((1 - damping) / n)
    let dangling = 0
    for (let i = 0; i < n; i++) {
      const outDegree = built.out[i]!.length
      if (outDegree === 0) {
        dangling += vector[i]!
        continue
      }
      const share = (damping * vector[i]!) / outDegree
      for (const j of built.out[i]!) next[j]! += share
    }
    const danglingShare = (damping * dangling) / n
    let diff = 0
    for (let i = 0; i < n; i++) {
      next[i]! += danglingShare
      diff += Math.abs(next[i]! - vector[i]!)
    }
    vector = next
    if (diff < 1e-13) break
  }
  return vector
}

const NOTES: Record<CentralityMetric, string> = {
  degree: '度中心性 = 关联边数 / (n−1)；有向图按入度+出度计。边权忽略。',
  closeness: '接近中心性 = 可达节点数 / 到可达节点的距离和（BFS，单位边权）；不可达节点不参与。',
  betweenness:
    '介数中心性（Brandes 算法，未归一化，无向图已除以 2）；表示经过该节点的最短路径条数。',
  eigenvector:
    '特征向量中心性：邻接矩阵对称化（A + Aᵀ）后用位移幂迭代（A + I）求主特征向量（避免二部图振荡），最大值归一为 1。',
  pageRank: 'PageRank：阻尼 d = 0.85，悬挂点（出度 0）权重均匀分配，迭代至收敛。',
}

export function computeCentrality(graph: GraphObject, metric: CentralityMetric): CentralityResult {
  const values =
    metric === 'degree'
      ? degreeCentrality(graph)
      : metric === 'closeness'
        ? closenessCentrality(graph)
        : metric === 'betweenness'
          ? betweennessCentrality(graph)
          : metric === 'eigenvector'
            ? eigenvectorCentrality(graph)
            : pageRank(graph)
  const ranking = graph.nodes
    .map((node, i) => ({ id: node.id, label: node.label, value: values[i] ?? 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
  return { metric, values, ranking, note: NOTES[metric] }
}
