import { describe, expect, it } from 'vitest'
import { currentRange, exactView } from './viewport'
import { createView } from '../core/transform'
import type { Size } from '../state/types'

const size: Size = { width: 1200, height: 800 }

describe('viewport: 精确范围输入', () => {
  it('等比关闭：两轴独立换算比例', () => {
    const view = { ...createView(0, 0, 80), equalAspect: false }
    const next = exactView(view, size, { minX: -10, maxX: 10, minY: -5, maxY: 5 })
    expect(next.centerX).toBeCloseTo(0, 12)
    expect(next.centerY).toBeCloseTo(0, 12)
    expect(next.scaleX).toBeCloseTo(1200 / 20, 12)
    expect(next.scaleY).toBeCloseTo(800 / 10, 12)
  })

  it('等比开启：取较小比例，两个范围都完整可见', () => {
    const view = createView(0, 0, 80)
    const next = exactView(view, size, { minX: -10, maxX: 10, minY: -5, maxY: 5 })
    expect(next.scaleX).toBe(next.scaleY)
    expect(next.scaleX).toBeCloseTo(60, 12)
    // x 覆盖 1200px：1200/60 = 20 个单位（正好 ±10）；y 覆盖更多
    expect(size.width / next.scaleX).toBeCloseTo(20, 9)
    expect(size.height / next.scaleY).toBeGreaterThanOrEqual(10)
  })

  it('非零中心：范围中点成为视图中心', () => {
    const view = createView(0, 0, 80)
    const next = exactView(view, size, { minX: 100, maxX: 120, minY: -1, maxY: 1 })
    expect(next.centerX).toBeCloseTo(110, 12)
    expect(next.centerY).toBeCloseTo(0, 12)
  })

  it('非法范围（min ≥ max / 非有限）返回原视图引用', () => {
    const view = createView(0, 0, 80)
    expect(exactView(view, size, { minX: 1, maxX: 1, minY: -5, maxY: 5 })).toBe(view)
    expect(exactView(view, size, { minX: -1, maxX: 1, minY: 5, maxY: -5 })).toBe(view)
    expect(exactView(view, size, { minX: Number.NaN, maxX: 1, minY: -5, maxY: 5 })).toBe(view)
  })

  it('对数坐标：按十倍程换算，非正范围拒绝', () => {
    const log = { ...createView(1, 1, 80), coordType: 'log' as const, equalAspect: false }
    const next = exactView(log, size, { minX: 0.1, maxX: 1000, minY: 1, maxY: 10 })
    // x 跨度 4 个十倍程 → 1200 / 4
    expect(next.scaleX).toBeCloseTo(300, 9)
    // y 跨度 1 个十倍程 → 800 / 1
    expect(next.scaleY).toBeCloseTo(800, 9)
    expect(exactView(log, size, { minX: -1, maxX: 10, minY: 1, maxY: 10 })).toBe(log)
  })

  it('currentRange 与视图范围一致', () => {
    const view = createView(0, 0, 100)
    const range = currentRange(view, size)
    expect(range.minX).toBeCloseTo(-6, 12)
    expect(range.maxX).toBeCloseTo(6, 12)
    expect(range.minY).toBeCloseTo(-4, 12)
    expect(range.maxY).toBeCloseTo(4, 12)
  })
})
