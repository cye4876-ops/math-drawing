import { describe, expect, it } from 'vitest'
import { riemannSum } from './riemann'

describe('numeric/riemann: 四种模式', () => {
  const f = Math.sin
  const a = 0
  const b = Math.PI
  const exact = 2

  it('n=100 中点法逼近误差 < 0.01（验收要求）', () => {
    const result = riemannSum(f, a, b, 100, 'mid')
    expect(Math.abs(result.value - exact)).toBeLessThan(0.01)
  })

  it('n=100 梯形法逼近误差 < 1e-3', () => {
    const result = riemannSum(f, a, b, 100, 'trapezoid')
    expect(Math.abs(result.value - exact)).toBeLessThan(1e-3)
  })

  it('左端点法在单调增区间偏小、右端点法偏大（x² 在 [0,1]）', () => {
    const square = (x: number): number => x * x
    const left = riemannSum(square, 0, 1, 100, 'left')
    const right = riemannSum(square, 0, 1, 100, 'right')
    expect(left.value).toBeLessThan(1 / 3)
    expect(right.value).toBeGreaterThan(1 / 3)
    expect(Math.abs(left.value - 1 / 3)).toBeLessThan(0.01)
  })

  it('n=1 各模式行为正确（sin 在 [0,π]）', () => {
    expect(riemannSum(f, a, b, 1, 'left').value).toBeCloseTo(0, 10)
    expect(riemannSum(f, a, b, 1, 'right').value).toBeCloseTo(0, 10)
    expect(riemannSum(f, a, b, 1, 'mid').value).toBeCloseTo(Math.PI, 10)
    expect(riemannSum(f, a, b, 1, 'trapezoid').value).toBeCloseTo(0, 10)
  })

  it('n 被夹取到合法范围；非法区间返回 NaN', () => {
    expect(riemannSum(f, a, b, 0, 'mid').n).toBe(1)
    expect(riemannSum(f, a, b, 1e9, 'mid').n).toBe(10000)
    expect(Number.isNaN(riemannSum(f, b, a, 10, 'mid').value)).toBe(true)
  })

  it('性能：n=100 单次求和 < 1 ms（帧内重算无需增量机制的依据）', () => {
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      riemannSum(f, a, b, 100, 'mid')
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(1)
  })

  it('求值次数与模式一致（n 或 n+1）', () => {
    expect(riemannSum(f, a, b, 100, 'left').evaluations).toBe(100)
    expect(riemannSum(f, a, b, 100, 'mid').evaluations).toBe(100)
    expect(riemannSum(f, a, b, 100, 'trapezoid').evaluations).toBe(101)
  })
})
