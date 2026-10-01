import { describe, expect, it } from 'vitest'
import { type ExplicitSampleOptions, sampleExplicit } from './adaptive'
import { MAX_EVALUATIONS, qualityToTuning } from './types'
import { createView, mathToScreen, screenToMath, viewBounds } from '../../core/transform'
import type { Point2, ViewTransform } from '../../state/types'

const size = { width: 1200, height: 800 }

/** 与生产调用一致：采样范围取自视图可见范围（默认约 ±7.5） */
function makeOptions(view: ViewTransform, quality = 3): ExplicitSampleOptions {
  const tuning = qualityToTuning(quality)
  const bounds = viewBounds(view, size)
  return {
    ...tuning,
    xMin: bounds.minX,
    xMax: bounds.maxX,
    widthPx: size.width,
    heightPx: size.height,
    screenX: (x) => mathToScreen(view, size, { x, y: 0 }).x,
    screenY: (y) => mathToScreen(view, size, { x: 0, y }).y,
    screenToMathX: (sx) => screenToMath(view, size, { x: sx, y: 0 }).x,
  }
}

const proj = (view: ViewTransform, p: Point2): Point2 => mathToScreen(view, size, p)

/** 所有点（平铺） */
function allPoints(segments: Point2[][]): Point2[] {
  return segments.flat()
}

/** 某段内点的 x 是否单调不减 */
function isMonotonicX(segment: Point2[]): boolean {
  for (let i = 1; i < segment.length; i++) {
    const a = segment[i - 1] as Point2
    const b = segment[i] as Point2
    if (b.x < a.x - 1e-12) return false
  }
  return true
}

/** 检查折线逼近质量：相邻点中点处真实曲线偏离弦 < 3 倍容差 */
function checkApproximation(
  view: ViewTransform,
  f: (x: number) => number,
  segment: Point2[],
  maxDist = 1.5,
): void {
  for (let i = 1; i < segment.length; i++) {
    const a = segment[i - 1] as Point2
    const b = segment[i] as Point2
    const xm = (a.x + b.x) / 2
    const real = proj(view, { x: xm, y: f(xm) })
    const sa = proj(view, a)
    const sb = proj(view, b)
    const dx = sb.x - sa.x
    const dy = sb.y - sa.y
    const len2 = dx * dx + dy * dy
    if (len2 === 0) continue
    let t = ((real.x - sa.x) * dx + (real.y - sa.y) * dy) / len2
    t = Math.min(1, Math.max(0, t))
    const dist = Math.hypot(real.x - (sa.x + t * dx), real.y - (sa.y + t * dy))
    expect(dist).toBeLessThan(maxDist)
  }
}

describe('samplers/adaptive: 基本形状', () => {
  it('直线：不细分（点少）、单段、无渐近线', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit((x) => 2 * x + 1, makeOptions(view))
    expect(result.segments).toHaveLength(1)
    expect(result.asymptoteXs).toHaveLength(0)
    // 种子约 100 个；直线无需细分
    expect(result.evaluations).toBeLessThan(1500)
    expect(result.segments[0]?.length ?? 0).toBeLessThan(600)
  })

  it('sin(x)：单段、点按 x 单调、无渐近线，采样加密到容差内', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit(Math.sin, makeOptions(view))
    expect(result.segments).toHaveLength(1)
    expect(result.asymptoteXs).toHaveLength(0)
    const seg = result.segments[0] as Point2[]
    expect(isMonotonicX(seg)).toBe(true)
    expect(result.evaluations).toBeGreaterThan(100)
    expect(result.evaluations).toBeLessThan(20000)
    checkApproximation(view, Math.sin, seg)
  })
})

describe('samplers/adaptive: 渐近线断开（tan / 1/(x²-1)）', () => {
  it('tan(x)：在 ±π/2 处断开、记录渐近线，不出现跨渐近线的连线', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit(Math.tan, makeOptions(view))

    const near = (target: number): boolean =>
      result.asymptoteXs.some((x) => Math.abs(x - target) < 0.02)
    expect(near(Math.PI / 2)).toBe(true)
    expect(near(-Math.PI / 2)).toBe(true)

    // 视口 ±7.5 内含 4 条渐近线（±π/2、±3π/2），至少 5 段
    expect(result.segments.length).toBeGreaterThanOrEqual(5)

    for (const seg of result.segments) {
      const xs = seg.map((p) => p.x)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      for (const a of [Math.PI / 2, -Math.PI / 2]) {
        const spans = minX < a - 0.05 && maxX > a + 0.05
        expect(spans).toBe(false)
      }
    }
  })

  it('1/(x²-1)：±1 处两条渐近线，均断开', () => {
    const view = createView(0, 0, 80)
    const f = (x: number): number => 1 / (x * x - 1)
    const result = sampleExplicit(f, makeOptions(view))

    const near = (target: number): boolean =>
      result.asymptoteXs.some((x) => Math.abs(x - target) < 0.02)
    expect(near(1)).toBe(true)
    expect(near(-1)).toBe(true)
    expect(result.segments.length).toBeGreaterThanOrEqual(3)

    for (const seg of result.segments) {
      const xs = seg.map((p) => p.x)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      expect(minX < 1 - 0.05 && maxX > 1 + 0.05).toBe(false)
      expect(minX < -1 - 0.05 && maxX > -1 + 0.05).toBe(false)
    }
  })
})

describe('samplers/adaptive: 域边界（sqrt / ln）', () => {
  it('sqrt(x)：x<0 完全不绘制，逼近 0 边界', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit(Math.sqrt, makeOptions(view))
    const points = allPoints(result.segments)
    expect(points.length).toBeGreaterThan(10)
    for (const p of points) expect(p.x).toBeGreaterThanOrEqual(0)
    const minX = Math.min(...points.map((p) => p.x))
    expect(minX).toBeLessThan(1e-3)
    expect(result.asymptoteXs).toHaveLength(0)
  })

  it('ln(x)：x≤0 完全不绘制', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit(Math.log, makeOptions(view))
    const points = allPoints(result.segments)
    expect(points.length).toBeGreaterThan(10)
    for (const p of points) {
      expect(p.x).toBeGreaterThan(0)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })
})

describe('samplers/adaptive: 台阶与跳跃（floor / abs(x)/x）', () => {
  it('floor(x)：台阶处垂直接线（不斜切、不断开）', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit(Math.floor, makeOptions(view))
    expect(result.segments).toHaveLength(1)
    const seg = result.segments[0] as Point2[]

    let vertical = 0
    for (let i = 1; i < seg.length; i++) {
      const a = seg[i - 1] as Point2
      const b = seg[i] as Point2
      if (Math.abs(b.x - a.x) < 0.05 && Math.abs(Math.abs(b.y - a.y) - 1) < 0.05) vertical++
    }
    expect(vertical).toBeGreaterThanOrEqual(4)

    // 所有点的 y 都是整数（台阶平段来自函数值本身）
    for (const p of seg) expect(Math.abs(p.y - Math.round(p.y))).toBeLessThan(1e-9)
  })

  it('abs(x)/x：x=0 处断开（不是从 -1 直连到 1）', () => {
    const view = createView(0, 0, 80)
    const f = (x: number): number => Math.abs(x) / x
    const result = sampleExplicit(f, makeOptions(view))
    expect(result.segments.length).toBeGreaterThanOrEqual(2)

    for (const seg of result.segments) {
      const xs = seg.map((p) => p.x)
      // 没有任何一段同时包含 x<0 与 x>0 的点
      expect(Math.min(...xs) < -1e-6 && Math.max(...xs) > 1e-6).toBe(false)
      // 各段的 y 恒定在 -1 或 +1
      const ys = seg.map((p) => p.y)
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.2)
    }
    const hasNegative = result.segments.some((seg) => (seg[0] as Point2).x < 0)
    const hasPositive = result.segments.some((seg) => (seg[seg.length - 1] as Point2).x > 0)
    expect(hasNegative).toBe(true)
    expect(hasPositive).toBe(true)
  })
})

describe('samplers/adaptive: 高频振荡（sin(1/x) / x*sin(1/x)）', () => {
  it('sin(1/x)：0 附近高频振荡被捕捉，且不超预算、不死循环', () => {
    const view = createView(0, 0, 80)
    const t0 = performance.now()
    const result = sampleExplicit((x) => Math.sin(1 / x), makeOptions(view))
    const elapsed = performance.now() - t0

    const points = allPoints(result.segments)
    const dense = points.filter((p) => Math.abs(p.x) < 0.02).length
    expect(dense).toBeGreaterThan(30)
    expect(result.evaluations).toBeLessThanOrEqual(MAX_EVALUATIONS + 1000)
    expect(elapsed).toBeLessThan(300)
  })

  it('x*sin(1/x)：在 0 附近收敛到 0，且振荡可见', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit((x) => x * Math.sin(1 / x), makeOptions(view))
    const points = allPoints(result.segments)
    const near = points.filter((p) => Math.abs(p.x) < 0.05)
    expect(near.length).toBeGreaterThan(10)
    for (const p of near) expect(Math.abs(p.y)).toBeLessThan(0.06)
  })
})

describe('samplers/adaptive: 极端缩放与退化输入', () => {
  it('x² 在 x∈[1e5, 1e5+10]：极端偏移下仍能画出且保精度', () => {
    const f = (x: number): number => x * x
    const view: ViewTransform = {
      ...createView(100005, f(100005), 80),
      equalAspect: false,
      scaleX: 120, // 可见 ±5 → [1e5, 1e5+10]
      scaleY: 3e-4, // 2e6 的 y 跨度 → 600px
    }
    const result = sampleExplicit(f, makeOptions(view, 4))
    const points = allPoints(result.segments)
    expect(points.length).toBeGreaterThan(20)
    checkApproximation(view, f, result.segments[0] as Point2[])
  })

  it('恒 NaN / 恒 Infinity 的函数：安全返回空结果', () => {
    const view = createView(0, 0, 80)
    const nan = sampleExplicit(() => Number.NaN, makeOptions(view))
    expect(nan.segments).toHaveLength(0)
    const inf = sampleExplicit(() => Number.POSITIVE_INFINITY, makeOptions(view))
    expect(inf.segments).toHaveLength(0)
  })

  it('1/x：x=0 处记录渐近线并断开', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit((x) => 1 / x, makeOptions(view))
    expect(result.asymptoteXs.some((x) => Math.abs(x) < 0.02)).toBe(true)
    for (const seg of result.segments) {
      const xs = seg.map((p) => p.x)
      expect(Math.min(...xs) < -1e-6 && Math.max(...xs) > 1e-6).toBe(false)
    }
  })

  it('对数坐标：不可绘制（≤0）的值自动断开，只画正域分支', () => {
    const view = { ...createView(1, 1, 80), coordType: 'log' as const }
    const result = sampleExplicit((x) => x - 0.9, makeOptions(view))
    const points = allPoints(result.segments)
    expect(points.length).toBeGreaterThan(5)
    for (const p of points) {
      expect(p.x).toBeGreaterThan(0)
      expect(p.y).toBeGreaterThan(0)
    }
    const minX = Math.min(...points.map((p) => p.x))
    expect(minX).toBeGreaterThan(0.85)
  })

  it('sin(1/x) 高精度档：亚像素弦早停，采样量受控（不触碰预算上限）', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit((x) => Math.sin(1 / x), makeOptions(view, 5))
    expect(result.evaluations).toBeLessThanOrEqual(MAX_EVALUATIONS)
    expect(result.evaluations).toBeGreaterThan(200)
  })

  it('退化范围（xMin = xMax）安全返回', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit((x) => x * x, { ...makeOptions(view), xMin: 3, xMax: 3 })
    expect(result.evaluations).toBeGreaterThan(0)
    expect(result.segments.length).toBeLessThanOrEqual(1)
  })

  it('右侧域边界：sqrt(-x) 在 x>0 不绘制，逼近 0', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit((x) => Math.sqrt(-x), makeOptions(view))
    const points = allPoints(result.segments)
    expect(points.length).toBeGreaterThan(10)
    for (const p of points) expect(p.x).toBeLessThanOrEqual(0)
    const maxX = Math.max(...points.map((p) => p.x))
    expect(maxX).toBeGreaterThan(-1e-3)
  })

  it('低精度（浅深度上限）：1/(x-a) 在深度用尽处断开并记录渐近线', () => {
    const view = createView(0, 0, 80)
    const result = sampleExplicit((x) => 1 / (x - 0.123456789), makeOptions(view, 1))
    expect(result.asymptoteXs.some((x) => Math.abs(x - 0.123456789) < 0.01)).toBe(true)
    for (const seg of result.segments) {
      const xs = seg.map((p) => p.x)
      const spans = Math.min(...xs) < 0.123456789 - 0.001 && Math.max(...xs) > 0.123456789 + 0.001
      expect(spans).toBe(false)
    }
  })

  it('二分中点恰好命中奇点（f=±Infinity）时仍正确分段', () => {
    // 0 与 0.15 均为种子点时，其中点 0.075 恰好是奇点 → 覆盖 locateJump 的非有限分支
    const view = createView(0, 0, 80)
    const result = sampleExplicit((x) => 1 / (x - 0.075), makeOptions(view))
    expect(result.asymptoteXs.some((x) => Math.abs(x - 0.075) < 0.01)).toBe(true)
    for (const seg of result.segments) {
      const xs = seg.map((p) => p.x)
      expect(Math.min(...xs) < 0.074 && Math.max(...xs) > 0.076).toBe(false)
    }
  })

  it('性能：sin(x) 单次采样 < 16 ms', () => {
    const view = createView(0, 0, 80)
    const options = makeOptions(view)
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      sampleExplicit(Math.sin, options)
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(16)
  })
})

describe('samplers/adaptive: 质量档位', () => {
  it('quality 1..5 容差递减、深度递增', () => {
    const q1 = qualityToTuning(1)
    const q5 = qualityToTuning(5)
    expect(q1.tolerancePx).toBeGreaterThan(q5.tolerancePx)
    expect(q1.maxDepth).toBeLessThan(q5.maxDepth)
    // 越界自动收敛
    expect(qualityToTuning(0)).toEqual(q1)
    expect(qualityToTuning(99)).toEqual(q5)
  })

  it('高精度档位产生更多采样点', () => {
    const view = createView(0, 0, 80)
    const low = sampleExplicit(Math.sin, makeOptions(view, 1))
    const high = sampleExplicit(Math.sin, makeOptions(view, 5))
    expect(high.evaluations).toBeGreaterThanOrEqual(low.evaluations)
  })
})
