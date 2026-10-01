/**
 * 遍历算法（v0.5 阶段 5）：BFS / DFS——生成器实现（可单步、可回退）。
 * 语义：沿「出方向」（无向边双向、有向边只沿箭头）——见 common.ts 约定。
 */
import type { GraphObject } from '../model'
import { graphView, resolveStart } from './common'
import type { AlgorithmStep, TraversalResult } from './types'

/**
 * BFS 广度优先：
 * - `push`：节点被发现入队（记父指针与跳数距离）；
 * - `visit`：出队正式访问；
 * - 平行边导致的重复邻居由 visited 集合去重。
 */
export function* bfsSteps(
  graph: GraphObject,
  startId?: string,
): Generator<AlgorithmStep, TraversalResult, void> {
  const view = graphView(graph)
  const start = resolveStart(graph, startId)
  const parent: Record<string, string | null> = {}
  const distance: Record<string, number | null> = {}
  const order: string[] = []
  for (const node of graph.nodes) {
    parent[node.id] = null
    distance[node.id] = null
  }
  if (!start) return { order, parent, distance }
  const visited = new Set<string>([start])
  const queue: string[] = [start]
  parent[start] = null
  distance[start] = 0
  yield { kind: 'push', node: start, note: `起点 ${view.label(start)} 入队（距离 0）` }
  while (queue.length > 0) {
    const u = queue.shift()!
    order.push(u)
    yield { kind: 'visit', node: u, note: `访问 ${view.label(u)}（距离 ${distance[u]}）` }
    for (const v of view.neighbors(u)) {
      yield {
        kind: 'inspect',
        node: u,
        edge: { source: u, target: v },
        note: `检查边 ${view.label(u)} → ${view.label(v)}`,
      }
      if (visited.has(v)) {
        yield { kind: 'reject', node: v, note: `${view.label(v)} 已访问，跳过` }
        continue
      }
      visited.add(v)
      parent[v] = u
      distance[v] = (distance[u] ?? 0) + 1
      queue.push(v)
      yield {
        kind: 'push',
        node: v,
        // 携带发现边（树边）：播放器据此累积标记「走过的边」
        edge: { source: u, target: v },
        note: `${view.label(v)} 入队（距离 ${distance[v]}）`,
      }
    }
  }
  yield {
    kind: 'note',
    note: `BFS 完成：访问顺序 ${order.map((id) => view.label(id)).join(' → ')}`,
  }
  return { order, parent, distance }
}

/**
 * DFS 深度优先（迭代实现，保证可中断与生成器输出）：
 * - `push`：入栈（标记发现）；`visit`：弹栈正式访问；
 * - 邻居逆序入栈，使弹出顺序符合「先访问第一个邻居」的递归直觉。
 */
export function* dfsSteps(
  graph: GraphObject,
  startId?: string,
): Generator<AlgorithmStep, TraversalResult, void> {
  const view = graphView(graph)
  const start = resolveStart(graph, startId)
  const parent: Record<string, string | null> = {}
  const distance: Record<string, number | null> = {}
  const order: string[] = []
  for (const node of graph.nodes) {
    parent[node.id] = null
    distance[node.id] = null
  }
  if (!start) return { order, parent, distance }
  const visited = new Set<string>([start])
  const stack: string[] = [start]
  parent[start] = null
  distance[start] = 0
  yield { kind: 'push', node: start, note: `起点 ${view.label(start)} 入栈` }
  while (stack.length > 0) {
    const u = stack.pop()!
    order.push(u)
    yield { kind: 'visit', node: u, note: `访问 ${view.label(u)}` }
    for (const v of [...view.neighbors(u)].reverse()) {
      yield {
        kind: 'inspect',
        node: u,
        edge: { source: u, target: v },
        note: `检查边 ${view.label(u)} → ${view.label(v)}`,
      }
      if (visited.has(v)) {
        yield { kind: 'reject', node: v, note: `${view.label(v)} 已访问，跳过` }
        continue
      }
      visited.add(v)
      parent[v] = u
      distance[v] = (distance[u] ?? 0) + 1
      stack.push(v)
      yield {
        kind: 'push',
        node: v,
        // 携带发现边（树边）：播放器据此累积标记「走过的边」
        edge: { source: u, target: v },
        note: `${view.label(v)} 入栈（深度 ${distance[v]}）`,
      }
    }
  }
  yield {
    kind: 'note',
    note: `DFS 完成：访问顺序 ${order.map((id) => view.label(id)).join(' → ')}`,
  }
  return { order, parent, distance }
}
