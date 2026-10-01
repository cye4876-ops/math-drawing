/**
 * 最小生成树（v0.5 阶段 5）：Prim / Kruskal——生成器实现。
 * MST 为无向语义：有向边按「两端相连」处理（忽略方向）；自环不参与；平行边各自参与（天然取小）。
 * 不连通图返回生成森林（connected=false）。
 */
import type { GraphObject } from '../model'
import { graphView, resolveStart } from './common'
import type { AlgorithmStep } from './types'

export interface MstEdge {
  source: string
  target: string
  weight: number
}

export interface MstResult {
  /** 选中的边（按选择顺序） */
  edges: MstEdge[]
  /** 总权重 */
  totalWeight: number
  /** 图是否连通（false = 返回的是生成森林） */
  connected: boolean
}

/** 无向边表（忽略方向、跳过自环）与邻接表 */
function undirectedEdgeList(graph: GraphObject): {
  edges: MstEdge[]
  adjacency: Map<string, { other: string; weight: number }[]>
} {
  const edges: MstEdge[] = []
  const adjacency = new Map<string, { other: string; weight: number }[]>()
  const push = (id: string, entry: { other: string; weight: number }): void => {
    const list = adjacency.get(id)
    if (list) list.push(entry)
    else adjacency.set(id, [entry])
  }
  for (const edge of graph.edges) {
    if (edge.source === edge.target) continue
    const weight = edge.weight ?? 1
    edges.push({ source: edge.source, target: edge.target, weight })
    push(edge.source, { other: edge.target, weight })
    push(edge.target, { other: edge.source, weight })
  }
  return { edges, adjacency }
}

/**
 * Prim 最小生成树（从起点生长）：
 * - 每轮在所有「横跨切（一端已选、一端未选）」的边中选权重最小者 → `select`；
 * - 步骤简洁（每选一条边一个步骤），适合逐边动画。
 */
export function* primSteps(
  graph: GraphObject,
  startId?: string,
): Generator<AlgorithmStep, MstResult, void> {
  const view = graphView(graph)
  const start = resolveStart(graph, startId)
  const { adjacency } = undirectedEdgeList(graph)
  const chosen: MstEdge[] = []
  if (!start) return { edges: chosen, totalWeight: 0, connected: true }
  const visited = new Set<string>([start])
  yield { kind: 'push', node: start, note: `从 ${view.label(start)} 开始生长生成树` }
  while (visited.size < graph.nodes.length) {
    // 扫描所有横跨边的候选（经邻接表：已选端 → 未选端）
    let best: MstEdge | null = null
    for (const id of visited) {
      for (const entry of adjacency.get(id) ?? []) {
        if (visited.has(entry.other)) continue
        if (best === null || entry.weight < best.weight) {
          best = { source: id, target: entry.other, weight: entry.weight }
        }
      }
    }
    if (best === null) break // 不连通：无横跨边
    visited.add(best.target)
    chosen.push(best)
    yield {
      kind: 'select',
      edge: { source: best.source, target: best.target },
      note: `加入边 ${view.label(best.source)} — ${view.label(best.target)}（权重 ${best.weight}）`,
    }
  }
  const totalWeight = chosen.reduce((sum, edge) => sum + edge.weight, 0)
  const connected = visited.size === graph.nodes.length
  yield {
    kind: 'note',
    note: connected
      ? `Prim 完成：${chosen.length} 条边，总权重 ${totalWeight}`
      : `Prim 完成（不连通，生成森林）：${chosen.length} 条边，总权重 ${totalWeight}`,
  }
  return { edges: chosen, totalWeight, connected }
}

/**
 * Kruskal 最小生成树（按权重升序并查集）：
 * - 每条边依次 `inspect`；可加入时 `select`（并查集合并），成环时 `reject`。
 */
export function* kruskalSteps(graph: GraphObject): Generator<AlgorithmStep, MstResult, void> {
  const view = graphView(graph)
  const { edges } = undirectedEdgeList(graph)
  const sorted = edges
    .map((edge, index) => ({ edge, index }))
    .sort((a, b) => a.edge.weight - b.edge.weight || a.index - b.index)
    .map((item) => item.edge)
  const parent = new Map<string, string>()
  for (const node of graph.nodes) parent.set(node.id, node.id)
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root)!
    let current = x
    while (parent.get(current) !== root) {
      const next = parent.get(current)!
      parent.set(current, root)
      current = next
    }
    return root
  }
  const chosen: MstEdge[] = []
  yield { kind: 'note', note: `按权重升序考察 ${sorted.length} 条边（并查集判环）` }
  for (const edge of sorted) {
    yield {
      kind: 'inspect',
      edge: { source: edge.source, target: edge.target },
      note: `检查边 ${view.label(edge.source)} — ${view.label(edge.target)}（权重 ${edge.weight}）`,
    }
    const rootA = find(edge.source)
    const rootB = find(edge.target)
    if (rootA === rootB) {
      yield {
        kind: 'reject',
        edge: { source: edge.source, target: edge.target },
        note: `加入会成环，跳过（${view.label(edge.source)} — ${view.label(edge.target)}）`,
      }
      continue
    }
    parent.set(rootA, rootB)
    chosen.push(edge)
    yield {
      kind: 'select',
      edge: { source: edge.source, target: edge.target },
      note: `加入边 ${view.label(edge.source)} — ${view.label(edge.target)}（权重 ${edge.weight}）`,
    }
  }
  const totalWeight = chosen.reduce((sum, edge) => sum + edge.weight, 0)
  const connected = chosen.length === Math.max(0, graph.nodes.length - 1) || graph.nodes.length <= 1
  yield {
    kind: 'note',
    note: connected
      ? `Kruskal 完成：${chosen.length} 条边，总权重 ${totalWeight}`
      : `Kruskal 完成（不连通，生成森林）：${chosen.length} 条边，总权重 ${totalWeight}`,
  }
  return { edges: chosen, totalWeight, connected }
}
