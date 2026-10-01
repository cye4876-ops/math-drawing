import { describe, expect, it } from 'vitest'
import { sampleImplicit } from './implicit'
import type { Point2 } from '../../state/types'

const size = { width: 1200, height: 800 }

function options(xMin: number, xMax: number, yMin: number, yMax: number, quality = 3) {
  return {
    xMin,
    xMax,
    yMin,
    yMax,
    widthPx: size.width,
    heightPx: size.height,
    quality,
  }
}

/** 所有线段端点 */
function endpoints(segments: Point2[][]): Point2[] {
  return segments.flat()
}

describe('samplers/implicit: 圆 x²+y²=4', () => {
  it('线段全部落在半径 2 附近，且四个象限都有覆盖', () => {
    const result = sampleImplicit((x, y) => x * x + y * y - 4, options(-5, 5, -5, 5))
    expect(result.segments.length).toBeGreaterThan(50)

    const cellTolerance = 0.15
    for (const seg of result.segments) {
      const mid = {
        x: ((seg[0] as Point2).x + (seg[1] as Point2).x) / 2,
        y: ((seg[0] as Point2).y + (seg[1] as Point2).y) / 2,
      }
      expect(Math.abs(Math.hypot(mid.x, mid.y) - 2)).toBeLessThan(cellTolerance)
    }

    const quadrants = new Set<string>()
    for (const p of endpoints(result.segments)) {
      quadrants.add(`${p.x >= 0 ? 'R' : 'L'}${p.y >= 0 ? 'T' : 'B'}`)
    }
    expect(quadrants.size).toBe(4)
  })
})

describe('samplers/implicit: 双曲线 x²-y²=1', () => {
  it('两条分支，且不跨越 y 轴', () => {
    const result = sampleImplicit((x, y) => x * x - y * y - 1, options(-4, 4, -4, 4))
    expect(result.segments.length).toBeGreaterThan(30)

    const points = endpoints(result.segments)
    expect(points.some((p) => p.x > 1)).toBe(true)
    expect(points.some((p) => p.x < -1)).toBe(true)

    // 分支不应穿过 x=0 附近（|x| 最小值受顶点约束 ≈ 1）
    const minAbsX = Math.min(...points.map((p) => Math.abs(p.x)))
    expect(minAbsX).toBeGreaterThan(0.5)
  })
})

describe('samplers/implicit: 直线 x-y=0', () => {
  it('所有线段在对角线附近', () => {
    const result = sampleImplicit((x, y) => x - y, options(-5, 5, -5, 5))
    expect(result.segments.length).toBeGreaterThan(50)
    for (const seg of result.segments) {
      for (const p of seg) {
        expect(Math.abs(p.x - p.y)).toBeLessThan(0.15)
      }
    }
  })
})

describe('samplers/implicit: 退化与边界', () => {
  it('歧义单元（对角同号）用中心值判定：鞍点十字线不断裂', () => {
    // 鞍点放在单元内部 (0.02, 0.03)（避开网格线），强制产生对角同号歧义单元
    const variants = [
      (x: number, y: number) => (x - 0.02) * (y - 0.03),
      (x: number, y: number) => -(x - 0.02) * (y - 0.03),
    ]
    for (const f of variants) {
      const result = sampleImplicit(f, options(-3, 3, -3, 3))
      expect(result.segments.length).toBeGreaterThan(20)
      const points = endpoints(result.segments)
      // 竖直分支（x≈0.02 处）与水平分支（y≈0.03 处）都存在
      expect(points.some((p) => Math.abs(p.x - 0.02) < 0.05 && Math.abs(p.y - 0.03) > 1)).toBe(true)
      expect(points.some((p) => Math.abs(p.y - 0.03) < 0.05 && Math.abs(p.x - 0.02) > 1)).toBe(true)
    }
  })

  it('退化与边界：恒 NaN / 恒正值 / 恒零：无线段且不崩溃', () => {
    expect(sampleImplicit(() => Number.NaN, options(-5, 5, -5, 5)).segments).toHaveLength(0)
    expect(sampleImplicit(() => 1, options(-5, 5, -5, 5)).segments).toHaveLength(0)
    expect(sampleImplicit(() => 0, options(-5, 5, -5, 5)).segments).toHaveLength(0)
  })

  it('含奇点的 1/(x²+y²-1)：不崩溃且线段在单位圆附近', () => {
    const result = sampleImplicit((x, y) => 1 / (x * x + y * y - 1), options(-3, 3, -3, 3))
    expect(result.segments.length).toBeGreaterThan(30)
    for (const seg of result.segments) {
      const mid = {
        x: ((seg[0] as Point2).x + (seg[1] as Point2).x) / 2,
        y: ((seg[0] as Point2).y + (seg[1] as Point2).y) / 2,
      }
      expect(Math.abs(Math.hypot(mid.x, mid.y) - 1)).toBeLessThan(0.1)
    }
  })

  it('非法范围：空结果', () => {
    expect(sampleImplicit((x, y) => x + y, options(1, 1, 0, 5)).segments).toHaveLength(0)
  })

  it('高精度档位线段更多', () => {
    const low = sampleImplicit((x, y) => x * x + y * y - 4, options(-5, 5, -5, 5, 1))
    const high = sampleImplicit((x, y) => x * x + y * y - 4, options(-5, 5, -5, 5, 5))
    expect(high.segments.length).toBeGreaterThan(low.segments.length)
  })

  it('超大画布触发网格降采样上限，求值量受控', () => {
    const result = sampleImplicit((x, y) => x - y, {
      xMin: -5,
      xMax: 5,
      yMin: -5,
      yMax: 5,
      widthPx: 100_000,
      heightPx: 100_000,
      quality: 5,
    })
    expect(result.segments.length).toBeGreaterThan(0)
    expect(result.evaluations).toBeLessThan(250_000)
  })

  it('性能：圆单次采样 < 16 ms', () => {
    const opts = options(-5, 5, -5, 5)
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      sampleImplicit((x, y) => x * x + y * y - 4, opts)
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(16)
  })
})
