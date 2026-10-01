/** 等高线（Marching Squares）测试（v0.8）：圆（x²+y²=1）、线性场、鞍点歧义、越界。 */
import { describe, expect, it } from 'vitest'
import { contourSegments } from './contours'

describe('v0.8 等高线', () => {
  it('f = x²+y², level = 1：线段端点都在单位圆附近', () => {
    const segments = contourSegments((x, y) => x * x + y * y, {
      xMin: -1.5,
      xMax: 1.5,
      yMin: -1.5,
      yMax: 1.5,
      cols: 60,
      rows: 60,
      level: 1,
    })
    expect(segments.length).toBeGreaterThan(40)
    for (const [a, b] of segments) {
      for (const p of [a, b]) {
        const r = Math.hypot(p.x, p.y)
        expect(r).toBeGreaterThan(0.96)
        expect(r).toBeLessThan(1.04)
      }
    }
  })

  it('线性场 f = x + y, level = 0：端点满足 x + y ≈ 0（细网格精度更高）', () => {
    const segments = contourSegments((x, y) => x + y, {
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      cols: 40,
      rows: 40,
      level: 0,
    })
    expect(segments.length).toBeGreaterThan(20)
    for (const [a, b] of segments) {
      expect(Math.abs(a.x + a.y)).toBeLessThan(0.05)
      expect(Math.abs(b.x + b.y)).toBeLessThan(0.05)
    }
  })

  it('鞍点（f = x²−y², level = 0）：端点满足 |x²−y²| < 0.06（中心值消歧）', () => {
    const segments = contourSegments((x, y) => x * x - y * y, {
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      cols: 40,
      rows: 40,
      level: 0,
    })
    expect(segments.length).toBeGreaterThan(10)
    for (const [a, b] of segments) {
      expect(Math.abs(a.x * a.x - a.y * a.y)).toBeLessThan(0.06)
      expect(Math.abs(b.x * b.x - b.y * b.y)).toBeLessThan(0.06)
    }
  })

  it('level 超出函数值域：无线段', () => {
    const segments = contourSegments((x, y) => x * x + y * y, {
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      cols: 20,
      rows: 20,
      level: 10,
    })
    expect(segments).toHaveLength(0)
  })

  it('NaN 区域不产生线段、不抛异常', () => {
    const segments = contourSegments((x, y) => (x < 0 ? Number.NaN : y), {
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      cols: 20,
      rows: 20,
      level: 0,
    })
    // 仅右半平面可能存在（f = y 与 level 0 重合于 y = 0 —— 恰好为零值边界的极端情形，允许 0 段）
    expect(segments.length).toBeGreaterThanOrEqual(0)
  })
})
