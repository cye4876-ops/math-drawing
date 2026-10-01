import { describe, expect, it } from 'vitest'
import { boxPlot, describe as describeStats, pearson, quantileSorted, spearman } from './describe'
import { autoBinCount, histogram } from './histogram'
import { kdeEvaluate, kdeGrid, silvermanBandwidth } from './kde'

describe('stats/describe: 描述统计', () => {
  it('已知数据手算对照', () => {
    const values = [2, 4, 4, 4, 5, 5, 7, 9]
    const result = describeStats(values)
    expect(result.count).toBe(8)
    expect(result.mean).toBeCloseTo(5, 12)
    expect(result.median).toBeCloseTo(4.5, 12)
    expect(result.mode).toBe(4)
    expect(result.min).toBe(2)
    expect(result.max).toBe(9)
    expect(result.q1).toBeCloseTo(4, 12)
    expect(result.q3).toBeCloseTo(5.5, 12)
    // 样本方差：Σ(x−5)²/(n−1) = 32/7
    expect(result.variance).toBeCloseTo(32 / 7, 12)
    expect(result.std).toBeCloseTo(Math.sqrt(32 / 7), 12)
  })

  it('分位数线性插值：quantile(0.25) 对 [1..5] = 2', () => {
    const sorted = [1, 2, 3, 4, 5]
    expect(quantileSorted(sorted, 0.25)).toBe(2)
    expect(quantileSorted(sorted, 0.5)).toBe(3)
    expect(quantileSorted(sorted, 0.75)).toBe(4)
  })

  it('偏度/峰度：对称数据偏度 ≈ 0', () => {
    const symmetric = [-2, -1, 0, 1, 2]
    const result = describeStats(symmetric)
    expect(Math.abs(result.skewness)).toBeLessThan(1e-12)
  })

  it('箱线图：1.5×IQR 之外的离群点', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]
    const box = boxPlot(values)
    expect(box.outliers).toContain(100)
    expect(box.max).toBeLessThan(100)
  })

  it('Pearson 相关：完全线性 = ±1', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12)
  })

  it('Spearman 秩相关：单调非线性 = 1，含并列值处理', () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 12)
    const result = spearman([1, 1, 2, 3], [2, 2, 4, 6])
    expect(result).toBeGreaterThan(0.9)
  })
})

describe('stats/histogram: 自动分箱', () => {
  it('Freedman-Diaconis：正态样本分箱数合理（10..60）', () => {
    let seed = 42
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const values = Array.from({ length: 500 }, () => {
      let u = 0
      let v = 0
      while (u === 0) u = rng()
      while (v === 0) v = rng()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    })
    const bins = autoBinCount(values)
    expect(bins).toBeGreaterThanOrEqual(10)
    expect(bins).toBeLessThanOrEqual(60)
  })

  it('计数总和 = n，密度积分 ≈ 1', () => {
    const values = [1, 2, 2, 3, 3, 3, 4, 5, 8]
    const result = histogram(values, 5)
    expect(result.counts.reduce((a, b) => a + b, 0)).toBe(values.length)
    const area = result.density.reduce((acc, d) => acc + d * result.binWidth, 0)
    expect(area).toBeCloseTo(1, 10)
  })

  it('统一值数据退化不崩溃', () => {
    const result = histogram([5, 5, 5], 'auto')
    expect(result.counts.reduce((a, b) => a + b, 0)).toBe(3)
  })
})

describe('stats/kde: 核密度估计', () => {
  it('验收：KDE 数值积分 = 1（宽域细网格，误差 < 1e-6）', () => {
    const values = [0.2, 0.8, 1.1, 1.3, 2.0, 2.2, 2.9, 3.5, 4.2]
    const grid = Array.from({ length: 20001 }, (_, i) => -15 + (40 * i) / 20000)
    const density = kdeEvaluate(values, grid, 'gaussian')
    let integral = 0
    for (let i = 1; i < grid.length; i++) {
      integral += ((density[i]! + density[i - 1]!) / 2) * (grid[i]! - grid[i - 1]!)
    }
    expect(integral).toBeCloseTo(1, 6)
  })

  it('Epanechnikov 核积分同样为 1', () => {
    const values = [1, 2, 2.5, 3, 5, 7]
    const grid = Array.from({ length: 20001 }, (_, i) => -15 + (45 * i) / 20000)
    const density = kdeEvaluate(values, grid, 'epanechnikov')
    let integral = 0
    for (let i = 1; i < grid.length; i++) {
      integral += ((density[i]! + density[i - 1]!) / 2) * (grid[i]! - grid[i - 1]!)
    }
    expect(integral).toBeCloseTo(1, 6)
  })

  it('Silverman 带宽：样本量增大带宽减小', () => {
    const small = silvermanBandwidth([1, 2, 3, 4, 5])
    const large = silvermanBandwidth(Array.from({ length: 1000 }, (_, i) => (i % 7) + Math.sin(i)))
    expect(small).toBeGreaterThan(0)
    expect(large).toBeGreaterThan(0)
    expect(large).toBeLessThan(small)
  })

  it('KDE 峰值位置接近数据众数', () => {
    const values = [-1, -0.5, 0, 0.1, 0.2, 0.3, 5]
    const grid = kdeGrid(values, 200)
    const density = kdeEvaluate(values, grid, 'gaussian')
    let bestIndex = 0
    for (let i = 1; i < density.length; i++) {
      if (density[i]! > density[bestIndex]!) bestIndex = i
    }
    expect(grid[bestIndex]!).toBeGreaterThan(-1)
    expect(grid[bestIndex]!).toBeLessThan(1.5)
  })
})
