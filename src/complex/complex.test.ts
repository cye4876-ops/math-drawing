/**
 * 复数运算与特殊函数测试（v0.9）：基本运算、初等函数恒等式、Γ/ζ 数值对照。
 */
import { describe, expect, it } from 'vitest'
import {
  cAbs,
  cAdd,
  cDiv,
  cExp,
  cGamma,
  cLog,
  cMul,
  cSin,
  cCos,
  cSqrt,
  cSub,
  cZeta,
  type Complex,
} from './complex'

describe('v0.9 复数：基本运算', () => {
  it('加减乘除', () => {
    const a: Complex = { re: 1, im: 1 }
    const b: Complex = { re: 1, im: -1 }
    expect(cMul(a, b).re).toBeCloseTo(2, 12)
    expect(cMul(a, b).im).toBeCloseTo(0, 12)
    const q = cDiv(a, b)
    expect(q.re).toBeCloseTo(0, 12)
    expect(q.im).toBeCloseTo(1, 12)
    expect(cSub(cAdd(a, b), b)).toEqual(a)
  })

  it('exp / log 互逆（主值带区内）', () => {
    const z: Complex = { re: 0.3, im: 0.7 }
    const back = cLog(cExp(z))
    expect(back.re).toBeCloseTo(z.re, 12)
    expect(back.im).toBeCloseTo(z.im, 12)
  })

  it('sqrt：平方回归与主值（√−1 = i）', () => {
    const z: Complex = { re: 2, im: -1 }
    const s = cSqrt(z)
    const squared = cMul(s, s)
    expect(squared.re).toBeCloseTo(z.re, 12)
    expect(squared.im).toBeCloseTo(z.im, 12)
    const i = cSqrt({ re: -1, im: 0 })
    expect(i.re).toBeCloseTo(0, 12)
    expect(i.im).toBeCloseTo(1, 12)
  })

  it('三角恒等式 sin²+cos²=1（复平面上）', () => {
    const z: Complex = { re: 0.3, im: 0.7 }
    const s = cSin(z)
    const c = cCos(z)
    const sum = cAdd(cMul(s, s), cMul(c, c))
    expect(sum.re).toBeCloseTo(1, 12)
    expect(sum.im).toBeCloseTo(0, 12)
  })
})

describe('v0.9 复数：Γ 函数', () => {
  it('Γ(0.5) = √π；Γ(5) = 24；Γ(1) = 1', () => {
    expect(cGamma({ re: 0.5, im: 0 }).re).toBeCloseTo(Math.sqrt(Math.PI), 10)
    expect(cGamma({ re: 5, im: 0 }).re).toBeCloseTo(24, 8)
    expect(cGamma({ re: 1, im: 0 }).re).toBeCloseTo(1, 10)
  })

  it('反射公式：Γ(−0.5) = −2√π；Γ(0.5+i) 与数值恒等式一致', () => {
    expect(cGamma({ re: -0.5, im: 0 }).re).toBeCloseTo(-2 * Math.sqrt(Math.PI), 8)
    // 邻近性检查：|Γ(0.5+i)|² 与 Γ(0.5+i)Γ(0.5−i) 一致（共轭对称）
    const value = cGamma({ re: 0.5, im: 1 })
    const conjugate = cGamma({ re: 0.5, im: -1 })
    const product = cMul(value, conjugate)
    expect(product.im).toBeCloseTo(0, 8)
    expect(product.re).toBeCloseTo(cAbs(value) ** 2, 8)
  })

  it('极点：Γ(0)、Γ(−1) 为非有限', () => {
    expect(Number.isFinite(cGamma({ re: 0, im: 0 }).re)).toBe(false)
    expect(Number.isFinite(cGamma({ re: -1, im: 0 }).re)).toBe(false)
  })
})

describe('v0.9 复数：ζ 函数', () => {
  it('ζ(2) = π²/6', () => {
    expect(cZeta({ re: 2, im: 0 }).re).toBeCloseTo((Math.PI * Math.PI) / 6, 6)
  })

  it('特殊值：ζ(0) = −1/2；ζ(−1) = −1/12（函数方程）', () => {
    expect(cZeta({ re: 0, im: 0 }).re).toBeCloseTo(-0.5, 6)
    expect(cZeta({ re: -1, im: 0 }).re).toBeCloseTo(-1 / 12, 4)
  })

  it('已知非平凡零点附近 |ζ| 很小（1/2 + 14.134725i）', () => {
    const value = cZeta({ re: 0.5, im: 14.134725 })
    expect(cAbs(value)).toBeLessThan(0.1)
    // 对比：远离零点处模显著更大
    const away = cZeta({ re: 0.5, im: 12 })
    expect(cAbs(away)).toBeGreaterThan(cAbs(value))
  })
})
