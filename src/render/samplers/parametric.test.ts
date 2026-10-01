import { describe, expect, it } from 'vitest'
import { parametricSeedCount, sampleParametric, samplePolar } from './parametric'
import { qualityToTuning } from './types'
import { createView, mathToScreen } from '../../core/transform'
import type { Point2, ViewTransform } from '../../state/types'

const size = { width: 1200, height: 800 }

function makeOptions(
  view: ViewTransform,
  tMin: number,
  tMax: number,
  quality = 3,
): Parameters<typeof sampleParametric>[2] {
  const tuning = qualityToTuning(quality)
  return {
    ...tuning,
    tMin,
    tMax,
    project: (p: Point2) => mathToScreen(view, size, p),
  }
}

const proj = (view: ViewTransform, p: Point2): Point2 => mathToScreen(view, size, p)

describe('samplers/parametric: 形状正确性', () => {
  it('圆 (cos t, sin t)：单段、闭合、逼近质量达标', () => {
    const view = createView(0, 0, 80)
    const result = sampleParametric(Math.cos, Math.sin, makeOptions(view, 0, 2 * Math.PI))
    expect(result.segments).toHaveLength(1)
    expect(result.asymptoteXs).toHaveLength(0)
    const seg = result.segments[0] as Point2[]
    expect(seg.length).toBeGreaterThan(30)

    const first = seg[0] as Point2
    const last = seg[seg.length - 1] as Point2
    expect(Math.abs(first.x - last.x)).toBeLessThan(1e-9)
    expect(Math.abs(first.y - last.y)).toBeLessThan(1e-9)

    // 所有点严格在单位圆上（来自函数值本身）
    for (const p of seg) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 1)).toBeLessThan(1e-9)
    }

    // 逼近质量：用参数中点重建（不使用内部 t，粗略检查相邻点弦）
    for (let i = 1; i < seg.length; i++) {
      const a = proj(view, seg[i - 1] as Point2)
      const b = proj(view, seg[i] as Point2)
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(40)
    }
  })

  it('抛物线 (t, t²)：单段且 x 单调', () => {
    const view = createView(0, 0, 60)
    const result = sampleParametric(
      (t) => t,
      (t) => t * t,
      makeOptions(view, -3, 3),
    )
    expect(result.segments).toHaveLength(1)
    const seg = result.segments[0] as Point2[]
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1] as Point2
      const b = seg[i] as Point2
      expect(b.x).toBeGreaterThanOrEqual(a.x - 1e-12)
    }
  })

  it('中间参数区间非有限：正确断开为多段', () => {
    const view = createView(0, 0, 60)
    const fx = (t: number): number => (t > 1 && t < 2 ? Number.NaN : t)
    const fy = (t: number): number => t
    const result = sampleParametric(fx, fy, makeOptions(view, 0, 3))
    expect(result.segments.length).toBeGreaterThanOrEqual(2)
    for (const seg of result.segments) {
      for (const p of seg) {
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
      }
    }
    const hasLeft = result.segments.some((seg) => (seg[0] as Point2).x < 1)
    const hasRight = result.segments.some((seg) => (seg[seg.length - 1] as Point2).x > 2)
    expect(hasLeft).toBe(true)
    expect(hasRight).toBe(true)
  })

  it('螺旋 (t·cos t, t·sin t)：长参数跨度不崩溃、单段、半径递增', () => {
    const view = createView(0, 0, 10)
    const result = sampleParametric(
      (t) => t * Math.cos(t),
      (t) => t * Math.sin(t),
      makeOptions(view, 0, 6 * Math.PI),
    )
    expect(result.segments).toHaveLength(1)
    const seg = result.segments[0] as Point2[]
    expect(seg.length).toBeGreaterThan(200)
    const last = seg[seg.length - 1] as Point2
    expect(Math.hypot(last.x, last.y)).toBeCloseTo(6 * Math.PI, 1)
  })

  it('投影失败（如 log 域外）的点不绘制', () => {
    const tuning = qualityToTuning(3)
    const result = sampleParametric(
      (t) => t,
      (t) => t,
      {
        ...tuning,
        tMin: -2,
        tMax: 2,
        project: (p: Point2) =>
          p.x <= 0 ? { x: Number.NaN, y: Number.NaN } : { x: p.x * 10, y: -p.y * 10 },
      },
    )
    expect(result.segments.length).toBeGreaterThan(0)
    for (const seg of result.segments) {
      for (const p of seg) expect(p.x).toBeGreaterThan(0)
    }
  })

  it('退化参数范围：空结果', () => {
    const view = createView(0, 0, 80)
    expect(sampleParametric(Math.cos, Math.sin, makeOptions(view, 1, 1)).segments).toHaveLength(0)
    expect(sampleParametric(Math.cos, Math.sin, makeOptions(view, 2, 1)).segments).toHaveLength(0)
  })

  it('种子数随参数跨度增长且有上限', () => {
    expect(parametricSeedCount(0, 2 * Math.PI)).toBe(128)
    expect(parametricSeedCount(0, 20 * Math.PI)).toBeGreaterThan(128)
    expect(parametricSeedCount(0, 1e6)).toBe(1024)
  })
})

describe('samplers/parametric: 极坐标', () => {
  it('心形线 r=1+cos(θ)：闭合、单段、在合理范围内', () => {
    const view = createView(0, 0, 80)
    const result = samplePolar((t) => 1 + Math.cos(t), makeOptions(view, 0, 2 * Math.PI))
    expect(result.segments).toHaveLength(1)
    const seg = result.segments[0] as Point2[]
    const first = seg[0] as Point2
    const last = seg[seg.length - 1] as Point2
    expect(Math.abs(first.x - last.x)).toBeLessThan(1e-9)
    expect(Math.abs(first.y - last.y)).toBeLessThan(1e-9)
    for (const p of seg) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(2.01)
      // y = (1+cosθ)sinθ 的最大绝对值约为 1.299（θ = π/3）
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1.31)
    }
  })

  it('四叶玫瑰 r=cos(2θ)：全部落在单位圆内', () => {
    const view = createView(0, 0, 120)
    const result = samplePolar((t) => Math.cos(2 * t), makeOptions(view, 0, 2 * Math.PI))
    expect(result.segments).toHaveLength(1)
    for (const seg of result.segments) {
      for (const p of seg) {
        expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1.0000001)
      }
    }
  })

  it('r=1/θ：θ→0 处非有限，安全处理并保留有限点', () => {
    const view = createView(0, 0, 80)
    const result = samplePolar((t) => 1 / t, makeOptions(view, 0, 2 * Math.PI))
    expect(result.segments.length).toBeGreaterThanOrEqual(1)
    for (const seg of result.segments) {
      for (const p of seg) {
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
      }
    }
  })
})

describe('samplers/parametric: 性能', () => {
  it('圆单次采样 < 16 ms', () => {
    const view = createView(0, 0, 80)
    const options = makeOptions(view, 0, 2 * Math.PI)
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      sampleParametric(Math.cos, Math.sin, options)
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(16)
  })
})
