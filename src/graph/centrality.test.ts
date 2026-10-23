/**
 * v3.2 中心性套件测试：路径 P3 / 星 K1,3 / 环 C4 / 有向路 / Petersen（正则图特征向量全 1）。
 */
import { describe, expect, it } from 'vitest'
import {
  betweennessCentrality,
  closenessCentrality,
  computeCentrality,
  degreeCentrality,
  eigenvectorCentrality,
  pageRank,
} from './centrality'
import { createEdge, createNode, type GraphObject } from './model'

function makeGraph(edges: string, nodeCount?: number, directed = false): GraphObject {
  const labels = new Set<string>()
  const parsed: [string, string][] = []
  for (const part of edges
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const [a, b] = part.split('-')
    if (!a || !b) continue
    labels.add(a)
    labels.add(b)
    parsed.push([a, b])
  }
  if (nodeCount !== undefined) {
    for (let i = 0; i < nodeCount; i++) labels.add(String.fromCharCode(65 + i))
  }
  const nodes = [...labels].sort().map((label, i) => createNode(label, i, 0, '#2563eb'))
  const byLabel = new Map(nodes.map((node) => [node.label, node]))
  const edgesData = parsed.map(([a, b]) =>
    createEdge(byLabel.get(a)!.id, byLabel.get(b)!.id, { directed }),
  )
  return { id: 'g', type: 'graph', name: 'g', visible: true, nodes, edges: edgesData }
}

describe('v3.2 图中心性', () => {
  it('度中心性：P3 为 [0.5, 1, 0.5]，星图中心度 1', () => {
    const p3 = makeGraph('A-B, B-C')
    const values = degreeCentrality(p3)
    expect(values).toEqual([0.5, 1, 0.5])
    const star = makeGraph('C-A, C-B, C-D')
    const center = star.nodes.find((node) => node.label === 'C')!
    expect(degreeCentrality(star)[star.nodes.indexOf(center)]).toBeCloseTo(1)
  })

  it('接近中心性：P3 为 [2/3, 1, 2/3]；有向链 A→B→C', () => {
    const p3 = makeGraph('A-B, B-C')
    const values = closenessCentrality(p3)
    expect(values[0]).toBeCloseTo(2 / 3)
    expect(values[1]).toBeCloseTo(1)
    const directed = makeGraph('A-B, B-C', undefined, true)
    const v = closenessCentrality(directed)
    expect(v[0]).toBeCloseTo(2 / 3)
    expect(v[1]).toBeCloseTo(1)
    expect(v[2]).toBe(0)
  })

  it('介数中心性：P3 中心为 1；星 K1,3 中心为 3', () => {
    const p3 = makeGraph('A-B, B-C')
    const values = betweennessCentrality(p3)
    expect(values).toEqual([0, 1, 0])
    const star = makeGraph('C-A, C-B, C-D')
    const center = star.nodes.find((node) => node.label === 'C')!
    expect(betweennessCentrality(star)[star.nodes.indexOf(center)]).toBeCloseTo(3)
  })

  it('特征向量中心性：P3 中心最大，比值 1:√2；Petersen（3-正则）全相等', () => {
    const p3 = makeGraph('A-B, B-C')
    const values = eigenvectorCentrality(p3)
    expect(values[1]).toBeCloseTo(1)
    expect(values[0]).toBeCloseTo(1 / Math.SQRT2, 6)
    expect(values[0]).toBeCloseTo(values[2]!, 12)
    const petersen = makeGraph(
      '1-2, 2-3, 3-4, 4-5, 5-1, 6-8, 8-10, 10-7, 7-9, 9-6, 1-6, 2-7, 3-8, 4-9, 5-10',
    )
    const pet = eigenvectorCentrality(petersen)
    for (const value of pet) expect(value).toBeCloseTo(1, 6)
  })

  it('PageRank：P3 中心 ≈ 0.4865、端点 ≈ 0.2568；有向链末端最高', () => {
    const p3 = makeGraph('A-B, B-C')
    const values = pageRank(p3)
    expect(values[1]).toBeCloseTo(0.4865, 3)
    expect(values[0]).toBeCloseTo(0.2568, 3)
    const directed = makeGraph('A-B, B-C', undefined, true)
    const d = pageRank(directed)
    expect(d[2]).toBeGreaterThan(d[1]!)
    expect(d[1]).toBeGreaterThan(d[0]!)
  })

  it('computeCentrality：结果与节点同序 + 排名降序 + 说明文本', () => {
    const p3 = makeGraph('A-B, B-C')
    const result = computeCentrality(p3, 'degree')
    expect(result.values).toHaveLength(3)
    expect(result.ranking[0]!.value).toBeCloseTo(1)
    expect(result.note).toContain('度中心性')
  })
})
