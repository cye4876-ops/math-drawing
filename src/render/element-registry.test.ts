import { describe, expect, it } from 'vitest'
import { ElementRegistry, type ElementRenderer } from './element-registry'
import { createNode, createEdge, type GraphObject } from '../graph/model'
import { graphElementRenderer } from './graph-renderer'
import { curveElementRenderer } from './curve-renderer'
import { createStore } from '../state/store'
import type { Curve, MarkerPoint, Point2, SceneObject } from '../state/types'

const viewport = { view: createStore().getView(), size: { width: 800, height: 600 } }

/** 测试用渲染器：记录绘制顺序；可选命中表 */
function stubRenderer(
  type: string,
  log: string[],
  hit?: (screen: Point2) => { targetId: string; distancePx: number } | null,
): ElementRenderer<SceneObject> {
  return {
    type: type as SceneObject['type'],
    draw: (_ctx: CanvasRenderingContext2D, element: SceneObject) => log.push(`draw:${element.id}`),
    hitTest: (element: SceneObject, screen: Point2) => {
      const result = hit?.(screen)
      if (!result) return null
      return {
        elementId: element.id,
        part: type,
        targetId: result.targetId,
        distancePx: result.distancePx,
      }
    },
  }
}

describe('render/element-registry: 注册与分发', () => {
  it('按文档顺序绘制；未注册类型与 marker 跳过', () => {
    const log: string[] = []
    const registry = new ElementRegistry()
      .register(stubRenderer('curve', log))
      .register(stubRenderer('graph', log))

    const marker: MarkerPoint = { id: 'm1', type: 'marker', x: 0, y: 0 }
    const objects = [
      { id: 'c1', type: 'curve' },
      { id: 'g1', type: 'graph' },
      marker,
    ] as unknown as SceneObject[]

    const ctx = {} as CanvasRenderingContext2D
    registry.draw(ctx, objects, viewport)
    expect(log).toEqual(['draw:c1', 'draw:g1'])
    expect(registry.has('curve')).toBe(true)
    expect(registry.has('marker')).toBe(false)
  })

  it('命中检测返回距离最近者', () => {
    const registry = new ElementRegistry()
      .register(stubRenderer('curve', [], () => ({ targetId: 'far', distancePx: 10 })))
      .register(stubRenderer('graph', [], () => ({ targetId: 'near', distancePx: 3 })))

    const objects = [
      { id: 'c1', type: 'curve' },
      { id: 'g1', type: 'graph' },
    ] as unknown as SceneObject[]

    const hit = registry.hitTest(objects, { x: 0, y: 0 }, viewport, 20)
    expect(hit).not.toBeNull()
    expect(hit!.targetId).toBe('near')
    expect(hit!.distancePx).toBe(3)

    const miss = registry.hitTest([], { x: 0, y: 0 }, viewport, 20)
    expect(miss).toBeNull()
  })
})

describe('render/element-registry: 默认注册表装配', () => {
  it('曲线与图渲染器可用；命中曲线（sin 波峰附近）', () => {
    const store = createStore()
    store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    const curve = store.getCurves()[0] as Curve
    const registry = new ElementRegistry()
      .register(curveElementRenderer)
      .register(graphElementRenderer)

    // 数学 (π/2, 1) 的屏幕位置
    const projectorView = viewport.view
    const size = viewport.size
    const screen = {
      x: (Math.PI / 2) * projectorView.scaleX + size.width / 2,
      y: size.height / 2 - 1 * projectorView.scaleY,
    }
    const hit = registry.hitTest([curve], screen, viewport, 8)
    expect(hit).not.toBeNull()
    expect(hit!.part).toBe('curve')
    expect(hit!.elementId).toBe(curve.id)
  })

  it('命中图节点（节点优先于边）', () => {
    const a = createNode('A', 0, 0, '#2563eb')
    const b = createNode('B', 2, 0, '#dc2626')
    const edge = createEdge(a.id, b.id)
    const graph: GraphObject = {
      id: 'g1',
      type: 'graph',
      name: '图',
      nodes: [a, b],
      edges: [edge],
      visible: true,
    }
    const registry = new ElementRegistry().register(graphElementRenderer)

    // 节点 A 中心
    const nodeScreen = { x: viewport.size.width / 2, y: viewport.size.height / 2 }
    const hit = registry.hitTest([graph], nodeScreen, viewport, 16)
    expect(hit).toMatchObject({ part: 'node', targetId: a.id })

    // 两节点中点的边（远离节点）
    const midScreen = {
      x: viewport.size.width / 2 + viewport.view.scaleX,
      y: viewport.size.height / 2,
    }
    const edgeHit = registry.hitTest([graph], midScreen, viewport, 16)
    expect(edgeHit).toMatchObject({ part: 'edge', targetId: edge.id })

    // 远处无命中
    const miss = registry.hitTest([graph], { x: 10, y: 10 }, viewport, 16)
    expect(miss).toBeNull()
  })
})
