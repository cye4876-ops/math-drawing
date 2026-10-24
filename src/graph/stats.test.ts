/**
 * v3.3 图统计与过滤测试：K4/C4/不连通/孤立点；度数、社区、中心性 top-k 过滤。
 */
import { describe, expect, it } from 'vitest'
import { computeGraphStats, filterNodeIndices } from './stats'
import { createEdge, createNode, type GraphObject } from './model'

function makeGraph(labels: string[], edges: [string, string][]): GraphObject {
  const nodes = labels.map((label, i) => createNode(label, i, 0, '#2563eb'))
  const byLabel = new Map(nodes.map((node) => [node.label, node]))
  return {
    id: 'g',
    type: 'graph',
    name: 'g',
    visible: true,
    nodes,
    edges: edges.map(([a, b]) => createEdge(byLabel.get(a)!.id, byLabel.get(b)!.id)),
  }
}

const K4 = makeGraph(
  ['A', 'B', 'C', 'D'],
  [
    ['A', 'B'],
    ['A', 'C'],
    ['A', 'D'],
    ['B', 'C'],
    ['B', 'D'],
    ['C', 'D'],
  ],
)

const C4 = makeGraph(
  ['A', 'B', 'C', 'D'],
  [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'A'],
  ],
)

describe('v3.3 图统计', () => {
  it('K4：n=4、m=6、密度 1、平均度 3、连通分量 1', () => {
    const stats = computeGraphStats(K4)
    expect(stats).toMatchObject({
      n: 4,
      m: 6,
      density: 1,
      avgDegree: 3,
      maxDegree: 3,
      minDegree: 3,
      isolated: 0,
      components: 1,
    })
  })

  it('不连通 + 孤立点：C4 ∪ P2 ∪ 孤立点 → 3 个分量、1 个孤立点', () => {
    const graph = makeGraph(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['D', 'A'],
        ['E', 'F'],
      ],
    )
    const stats = computeGraphStats(graph)
    expect(stats.components).toBe(3)
    expect(stats.isolated).toBe(1)
    expect(stats.density).toBeCloseTo(5 / 21, 10)
  })

  it('空图与单点不报错', () => {
    const empty = makeGraph([], [])
    expect(computeGraphStats(empty).n).toBe(0)
    const single = makeGraph(['A'], [])
    expect(computeGraphStats(single)).toMatchObject({ n: 1, components: 1, isolated: 1 })
  })
})

describe('v3.3 图过滤', () => {
  it('度数过滤：K4 全部匹配；星图仅中心匹配', () => {
    expect(filterNodeIndices(K4, { kind: 'degree', min: 3 }).matched).toHaveLength(4)
    const star = makeGraph(
      ['H', 'A', 'B', 'C'],
      [
        ['H', 'A'],
        ['H', 'B'],
        ['H', 'C'],
      ],
    )
    const result = filterNodeIndices(star, { kind: 'degree', min: 2 })
    expect(result.matched).toEqual([0])
    expect(result.description).toContain('1 个顶点')
  })

  it('社区过滤：按社区编号取子集', () => {
    const result = filterNodeIndices(K4, {
      kind: 'community',
      communities: [0, 0, 1, 1],
      community: 1,
    })
    expect(result.matched).toEqual([2, 3])
  })

  it('中心性 top-k：取前两名且按索引升序', () => {
    const result = filterNodeIndices(C4, {
      kind: 'centrality',
      values: [0.1, 0.9, 0.5, 0.7],
      top: 2,
    })
    expect(result.matched).toEqual([1, 3])
    expect(result.description).toContain('前 2')
  })
})
