import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  createView,
  mathToScreen,
  panBy,
  screenToMath,
  viewBounds,
  zoomAt,
} from './transform'
import type { Size, ViewTransform } from '../state/types'

const size: Size = { width: 1280, height: 720 }

describe('transform: 往返一致性', () => {
  it('mathToScreen 后 screenToMath 应回到原点（误差 < 1e-9）', () => {
    const scales = [0.5, 1, 42, 80, 1234.5]
    const centers = [
      { x: 0, y: 0 },
      { x: 3.5, y: -2.25 },
      { x: 50, y: -75 },
    ]
    const points = [
      { x: 0, y: 0 },
      { x: 1.5, y: -7.25 },
      { x: -3.14159, y: 2.71828 },
      { x: 123.456, y: -0.001 },
    ]
    for (const scale of scales) {
      for (const center of centers) {
        const view: ViewTransform = { centerX: center.x, centerY: center.y, scale }
        for (const p of points) {
          const screen = mathToScreen(view, size, p)
          const back = screenToMath(view, size, screen)
          expect(Math.abs(back.x - p.x)).toBeLessThan(1e-9)
          expect(Math.abs(back.y - p.y)).toBeLessThan(1e-9)
        }
      }
    }
  })

  it('极端量级组合（1e-6 / 1e6 缩放 × 大中心偏移）下保持数值稳定', () => {
    // 说明：屏幕坐标固定量级为 ~1e3，其浮点 ulp（约 1e-13）除以极小 scale 后
    // 会被放大，此时用相对误差衡量稳定性更合理
    const scales = [1e-6, 1e-3, 1e6]
    const centers = [
      { x: 0, y: 0 },
      { x: -1000, y: 1000 },
    ]
    const points = [
      { x: 0, y: 0 },
      { x: -3.14159, y: 2.71828 },
      { x: 123.456, y: -0.001 },
    ]
    for (const scale of scales) {
      for (const center of centers) {
        const view: ViewTransform = { centerX: center.x, centerY: center.y, scale }
        for (const p of points) {
          const screen = mathToScreen(view, size, p)
          const back = screenToMath(view, size, screen)
          expect(Math.abs(back.x - p.x)).toBeLessThan(1e-6 * Math.max(1, Math.abs(p.x)))
          expect(Math.abs(back.y - p.y)).toBeLessThan(1e-6 * Math.max(1, Math.abs(p.y)))
        }
      }
    }
  })

  it('屏幕中心对应视图中心的数学坐标', () => {
    const view = createView(2, -3, 50)
    const center = screenToMath(view, size, { x: size.width / 2, y: size.height / 2 })
    expect(center.x).toBeCloseTo(2, 12)
    expect(center.y).toBeCloseTo(-3, 12)
  })

  it('数学 y 轴向上：屏幕上方向对应更大的 y', () => {
    const view = createView()
    const up = mathToScreen(view, size, { x: 0, y: 1 })
    const down = mathToScreen(view, size, { x: 0, y: -1 })
    expect(up.y).toBeLessThan(down.y)
  })
})

describe('transform: zoomAt 锚点缩放', () => {
  it('锚点对应的数学坐标在缩放前后保持不动', () => {
    const anchors = [
      { x: 100, y: 100 },
      { x: 640, y: 360 },
      { x: 1200, y: 650 },
    ]
    const factors = [1.25, 0.8, 2, 0.5]
    for (const anchor of anchors) {
      let view = createView(2, 3, 80)
      for (const factor of factors) {
        const before = screenToMath(view, size, anchor)
        view = zoomAt(view, size, anchor, factor)
        const after = screenToMath(view, size, anchor)
        expect(Math.abs(after.x - before.x)).toBeLessThan(1e-9)
        expect(Math.abs(after.y - before.y)).toBeLessThan(1e-9)
      }
    }
  })

  it('缩放因子正确作用于 scale', () => {
    const view = createView(0, 0, 80)
    const next = zoomAt(view, size, { x: 640, y: 360 }, 2)
    expect(next.scale).toBeCloseTo(160, 12)
  })

  it('scale 受上下限约束', () => {
    const view = createView(0, 0, 80)
    expect(zoomAt(view, size, { x: 640, y: 360 }, 1e-18).scale).toBe(MIN_SCALE)
    expect(zoomAt(view, size, { x: 640, y: 360 }, 1e18).scale).toBe(MAX_SCALE)
  })
})

describe('transform: panBy 平移', () => {
  it('向左拖动内容 50px 等价于 center 向右移动 50/scale', () => {
    const view = createView(1, 2, 100)
    const next = panBy(view, -50, 0)
    expect(next.centerX).toBeCloseTo(1 + 50 / 100, 12)
    expect(next.centerY).toBeCloseTo(2, 12)
  })

  it('平移往返可回到原视图', () => {
    const view = createView(-4, 6, 33)
    const moved = panBy(panBy(view, 120, -45), -120, 45)
    expect(moved.centerX).toBeCloseTo(view.centerX, 9)
    expect(moved.centerY).toBeCloseTo(view.centerY, 9)
  })
})

describe('transform: clampScale 与 viewBounds', () => {
  it('clampScale 边界行为', () => {
    expect(clampScale(MIN_SCALE / 10)).toBe(MIN_SCALE)
    expect(clampScale(MAX_SCALE * 10)).toBe(MAX_SCALE)
    expect(clampScale(Number.NaN)).toBe(DEFAULT_SCALE)
    expect(clampScale(42)).toBe(42)
  })

  it('viewBounds 与屏幕四角一致', () => {
    const view = createView(0, 0, 80)
    const b = viewBounds(view, size)
    expect(b.maxX).toBeCloseTo(1280 / 2 / 80, 12)
    expect(b.maxY).toBeCloseTo(720 / 2 / 80, 12)
    expect(b.minX).toBeCloseTo(-1280 / 2 / 80, 12)
    expect(b.minY).toBeCloseTo(-720 / 2 / 80, 12)
  })
})
