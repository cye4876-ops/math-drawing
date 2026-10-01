import { describe, expect, it } from 'vitest'
import { nearestPointOnPolylines } from './nearest'
import { sampleExplicit } from '../../render/samplers/adaptive'
import { sampleParametric } from '../../render/samplers/parametric'
import { qualityToTuning } from '../../render/samplers/types'
import { createView, mathToScreen, screenToMath } from '../../core/transform'
import type { Point2, Size, ViewTransform } from '../../state/types'

const size: Size = { width: 1200, height: 800 }

function project(view: ViewTransform): (p: Point2) => Point2 {
  return (p) => mathToScreen(view, size, p)
}

describe('numeric/nearest: 折线最近点', () => {
  it('显函数 sin(x)：光标靠近曲线时吸附到最近点（t = x）', () => {
    const view = createView(0, 0, 80)
    const polyline = sampleExplicit(Math.sin, {
      ...qualityToTuning(3),
      xMin: -7.5,
      xMax: 7.5,
      widthPx: size.width,
      heightPx: size.height,
      screenX: (x) => mathToScreen(view, size, { x, y: 0 }).x,
      screenY: (y) => mathToScreen(view, size, { x: 0, y }).y,
      screenToMathX: (sx) => screenToMath(view, size, { x: sx, y: 0 }).x,
    })
    // 目标点：x = 1 处曲线点上方 3px
    const anchor = mathToScreen(view, size, { x: 1, y: Math.sin(1) })
    const target = { x: anchor.x, y: anchor.y - 3 }
    const hit = nearestPointOnPolylines(polyline.segments, project(view), target)
    expect(hit).not.toBeNull()
    expect(Math.abs((hit as { x: number }).x - 1)).toBeLessThan(0.02)
    expect(Math.abs((hit as { y: number }).y - Math.sin(1))).toBeLessThan(0.02)
    expect(Math.abs((hit as { t: number }).t - (hit as { x: number }).x)).toBeLessThan(1e-9)
  })

  it('参数方程圆：多值曲线上正确吸附（同 x 取点会失效的场景）', () => {
    const view = createView(0, 0, 80)
    const polyline = sampleParametric(Math.cos, Math.sin, {
      ...qualityToTuning(3),
      tMin: 0,
      tMax: 2 * Math.PI,
      project: project(view),
    })
    // 圆最上点：θ = π/2
    const anchor = mathToScreen(view, size, { x: 0, y: 1 })
    const target = { x: anchor.x + 2, y: anchor.y }
    const hit = nearestPointOnPolylines(polyline.segments, project(view), target)
    expect(hit).not.toBeNull()
    expect(Math.abs((hit as { x: number }).x)).toBeLessThan(0.05)
    expect(Math.abs((hit as { y: number }).y - 1)).toBeLessThan(0.02)
    expect(Math.abs((hit as { t: number }).t - Math.PI / 2)).toBeLessThan(0.05)
  })

  it('最大距离过滤：超出阈值返回 null', () => {
    const view = createView(0, 0, 80)
    const polyline = sampleExplicit((x) => x, {
      ...qualityToTuning(3),
      xMin: -7.5,
      xMax: 7.5,
      widthPx: size.width,
      heightPx: size.height,
      screenX: (x) => mathToScreen(view, size, { x, y: 0 }).x,
      screenY: (y) => mathToScreen(view, size, { x: 0, y }).y,
      screenToMathX: (sx) => screenToMath(view, size, { x: sx, y: 0 }).x,
    })
    const origin = mathToScreen(view, size, { x: 0, y: 0 })
    const far = { x: origin.x, y: origin.y - 500 }
    expect(nearestPointOnPolylines(polyline.segments, project(view), far, 10)).toBeNull()
    expect(nearestPointOnPolylines(polyline.segments, project(view), far, 1000)).not.toBeNull()
  })

  it('空折线与单点段安全处理', () => {
    expect(nearestPointOnPolylines([], project(createView()), { x: 0, y: 0 })).toBeNull()
    const single = nearestPointOnPolylines(
      [[{ x: 2, y: 3 }]],
      project(createView(0, 0, 80)),
      mathToScreen(createView(0, 0, 80), size, { x: 2, y: 3 }),
    )
    expect(single?.x).toBe(2)
  })

  it('性能：sin(x) 折线单次吸附 < 1 ms', () => {
    const view = createView(0, 0, 80)
    const polyline = sampleExplicit(Math.sin, {
      ...qualityToTuning(3),
      xMin: -7.5,
      xMax: 7.5,
      widthPx: size.width,
      heightPx: size.height,
      screenX: (x) => mathToScreen(view, size, { x, y: 0 }).x,
      screenY: (y) => mathToScreen(view, size, { x: 0, y }).y,
      screenToMathX: (sx) => screenToMath(view, size, { x: sx, y: 0 }).x,
    })
    const target = mathToScreen(view, size, { x: 1, y: 1 })
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now()
      nearestPointOnPolylines(polyline.segments, project(view), target)
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(1)
  })
})
