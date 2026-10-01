/**
 * 强连通分量（v0.5）：Tarjan 算法——生成器实现（可单步/回退）。
 * 语义：沿「出方向」（有向边沿箭头、无向边双向）；无向连通图恰有一个分量。
 * 步骤：`push` 入栈（含 dfn）、`select` 发现一个分量（高亮该分量根）、note 汇总。
 */
import type { GraphObject } from '../model'
import { graphView } from './common'
import type { AlgorithmStep } from './types'

export interface SccResult {
  count: number
  /** 节点 id → 分量编号（按发现顺序） */
  componentOf: Record<string, number>
  /** 各分量节点（按发现顺序） */
  components: string[][]
}

export function* stronglyConnectedSteps(
  graph: GraphObject,
): Generator<AlgorithmStep, SccResult, void> {
  const view = graphView(graph)
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: string[][] = []
  const componentOf: Record<string, number> = {}

  function* visit(u: string): Generator<AlgorithmStep, void, void> {
    index.set(u, counter)
    low.set(u, counter)
    counter += 1
    stack.push(u)
    onStack.add(u)
    yield { kind: 'push', node: u, note: `${view.label(u)} 入栈（dfn=${index.get(u)}）` }
    for (const v of view.neighbors(u)) {
      if (!index.has(v)) {
        yield* visit(v)
        low.set(u, Math.min(low.get(u)!, low.get(v)!))
      } else if (onStack.has(v)) {
        low.set(u, Math.min(low.get(u)!, index.get(v)!))
      }
    }
    if (low.get(u) === index.get(u)) {
      const component: string[] = []
      for (;;) {
        const w = stack.pop()!
        onStack.delete(w)
        component.push(w)
        if (w === u) break
      }
      const componentIndex = components.length
      for (const id of component) componentOf[id] = componentIndex
      components.push(component)
      yield {
        kind: 'select',
        node: u,
        note: `发现强连通分量（${component.length} 个顶点）：${component
          .map((id) => view.label(id))
          .join('、')}`,
      }
    }
  }

  for (const node of graph.nodes) {
    if (!index.has(node.id)) yield* visit(node.id)
  }
  yield { kind: 'note', note: `共 ${components.length} 个强连通分量` }
  return { count: components.length, componentOf, components }
}
