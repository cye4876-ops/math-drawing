import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  createProjector,
  createView,
  mathToScreen,
  mathToUnitSpace,
  panBy,
  sanitizeView,
  screenToMath,
  unitRangeSamples,
  viewBounds,
  viewCenterUnits,
  withEqualAspect,
  zoomAt,
} from './transform'
import type { Size, ViewTransform } from '../state/types'

const size: Size = { width: 1280, height: 720 }

function makeView(
  centerX: number,
  centerY: number,
  scale: number,
  extra: Partial<ViewTransform> = {},
): ViewTransform {
  return { ...createView(centerX, centerY, scale), ...extra }
}

const logView = (centerX = 1, centerY = 1, scale = 80): ViewTransform =>
  makeView(centerX, centerY, scale, { coordType: 'log' })

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
        const view = makeView(center.x, center.y, scale)
        for (const p of points) {
          const screen = mathToScreen(view, size, p)
          const back = screenToMath(view, size, screen)
          expect(Math.abs(back.x - p.x)).toBeLessThan(1e-9)
          expect(Math.abs(back.y - p.y)).toBeLessThan(1e-9)
        }
      }
    }
  })

  it('双轴比例不同（等比关闭）时往返一致', () => {
    const view = makeView(2, -1, 80, { equalAspect: false, scaleX: 50, scaleY: 320 })
    for (const p of [
      { x: 0, y: 0 },
      { x: 10.25, y: -6.5 },
    ]) {
      const back = screenToMath(view, size, mathToScreen(view, size, p))
      expect(Math.abs(back.x - p.x)).toBeLessThan(1e-9)
      expect(Math.abs(back.y - p.y)).toBeLessThan(1e-9)
    }
  })

  it('极端量级组合（1e-6 / 1e6 缩放 × 大中心偏移）下保持数值稳定', () => {
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
        const view = makeView(center.x, center.y, scale)
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
      let view = makeView(2, 3, 80)
      for (const factor of factors) {
        const before = screenToMath(view, size, anchor)
        view = zoomAt(view, size, anchor, factor)
        const after = screenToMath(view, size, anchor)
        expect(Math.abs(after.x - before.x)).toBeLessThan(1e-9)
        expect(Math.abs(after.y - before.y)).toBeLessThan(1e-9)
      }
    }
  })

  it('锚点不变量在双轴不同比例下同样成立', () => {
    const anchor = { x: 300, y: 500 }
    let view = makeView(2, 3, 80, { equalAspect: false, scaleX: 40, scaleY: 200 })
    const before = screenToMath(view, size, anchor)
    view = zoomAt(view, size, anchor, 1.7)
    const after = screenToMath(view, size, anchor)
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-9)
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-9)
    // 等比关闭时两轴按同一因子缩放，比例保持不变
    expect(view.scaleX / view.scaleY).toBeCloseTo(40 / 200, 12)
  })

  it('缩放因子正确作用于 scale', () => {
    const view = createView(0, 0, 80)
    const next = zoomAt(view, size, { x: 640, y: 360 }, 2)
    expect(next.scaleX).toBeCloseTo(160, 12)
    expect(next.scaleY).toBeCloseTo(160, 12)
  })

  it('等比模式开启时，缩放后两轴比例始终相等', () => {
    const next = zoomAt(createView(0, 0, 80), size, { x: 100, y: 100 }, 1.3)
    expect(next.scaleX).toBe(next.scaleY)
  })

  it('scale 受上下限约束', () => {
    const view = createView(0, 0, 80)
    expect(zoomAt(view, size, { x: 640, y: 360 }, 1e-18).scaleX).toBe(MIN_SCALE)
    expect(zoomAt(view, size, { x: 640, y: 360 }, 1e18).scaleX).toBe(MAX_SCALE)
  })

  it('log 模式：锚点缩放保持锚点下数学坐标不变且为正', () => {
    const anchor = { x: 200, y: 100 }
    let view = logView(1, 1, 80)
    for (const factor of [2, 0.5, 3]) {
      const before = screenToMath(view, size, anchor)
      view = zoomAt(view, size, anchor, factor)
      const after = screenToMath(view, size, anchor)
      expect(after.x).toBeGreaterThan(0)
      expect(after.y).toBeGreaterThan(0)
      expect(Math.abs(after.x - before.x)).toBeLessThan(1e-9 * before.x)
      expect(Math.abs(after.y - before.y)).toBeLessThan(1e-9 * before.y)
    }
  })
})

describe('transform: panBy 平移', () => {
  it('向左拖动内容 50px 等价于 center 向右移动 50/scale', () => {
    const view = makeView(1, 2, 100)
    const next = panBy(view, -50, 0)
    expect(next.centerX).toBeCloseTo(1 + 50 / 100, 12)
    expect(next.centerY).toBeCloseTo(2, 12)
  })

  it('平移往返可回到原视图', () => {
    const view = makeView(-4, 6, 33)
    const moved = panBy(panBy(view, 120, -45), -120, 45)
    expect(moved.centerX).toBeCloseTo(view.centerX, 9)
    expect(moved.centerY).toBeCloseTo(view.centerY, 9)
  })

  it('log 模式：平移在对数空间中生效', () => {
    const view = logView(100, 10, 100)
    const next = panBy(view, -50, 0)
    // log10(100) = 2，向右平移 50px 相当于 +0.5 个十倍程
    expect(next.centerX).toBeCloseTo(10 ** 2.5, 6)
    expect(next.centerY).toBeCloseTo(10, 6)
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

  it('log 模式 viewBounds 为正值且以十倍程对称', () => {
    const view = logView(1, 1, 100)
    const b = viewBounds(view, size)
    expect(Math.log10(b.maxX)).toBeCloseTo(Math.log10(b.minX) * -1 + 0, 9)
    expect(Math.log10(b.minY)).toBeCloseTo(-720 / 2 / 100, 9)
    expect(b.minX).toBeGreaterThan(0)
    expect(b.minY).toBeGreaterThan(0)
  })
})

describe('transform: 等比模式切换', () => {
  it('开启等比时 scaleY 对齐 scaleX', () => {
    const view = makeView(0, 0, 100, { equalAspect: false, scaleY: 40 })
    const equal = withEqualAspect(view, true)
    expect(equal.scaleX).toBe(equal.scaleY)
    expect(equal.scaleX).toBe(100)
  })

  it('关闭等比不改变比例', () => {
    const view = makeView(0, 0, 100)
    const free = withEqualAspect(view, false)
    expect(free.equalAspect).toBe(false)
    expect(free.scaleX).toBe(100)
    expect(free.scaleY).toBe(100)
  })

  it('状态未变化时返回同一引用', () => {
    const view = createView()
    expect(withEqualAspect(view, true)).toBe(view)
  })
})

describe('transform: 大坐标中心（回归：centerUnits 不得在线性模式钳制）', () => {
  it('viewBounds 对超大中心保持正确（1e5 / 1e10）', () => {
    const view = {
      ...createView(100005, 10001000025, 80),
      equalAspect: false,
      scaleX: 57,
      scaleY: 2.568e-4,
    }
    const b = viewBounds(view, { width: 570, height: 565 })
    expect(b.minX).toBeCloseTo(100000, 6)
    expect(b.maxX).toBeCloseTo(100010, 6)
    expect(b.maxY - b.minY).toBeCloseTo(565 / 2.568e-4, 0)
  })

  it('mathToScreen 与 screenToMath 在大中心下往返一致，且中心映射到画布中心', () => {
    const view = {
      ...createView(100005, 10001000025, 80),
      equalAspect: false,
      scaleX: 120,
      scaleY: 3e-4,
    }
    for (const p of [
      { x: 100000, y: 10001000025 },
      { x: 100010, y: 10001000025 + 1e5 },
    ]) {
      const back = screenToMath(view, size, mathToScreen(view, size, p))
      expect(Math.abs(back.x - p.x)).toBeLessThan(1e-6)
      expect(Math.abs(back.y - p.y)).toBeLessThan(1e-3)
    }
    const center = mathToScreen(view, size, { x: 100005, y: 10001000025 })
    expect(center.x).toBeCloseTo(size.width / 2, 9)
    expect(center.y).toBeCloseTo(size.height / 2, 9)
  })

  it('panBy 在大中心下不被钳制', () => {
    const view = createView(100005, 0, 100)
    const next = panBy(view, -50, 0)
    expect(next.centerX).toBeCloseTo(100005.5, 9)
  })

  it('缩放锚点不变量对超大中心依然成立', () => {
    const view = {
      ...createView(100005, 10001000025, 80),
      equalAspect: false,
      scaleX: 120,
      scaleY: 3e-4,
    }
    const anchor = { x: 300, y: 500 }
    const before = screenToMath(view, size, anchor)
    const next = zoomAt(view, size, anchor, 1.5)
    const after = screenToMath(next, size, anchor)
    expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6)
    expect(Math.abs(after.y - before.y)).toBeLessThan(1e-2)
  })
})

describe('transform: 投影器与单位空间辅助', () => {
  it('createProjector 与 mathToScreen/screenToMath 一致（线性与对数）', () => {
    const linear = createView(3, -2, 120)
    const log = { ...createView(1, 1, 100), coordType: 'log' as const }
    for (const view of [linear, log]) {
      const projector = createProjector(view, size)
      const points =
        view.coordType === 'log'
          ? [
              { x: 0.5, y: 3 },
              { x: 30, y: 0.2 },
            ]
          : [
              { x: 1.5, y: -0.5 },
              { x: 400, y: 0.1 },
            ]
      for (const point of points) {
        const viaProjector = projector.project(point)
        const viaTransform = mathToScreen(view, size, point)
        expect(viaProjector.x).toBeCloseTo(viaTransform.x, 9)
        expect(viaProjector.y).toBeCloseTo(viaTransform.y, 9)
        expect(projector.screenX(point.x)).toBeCloseTo(viaTransform.x, 9)
        expect(projector.screenY(point.y)).toBeCloseTo(viaTransform.y, 9)
      }
      // 反投影往返
      const sx = size.width * 0.7
      const sy = size.height * 0.3
      expect(projector.screenX(projector.screenToMathX(sx))).toBeCloseTo(sx, 6)
      expect(projector.screenY(projector.screenToMathY(sy))).toBeCloseTo(sy, 6)
    }
  })

  it('mathToUnitSpace 与 viewCenterUnits：线性原值、对数取 log10', () => {
    const log = { ...createView(10, 100, 80), coordType: 'log' as const }
    expect(mathToUnitSpace(log, { x: 10, y: 100 })).toEqual({ x: 1, y: 2 })
    expect(viewCenterUnits(log)).toEqual({ x: 1, y: 2 })
    const linear = createView(5, -5, 80)
    expect(mathToUnitSpace(linear, { x: 5, y: -5 })).toEqual({ x: 5, y: -5 })
    expect(viewCenterUnits(linear)).toEqual({ x: 5, y: -5 })
  })
})

describe('transform: sanitizeView 视图归一化（对数坐标）', () => {
  it('线性模式：所有字段原样，返回同一引用', () => {
    const view = createView(0, 0, 80)
    expect(sanitizeView(view)).toBe(view)
  })

  it('对数模式：非正/非有限 center 与轴位置归一为 1（回归：不得跑到 1e-300）', () => {
    const broken = makeView(0, -5, 80, {
      coordType: 'log',
      axisX: 0,
      axisY: -2,
    })
    const fixed = sanitizeView(broken)
    expect(fixed.centerX).toBe(1)
    expect(fixed.centerY).toBe(1)
    expect(fixed.axisX).toBe(1)
    expect(fixed.axisY).toBe(1)
    // 归一后可见范围落在合理量级（而非 1e-300）
    const bounds = viewBounds(fixed, size)
    expect(bounds.minX).toBeGreaterThan(1e-10)
    expect(bounds.maxX).toBeLessThan(1e10)

    const nanCenter = makeView(Number.NaN, Number.POSITIVE_INFINITY, 80, { coordType: 'log' })
    expect(sanitizeView(nanCenter).centerX).toBe(1)
    expect(sanitizeView(nanCenter).centerY).toBe(1)
  })

  it('对数模式下已为正值时不改动（同一引用）', () => {
    const view = makeView(10, 100, 80, { coordType: 'log', axisX: 1, axisY: 1 })
    expect(sanitizeView(view)).toBe(view)
  })
})

describe('transform: unitRangeSamples 采样生成', () => {
  it('线性模式：区间均匀分布，含两端点', () => {
    const view = createView()
    const samples = unitRangeSamples(view, -2, 4, 3)
    expect(samples).toEqual([-2, 0, 2, 4])
  })

  it('对数模式：按十倍程均匀（屏幕空间均匀）', () => {
    const view = { ...createView(1, 1, 80), coordType: 'log' as const }
    const samples = unitRangeSamples(view, 0.01, 100, 4)
    // log10 均匀：0.01, 0.1, 1, 10, 100
    for (let i = 0; i < samples.length; i++) {
      expect(samples[i]).toBeCloseTo(10 ** (-2 + i), 9)
    }
  })

  it('对数模式下非正端点返回空数组', () => {
    const view = { ...createView(1, 1, 80), coordType: 'log' as const }
    expect(unitRangeSamples(view, -1, 10, 4)).toEqual([])
    expect(unitRangeSamples(view, 0, 10, 4)).toEqual([])
  })
})
