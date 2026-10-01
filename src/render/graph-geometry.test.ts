import { describe, expect, it } from 'vitest'
import { createStore } from '../state/store'
import { createEdge, createNode } from '../graph/model'
import {
  arrowPoints,
  distanceToPolyline,
  edgePath,
  hitTestGraph,
  nodeScreen,
  parallelKey,
} from './graph-geometry'

const store = createStore()
const view = store.getView() // 默认 center (0,0)、scale 80
const size = { width: 800, height: 600 }

describe('render/graph-geometry: 节点与平行边分组', () => {
  it('nodeScreen：数学坐标 → 屏幕（半径为屏幕常量）', () => {
    const node = createNode('A', 1, 2, '#000')
    node.size = 10
    const s = nodeScreen(node, view, size)
    expect(s.cx).toBeCloseTo(400 + 80, 9)
    expect(s.cy).toBeCloseTo(300 - 160, 9)
    expect(s.radius).toBe(10)
  })

  it('parallelKey：有向按方向、无向归一化、自环独立', () => {
    const a = createNode('A', 0, 0, '#000')
    const b = createNode('B', 1, 0, '#000')
    const undirected = createEdge(a.id, b.id)
    const reversed = createEdge(b.id, a.id)
    expect(parallelKey(undirected)).toBe(parallelKey(reversed))
    const directed = createEdge(a.id, b.id, { directed: true })
    const directedRev = createEdge(b.id, a.id, { directed: true })
    expect(parallelKey(directed)).not.toBe(parallelKey(directedRev))
    const loop = createEdge(a.id, a.id)
    expect(parallelKey(loop)).not.toBe(parallelKey(undirected))
  })
})

describe('render/graph-geometry: 边路径', () => {
  const a = createNode('A', -1, 0, '#000')
  const b = createNode('B', 1, 0, '#000')
  const from = nodeScreen(a, view, size)
  const to = nodeScreen(b, view, size)

  it('普通边为直线段（端点收缩到节点边缘）', () => {
    const edge = createEdge(a.id, b.id)
    const path = edgePath(edge, from, to, 0, 1)
    expect(path).toHaveLength(2)
    // 起点在 A 右边缘、终点在 B 左边缘
    expect(path[0]!.x).toBeCloseTo(from.cx + from.radius, 6)
    expect(path[1]!.x).toBeCloseTo(to.cx - to.radius, 6)
    expect(path[0]!.y).toBeCloseTo(from.cy, 6)
  })

  it('平行边按层级弯曲分离（中间层为直线，两侧对称）', () => {
    const edge = createEdge(a.id, b.id)
    const p0 = edgePath(edge, from, to, 0, 3)
    const p1 = edgePath(edge, from, to, 1, 3)
    const p2 = edgePath(edge, from, to, 2, 3)
    const midY = (path: ReturnType<typeof edgePath>): number =>
      (path[Math.floor(path.length / 2)] as { y: number }).y
    // 层级 0 上弯、1 直线、2 下弯
    expect(midY(p0)).toBeLessThan(midY(p1) - 4)
    expect(midY(p2)).toBeGreaterThan(midY(p1) + 4)
    // 两侧对称
    expect(midY(p0) + midY(p2)).toBeCloseTo(2 * midY(p1), 6)
  })

  it('自环为闭合环（首尾相接、环心在节点右上方）', () => {
    const loop = createEdge(a.id, a.id)
    const path = edgePath(loop, from, from, 0, 1)
    expect(path.length).toBeGreaterThan(20)
    // 首尾相接
    const first = path[0]!
    const last = path[path.length - 1]!
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(1e-6)
    // 环上所有点距环心一致；环心在节点右上方
    const radius = from.radius * 1.9
    const loopCx = from.cx + from.radius * 0.9
    const loopCy = from.cy - from.radius * 0.9
    for (const p of path.slice(0, -1)) {
      expect(Math.hypot(p.x - loopCx, p.y - loopCy)).toBeCloseTo(radius, 6)
    }
    expect(loopCx).toBeGreaterThan(from.cx)
    expect(loopCy).toBeLessThan(from.cy)
  })
})

describe('render/graph-geometry: 箭头与距离', () => {
  it('arrowPoints：尖端在 tip、三角形对称', () => {
    const [tip, left, right] = arrowPoints({ x: 100, y: 50 }, { x: 1, y: 0 }, 9)
    expect(tip).toEqual({ x: 100, y: 50 })
    // 两翼关于 tip 所在方向轴对称（dir=+x 时垂直对称）
    expect(left.x).toBeCloseTo(right.x, 9)
    expect(left.y + right.y).toBeCloseTo(100, 9)
    // 两翼间距 = 2 × size × 0.45
    expect(Math.abs(left.y - right.y)).toBeCloseTo(9 * 0.9, 6)
  })

  it('distanceToPolyline：垂距与端点距离', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    expect(distanceToPolyline(line, { x: 5, y: 3 })).toBeCloseTo(3, 9)
    expect(distanceToPolyline(line, { x: -4, y: 0 })).toBeCloseTo(4, 9)
  })
})

describe('render/graph-geometry: hitTestGraph', () => {
  const a = createNode('A', -1, 0, '#000')
  const b = createNode('B', 1, 0, '#000')
  const edge = createEdge(a.id, b.id)
  const graph = { nodes: [a, b], edges: [edge] }

  it('节点命中优先（圆内/边缘 2px）', () => {
    const center = nodeScreen(a, view, size)
    const hit = hitTestGraph(graph, { x: center.cx, y: center.cy }, view, size, 16)
    expect(hit).toMatchObject({ part: 'node', targetId: a.id })
    // 边缘外 2px 内仍命中
    const nearEdge = hitTestGraph(
      graph,
      { x: center.cx + center.radius + 1, y: center.cy },
      view,
      size,
      16,
    )
    expect(nearEdge).toMatchObject({ part: 'node', targetId: a.id })
  })

  it('边命中与未命中', () => {
    const midX = (nodeScreen(a, view, size).cx + nodeScreen(b, view, size).cx) / 2
    const onEdge = hitTestGraph(graph, { x: midX, y: 300 + 3 }, view, size, 16)
    expect(onEdge).toMatchObject({ part: 'edge', targetId: edge.id })
    expect(onEdge!.distancePx).toBeCloseTo(3, 6)

    const miss = hitTestGraph(graph, { x: midX, y: 300 + 40 }, view, size, 16)
    expect(miss).toBeNull()
  })

  it('自环可命中', () => {
    const loop = createEdge(a.id, a.id)
    const loopGraph = { nodes: [a], edges: [loop] }
    const s = nodeScreen(a, view, size)
    // 环中心大约在节点右上方
    const loopCenter = { x: s.cx + s.radius * 0.9, y: s.cy - s.radius * 0.9 }
    const radius = s.radius * 1.9
    const hit = hitTestGraph(
      loopGraph,
      { x: loopCenter.x + radius, y: loopCenter.y },
      view,
      size,
      16,
    )
    expect(hit).toMatchObject({ part: 'edge', targetId: loop.id })
  })
})
