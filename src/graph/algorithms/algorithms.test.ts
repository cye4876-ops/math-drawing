/**
 * 算法层测试（v0.5 阶段 5）——覆盖规格「关键正确性测试」表：
 * Petersen 3 色 / K5 5 色 / K3,3 二分 / C5 非二分 / 负权 Dijkstra 拒绝 / 负环检测 / 拓扑排序约束。
 * 以及边界：空图、单点、自环、多重边、有向、不连通、平行边取短。
 */
import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from '../dsl-to-doc'
import type { GraphObject } from '../model'
import { dsaturColoring, greedyColoring, isBipartite, verifyColoring } from './coloring'
import { ALGORITHMS, reconstructPath, runAlgorithm } from './index'
import { dijkstraSteps } from './shortest-path'
import type { AlgorithmFailure, ShortestPathResult, TraversalResult } from './types'

function make(dsl: string): GraphObject {
  const { graph } = graphObjectFromDsl(dsl)
  return graph!
}

const EMPTY: GraphObject = {
  id: 'empty',
  type: 'graph',
  name: '空图',
  nodes: [],
  edges: [],
  visible: true,
}

/** 标准 Petersen 图：外五边形 + 内五角星 + 辐条 */
const PETERSEN = '1-2, 2-3, 3-4, 4-5, 5-1, 6-8, 8-10, 10-7, 7-9, 9-6, 1-6, 2-7, 3-8, 4-9, 5-10'
const K5 = '1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5'
const K33 = '1-4, 1-5, 1-6, 2-4, 2-5, 2-6, 3-4, 3-5, 3-6'
const C5 = '1-2, 2-3, 3-4, 4-5, 5-1'

function labelsOf(graph: GraphObject, ids: string[]): string[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node.label]))
  return ids.map((id) => byId.get(id) ?? id)
}

describe('v0.5 算法：BFS / DFS', () => {
  it('BFS 链式图：距离与父指针正确，步骤含 push/visit/inspect', () => {
    const graph = make('1-2, 2-3, 3-4')
    const run = runAlgorithm('bfs', graph)
    const traversal = run.result as TraversalResult
    expect(labelsOf(graph, traversal.order)).toEqual(['1', '2', '3', '4'])
    const id4 = graph.nodes.find((n) => n.label === '4')!.id
    const id3 = graph.nodes.find((n) => n.label === '3')!.id
    expect(traversal.distance[id4]).toBe(3)
    expect(traversal.parent[id4]).toBe(id3)
    expect(run.steps.some((step) => step.kind === 'push')).toBe(true)
    expect(run.steps.some((step) => step.kind === 'visit')).toBe(true)
    expect(run.steps.some((step) => step.kind === 'inspect')).toBe(true)
  })

  it('BFS 不连通图：可达节点有距离，不可达为 null', () => {
    const graph = make('A-B, C-D')
    const { result } = runAlgorithm('bfs', graph)
    const traversal = result as TraversalResult
    const idC = graph.nodes.find((n) => n.label === 'C')!.id
    expect(traversal.order).toHaveLength(2)
    expect(traversal.distance[idC]).toBeNull()
  })

  it('DFS 树：起点先访问、全部可达、父链有效', () => {
    const graph = make('1-2, 1-3, 2-4')
    const { result } = runAlgorithm('dfs', graph)
    const traversal = result as TraversalResult
    expect(traversal.order).toHaveLength(4)
    expect(labelsOf(graph, [traversal.order[0]!])).toEqual(['1'])
    const id4 = graph.nodes.find((n) => n.label === '4')!.id
    const id2 = graph.nodes.find((n) => n.label === '2')!.id
    expect(traversal.parent[id4]).toBe(id2)
  })

  it('空图与单点自环：安全且结果为空/单点', () => {
    expect((runAlgorithm('bfs', EMPTY).result as TraversalResult).order).toEqual([])
    const loop = make('A-A')
    const { result } = runAlgorithm('bfs', loop)
    expect((result as TraversalResult).order).toHaveLength(1)
    expect((runAlgorithm('dfs', loop).result as TraversalResult).order).toHaveLength(1)
  })
})

describe('v0.5 算法：Dijkstra', () => {
  it('带权图：距离与路径与手算一致（A-B-C-D = 4）', () => {
    const graph = make('A-B:2, A-C:5, B-C:1, B-D:4, C-D:1')
    const { result } = runAlgorithm('dijkstra', graph)
    const shortest = result as ShortestPathResult
    const idD = graph.nodes.find((n) => n.label === 'D')!.id
    expect(shortest.distance[idD]).toBe(4)
    expect(labelsOf(graph, shortest.order)).toEqual(['A', 'B', 'C', 'D'])
    expect(labelsOf(graph, reconstructPath(shortest, idD)!)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('平行边取更短的一条', () => {
    const graph = make('A-B:5, A-B:2')
    const { result } = runAlgorithm('dijkstra', graph)
    const idB = graph.nodes.find((n) => n.label === 'B')!.id
    expect((result as ShortestPathResult).distance[idB]).toBe(2)
  })

  it('有向图沿箭头方向；无向边双向', () => {
    const graph = make('A->B:1, B->C:2, C-A:10')
    const { result } = runAlgorithm('dijkstra', graph)
    const shortest = result as ShortestPathResult
    const idC = graph.nodes.find((n) => n.label === 'C')!.id
    expect(shortest.distance[idC]).toBe(3)
  })

  it('负权边：拒绝执行（返回错误，不给出错误结果）', () => {
    const graph = make('A-B:-1, B-C:2')
    const { steps, result } = runAlgorithm('dijkstra', graph)
    expect('error' in result).toBe(true)
    expect((result as AlgorithmFailure).error).toContain('负权')
    expect(steps[steps.length - 1]?.kind).toBe('reject')
  })

  it('不连通：不可达距离为 null；空图安全', () => {
    const graph = make('A-B:1, C-D:1')
    const { result } = runAlgorithm('dijkstra', graph)
    const idC = graph.nodes.find((n) => n.label === 'C')!.id
    expect((result as ShortestPathResult).distance[idC]).toBeNull()
    expect('error' in runAlgorithm('dijkstra', EMPTY).result).toBe(false)
  })
})

describe('v0.5 算法：Bellman-Ford', () => {
  it('负权（有向、无负环）：结果正确', () => {
    // 注意：无向负权边会天然构成 2-环负环，测试负权须用有向边
    const graph = make('A->B:1, B->C:-3, A->C:10')
    const { result } = runAlgorithm('bellman-ford', graph)
    const shortest = result as ShortestPathResult
    const idC = graph.nodes.find((n) => n.label === 'C')!.id
    expect(shortest.distance[idC]).toBe(-2)
  })

  it('负环检测：正确报告（B→C→B 权重 -1）', () => {
    const graph = make('A-B:1, B-C:-2, C-B:1')
    const { steps, result } = runAlgorithm('bellman-ford', graph)
    expect('error' in result).toBe(true)
    expect((result as AlgorithmFailure).error).toContain('负环')
    expect(steps.some((step) => step.kind === 'reject')).toBe(true)
  })

  it('正权图不误报负环', () => {
    const graph = make('A-B:1, B-C:1, C-A:1')
    const { result } = runAlgorithm('bellman-ford', graph)
    expect('error' in result).toBe(false)
  })
})

describe('v0.5 算法：拓扑排序（Kahn）', () => {
  it('有向链：唯一序列', () => {
    const graph = make('1->2, 2->3')
    const { result } = runAlgorithm('topological', graph)
    const typed = result as { order: string[] | null; remaining: string[] | null }
    expect(typed.remaining).toBeNull()
    expect(labelsOf(graph, typed.order!)).toEqual(['1', '2', '3'])
  })

  it('有向树：满足全部边约束、根最先', () => {
    const graph = make('A->B, A->C, B->D, C->D')
    const { result } = runAlgorithm('topological', graph)
    const order = (result as { order: string[] }).order
    expect(order).toHaveLength(4)
    expect(graph.nodes.find((n) => n.label === 'A')!.id).toBe(order[0])
    const position = new Map(order.map((id, i) => [id, i]))
    for (const edge of graph.edges) {
      expect(position.get(edge.source)!).toBeLessThan(position.get(edge.target)!)
    }
  })

  it('环（有向 2-环）与自环：报告环并给出剩余节点', () => {
    const twoCycle = make('A->B, B->A')
    const r1 = runAlgorithm('topological', twoCycle).result as { order: null; remaining: string[] }
    expect(r1.order).toBeNull()
    expect(r1.remaining).toHaveLength(2)
    const loop = make('A-A, A->B')
    expect((runAlgorithm('topological', loop).result as { order: null }).order).toBeNull()
  })

  it('无向三角形（双向语义）也被判为环', () => {
    const graph = make('1-2, 2-3, 3-1')
    expect((runAlgorithm('topological', graph).result as { order: null }).order).toBeNull()
  })
})

describe('v0.5 算法：着色（规格关键项）', () => {
  it('Petersen 图：DSATUR 给出 3 色且合法（规格验收）', () => {
    const graph = make(PETERSEN)
    const coloring = dsaturColoring(graph)
    expect(coloring.count).toBe(3)
    expect(verifyColoring(graph, coloring.colors)).toBe(true)
  })

  it('K5：着色用 5 色且合法（两种算法）', () => {
    const graph = make(K5)
    const dsatur = dsaturColoring(graph)
    const greedy = greedyColoring(graph)
    expect(dsatur.count).toBe(5)
    expect(greedy.count).toBe(5)
    expect(verifyColoring(graph, dsatur.colors)).toBe(true)
    expect(verifyColoring(graph, greedy.colors)).toBe(true)
  })

  it('C5 三色；无向树可合法着色', () => {
    const c5 = make(C5)
    const coloring = dsaturColoring(c5)
    expect(coloring.count).toBe(3)
    expect(verifyColoring(c5, coloring.colors)).toBe(true)
    const tree = make('A-B, A-C, A-D, B-E')
    expect(verifyColoring(tree, dsaturColoring(tree).colors)).toBe(true)
    expect(verifyColoring(tree, greedyColoring(tree).colors)).toBe(true)
  })

  it('runAlgorithm 分发：着色结果携带算法名', () => {
    const graph = make(K5)
    expect((runAlgorithm('dsatur-color', graph).result as { method: string }).method).toBe('dsatur')
    expect((runAlgorithm('greedy-color', graph).result as { method: string }).method).toBe('greedy')
  })
})

describe('v0.5 算法：二分判定（规格关键项）', () => {
  it('K3,3 二分（true）', () => {
    const graph = make(K33)
    const result = isBipartite(graph)
    expect(result.bipartite).toBe(true)
    expect(result.conflict).toBeNull()
    // 二着色仅用 0/1
    expect(new Set(Object.values(result.colors))).toEqual(new Set([0, 1]))
  })

  it('C5 非二分（false）且给出冲突边', () => {
    const graph = make(C5)
    const result = isBipartite(graph)
    expect(result.bipartite).toBe(false)
    expect(result.conflict).not.toBeNull()
  })

  it('Petersen 非二分；自环点非二分；单点/空图二分', () => {
    expect(isBipartite(make(PETERSEN)).bipartite).toBe(false)
    expect(isBipartite(make('A-A')).bipartite).toBe(false)
    expect(isBipartite(make('A')).bipartite).toBe(true)
    expect(isBipartite(EMPTY).bipartite).toBe(true)
  })
})

describe('v0.5 算法：注册与统一入口', () => {
  it('ALGORITHMS 元数据完整（10 项）且 runAlgorithm 全部可用', () => {
    expect(ALGORITHMS).toHaveLength(10)
    const graph = make('A-B:1, B-C:2, C->A:1')
    for (const info of ALGORITHMS) {
      const { result } = runAlgorithm(info.id, graph)
      expect('error' in result, `${info.id} 不应报错`).toBe(false)
    }
  })

  it('未知算法 id 返回错误', () => {
    const { result } = runAlgorithm('nope', make('A-B'))
    expect((result as AlgorithmFailure).error).toContain('未知算法')
  })

  it('生成器可逐步消费（单步语义）：每次 next 只推进一小步', () => {
    const graph = make('1-2, 2-3')
    const run = dijkstraSteps(graph)
    const first = run.next()
    expect(first.done).toBe(false)
    // 再消费几步后结束，最终结果距离正确
    let last = run.next()
    while (!last.done) last = run.next()
    const result = last.value as ShortestPathResult
    const id3 = graph.nodes.find((n) => n.label === '3')!.id
    expect(result.distance[id3]).toBe(2)
  })

  it('步骤数量受控（小图全流程 < 200 步，符合「1000 步内流畅」要求）', () => {
    const graph = make(PETERSEN)
    expect(runAlgorithm('bfs', graph).steps.length).toBeLessThan(200)
    expect(runAlgorithm('bellman-ford', graph).steps.length).toBeLessThan(1000)
  })
})
