import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import { countSpanningTrees } from './spanning-tree'
import { createEdge, createNode, paletteColor, type GraphObject } from './model'

function g(dsl: string): GraphObject {
  const result = graphObjectFromDsl(dsl)
  expect(result.errors).toEqual([])
  return result.graph!
}

describe('graph/spanning-tree: 生成树计数（Kirchhoff）', () => {
  it('经典：K3=3、K4=16（Cayley 4²）、C4=4、P3=1、K2=1', () => {
    expect(countSpanningTrees(g('A-B, B-C, C-A')).count).toBe(3)
    expect(countSpanningTrees(g('A-B, A-C, A-D, B-C, B-D, C-D')).count).toBe(16)
    expect(countSpanningTrees(g('A-B, B-C, C-D, D-A')).count).toBe(4)
    expect(countSpanningTrees(g('A-B, B-C')).count).toBe(1)
    expect(countSpanningTrees(g('A-B')).count).toBe(1)
  })

  it('平行边/带权边计入权重：双平行边 = 2；权重 3 的边 = 3', () => {
    expect(countSpanningTrees(g('A-B, A-B')).count).toBe(2)
    expect(countSpanningTrees(g('A-B:3')).count).toBe(3)
    // 三角形：AB 双平行；加权生成树和 = 1（BC+CA）+ 2（AB+BC）+ 2（AB+CA）= 5
    expect(countSpanningTrees(g('A-B, A-B, B-C, C-A')).count).toBe(5)
  })

  it('Petersen 图：著名计数 2000', () => {
    const petersen = g(
      [
        'A0-A1',
        'A1-A2',
        'A2-A3',
        'A3-A4',
        'A4-A0',
        'B0-B2',
        'B2-B4',
        'B4-B1',
        'B1-B3',
        'B3-B0',
        'A0-B0',
        'A1-B1',
        'A2-B2',
        'A3-B3',
        'A4-B4',
      ].join(', '),
    )
    expect(countSpanningTrees(petersen).count).toBe(2000)
  })

  it('边界：单点=1、空图=0、不连通=0、自环忽略', () => {
    expect(countSpanningTrees(g('A')).count).toBe(1)
    const empty: GraphObject = {
      id: 'e',
      type: 'graph',
      name: '',
      nodes: [],
      edges: [],
      visible: true,
    }
    expect(countSpanningTrees(empty).count).toBe(0)
    expect(countSpanningTrees(g('A-B, C-D')).count).toBe(0)
    // 自环不参与生成树
    expect(countSpanningTrees(g('A-A, A-B, B-C, C-A')).count).toBe(3)
  })

  it('有向边按无向化计入（与连通性语义一致）', () => {
    expect(countSpanningTrees(g('A->B, B->C, C->A')).count).toBe(3)
  })

  it('规模超限（> 64 顶点）跳过', () => {
    const nodes = Array.from({ length: 65 }, (_, i) => createNode(`V${i}`, i, 0, paletteColor(i)))
    const edges = nodes.slice(1).map((node, i) => createEdge(nodes[i]!.id, node.id))
    const graph: GraphObject = {
      id: 'big',
      type: 'graph',
      name: 'big',
      nodes,
      edges,
      visible: true,
    }
    const result = countSpanningTrees(graph)
    expect(result.skipped).toBe(true)
    expect(result.count).toBeNull()
  })
})
