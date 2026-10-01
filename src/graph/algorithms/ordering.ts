/**
 * 排序与结构判定（v0.5 阶段 5）：Kahn 拓扑排序。
 * 入度语义：无向边按双向计入（含无向环的图将被正确判为「有环」）。
 */
import type { GraphObject } from '../model'
import { graphView } from './common'
import type { AlgorithmStep, TopologicalResult } from './types'

/**
 * Kahn 拓扑排序（生成器）：
 * - `push`：入度归零入队；`visit`：出队并输出到拓扑序；
 * - 流程结束仍有剩余节点 → 有环（返回 order: null 与剩余节点）。
 */
export function* topologicalSteps(
  graph: GraphObject,
): Generator<AlgorithmStep, TopologicalResult, void> {
  const view = graphView(graph)
  const g = view.g
  // 入度自算（graphology 的 inDegree 不含无向边；无向边按双向计入）：
  const indegree = new Map<string, number>()
  g.forEachNode((id) => indegree.set(id, 0))
  g.forEachDirectedEdge((_key, _attributes, _source, target) => {
    indegree.set(target, (indegree.get(target) ?? 0) + 1)
  })
  g.forEachUndirectedEdge((_key, _attributes, source, target) => {
    indegree.set(target, (indegree.get(target) ?? 0) + 1)
    indegree.set(source, (indegree.get(source) ?? 0) + 1)
  })
  const queue: string[] = []
  for (const node of graph.nodes) {
    if ((indegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id)
      yield { kind: 'push', node: node.id, note: `${view.label(node.id)} 入度为 0，入队` }
    }
  }
  const order: string[] = []
  while (queue.length > 0) {
    const u = queue.shift()!
    order.push(u)
    yield { kind: 'visit', node: u, note: `输出 ${view.label(u)}（第 ${order.length} 个）` }
    for (const v of view.neighbors(u)) {
      const next = (indegree.get(v) ?? 0) - 1
      indegree.set(v, next)
      yield {
        kind: 'inspect',
        node: u,
        edge: { source: u, target: v },
        note: `沿边 ${view.label(u)} → ${view.label(v)}：${view.label(v)} 入度降为 ${next}`,
      }
      if (next === 0) {
        queue.push(v)
        yield { kind: 'push', node: v, note: `${view.label(v)} 入度为 0，入队` }
      }
    }
  }
  if (order.length < graph.nodes.length) {
    const remaining = graph.nodes.filter((node) => !order.includes(node.id)).map((node) => node.id)
    yield {
      kind: 'reject',
      note: `存在环：${remaining.map((id) => view.label(id)).join('、')} 无法进入拓扑序`,
    }
    return { order: null, remaining }
  }
  yield { kind: 'note', note: `拓扑排序完成：${order.map((id) => view.label(id)).join(' → ')}` }
  return { order, remaining: null }
}
