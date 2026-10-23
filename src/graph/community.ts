/**
 * 社区发现（v3.2）：Louvain 模块度优化（对齐 Gephi / NetworkX 的基础能力）。
 * - 无向、可加权（边权求和，缺省 1）；有向边按无向处理；
 * - 本地移动（local moving）+ 聚合（aggregation）迭代，确定性顺序（不做随机打乱）；
 * - 模块度 Q = Σ_c [L_c/m − (d_c/2m)²]。
 */
import type { GraphObject } from './model'

export interface CommunityResult {
  /** 与 graph.nodes 同序的社区编号（0 起、按最小成员排序） */
  communityOf: number[]
  count: number
  modularity: number
  note: string
}

interface LevelGraph {
  n: number
  adj: Map<number, number>[]
  degree: number[]
  loops: number[]
}

interface OriginalGraph {
  n: number
  adj: Map<number, number>[]
  degree: number[]
  m2: number
}

function buildOriginal(graph: GraphObject): OriginalGraph {
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const adj = Array.from({ length: n }, () => new Map<number, number>())
  for (const edge of graph.edges) {
    const u = index.get(edge.source)
    const v = index.get(edge.target)
    if (u === undefined || v === undefined || u === v) continue
    const weight = edge.weight === null || !Number.isFinite(edge.weight) ? 1 : Math.abs(edge.weight)
    if (weight === 0) continue
    adj[u]!.set(v, (adj[u]!.get(v) ?? 0) + weight)
    adj[v]!.set(u, (adj[v]!.get(u) ?? 0) + weight)
  }
  const degree = adj.map((map) => {
    let sum = 0
    for (const weight of map.values()) sum += weight
    return sum
  })
  const m2 = degree.reduce((acc, value) => acc + value, 0)
  return { n, adj, degree, m2 }
}

function toLevel(graph: OriginalGraph): LevelGraph {
  return {
    n: graph.n,
    adj: graph.adj.map((map) => new Map(map)),
    degree: [...graph.degree],
    loops: new Array<number>(graph.n).fill(0),
  }
}

/** 本地移动：反复尝试把节点移到使模块度增益最大的邻居社区 */
function localMoving(level: LevelGraph, m2: number): number[] {
  const n = level.n
  const community = Array.from({ length: n }, (_, i) => i)
  const totals = [...level.degree]
  let improved = true
  let passes = 0
  while (improved && passes < 50) {
    improved = false
    passes++
    for (let i = 0; i < n; i++) {
      const current = community[i]!
      const degree = level.degree[i]!
      totals[current]! -= degree
      const weightTo = new Map<number, number>()
      for (const [j, weight] of level.adj[i]!) {
        if (j === i) continue
        const target = community[j]!
        weightTo.set(target, (weightTo.get(target) ?? 0) + weight)
      }
      let bestCommunity = current
      let bestGain = (weightTo.get(current) ?? 0) - (degree * totals[current]!) / m2
      for (const [candidate, weight] of weightTo) {
        const gain = weight - (degree * totals[candidate]!) / m2
        if (gain > bestGain + 1e-12) {
          bestGain = gain
          bestCommunity = candidate
        }
      }
      totals[bestCommunity]! += degree
      community[i] = bestCommunity
      if (bestCommunity !== current) improved = true
    }
  }
  return community
}

/** 按首次出现顺序重编号社区（确定性） */
function renumber(community: number[]): { labels: number[]; count: number } {
  const map = new Map<number, number>()
  const labels: number[] = []
  for (const c of community) {
    let label = map.get(c)
    if (label === undefined) {
      label = map.size
      map.set(c, label)
    }
    labels.push(label)
  }
  return { labels, count: map.size }
}

/** 聚合：把每个社区缩成一个超级节点（社区内部权重视为自环） */
function aggregate(level: LevelGraph, community: number[], count: number): LevelGraph {
  const adj = Array.from({ length: count }, () => new Map<number, number>())
  const loops = new Array<number>(count).fill(0)
  for (let i = 0; i < level.n; i++) {
    loops[community[i]!]! += level.loops[i]!
    for (const [j, weight] of level.adj[i]!) {
      if (j <= i) continue
      const a = community[i]!
      const b = community[j]!
      if (a === b) loops[a]! += weight
      else {
        adj[a]!.set(b, (adj[a]!.get(b) ?? 0) + weight)
        adj[b]!.set(a, (adj[b]!.get(a) ?? 0) + weight)
      }
    }
  }
  const degree = adj.map((map, i) => {
    let sum = 2 * loops[i]!
    for (const weight of map.values()) sum += weight
    return sum
  })
  return { n: count, adj, degree, loops }
}

/** 给定划分计算模块度（Q = Σ L_c/m − (d_c/2m)²） */
export function modularityOf(graph: GraphObject, communityOf: number[]): number {
  const { n, adj, degree, m2 } = buildOriginal(graph)
  if (n === 0 || m2 === 0) return 0
  const internal = new Map<number, number>()
  const totals = new Map<number, number>()
  for (let i = 0; i < n; i++) {
    const c = communityOf[i] ?? 0
    totals.set(c, (totals.get(c) ?? 0) + degree[i]!)
    for (const [j, weight] of adj[i]!) {
      if (j <= i) continue
      if ((communityOf[j] ?? 0) === c) internal.set(c, (internal.get(c) ?? 0) + weight)
    }
  }
  let q = 0
  for (const [c, total] of totals) {
    q += (internal.get(c) ?? 0) / (m2 / 2) - (total / m2) ** 2
  }
  return q
}

export function detectCommunities(graph: GraphObject): CommunityResult {
  const original = buildOriginal(graph)
  if (original.n === 0) {
    return { communityOf: [], count: 0, modularity: 0, note: '空图' }
  }
  // 原节点 → 当前层节点编号
  let assignment = Array.from({ length: original.n }, (_, i) => i)
  let level = toLevel(original)
  for (let round = 0; round < 20; round++) {
    const moved = localMoving(level, original.m2)
    const { labels, count } = renumber(moved)
    if (count === level.n) break
    assignment = assignment.map((id) => labels[id]!)
    if (count === 1) break
    level = aggregate(level, labels, count)
  }
  const { labels, count } = renumber(assignment)
  const communityOf = labels
  const modularity = modularityOf(graph, communityOf)
  return {
    communityOf,
    count,
    modularity,
    note: `Louvain（确定性本地移动 + 聚合）：${count} 个社区，模块度 Q = ${modularity.toFixed(4)}。无向、可加权（边权求和），有向边按无向处理。`,
  }
}
