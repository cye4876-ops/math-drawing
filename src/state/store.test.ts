import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_LIMIT, colorForIndex, createStore, type AppStore } from './store'
import { createView } from '../core/transform'
import { createEdge, createNode } from '../graph/model'

let store: AppStore

beforeEach(() => {
  store = createStore()
})

describe('store: 初始状态', () => {
  it('初始为空文档、默认视图、无历史', () => {
    const s = store.getState()
    expect(s.doc.objects).toHaveLength(0)
    expect(s.view.scaleX).toBe(80)
    expect(s.view.scaleY).toBe(80)
    expect(s.view.equalAspect).toBe(true)
    expect(s.view.coordType).toBe('rect')
    expect(s.view.axisVisible).toBe(true)
    expect(store.canUndo()).toBe(false)
    expect(store.canRedo()).toBe(false)
  })
})

describe('store: 撤销/重做', () => {
  it('添加对象后可撤销、可重做', () => {
    store.addMarker(1, 2)
    expect(store.getState().doc.objects).toHaveLength(1)
    expect(store.canUndo()).toBe(true)

    store.undo()
    expect(store.getState().doc.objects).toHaveLength(0)
    expect(store.canRedo()).toBe(true)

    store.redo()
    expect(store.getState().doc.objects).toHaveLength(1)
  })

  it('无历史时 undo/redo 为安全的 no-op', () => {
    expect(() => store.undo()).not.toThrow()
    expect(() => store.redo()).not.toThrow()
    expect(store.getState().doc.objects).toHaveLength(0)
  })

  it('撤销后新操作清空 redo 栈', () => {
    store.addMarker(0, 0)
    store.addMarker(1, 1)
    store.undo()
    expect(store.canRedo()).toBe(true)

    store.addMarker(2, 2)
    expect(store.canRedo()).toBe(false)
  })

  it('历史深度受 HISTORY_LIMIT 约束', () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store.addMarker(i, 0)

    let undone = 0
    while (store.canUndo()) {
      store.undo()
      undone++
    }
    expect(undone).toBe(HISTORY_LIMIT)
  })
})

describe('store: 视图不入历史', () => {
  it('setView 不产生可撤销项', () => {
    store.setView(createView(5, -5, 200))
    expect(store.canUndo()).toBe(false)
  })

  it('撤销/重做不会回滚视图', () => {
    store.addMarker(0, 0)
    store.setView(createView(5, -5, 200))
    store.undo()
    expect(store.getState().view).toEqual(createView(5, -5, 200))
    store.redo()
    expect(store.getState().view).toEqual(createView(5, -5, 200))
  })
})

describe('store: 订阅', () => {
  it('状态变更通知订阅者，退订后不再通知', () => {
    const fn = vi.fn()
    const unsubscribe = store.subscribe(fn)

    store.addMarker(0, 0)
    store.setView(createView(0, 0, 50))
    store.undo()
    expect(fn).toHaveBeenCalledTimes(3)

    unsubscribe()
    store.addMarker(1, 1)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('addMarker 返回带唯一 id 的标记点', () => {
    const a = store.addMarker(0, 0)
    const b = store.addMarker(1, 1)
    expect(a.id).not.toBe(b.id)
    expect(a.type).toBe('marker')
    expect(a.x).toBe(0)
    expect(b.y).toBe(1)
  })

  it('removeMarker 删除指定标记点，可撤销恢复', () => {
    const a = store.addMarker(0, 0)
    const b = store.addMarker(1, 1)
    store.removeMarker(a.id)
    const markers = store.getState().doc.objects.filter((o) => o.type === 'marker')
    expect(markers).toHaveLength(1)
    expect(markers[0]?.id).toBe(b.id)

    store.undo()
    expect(store.getState().doc.objects.filter((o) => o.type === 'marker')).toHaveLength(2)
  })
})

describe('store: 曲线管理', () => {
  it('addCurve 填充默认值（颜色/线型/精度/可见性/名称）', () => {
    const curve = store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    expect(curve.type).toBe('curve')
    expect(curve.kind).toBe('explicit')
    expect(curve.name).toBe('sin(x)')
    expect(curve.lineStyle).toBe('solid')
    expect(curve.quality).toBe(3)
    expect(curve.visible).toBe(true)
    expect(curve.color).toBe(colorForIndex(0))
    expect(store.getCurves()).toHaveLength(1)
  })

  it('参数曲线保留 x(t) 与 y(t) 两个表达式', () => {
    const curve = store.addCurve({ kind: 'parametric', expr: 'cos(t)', expr2: 'sin(t)' })
    expect(curve.expr).toBe('cos(t)')
    expect(curve.expr2).toBe('sin(t)')
  })

  it('色环分配：前 8 条曲线颜色互不相同', () => {
    for (let i = 0; i < 8; i++) store.addCurve({ kind: 'explicit', expr: `x^${i + 1}` })
    const colors = store.getCurves().map((c) => c.color)
    expect(new Set(colors).size).toBe(8)
  })

  it('updateCurve 修改属性并可撤销', () => {
    const curve = store.addCurve({ kind: 'explicit', expr: 'x' })
    store.updateCurve(curve.id, { expr: 'x^2', color: '#ff0000', visible: false, quality: 5 })
    const updated = store.getCurves()[0]
    expect(updated?.expr).toBe('x^2')
    expect(updated?.color).toBe('#ff0000')
    expect(updated?.visible).toBe(false)
    expect(updated?.quality).toBe(5)

    store.undo()
    expect(store.getCurves()[0]?.expr).toBe('x')
  })

  it('removeCurve 删除目标曲线', () => {
    const a = store.addCurve({ kind: 'explicit', expr: 'a' })
    store.addCurve({ kind: 'explicit', expr: 'b' })
    store.removeCurve(a.id)
    const curves = store.getCurves()
    expect(curves).toHaveLength(1)
    expect(curves[0]?.expr).toBe('b')
  })

  it('moveCurve 调整曲线顺序，标记点保持原位', () => {
    store.addMarker(0, 0)
    store.addCurve({ kind: 'explicit', expr: '1' })
    store.addCurve({ kind: 'explicit', expr: '2' })
    store.addCurve({ kind: 'explicit', expr: '3' })

    const third = store.getCurves()[2]?.id as string
    store.moveCurve(third, -1)
    expect(store.getCurves().map((c) => c.expr)).toEqual(['1', '3', '2'])

    store.moveCurve(third, -1)
    expect(store.getCurves().map((c) => c.expr)).toEqual(['3', '1', '2'])

    // 标记点仍在文档中且只有一个
    expect(store.getState().doc.objects.filter((o) => o.type === 'marker')).toHaveLength(1)
  })

  it('moveCurve 越界为 no-op', () => {
    const first = store.addCurve({ kind: 'explicit', expr: '1' })
    expect(() => store.moveCurve(first.id, -1)).not.toThrow()
    expect(store.getCurves().map((c) => c.expr)).toEqual(['1'])
  })

  it('loadState 载入文档与视图并进入撤销历史', () => {
    store.addCurve({ kind: 'explicit', expr: 'old' })
    const doc = {
      objects: [
        {
          id: 'c1',
          type: 'curve' as const,
          kind: 'explicit' as const,
          name: 'p',
          expr: 'x^2',
          color: '#123456',
          lineStyle: 'dashed' as const,
          quality: 4,
          visible: true,
        },
      ],
    }
    const view = createView(1, 2, 90)
    store.loadState(doc, view)
    expect(store.getCurves()[0]?.expr).toBe('x^2')
    expect(store.getState().view.centerX).toBe(1)
    expect(store.canUndo()).toBe(true)

    store.undo()
    expect(store.getCurves()[0]?.expr).toBe('old')
  })
})

describe('store: 图对象（v0.5）', () => {
  it('addGraph / updateGraphNodes / removeGraph 入撤销历史', () => {
    const a = createNode('A', 0, 0, '#000')
    const b = createNode('B', 1, 0, '#000')
    const graph = store.addGraph([a, b], [createEdge(a.id, b.id)], '测试图')
    expect(store.getGraphs()).toHaveLength(1)
    expect(graph.name).toBe('测试图')
    expect(store.getGraphs()[0]!.nodes).toHaveLength(2)

    store.updateGraphNodes(graph.id, [{ ...a, x: 5 }, b])
    expect(store.getGraphs()[0]!.nodes[0]!.x).toBe(5)

    store.removeGraph(graph.id)
    expect(store.getGraphs()).toHaveLength(0)

    store.undo()
    expect(store.getGraphs()[0]!.nodes[0]!.x).toBe(5)
    store.undo()
    expect(store.getGraphs()[0]!.nodes[0]!.x).toBe(0)
  })

  it('图与曲线/标记点共存于同一文档', () => {
    store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    store.addMarker(0, 0)
    const a = createNode('A', 0, 0, '#000')
    store.addGraph([a], [])
    expect(store.getCurves()).toHaveLength(1)
    expect(store.getGraphs()).toHaveLength(1)
    expect(store.getState().doc.objects).toHaveLength(3)
  })
})
