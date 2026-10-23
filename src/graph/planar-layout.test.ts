/**
 * v3.2 平面嵌入布局测试：C4/K4/3×3 网格 无交叉；K5/K3,3 非平面报错；树/不连通报错。
 */
import { describe, expect, it } from 'vitest'
import { layoutPlanarGraph } from './planar-layout'
import { createEdge, createNode, type GraphObject } from './model'

function makeGraph(labels: string[], edges: [string, string][]): GraphObject {
  const nodes = labels.map((label, i) => createNode(label, i, 0, '#2563eb'))
  const byLabel = new Map(nodes.map((node) => [node.label, node]))
  return {
    id: 'g',
    type: 'graph',
    name: 'g',
    visible: true,
    nodes,
    edges: edges.map(([a, b]) => createEdge(byLabel.get(a)!.id, byLabel.get(b)!.id)),
  }
}

interface Point {
  x: number
  y: number
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function properCrossing(p: Point, q: Point, r: Point, s: Point): boolean {
  const d1 = cross(p.x, p.y, q.x, q.y, r.x, r.y)
  const d2 = cross(p.x, p.y, q.x, q.y, s.x, s.y)
  const d3 = cross(r.x, r.y, s.x, s.y, p.x, p.y)
  const d4 = cross(r.x, r.y, s.x, s.y, q.x, q.y)
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9
}

function countCrossings(
  graph: GraphObject,
  positions: { id: string; x: number; y: number }[],
): number {
  const at = new Map(positions.map((position) => [position.id, position]))
  const segments = graph.edges
    .map((edge) => [at.get(edge.source)!, at.get(edge.target)!] as [Point, Point])
    .filter(([a, b]) => a && b)
  let crossings = 0
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const [a, b] = segments[i]!
      const [c, d] = segments[j]!
      // 共享端点跳过
      const shared = a === c || a === d || b === c || b === d
      if (shared) continue
      if (properCrossing(a, b, c, d)) crossings++
    }
  }
  return crossings
}

describe('v3.2 平面嵌入布局（Tutte）', () => {
  it('C4：正方形（四点在半径 3 的圆上），无交叉', () => {
    const c4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['D', 'A'],
      ],
    )
    const result = layoutPlanarGraph(c4)
    console.log('C4 layout:', JSON.stringify(result))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.positions).toHaveLength(4)
    for (const position of result.positions) {
      expect(Math.hypot(position.x, position.y)).toBeCloseTo(3, 6)
    }
    expect(countCrossings(c4, result.positions)).toBe(0)
  })

  it('K4：三角形外表面 + 中心内部点，无交叉', () => {
    const k4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['A', 'C'],
        ['A', 'D'],
        ['B', 'C'],
        ['B', 'D'],
        ['C', 'D'],
      ],
    )
    const result = layoutPlanarGraph(k4)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(countCrossings(k4, result.positions)).toBe(0)
    // 存在一个内部点（半径明显小于 3）
    expect(result.positions.some((position) => Math.hypot(position.x, position.y) < 2.9)).toBe(true)
  })

  it('3×3 网格：无交叉，内部点不越界', () => {
    const labels = Array.from({ length: 9 }, (_, i) => `n${i}`)
    const edges: [string, string][] = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const id = row * 3 + col
        if (col < 2) edges.push([`n${id}`, `n${id + 1}`])
        if (row < 2) edges.push([`n${id}`, `n${id + 3}`])
      }
    }
    const grid = makeGraph(labels, edges)
    const result = layoutPlanarGraph(grid)
    console.log('GRID layout:', JSON.stringify(result))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(countCrossings(grid, result.positions)).toBe(0)
    for (const position of result.positions) {
      expect(Math.hypot(position.x, position.y)).toBeLessThanOrEqual(3.001)
    }
  })

  it('K5 / K3,3：非平面图给出明确错误', () => {
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
    const k5Result = layoutPlanarGraph(k5)
    expect(k5Result.ok).toBe(false)
    if (!k5Result.ok) expect(k5Result.error).toContain('非平面')

    const k33 = makeGraph(
      ['1', '2', '3', '4', '5', '6'],
      [
        ['1', '4'],
        ['1', '5'],
        ['1', '6'],
        ['2', '4'],
        ['2', '5'],
        ['2', '6'],
        ['3', '4'],
        ['3', '5'],
        ['3', '6'],
      ],
    )
    const k33Result = layoutPlanarGraph(k33)
    expect(k33Result.ok).toBe(false)
  })

  it('树（P4）与不连通图：给出明确错误', () => {
    const p4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ],
    )
    const tree = layoutPlanarGraph(p4)
    expect(tree.ok).toBe(false)
    if (!tree.ok) expect(tree.error).toMatch(/割点|树|连通/)

    const disconnected = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['C', 'D'],
      ],
    )
    const result = layoutPlanarGraph(disconnected)
    expect(result.ok).toBe(false)
  })
})
