import { describe, expect, it } from 'vitest'
import { dslMatchesGraph, graphObjectFromDsl, graphToDsl } from './dsl-to-doc'
import { parseGraphDsl } from './dsl-parser'
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

describe('graph/dsl-to-doc: 坐标继承 / 反向生成 / 结构比较', () => {
  it('坐标继承：同名顶点保留坐标与 id；新增顶点补位；删除顶点不残留', () => {
    const first = graphObjectFromDsl('A-B, C-D').graph!
    const moved = { ...first.nodes[0]!, x: 7, y: -2 }
    const withMoved = { ...first, nodes: [moved, ...first.nodes.slice(1)] }
    const next = graphObjectFromDsl('A-B, B-C', '图', 3, withMoved).graph!
    expect(next.id).toBe(withMoved.id)
    expect(next.nodes.find((n) => n.label === 'A')).toMatchObject({ id: moved.id, x: 7, y: -2 })
    expect(next.nodes.find((n) => n.label === 'D')).toBeUndefined()
    expect(next.nodes).toHaveLength(3)
  })

  it('graphToDsl：孤立点一行一个；边含方向与权重', () => {
    const { graph } = graphObjectFromDsl('A-B:3, B->C, D')
    const lines = graphToDsl(graph!).split('\n')
    expect(lines).toContain('D')
    expect(lines).toContain('A-B:3')
    expect(lines).toContain('B->C')
    expect(lines).toHaveLength(3)
  })

  it('graphToDsl 与 graphObjectFromDsl 往返后结构一致', () => {
    const { graph } = graphObjectFromDsl('A-B:3, B->C, E-F, F-G, H')
    const text = graphToDsl(graph!)
    expect(dslMatchesGraph(parseGraphDsl(text), graph!)).toBe(true)
    const round = graphObjectFromDsl(text, '图', 3, graph!).graph!
    expect(round.edges).toHaveLength(graph!.edges.length)
    for (const node of round.nodes) {
      const original = graph!.nodes.find((n) => n.label === node.label)!
      expect(node.x).toBe(original.x)
      expect(node.y).toBe(original.y)
    }
  })

  it('dslMatchesGraph：端点顺序/注释/空行不影响；权重/方向/多边/解析错误判否', () => {
    const { graph } = graphObjectFromDsl('A-B:3, B->C')
    expect(dslMatchesGraph(parseGraphDsl('B-A:3, B->C'), graph!)).toBe(true)
    expect(dslMatchesGraph(parseGraphDsl('A-B:3, B->C # 注释\n\n'), graph!)).toBe(true)
    expect(dslMatchesGraph(parseGraphDsl('A-B, B->C'), graph!)).toBe(false)
    expect(dslMatchesGraph(parseGraphDsl('A-B:3, C->B'), graph!)).toBe(false)
    expect(dslMatchesGraph(parseGraphDsl('A-B:3, B->C, A-C'), graph!)).toBe(false)
    expect(dslMatchesGraph(parseGraphDsl('A-B:3, B->C, ???'), graph!)).toBe(false)
  })
})
