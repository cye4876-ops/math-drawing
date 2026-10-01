import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import { toGraphology } from './model'

describe('graph/dsl-to-doc: DSL → 图对象', () => {
  it('基本结构：顶点环形分布、有向/权重透传', () => {
    const { graph, errors } = graphObjectFromDsl('A-B:3, B-C:2, C->A')
    expect(errors).toEqual([])
    expect(graph).not.toBeNull()
    expect(graph!.type).toBe('graph')
    expect(graph!.visible).toBe(true)
    expect(graph!.nodes).toHaveLength(3)
    expect(graph!.edges).toHaveLength(3)

    // 顶点在半径 3 的圆上
    for (const node of graph!.nodes) {
      expect(Math.hypot(node.x, node.y)).toBeCloseTo(3, 9)
    }
    // 边连接正确（无向 2 条 + 有向 1 条）
    const graphology = toGraphology(graph!)
    expect(graphology.order).toBe(3)
    expect(graphology.size).toBe(3)
    const directedCount = graphology.edges().filter((key) => graphology.isDirected(key)).length
    expect(directedCount).toBe(1)
    const weights = graphology.edges().map((key) => graphology.getEdgeAttribute(key, 'weight'))
    expect(weights).toContain(3)
    expect(weights).toContain(2)
    expect(weights).toContain(null)
  })

  it('孤立点与自环', () => {
    const { graph } = graphObjectFromDsl('A, B, C-A, C-C')
    expect(graph!.nodes).toHaveLength(3)
    expect(graph!.edges).toHaveLength(2)
    const graphology = toGraphology(graph!)
    expect(graphology.order).toBe(3)
    expect(graphology.size).toBe(2)
  })

  it('解析错误透传；部分成功仍返回图对象', () => {
    const { graph, errors } = graphObjectFromDsl('A-B, ???, C-D')
    expect(errors).toHaveLength(1)
    expect(graph).not.toBeNull()
    expect(graph!.nodes).toHaveLength(4)
    expect(graph!.edges).toHaveLength(2)
  })

  it('无有效顶点时返回 null', () => {
    const { graph, errors } = graphObjectFromDsl('???')
    expect(graph).toBeNull()
    expect(errors).toHaveLength(1)
    expect(graphObjectFromDsl('').graph).toBeNull()
  })

  it('重量级标签（汉字）也可用', () => {
    const { graph } = graphObjectFromDsl('起点->终点:1.5')
    expect(graph!.nodes.map((n) => n.label)).toEqual(['起点', '终点'])
    expect(graph!.edges[0]!.directed).toBe(true)
    expect(graph!.edges[0]!.weight).toBe(1.5)
  })
})
