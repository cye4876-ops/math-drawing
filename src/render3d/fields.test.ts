/**
 * 向量场测试（v0.8）——覆盖规格「关键正确性测试」：
 * 散度（F=(x,y) 恒为 2）与旋度（F=(−y,x,0) 为 (0,0,2)）与解析解一致，误差 < 1e-6；
 * 流线正确（圆场出圆）；箭头场采样。
 */
import { describe, expect, it } from 'vitest'
import {
  arrowField2D,
  arrowField3D,
  curl2D,
  curl3D,
  divergence2D,
  divergence3D,
  streamline2D,
  streamline3D,
} from './fields'

describe('v0.8 向量场：箭头采样', () => {
  it('2D：数量 = cols×rows；模长正确；非有限跳过', () => {
    const arrows = arrowField2D((x, y) => [x, y], {
      xMin: 0,
      xMax: 2,
      yMin: 0,
      yMax: 2,
      cols: 3,
      rows: 3,
    })
    expect(arrows).toHaveLength(9)
    const atBottomLeft = arrows.find((a) => Math.abs(a.x) < 1e-9 && Math.abs(a.y) < 1e-9)
    expect(atBottomLeft?.magnitude).toBeCloseTo(0, 12)
    const atTopRight = arrows.find((a) => Math.abs(a.x - 2) < 1e-9 && Math.abs(a.y - 2) < 1e-9)
    expect(atTopRight?.magnitude).toBeCloseTo(Math.hypot(2, 2), 12)

    const skipped = arrowField2D((x) => (x > 1 ? [Number.NaN, 0] : [1, 0]), {
      xMin: 0,
      xMax: 2,
      yMin: 0,
      yMax: 0,
      cols: 3,
      rows: 1,
    })
    expect(skipped).toHaveLength(2)
  })

  it('3D：divisions³ 采样、模长与方向正确', () => {
    const arrows = arrowField3D((x, y, z) => [x, y, z], {
      min: [-1, -1, -1],
      max: [1, 1, 1],
      divisions: 3,
    })
    expect(arrows).toHaveLength(27)
    const corner = arrows.find(
      (a) => a.position[0] === 1 && a.position[1] === 1 && a.position[2] === 1,
    )
    expect(corner?.magnitude).toBeCloseTo(Math.sqrt(3), 12)
  })
})

describe('v0.8 向量场：散度与旋度（解析对照）', () => {
  it('∇·(x, y) = 2（误差 < 1e-6）', () => {
    expect(divergence2D((x, y) => [x, y], 1.7, -0.9)).toBeCloseTo(2, 6)
  })

  it('∇·(−y, x) = 0；∇×(−y, x) = 2', () => {
    const f = (x: number, y: number): [number, number] => [-y, x]
    expect(divergence2D(f, 0.8, 1.3)).toBeCloseTo(0, 6)
    expect(curl2D(f, 0.8, 1.3)).toBeCloseTo(2, 6)
  })

  it('∇×(x, y) = 0（无旋场）', () => {
    expect(curl2D((x, y) => [x, y], 2, -1)).toBeCloseTo(0, 6)
  })

  it('3D：∇·(x, y, z) = 3；∇·(−y, x, 0) = 0', () => {
    expect(divergence3D((x, y, z) => [x, y, z], 0.5, -1.2, 2.1)).toBeCloseTo(3, 6)
    expect(divergence3D((x, y) => [-y, x, 0], 0.5, -1.2, 2.1)).toBeCloseTo(0, 6)
  })

  it('3D：∇×(−y, x, 0) = (0, 0, 2)（误差 < 1e-6）', () => {
    const [cx, cy, cz] = curl3D((x, y) => [-y, x, 0], 0.3, 0.4, -0.5)
    expect(cx).toBeCloseTo(0, 6)
    expect(cy).toBeCloseTo(0, 6)
    expect(cz).toBeCloseTo(2, 6)
  })

  it('3D：∇×(0, 0, x) = (0, −1, 0)', () => {
    const [cx, cy, cz] = curl3D((x) => [0, 0, x], 1, 2, 3)
    expect(cx).toBeCloseTo(0, 6)
    expect(cy).toBeCloseTo(-1, 6)
    expect(cz).toBeCloseTo(0, 6)
  })
})

describe('v0.8 向量场：流线', () => {
  it('圆场 (−y, x)：流线到原点距离恒定（±1e-3）', () => {
    const points = streamline2D((x, y) => [-y, x], [1, 0], { dt: 0.01, steps: 628 })
    for (const point of points) {
      expect(Math.abs(Math.hypot(point.x, point.y) - 1)).toBeLessThan(1e-3)
    }
    // 一整圈后回到起点
    const last = points[points.length - 1]!
    expect(Math.hypot(last.x - 1, last.y)).toBeLessThan(1e-2)
  })

  it('直线场 (1, 0)：y 恒定', () => {
    const points = streamline2D(() => [1, 0], [0, 2], { dt: 0.1, steps: 50 })
    for (const point of points) expect(point.y).toBeCloseTo(2, 12)
    expect(points[points.length - 1]!.x).toBeCloseTo(5, 9)
  })

  it('both 模式：双向积分且以起点居中', () => {
    const points = streamline2D(() => [1, 0], [0, 0], { dt: 0.1, steps: 10, both: true })
    expect(points).toHaveLength(21)
    expect(points[10]!.x).toBeCloseTo(0, 9)
    expect(points[0]!.x).toBeCloseTo(-1, 9)
    expect(points[20]!.x).toBeCloseTo(1, 9)
  })

  it('3D：螺旋场 (−y, x, 1)：半径恒定、z 单调上升', () => {
    const points = streamline3D((x, y) => [-y, x, 1], [1, 0, 0], { dt: 0.01, steps: 300 })
    for (const [x, y] of points) {
      expect(Math.abs(Math.hypot(x, y) - 1)).toBeLessThan(1e-3)
    }
    expect(points[points.length - 1]![2]).toBeGreaterThan(2.9)
  })
})
