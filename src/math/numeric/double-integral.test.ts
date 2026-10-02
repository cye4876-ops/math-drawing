/**
 * 二重积分测试（v2.1）：对照解析解。
 */
import { describe, expect, it } from 'vitest'
import { doubleIntegral } from './double-integral'

describe('v2.1 二重积分（复合 Simpson）', () => {
  it('常数与面积：∬1 dA = 区域面积', () => {
    const r1 = doubleIntegral(() => 1, -1, 1, -1, 1)
    expect(r1.value).toBeCloseTo(4, 9)
    const r2 = doubleIntegral(() => 1, 0, 2, 0, 3, { nx: 64, ny: 64 })
    expect(r2.value).toBeCloseTo(6, 9)
    expect(r2.samples).toBe(65 * 65)
  })

  it('∬(x² + y²) dA on [-1,1]² = 8/3（解析解）', () => {
    const r = doubleIntegral((x, y) => x * x + y * y, -1, 1, -1, 1)
    expect(r.value).toBeCloseTo(8 / 3, 8)
    expect(r.invalidSamples).toBe(0)
  })

  it('奇对称积分为 0：∬xy dA on [-1,1]² = 0', () => {
    const r = doubleIntegral((x, y) => x * y, -1, 1, -1, 1)
    expect(Math.abs(r.value)).toBeLessThan(1e-12)
  })

  it('可分离函数：∬sin(x)sin(y) dA on [0,π]² = 4', () => {
    const r = doubleIntegral((x, y) => Math.sin(x) * Math.sin(y), 0, Math.PI, 0, Math.PI)
    expect(r.value).toBeCloseTo(4, 6)
  })

  it('高斯型函数：∬e^(−(x²+y²)) dA on [-3,3]² ≈ π·erf(3)²（区域截断解析值）', () => {
    const r = doubleIntegral((x, y) => Math.exp(-(x * x + y * y)), -3, 3, -3, 3)
    expect(r.value).toBeCloseTo(3.1414539, 5)
  })

  it('非有限取值被计数（结果仍返回）', () => {
    // 1/(x²+y²) 在原点发散
    const r = doubleIntegral((x, y) => 1 / (x * x + y * y), -1, 1, -1, 1)
    expect(r.invalidSamples).toBeGreaterThan(0)
  })

  it('段数参数生效（nx=ny=16 采样 17×17）', () => {
    const r = doubleIntegral(() => 1, 0, 1, 0, 1, { nx: 16, ny: 16 })
    expect(r.samples).toBe(17 * 17)
    expect(r.value).toBeCloseTo(1, 9)
  })
})
