/**
 * 图统计与过滤（v3.3）：Gephi 风格「统计面板 + 过滤高亮」的纯函数部分。
 * - 统计：顶点/边数、密度、平均/最大/最小度、孤立点数、连通分量数；
 * - 过滤：按度数下限 / 社区编号 / 中心性前 k 选择顶点（返回索引集合）。
 */
import type { GraphObject } from './model'

export interface GraphStats {
  n: number
  m: number
  density: number
  avgDegree: number
  maxDegree: number
  minDegree: number
  isolated: number
  components: number
}

interface SimpleAdjacency {
  n: number
  degree: number[]
  neighbors: number[][]
}

function adjacencyOf(graph: GraphObject): SimpleAdjacency {
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
  return {
    n,
    degree: sets.map((set) => set.size),
    neighbors: sets.map((set) => [...set]),
  }
}

export function computeGraphStats(graph: GraphObject): GraphStats {
  const { n, degree, neighbors } = adjacencyCached(graph)
  const m = degree.reduce((acc, value) => acc + value, 0) / 2
  const maxDegree = degree.length > 0 ? Math.max(...degree) : 0
  const minDegree = degree.length > 0 ? Math.min(...degree) : 0
  const sum = degree.reduce((acc, value) => acc + value, 0)
  const isolated = degree.filter((value) => value === 0).length
  // 连通分量（含孤立点）
  const seen = new Array<boolean>(n).fill(false)
  let components = 0
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue
    components++
    seen[start] = true
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      for (const v of neighbors[queue[head]!] ?? []) {
        if (!seen[v]) {
          seen[v] = true
          queue.push(v)
        }
      }
    }
  }
  return {
    n,
    m,
    density: n > 1 ? (2 * m) / (n * (n - 1)) : 0,
    avgDegree: n > 0 ? sum / n : 0,
    maxDegree,
    minDegree,
    isolated,
    components,
  }
}

/** 内部：按文档索引取邻居（供 stats 与 filter 共用；避免重复建图） */
const adjacencyCache = new WeakMap<GraphObject, SimpleAdjacency>()

function adjacencyCached(graph: GraphObject): SimpleAdjacency {
  const cached = adjacencyCache.get(graph)
  if (cached) return cached
  const built = adjacencyOf(graph)
  adjacencyCache.set(graph, built)
  return built
}

export type GraphFilter =
  | { kind: 'degree'; min: number }
  | { kind: 'community'; communities: number[]; community: number }
  | { kind: 'centrality'; values: number[]; top: number }

export interface GraphFilterResult {
  /** 匹配顶点索引（graph.nodes 顺序） */
  matched: number[]
  description: string
}

export function filterNodeIndices(graph: GraphObject, filter: GraphFilter): GraphFilterResult {
  const { n, degree } = adjacencyCached(graph)
  const matched: number[] = []
  if (filter.kind === 'degree') {
    for (let i = 0; i < n; i++) {
      if ((degree[i] ?? 0) >= filter.min) matched.push(i)
    }
    return { matched, description: `度 ≥ ${filter.min}：${matched.length} 个顶点` }
  }
  if (filter.kind === 'community') {
    for (let i = 0; i < n; i++) {
      if ((filter.communities[i] ?? 0) === filter.community) matched.push(i)
    }
    return { matched, description: `社区 ${filter.community}：${matched.length} 个顶点` }
  }
  const values = filter.values.map((value, i) => ({ value, i }))
  values.sort((a, b) => b.value - a.value || a.i - b.i)
  const top = Math.max(1, Math.min(filter.top, n))
  const picked = values.slice(0, top).map((item) => item.i)
  return {
    matched: picked.sort((a, b) => a - b),
    description: `中心性前 ${top}：${picked.length} 个顶点`,
  }
}
