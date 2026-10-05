import { describe, expect, it } from 'vitest'
import { adaptiveSimpson, compositeGauss } from './integrate'

describe('numeric/integrate: 自适应 Simpson', () => {
  it('∫₀^π sin(x)dx = 2，误差 < 1e-9', () => {
    const result = adaptiveSimpson(Math.sin, 0, Math.PI)
    expect(Math.abs(result.value - 2)).toBeLessThan(1e-9)
    expect(result.error).toBeGreaterThanOrEqual(0)
    expect(result.error).toBeLessThan(1e-8)
  })

  it('∫₀¹ x² dx = 1/3，误差 < 1e-12', () => {
    const result = adaptiveSimpson((x) => x * x, 0, 1)
    expect(Math.abs(result.value - 1 / 3)).toBeLessThan(1e-12)
  })

  it('高斯型振荡函数精度达标：∫₀^π sin(50x)dx = (1−cos(50π·1/π·…)) 数值核对', () => {
    // ∫₀^π sin(50x) dx = (1 - cos(50π))/50 = 0
    const result = adaptiveSimpson((x) => Math.sin(50 * x), 0, Math.PI)
    expect(Math.abs(result.value)).toBeLessThan(1e-6)
  })

  it('∫₀¹ 4/(1+x²) dx = π', () => {
    const result = adaptiveSimpson((x) => 4 / (1 + x * x), 0, 1)
    expect(Math.abs(result.value - Math.PI)).toBeLessThan(1e-10)
  })

  it('奇异积分（1/x 跨 0）：返回 NaN 而不是错误数值', () => {
    const result = adaptiveSimpson((x) => 1 / x, -1, 1)
    expect(Number.isNaN(result.value)).toBe(true)
    expect(result.error).toBe(Number.POSITIVE_INFINITY)
  })

  it('空区间与反向区间语义明确', () => {
    expect(adaptiveSimpson(Math.sin, 1, 1).value).toBe(0)
    expect(Number.isNaN(adaptiveSimpson(Math.sin, 2, 1).value)).toBe(true)
  })

  it('求值预算/深度受限时截断并给出偏大的误差', () => {
    const result = adaptiveSimpson((x) => Math.sin(1000 * x), 0, Math.PI, {
      maxDepth: 0,
      tolerance: 1e-14,
    })
    expect(result.truncated).toBe(true)
    expect(Number.isFinite(result.value)).toBe(true)
    expect(result.error).toBeGreaterThanOrEqual(1e-14)
  })

  it('性能：常规函数一次积分 < 5 ms', () => {
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      adaptiveSimpson(Math.sin, 0, Math.PI)
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(5)
  })
})

describe('v2.9 振荡积分防护', () => {
  it('sin²(4x) 在 [0, π] = π/2（回归：五点采样对齐零点曾误报 2.5e-31）', () => {
    const result = adaptiveSimpson((x) => Math.sin(4 * x) ** 2, 0, Math.PI)
    expect(Math.abs(result.value - Math.PI / 2)).toBeLessThan(1e-9)
    // 自适应结果被均匀细分/Gauss 复核纠正
    expect(result.verification.status).toBe('resolved')
    expect(result.verification.gauss).not.toBeNull()
    expect(Math.abs((result.verification.uniform ?? 0) - Math.PI / 2)).toBeLessThan(1e-9)
    expect(Math.abs((result.verification.gauss ?? 0) - Math.PI / 2)).toBeLessThan(1e-9)
  })

  it('光滑函数两法一致（matched），误差为估计值', () => {
    const result = adaptiveSimpson(Math.sin, 0, Math.PI)
    expect(result.verification.status).toBe('matched')
    expect(result.verification.uniform).not.toBeNull()
    expect(result.error).toBeLessThan(1e-8)
  })

  it('compositeGauss 独立可用：∫₀¹ 4/(1+x²) = π', () => {
    const { value } = compositeGauss((x) => 4 / (1 + x * x), 0, 1, 32)
    expect(Math.abs(value - Math.PI)).toBeLessThan(1e-12)
  })
})
