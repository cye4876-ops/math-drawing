import { describe, expect, it } from 'vitest'
import {
  bootstrapAdvance,
  cltAdvance,
  createGauss,
  createRng,
  llnAdvance,
  llnFraction,
  monteCarloAdvance,
  monteCarloEstimate,
  randomWalk2D,
} from './simulation'

describe('stats/simulation: 概率模拟', () => {
  it('验收：大数定律 10000 次抛硬币，频率与 0.5 偏差 < 0.02（种子可复现）', () => {
    const rng = createRng(12345)
    const state = { trials: 0, heads: 0 }
    llnAdvance(state, rng, 10_000)
    expect(Math.abs(llnFraction(state) - 0.5)).toBeLessThan(0.02)
    // 同种子可复现
    const rng2 = createRng(12345)
    const state2 = { trials: 0, heads: 0 }
    llnAdvance(state2, rng2, 10_000)
    expect(state2.heads).toBe(state.heads)
  })

  it('增量推进与一次性推进结果一致', () => {
    const a = { trials: 0, heads: 0 }
    const b = { trials: 0, heads: 0 }
    const rngA = createRng(7)
    llnAdvance(a, rngA, 5000)
    const rngB = createRng(7)
    for (let i = 0; i < 50; i++) llnAdvance(b, rngB, 100)
    expect(a.heads).toBe(b.heads)
    expect(a.trials).toBe(b.trials)
  })

  it('蒙特卡洛 π：10 万点估计误差 < 0.02', () => {
    const rng = createRng(99)
    const state = { inside: 0, total: 0 }
    monteCarloAdvance(state, rng, 100_000)
    expect(Math.abs(monteCarloEstimate(state) - Math.PI)).toBeLessThan(0.02)
  })

  it('CLT：均匀分布样本均值趋于正态（方差按 n 缩小）', () => {
    const rng = createRng(4242)
    const means = new Array<number>()
    cltAdvance(rng, means, 30, 3000)
    const mean = means.reduce((a, b) => a + b, 0) / means.length
    expect(mean).toBeCloseTo(0.5, 1)
    let variance = 0
    for (const value of means) variance += (value - mean) * (value - mean)
    variance /= means.length - 1
    // 均匀分布方差 1/12，均值方差 ≈ 1/(12×30) ≈ 0.00278
    expect(variance).toBeGreaterThan(0.0015)
    expect(variance).toBeLessThan(0.005)
  })

  it('自助法：重抽样均值围绕原样本均值', () => {
    const rng = createRng(7)
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const means = new Array<number>()
    bootstrapAdvance(rng, data, means, 500, data.length)
    const mean = means.reduce((a, b) => a + b, 0) / means.length
    expect(mean).toBeGreaterThan(4.5)
    expect(mean).toBeLessThan(6.5)
    expect(means.length).toBe(500)
  })

  it('随机游走：步数正确且起点在原点', () => {
    const rng = createRng(1)
    const points = randomWalk2D(rng, 100)
    expect(points.length).toBe(101)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    // 每步曼哈顿距离增加 1
    for (let i = 1; i < points.length; i++) {
      const dist =
        Math.abs(points[i]!.x - points[i - 1]!.x) + Math.abs(points[i]!.y - points[i - 1]!.y)
      expect(dist).toBe(1)
    }
  })

  it('高斯采样：均值≈0、标准差≈1（万点）', () => {
    const gauss = createGauss(createRng(2024))
    const values = Array.from({ length: 10_000 }, () => gauss())
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    let variance = 0
    for (const value of values) variance += (value - mean) * (value - mean)
    variance /= values.length - 1
    expect(Math.abs(mean)).toBeLessThan(0.05)
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(0.05)
  })
})
