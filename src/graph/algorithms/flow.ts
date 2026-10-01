/**
 * 最大流（v0.5）：Edmonds-Karp（BFS 增广的 Ford-Fulkerson）——生成器实现。
 * 容量取边权重（缺省 1）；无向边双向各计容量；非正容量忽略；自环忽略。
 * 残量网络用「净流」表示（允许负值），残量 = 容量 − 净流 + 反向净流。
 * 需要两个参数：源点与汇点（汇点缺省取最后一个顶点）。
 */
import type { GraphObject } from '../model'
import { graphView, resolveStart } from './common'
import type { AlgorithmFailure, AlgorithmStep } from './types'

export interface FlowEdge {
  source: string
  target: string
  /** 净流量（正方向） */
  flow: number
  capacity: number
}

export interface MaxFlowResult {
  start: string
  end: string
  maxFlow: number
  /** 有正向流量的边（按流经顺序去重） */
  flows: FlowEdge[]
}

export function* maxFlowSteps(
  graph: GraphObject,
  startId?: string,
  endId?: string,
): Generator<AlgorithmStep, MaxFlowResult | AlgorithmFailure, void> {
  const view = graphView(graph)
  const start = resolveStart(graph, startId)
  const end =
    endId && graph.nodes.some((node) => node.id === endId)
      ? endId
      : (graph.nodes[graph.nodes.length - 1]?.id ?? null)
  if (!start || !end) return { start: '', end: '', maxFlow: 0, flows: [] }
  if (start === end) {
    yield { kind: 'reject', note: '源点与汇点相同：最大流为 0（请选择不同的汇点）' }
    return { error: '源点与汇点相同：最大流为 0' }
  }

  // 容量表与可达表（含反向）
  const capacity = new Map<string, number>()
  const adjacent = new Map<string, Set<string>>()
  const addAdjacent = (u: string, v: string): void => {
    const set = adjacent.get(u)
    if (set) set.add(v)
    else adjacent.set(u, new Set([v]))
  }
  for (const edge of graph.edges) {
    if (edge.source === edge.target) continue
    const weight = edge.weight ?? 1
    if (weight <= 0) continue
    const key = `${edge.source}>${edge.target}`
    capacity.set(key, (capacity.get(key) ?? 0) + weight)
    addAdjacent(edge.source, edge.target)
    addAdjacent(edge.target, edge.source)
    if (!edge.directed) {
      const reverse = `${edge.target}>${edge.source}`
      capacity.set(reverse, (capacity.get(reverse) ?? 0) + weight)
    }
  }

  const flow = new Map<string, number>()
  const residual = (u: string, v: string): number =>
    (capacity.get(`${u}>${v}`) ?? 0) - (flow.get(`${u}>${v}`) ?? 0) + (flow.get(`${v}>${u}`) ?? 0)

  yield {
    kind: 'note',
    note: `Edmonds-Karp：从 ${view.label(start)} 到 ${view.label(end)} 逐步增广（容量取边权重，缺省 1）`,
  }

  let maxFlow = 0
  for (;;) {
    // BFS 在残量网络中寻找最短增广路
    const parent = new Map<string, string>()
    parent.set(start, start)
    const queue: string[] = [start]
    let found = false
    while (queue.length > 0 && !found) {
      const u = queue.shift()!
      for (const v of adjacent.get(u) ?? []) {
        if (parent.has(v)) continue
        if (residual(u, v) <= 0) continue
        parent.set(v, u)
        if (v === end) {
          found = true
          break
        }
        queue.push(v)
      }
    }
    if (!found) break

    const path: { source: string; target: string }[] = []
    let cursor = end
    while (cursor !== start) {
      const previous = parent.get(cursor)!
      path.unshift({ source: previous, target: cursor })
      cursor = previous
    }
    let bottleneck = Infinity
    for (const edge of path) bottleneck = Math.min(bottleneck, residual(edge.source, edge.target))
    for (const edge of path) {
      const key = `${edge.source}>${edge.target}`
      flow.set(key, (flow.get(key) ?? 0) + bottleneck)
    }
    maxFlow += bottleneck
    yield {
      kind: 'note',
      note: `增广路径 ${[start, ...path.map((edge) => edge.target)]
        .map((id) => view.label(id))
        .join(' → ')}（+${bottleneck}，累计 ${maxFlow}）`,
    }
    for (const edge of path) {
      yield {
        kind: 'select',
        edge,
        note: `推流 ${view.label(edge.source)} → ${view.label(edge.target)}（+${bottleneck}）`,
      }
    }
  }

  const flows: FlowEdge[] = []
  for (const [key, value] of flow) {
    if (value <= 0) continue
    const separator = key.indexOf('>')
    const source = key.slice(0, separator)
    const target = key.slice(separator + 1)
    flows.push({ source, target, flow: value, capacity: capacity.get(key) ?? 0 })
  }
  yield { kind: 'note', note: `增广结束：最大流 = ${maxFlow}` }
  return { start, end, maxFlow, flows }
}
