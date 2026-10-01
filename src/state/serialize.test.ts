import { describe, expect, it } from 'vitest'
import { DocFormatError, deserializeDocument, serializeDocument } from './serialize'
import { createView } from '../core/transform'
import { createEdge, createNode, type GraphObject } from '../graph/model'
import type { Curve, DocState, MarkerPoint } from './types'

const curve: Curve = {
  id: 'c1',
  type: 'curve',
  kind: 'explicit',
  name: '抛物线',
  expr: 'x^2',
  color: '#ff0000',
  lineStyle: 'dashed',
  quality: 4,
  visible: true,
}

const marker: MarkerPoint = { id: 'm1', type: 'marker', x: 1.5, y: -2 }

const doc: DocState = { objects: [curve, marker] }

describe('serialize: 往返一致', () => {
  it('序列化后再反序列化，文档与视图完全一致', () => {
    const view = { ...createView(2, -3, 120), coordType: 'log' as const, axisX: 1 }
    const json = serializeDocument(doc, view)
    const { doc: backDoc, view: backView } = deserializeDocument(json)
    expect(backDoc).toEqual(doc)
    expect(backView).toEqual(view)
  })

  it('参数曲线 expr2 保留', () => {
    const param: Curve = { ...curve, id: 'c2', kind: 'parametric', expr: 'cos(t)', expr2: 'sin(t)' }
    const json = serializeDocument({ objects: [param] }, createView())
    const { doc: back } = deserializeDocument(json)
    expect(back.objects[0]).toEqual(param)
  })
})

describe('serialize: 校验与容错', () => {
  it('非法 JSON 抛出 DocFormatError', () => {
    expect(() => deserializeDocument('{oops')).toThrow(DocFormatError)
  })

  it('缺少 version 抛出', () => {
    expect(() => deserializeDocument('{"objects":[]}')).toThrow(DocFormatError)
  })

  it('版本高于当前支持抛出', () => {
    expect(() => deserializeDocument('{"version":99,"objects":[]}')).toThrow(DocFormatError)
  })

  it('未知对象类型抛出且带位置', () => {
    const bad = JSON.stringify({ version: 1, objects: [{ id: 'x', type: 'unknown' }] })
    expect(() => deserializeDocument(bad)).toThrow(/第 0 个对象/)
  })

  it('缺省字段被填充（颜色/线型/精度/可见性）', () => {
    const raw = JSON.stringify({
      version: 1,
      objects: [{ id: 'c9', type: 'curve', kind: 'explicit', expr: 'x' }],
    })
    const { doc: back } = deserializeDocument(raw)
    const c = back.objects[0] as Curve
    expect(c.color).toBeDefined()
    expect(c.lineStyle).toBe('solid')
    expect(c.quality).toBe(3)
    expect(c.visible).toBe(true)
    expect(c.name).toBe('x')
  })

  it('精度越界被夹取', () => {
    const raw = JSON.stringify({
      version: 1,
      objects: [{ id: 'c9', type: 'curve', kind: 'explicit', expr: 'x', quality: 99 }],
    })
    const { doc: back } = deserializeDocument(raw)
    expect((back.objects[0] as Curve).quality).toBe(5)
  })

  it('视图字段部分缺失时合并默认值', () => {
    const raw = JSON.stringify({ version: 1, objects: [], view: { centerX: 5 } })
    const { view } = deserializeDocument(raw)
    expect(view.centerX).toBe(5)
    expect(view.scaleX).toBe(80)
    expect(view.equalAspect).toBe(true)
    expect(view.coordType).toBe('rect')
  })
})

describe('serialize: 图对象（v0.5）', () => {
  it('图对象序列化往返（含自环/重边/有向/权重）', () => {
    const a = createNode('A', 0, 0, '#2563eb')
    const b = createNode('B', 1, 1, '#dc2626')
    const graph: GraphObject = {
      id: 'g1',
      type: 'graph',
      name: '测试图',
      visible: true,
      nodes: [a, b],
      edges: [
        createEdge(a.id, b.id, { weight: 3 }),
        createEdge(a.id, b.id, { directed: true }),
        createEdge(a.id, a.id),
      ],
    }
    const roundtrip = deserializeDocument(serializeDocument({ objects: [graph] }, createView()))
    const back = roundtrip.doc.objects[0] as GraphObject
    expect(back.type).toBe('graph')
    expect(back.name).toBe('测试图')
    expect(back.nodes).toEqual(graph.nodes)
    expect(back.edges).toEqual(graph.edges)
  })

  it('图对象缺字段：name/visible 补默认；nodes 非法时报错', () => {
    const raw = JSON.stringify({
      version: 1,
      objects: [{ id: 'g1', type: 'graph', nodes: [], edges: [] }],
    })
    const { doc } = deserializeDocument(raw)
    const graph = doc.objects[0] as GraphObject
    expect(graph.name).toBe('图')
    expect(graph.visible).toBe(true)

    const bad = JSON.stringify({
      version: 1,
      objects: [{ id: 'g1', type: 'graph', nodes: [{ id: 'n1' }], edges: [] }],
    })
    expect(() => deserializeDocument(bad)).toThrow('图对象无效')
  })

  it('旧版本文档（无图对象）正常加载', () => {
    const raw = JSON.stringify({ version: 1, objects: [{ id: 'm1', type: 'marker', x: 1, y: 2 }] })
    const { doc } = deserializeDocument(raw)
    expect(doc.objects).toHaveLength(1)
  })
})
