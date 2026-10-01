import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NODE_SIZE,
  applyPositions,
  createEdge,
  createGraphDoc,
  createNode,
  deserializeGraphDoc,
  findNodeByLabel,
  serializeGraphDoc,
  toGraphology,
  uniqueLabel,
  type GraphDoc,
} from './model'

function makeDoc(): GraphDoc {
  const doc = createGraphDoc()
  const a = createNode('A', 0, 0, '#2563eb')
  const b = createNode('B', 1, 1, '#dc2626')
  const c = createNode('C', 2, 0, '#16a34a')
  doc.nodes.push(a, b, c)
  doc.edges.push(createEdge(a.id, b.id, { weight: 3 }))
  doc.edges.push(createEdge(a.id, b.id, { directed: true, weight: 1 })) // 重边（有向）
  doc.edges.push(createEdge(c.id, c.id)) // 自环
  return doc
}

describe('graph/model: 文档构造', () => {
  it('createNode / createEdge 默认值', () => {
    const node = createNode('A', 1, 2, '#000000')
    expect(node.label).toBe('A')
    expect(node.size).toBe(DEFAULT_NODE_SIZE)
    expect(node.shape).toBe('circle')
    expect(node.attrs).toEqual({})

    const edge = createEdge('n1', 'n2')
    expect(edge.directed).toBe(false)
    expect(edge.weight).toBeNull()
    expect(edge.style).toBe('solid')
  })

  it('uniqueLabel 生成不冲突的标签', () => {
    const doc = createGraphDoc()
    doc.nodes.push(createNode('A', 0, 0, '#000000'))
    expect(uniqueLabel(doc, 'A')).toBe('A2')
    doc.nodes.push(createNode('A2', 0, 0, '#000000'))
    expect(uniqueLabel(doc, 'A')).toBe('A3')
    expect(uniqueLabel(doc, 'B')).toBe('B')
  })

  it('findNodeByLabel 查找顶点', () => {
    const doc = makeDoc()
    expect(findNodeByLabel(doc, 'B')?.label).toBe('B')
    expect(findNodeByLabel(doc, 'Z')).toBeUndefined()
  })
})

describe('graph/model: graphology 派生层', () => {
  it('节点/边（含自环、重边、混合有向）正确转换', () => {
    const doc = makeDoc()
    const graph = toGraphology(doc)

    expect(graph.order).toBe(3)
    expect(graph.size).toBe(3)
    // 重边：A-B 之间有两条边
    const [aId, bId] = [doc.nodes[0]!.id, doc.nodes[1]!.id]
    expect(graph.edges(aId, bId)).toHaveLength(2)
    // 自环
    expect(graph.hasEdge(doc.nodes[2]!.id, doc.nodes[2]!.id)).toBe(true)
    // 有向/无向混合
    const directed = graph.edges(aId, bId).filter((key) => graph.isDirected(key))
    expect(directed).toHaveLength(1)
    // 边属性携带权重
    const weighted = graph.edges(aId, bId).map((key) => graph.getEdgeAttribute(key, 'weight'))
    expect(weighted).toContain(3)
    expect(weighted).toContain(1)
  })

  it('引用缺失端点的边被跳过', () => {
    const doc = makeDoc()
    doc.edges.push(createEdge('missing-1', doc.nodes[0]!.id))
    const graph = toGraphology(doc)
    expect(graph.size).toBe(3)
  })

  it('applyPositions 把布局坐标回写到文档', () => {
    const doc = makeDoc()
    const graph = toGraphology(doc)
    graph.setNodeAttribute(doc.nodes[0]!.id, 'x', 42)
    graph.setNodeAttribute(doc.nodes[0]!.id, 'y', -7)
    const next = applyPositions(doc, graph)
    expect(next.nodes[0]!.x).toBe(42)
    expect(next.nodes[0]!.y).toBe(-7)
    // 不可变更新：原文档不受影响
    expect(doc.nodes[0]!.x).toBe(0)
  })
})

describe('graph/model: 序列化往返', () => {
  it('serialize → deserialize 完整还原（含可选字段默认值）', () => {
    const doc = makeDoc()
    const restored = deserializeGraphDoc(serializeGraphDoc(doc))
    expect(restored).toEqual(doc)
  })

  it('非法输入抛出中文错误', () => {
    expect(() => deserializeGraphDoc('not json')).toThrow('不是合法 JSON')
    expect(() => deserializeGraphDoc('123')).toThrow('必须是对象')
    expect(() => deserializeGraphDoc('{"nodes":[],"edges":{}}')).toThrow('缺少 nodes / edges 数组')
    expect(() => deserializeGraphDoc('{"nodes":[{"id":"x"}],"edges":[]}')).toThrow(
      '缺少 id/label/x/y',
    )
    expect(() => deserializeGraphDoc('{"nodes":[],"edges":[{"id":"e"}]}')).toThrow(
      '缺少 id/source/target',
    )
  })

  it('缺失可选字段时补默认值', () => {
    const text = JSON.stringify({
      nodes: [{ id: 'n1', label: 'A', x: 0, y: 0 }],
      edges: [{ id: 'e1', source: 'n1', target: 'n1' }],
    })
    const doc = deserializeGraphDoc(text)
    expect(doc.nodes[0]!.color).toBeTruthy()
    expect(doc.nodes[0]!.size).toBe(DEFAULT_NODE_SIZE)
    expect(doc.nodes[0]!.shape).toBe('circle')
    expect(doc.edges[0]!.directed).toBe(false)
    expect(doc.edges[0]!.weight).toBeNull()
  })
})
