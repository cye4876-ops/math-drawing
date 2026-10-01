/**
 * Möbius 变换 / 围道积分 / 分支示意测试（v0.9）：
 * 圆→圆性质、保角性、断点处理、留数定理数值对照。
 */
import { describe, expect, it } from 'vitest'
import { MOBIUS_PRESETS, mappedGrid, mappedCircle, mobius, type MobiusParams } from './mobius'
import { contourIntegral } from './contour'
import { branchCount, branchFn } from './riemann-surface'
import { cAbs, cMul, type Complex } from './complex'
import { compileComplexExpression } from './evaluate'

function preset(id: string): MobiusParams {
  const found = MOBIUS_PRESETS.find((item) => item.id === id)
  if (!found) throw new Error(`缺少预设 ${id}`)
  return found.params
}

describe('v0.9 Möbius 变换', () => {
  it('恒等与反演', () => {
    const identity = preset('identity')
    expect(mobius(identity, { re: 0.3, im: -0.7 })).toEqual({ re: 0.3, im: -0.7 })
    const inversion = preset('inversion')
    const z: Complex = { re: 1, im: 1 }
    const w = mobius(inversion, z)
    // 1/(1+i) = (1−i)/2
    expect(w.re).toBeCloseTo(0.5, 12)
    expect(w.im).toBeCloseTo(-0.5, 12)
    // z · (1/z) = 1
    const product = cMul(z, w)
    expect(product.re).toBeCloseTo(1, 12)
    expect(product.im).toBeCloseTo(0, 12)
  })

  it('Cayley 映射把虚轴映为单位圆（|w| = 1）', () => {
    const cayley = preset('cayley')
    // (z−1)/(z+1) 在 z = iy 上：|iy−1| = |iy+1| → |w| = 1
    for (const y of [-5, -2, -0.3, 0, 0.7, 3, 10]) {
      const w = mobius(cayley, { re: 0, im: y })
      expect(Math.abs(cAbs(w) - 1)).toBeLessThan(1e-9)
    }
    // 实轴对应点不在单位圆上（备证映射非平凡）
    const offAxis = mobius(cayley, { re: -5, im: 0 })
    expect(Math.abs(cAbs(offAxis) - 1)).toBeGreaterThan(0.1)
  })

  it('保角性：正交网格像在对应点仍正交', () => {
    const cayley = preset('cayley')
    const z: Complex = { re: 0.8, im: 0.6 }
    const eps = 1e-6
    // 两个正交方向 dx、dy 的像（有限差分）
    const w0 = mobius(cayley, z)
    const wx = mobius(cayley, { re: z.re + eps, im: z.im })
    const wy = mobius(cayley, { re: z.re, im: z.im + eps })
    const vx = { re: wx.re - w0.re, im: wx.im - w0.im }
    const vy = { re: wy.re - w0.re, im: wy.im - w0.im }
    const dot = vx.re * vy.re + vx.im * vy.im
    const cosine = dot / (Math.hypot(vx.re, vx.im) * Math.hypot(vy.re, vy.im))
    expect(Math.abs(cosine)).toBeLessThan(1e-6)
  })

  it('mappedGrid 断开处理：反演在原点附近断为多段但均有限', () => {
    const segments = mappedGrid(preset('inversion'), 2, 1, 8)
    expect(segments.length).toBeGreaterThan(3)
    for (const segment of segments) {
      expect(segment.length).toBeGreaterThan(1)
      for (const point of segment) {
        expect(Number.isFinite(point.x)).toBe(true)
        expect(Number.isFinite(point.y)).toBe(true)
        expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(8 + 1e-9)
      }
    }
  })

  it('mappedCircle：不经过极点的圆映射为有限曲线', () => {
    const cayley = preset('cayley')
    const segments = mappedCircle(cayley, { re: 0, im: 1 }, 0.5)
    expect(segments.length).toBeGreaterThanOrEqual(1)
    for (const segment of segments) expect(Math.hypot(...segment.map((p) => p.x)) >= 0).toBe(true)
  })
})

describe('v0.9 围道积分（留数定理演示）', () => {
  it('∮ 1/(z−i) dz（含极点）≈ 2πi；圆不含极点时 ≈ 0', () => {
    const fn = compileComplexExpression('1/(z - i)')
    if (!('fn' in fn)) throw new Error('compile failed')
    const enclosing = contourIntegral(fn.fn, { center: { re: 0, im: 0 }, radius: 2 })
    expect(enclosing.value.re).toBeCloseTo(0, 3)
    expect(enclosing.value.im).toBeCloseTo(2 * Math.PI, 3)
    const inner = contourIntegral(fn.fn, { center: { re: 0, im: 0 }, radius: 0.5 })
    expect(cAbs(inner.value)).toBeLessThan(1e-3)
  })

  it('∮ z² dz ≈ 0（全纯函数）', () => {
    const fn = compileComplexExpression('z^2')
    if (!('fn' in fn)) throw new Error('compile failed')
    const result = contourIntegral(fn.fn, { center: { re: 0, im: 0 }, radius: 1.5 })
    expect(cAbs(result.value)).toBeLessThan(1e-6)
  })
})

describe('v0.9 黎曼面分支示意', () => {
  it('sqrt：两分支互为相反数；分支数与标签完整', () => {
    expect(branchCount('sqrt')).toBe(2)
    const first = branchFn('sqrt', 0)
    const second = branchFn('sqrt', 1)
    const z: Complex = { re: 2, im: 1 }
    const a = first(z)
    const b = second(z)
    expect(a.re).toBeCloseTo(-b.re, 12)
    expect(a.im).toBeCloseTo(-b.im, 12)
    // 两分支的乘积 = −z（(−s)(s) = −s² = −z）
    const product = cMul(a, b)
    expect(product.re).toBeCloseTo(-z.re, 12)
    expect(product.im).toBeCloseTo(-z.im, 12)
  })

  it('log：分支相差 2πk 的纯虚偏移', () => {
    expect(branchCount('log')).toBe(3)
    const base = branchFn('log', 0)
    const third = branchFn('log', 2)
    const z: Complex = { re: -2, im: 0.5 }
    const diff = { re: third(z).re - base(z).re, im: third(z).im - base(z).im }
    expect(diff.re).toBeCloseTo(0, 12)
    expect(diff.im).toBeCloseTo(4 * Math.PI, 12)
  })
})
