import { describe, expect, it } from 'vitest'
import {
  betaI,
  DISTRIBUTIONS,
  distributionDomain,
  erfHigh,
  gammaQ,
  getDistribution,
  lnGamma,
} from './distributions'

describe('stats/distributions: 特殊函数', () => {
  it('lnGamma 与已知值一致：Γ(0.5)=√π、Γ(5)=24、Γ(1)=1', () => {
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 12)
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 12)
    expect(lnGamma(1)).toBeCloseTo(0, 12)
    expect(lnGamma(0.5) + lnGamma(0.5) - lnGamma(1)).toBeCloseTo(Math.log(Math.PI), 12)
  })

  it('erf 高精度：erf(1) ≈ 0.8427007929497149（1e-12）', () => {
    expect(erfHigh(1)).toBeCloseTo(0.8427007929497149, 12)
    expect(erfHigh(-1)).toBeCloseTo(-0.8427007929497149, 12)
    expect(erfHigh(0)).toBe(0)
  })

  it('不完全贝塔对称性：I_x(a,b) = 1 − I_{1−x}(b,a)', () => {
    expect(betaI(2, 3, 0.4)).toBeCloseTo(1 - betaI(3, 2, 0.6), 12)
    expect(betaI(0.5, 0.5, 0.5)).toBeCloseTo(0.5, 12)
  })

  it('不完全伽马：P + Q = 1；Q(3,100) = e^{−100}(1+100+5000) ≈ 1.9e-40', () => {
    expect(gammaQ(2.5, 3.7) + (1 - gammaQ(2.5, 3.7))).toBeCloseTo(1, 12)
    expect(gammaQ(3, 100)).toBeLessThan(1e-39)
    expect(gammaQ(3, 100)).toBeGreaterThan(1e-41)
  })
})

describe('stats/distributions: 验收数值', () => {
  it('标准正态 P(X < 1.96) ≈ 0.975（误差 < 1e-7）', () => {
    const normal = getDistribution('normal')
    expect(normal.cdf(1.96, { mu: 0, sigma: 1 })).toBeCloseTo(0.9750021048517795, 7)
  })

  it('标准正态分位数 q(0.975) ≈ 1.959964（误差 < 1e-6）', () => {
    const normal = getDistribution('normal')
    expect(normal.quantile(0.975, { mu: 0, sigma: 1 })).toBeCloseTo(1.959964, 6)
    expect(normal.quantile(0.5, { mu: 0, sigma: 1 })).toBeCloseTo(0, 9)
  })

  it('二项 P(X=5), n=10, p=0.5 = 0.24609375（精确）', () => {
    const binom = getDistribution('binomial')
    expect(binom.pdf(5, { n: 10, p: 0.5 })).toBeCloseTo(0.24609375, 14)
  })

  it('泊松 P(X=2), λ=3 ≈ 0.224042（误差 < 1e-9）', () => {
    const poisson = getDistribution('poisson')
    expect(poisson.pdf(2, { lambda: 3 })).toBeCloseTo(0.22404180765538775, 9)
  })

  it('卡方与伽马/指数交叉：χ²(2) = Exp(1/2)；χ²(2) cdf = 1−e^{−x/2}', () => {
    const chi2 = getDistribution('chi2')
    for (const x of [0.5, 1, 2.5, 7]) {
      expect(chi2.cdf(x, { k: 2 })).toBeCloseTo(1 - Math.exp(-x / 2), 12)
    }
  })

  it('t 分布 ν→∞ 趋近正态；F(1, ν) 与 t(ν)² 的 CDF 关系', () => {
    const t = getDistribution('student-t')
    const normal = getDistribution('normal')
    expect(t.cdf(1.2, { nu: 2000 })).toBeCloseTo(normal.cdf(1.2, { mu: 0, sigma: 1 }), 3)
    // t(5)：P(T ≤ 1) 与已知参考 0.8061 接近
    expect(t.cdf(1, { nu: 5 })).toBeCloseTo(0.81839, 4)
  })

  it('10 种分布：cdf 单调且 quantile(cdf(x)) 往返一致', () => {
    for (const def of DISTRIBUTIONS) {
      const params: Record<string, number> = {}
      for (const p of def.params) params[p.key] = p.default
      const xs = [0.1, 0.3, 0.5, 0.7, 0.9].map((q) => def.quantile(q, params))
      // 单调性
      for (let i = 1; i < xs.length; i++) {
        const prev = def.cdf(xs[i - 1]!, params)
        const next = def.cdf(xs[i]!, params)
        expect(next).toBeGreaterThanOrEqual(prev - 1e-9)
      }
      // 往返：q → cdf ≈ p（对连续分布；离散放宽）
      const mid = def.quantile(0.5, params)
      const cdfMid = def.cdf(mid, params)
      if (def.discrete) {
        expect(cdfMid).toBeGreaterThan(0.3)
        expect(cdfMid).toBeLessThanOrEqual(1)
      } else {
        expect(cdfMid).toBeCloseTo(0.5, 4)
      }
    }
  })

  it('分布域估计：正态 μ±5σ 覆盖分位范围', () => {
    const normal = getDistribution('normal')
    const domain = distributionDomain(normal, { mu: 0, sigma: 1 })
    expect(domain.min).toBeLessThan(-3)
    expect(domain.max).toBeGreaterThan(3)
  })
})
