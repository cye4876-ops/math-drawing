/**
 * v3.2 社区发现（Louvain）测试：两个三角形 + 桥（Sage/networkx 核验 Q = 0.3571428571）；
 * K5 单社区；P4 两社区 Q = 1/6；孤立点独立成社区；空图。
 */
import { describe, expect, it } from 'vitest'
import { detectCommunities, modularityOf } from './community'
import { createEdge, createNode, type GraphObject } from './model'

function makeGraph(
  labels: string[],
  edges: [string, string][],
  weights?: (number | null)[],
): GraphObject {
  const nodes = labels.map((label, i) => createNode(label, i, 0, '#2563eb'))
  const byLabel = new Map(nodes.map((node) => [node.label, node]))
  const edgesData = edges.map(([a, b], i) =>
    createEdge(byLabel.get(a)!.id, byLabel.get(b)!.id, { weight: weights?.[i] ?? null }),
  )
  return { id: 'g', type: 'graph', name: 'g', visible: true, nodes, edges: edgesData }
}

const TWO_TRIANGLES = makeGraph(
  ['1', '2', '3', '4', '5', '6'],
  [
    ['1', '2'],
    ['2', '3'],
    ['3', '1'],
    ['4', '5'],
    ['5', '6'],
    ['6', '4'],
    ['3', '4'],
  ],
)

describe('v3.2 社区发现（Louvain）', () => {
  it('两个三角形 + 桥：2 个社区、Q = 0.3571428571（networkx 核验）', () => {
    const result = detectCommunities(TWO_TRIANGLES)
    expect(result.count).toBe(2)
    expect(result.modularity).toBeCloseTo(0.35714285714285715, 12)
    const first = result.communityOf.slice(0, 3)
    const second = result.communityOf.slice(3)
    expect(new Set(first).size).toBe(1)
    expect(new Set(second).size).toBe(1)
    expect(first[0]).not.toBe(second[0])
  })

  it('modularityOf 与检测结果一致；K5 单社区 Q = 0', () => {
    const result = detectCommunities(TWO_TRIANGLES)
    expect(modularityOf(TWO_TRIANGLES, result.communityOf)).toBeCloseTo(0.35714285714285715, 12)
    const k5 = makeGraph(
      ['1', '2', '3', '4', '5'],
      [
        ['1', '2'],
        ['1', '3'],
        ['1', '4'],
        ['1', '5'],
        ['2', '3'],
        ['2', '4'],
        ['2', '5'],
        ['3', '4'],
        ['3', '5'],
        ['4', '5'],
      ],
    )
    const k5Result = detectCommunities(k5)
    expect(k5Result.count).toBe(1)
    expect(k5Result.modularity).toBeCloseTo(0, 12)
  })

  it('路径 P4：两社区、Q = 1/6', () => {
    const p4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ],
    )
    const result = detectCommunities(p4)
    expect(result.count).toBe(2)
    expect(result.modularity).toBeCloseTo(1 / 6, 12)
  })

  it('孤立点独立成社区；空图返回 0', () => {
    const mixed = makeGraph(
      ['A', 'B', 'C', 'X', 'Y'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'A'],
      ],
    )
    const result = detectCommunities(mixed)
    expect(result.count).toBe(3)
    const empty = makeGraph([], [])
    expect(detectCommunities(empty).count).toBe(0)
  })

  it('加权边：权重 3 的桥使拆分更优（与 networkx Louvain 一致：3 社区 Q=0.1481）', () => {
    const weighted = makeGraph(
      ['1', '2', '3', '4', '5', '6'],
      [
        ['1', '2'],
        ['2', '3'],
        ['3', '1'],
        ['4', '5'],
        ['5', '6'],
        ['6', '4'],
        ['3', '4'],
      ],
      [1, 1, 1, 1, 1, 1, 3],
    )
    const result = detectCommunities(weighted)
    expect(result.count).toBe(3)
    expect(result.modularity).toBeCloseTo(0.14814814814814814, 12)
  })
})
