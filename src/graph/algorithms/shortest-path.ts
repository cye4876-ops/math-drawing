/**
 * 最短路径算法（v0.5 阶段 5）：Dijkstra / Bellman-Ford——生成器实现。
 * 语义：沿「出方向」松弛（无向边双向、有向边只沿箭头）；权重缺省 1；
 * 平行边由 outEdges 逐条给出（松弛天然处理多条）。
 */
import type { GraphObject } from '../model'
import { graphView, resolveStart, type GraphView, type OutEdge } from './common'
import type { AlgorithmFailure, AlgorithmStep, ShortestPathResult } from './types'

/** 统一收集「沿出方向」的全部有向边（无向边两方向各一条），供 Bellman-Ford 轮询 */
function collectDirectedEdges(view: GraphView): { source: string; edge: OutEdge }[] {
  const result: { source: string; edge: OutEdge }[] = []
  view.g.forEachNode((id) => {
    for (const edge of view.outEdges(id)) result.push({ source: id, edge })
  })
  return result
}

/**
 * Dijkstra 单源最短路（线性扫描找最小——教学可视化更直观，规模足够）：
 * - **负权预检**：存在负权边时拒绝执行（规格要求：不能给出错误结果）；
 * - `visit`：确定一个节点的最终距离；`relax`：更新距离；`reject`：已确定跳过。
 */
export function* dijkstraSteps(
  graph: GraphObject,
  startId?: string,
): Generator<AlgorithmStep, ShortestPathResult | AlgorithmFailure, void> {
  const view = graphView(graph)
  const start = resolveStart(graph, startId)
  const distance: Record<string, number | null> = {}
  const parent: Record<string, string | null> = {}
  const order: string[] = []
  for (const node of graph.nodes) {
    distance[node.id] = null
    parent[node.id] = null
  }
  if (!start) return { start: '', distance, parent, order }

  // 负权预检（规格：必须检测并拒绝）
  for (const edge of graph.edges) {
    if (edge.weight !== null && edge.weight < 0) {
      yield {
        kind: 'reject',
        note: `检测到负权边（权重 ${edge.weight}）：Dijkstra 要求非负权，已拒绝执行`,
      }
      return { error: 'Dijkstra 不支持负权边（请改用 Bellman-Ford）' }
    }
  }

  const settled = new Set<string>()
  distance[start] = 0
  yield { kind: 'note', note: `从 ${view.label(start)} 出发（Dijkstra 单源最短路）` }
  for (;;) {
    // 线性扫描：未确定节点中距离最小者
    let best: string | null = null
    view.g.forEachNode((id) => {
      if (settled.has(id) || distance[id] === null) return
      if (best === null || distance[id]! < distance[best]!) best = id
    })
    if (best === null) break
    const current: string = best
    settled.add(current)
    order.push(current)
    yield {
      kind: 'visit',
      node: current,
      note: `确定 ${view.label(current)} 的最短距离 = ${distance[current]}`,
    }
    for (const edge of view.outEdges(current)) {
      yield {
        kind: 'inspect',
        node: current,
        edge: { source: current, target: edge.other },
        note: `松弛边 ${view.label(current)} → ${view.label(edge.other)}（权重 ${edge.weight}）`,
      }
      if (settled.has(edge.other)) {
        yield { kind: 'reject', node: edge.other, note: `${view.label(edge.other)} 已确定，跳过` }
        continue
      }
      const candidate = distance[current]! + edge.weight
      if (distance[edge.other] === null || candidate < distance[edge.other]!) {
        distance[edge.other] = candidate
        parent[edge.other] = current
        yield {
          kind: 'relax',
          node: edge.other,
          edge: { source: current, target: edge.other },
          note: `${view.label(edge.other)} 距离更新为 ${candidate}`,
        }
      }
    }
  }
  yield { kind: 'note', note: '所有可达节点的最短距离已确定' }
  return { start, distance, parent, order }
}

/**
 * Bellman-Ford 单源最短路（允许负权）：
 * - V−1 轮全边松弛（提前收敛则停止）；`relax`/`reject` 步骤齐全；
 * - **负环检测**：第 V 轮仍可松弛 → 返回错误（最短路径无定义）。
 */
export function* bellmanFordSteps(
  graph: GraphObject,
  startId?: string,
): Generator<AlgorithmStep, ShortestPathResult | AlgorithmFailure, void> {
  const view = graphView(graph)
  const start = resolveStart(graph, startId)
  const distance: Record<string, number | null> = {}
  const parent: Record<string, string | null> = {}
  for (const node of graph.nodes) {
    distance[node.id] = null
    parent[node.id] = null
  }
  if (!start) return { start: '', distance, parent, order: [] }
  const n = graph.nodes.length
  distance[start] = 0
  yield { kind: 'note', note: `从 ${view.label(start)} 出发（Bellman-Ford，至多 ${n - 1} 轮松弛）` }
  const allEdges = collectDirectedEdges(view)
  for (let round = 1; round <= n - 1; round++) {
    let changed = false
    yield { kind: 'note', note: `第 ${round} 轮：逐边松弛` }
    for (const { source, edge } of allEdges) {
      if (distance[source] === null) continue
      const candidate = distance[source]! + edge.weight
      if (distance[edge.other] === null || candidate < distance[edge.other]!) {
        distance[edge.other] = candidate
        parent[edge.other] = source
        changed = true
        yield {
          kind: 'relax',
          edge: { source, target: edge.other },
          note: `${view.label(edge.other)} 距离更新为 ${candidate}`,
        }
      }
    }
    if (!changed) {
      yield { kind: 'note', note: `第 ${round} 轮无更新：已提前收敛` }
      break
    }
  }
  // 第 V 轮检测：仍能松弛 → 负环
  for (const { source, edge } of allEdges) {
    if (distance[source] === null) continue
    if (distance[edge.other] === null || distance[source]! + edge.weight < distance[edge.other]!) {
      yield {
        kind: 'reject',
        edge: { source, target: edge.other },
        note: `仍可松弛 ${view.label(source)} → ${view.label(edge.other)}：检测到负环`,
      }
      return { error: '检测到负环：最短路径无定义' }
    }
  }
  yield { kind: 'note', note: '未发现负环，最短距离收敛' }
  return { start, distance, parent, order: [] }
}

/** 由父指针重建起点到 target 的路径（不可达或起点缺省时返回 null） */
export function reconstructPath(result: ShortestPathResult, targetId: string): string[] | null {
  if (result.distance[targetId] === null || result.distance[targetId] === undefined) return null
  const path: string[] = []
  let cursor: string | null = targetId
  while (cursor !== null) {
    path.unshift(cursor)
    if (cursor === result.start) break
    const parent: string | null = result.parent[cursor] ?? null
    if (parent === null) return null
    cursor = parent
  }
  return path[0] === result.start ? path : null
}
