import { describe, expect, it } from 'vitest'
import {
  customRegression,
  fitRegression,
  linearRegression,
  polynomialRegression,
  transformRegression,
  type RegressionResult,
} from './regression'

/** 闭式最小二乘斜率/截距（测试用独立实现，校验 QR 结果） */
function closedFormLinear(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my)
    sxx += (x[i]! - mx) * (x[i]! - mx)
  }
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

function expectResult(result: RegressionResult | { error: string }): RegressionResult {
  if ('error' in result) throw new Error(result.error)
  return result
}

describe('stats/regression: 线性回归（QR）', () => {
  it('验收：无噪声数据精确恢复（误差 < 1e-10）', () => {
    const x = [-3, -1, 0, 2, 4, 7]
    const y = x.map((v) => 2.5 * v + 1.25)
    const result = expectResult(linearRegression(x, y))
    expect(Math.abs(result.coefficients[0]! - 1.25)).toBeLessThan(1e-10)
    expect(Math.abs(result.coefficients[1]! - 2.5)).toBeLessThan(1e-10)
    expect(result.r2).toBeCloseTo(1, 12)
  })

  it('带噪声数据与闭式解一致（独立实现对照）', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8]
    const y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.4, 13.9, 16.2]
    const expected = closedFormLinear(x, y)
    const result = expectResult(linearRegression(x, y))
    expect(result.coefficients[1]!).toBeCloseTo(expected.slope, 12)
    expect(result.coefficients[0]!).toBeCloseTo(expected.intercept, 12)
  })

  it('病态场景（x 大偏移 + 高阶）：QR 稳定不产生 NaN', () => {
    const x = Array.from({ length: 30 }, (_, i) => 1000 + i)
    const y = x.map((v) => 3 * Math.pow(v - 1000, 2) + 5)
    const result = expectResult(polynomialRegression(x, y, 2))
    expect(Number.isFinite(result.coefficients[0]!)).toBe(true)
    expect(result.r2).toBeCloseTo(1, 8)
  })

  it('R²/adjR²/RSE 定义自洽', () => {
    const x = [0, 1, 2, 3, 4, 5]
    const y = [1, 2.9, 5.2, 7, 9.1, 11]
    const result = expectResult(linearRegression(x, y))
    const ssRes = result.residuals.reduce((acc, r) => acc + r * r, 0)
    const dof = result.n - 2
    expect(result.residualStandardError).toBeCloseTo(Math.sqrt(ssRes / dof), 10)
    expect(result.adjustedR2).toBeLessThanOrEqual(result.r2 + 1e-12)
  })

  it('样本不足时报错', () => {
    expect(linearRegression([1], [2])).toHaveProperty('error')
  })
})

describe('stats/regression: 多项式/变换/自定义', () => {
  it('多项式：y = x² 完美恢复（degree 2）', () => {
    const x = [-2, -1, 0, 1, 2, 3]
    const y = x.map((v) => v * v)
    const result = expectResult(polynomialRegression(x, y, 2))
    expect(result.coefficients[0]!).toBeCloseTo(0, 8)
    expect(result.coefficients[1]!).toBeCloseTo(0, 8)
    expect(result.coefficients[2]!).toBeCloseTo(1, 8)
    expect(result.r2).toBeCloseTo(1, 10)
  })

  it('指数：y = 3·e^(0.5x) 恢复 a≈3、b≈0.5（无噪声 < 1e-8）', () => {
    const x = [0, 1, 2, 3, 4, 5]
    const y = x.map((v) => 3 * Math.exp(0.5 * v))
    const result = expectResult(transformRegression('exponential', x, y))
    expect(result.coefficients[0]!).toBeCloseTo(3, 8)
    expect(result.coefficients[1]!).toBeCloseTo(0.5, 8)
  })

  it('对数：y = 1 + 2·ln x 恢复', () => {
    const x = [0.5, 1, 2, 4, 8]
    const y = x.map((v) => 1 + 2 * Math.log(v))
    const result = expectResult(transformRegression('logarithmic', x, y))
    expect(result.coefficients[0]!).toBeCloseTo(1, 8)
    expect(result.coefficients[1]!).toBeCloseTo(2, 8)
  })

  it('幂：y = 2·x³ 恢复', () => {
    const x = [0.5, 1, 2, 3, 4]
    const y = x.map((v) => 2 * Math.pow(v, 3))
    const result = expectResult(transformRegression('power', x, y))
    expect(result.coefficients[0]!).toBeCloseTo(2, 6)
    expect(result.coefficients[1]!).toBeCloseTo(3, 6)
  })

  it('变换类过滤无效点（y ≤ 0）并计数', () => {
    const x = [1, 2, 3, 4, 5]
    const y = [-1, Math.exp(2), Math.exp(3), Math.exp(4), Math.exp(5)]
    const result = expectResult(transformRegression('exponential', x, y))
    expect(result.filtered).toBe(1)
    expect(result.coefficients[1]!).toBeCloseTo(1, 8)
  })

  it('自定义模型 a*exp(b*x)：LM 恢复参数', () => {
    const x = [0, 0.5, 1, 1.5, 2]
    const y = x.map((v) => 2.5 * Math.exp(0.8 * v))
    const result = expectResult(customRegression(x, y, 'a*exp(b*x)'))
    const [a, b] = result.coefficients
    expect(a!).toBeCloseTo(2.5, 3)
    expect(b!).toBeCloseTo(0.8, 3)
    expect(result.r2).toBeGreaterThan(0.999)
  })

  it('fitRegression 统一入口：6 类均可调用且返回结构完整', () => {
    const x = [1, 2, 3, 4, 5, 6]
    const y = x.map((v) => 1.5 * v + 0.5)
    const cases = [
      fitRegression('linear', x, y),
      fitRegression('polynomial', x, y, { degree: 2 }),
      fitRegression(
        'exponential',
        x,
        y.map((v) => Math.exp(v)),
      ),
      fitRegression(
        'logarithmic',
        x,
        y.map((v) => Math.log(v)),
      ),
      fitRegression(
        'power',
        x,
        y.map((v) => Math.pow(v, 2)),
      ),
      fitRegression('custom', x, y, { modelExpr: 'a*x+b' }),
    ]
    for (const item of cases) {
      const result = expectResult(item)
      expect(result.equationLatex.length).toBeGreaterThan(0)
      expect(Number.isFinite(result.r2)).toBe(true)
      expect(result.predict(3)).toBeTypeOf('number')
    }
  })
})
