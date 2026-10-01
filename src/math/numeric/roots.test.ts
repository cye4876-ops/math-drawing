import { describe, expect, it } from 'vitest'
import { findIntersections, findRoots } from './roots'

describe('numeric/roots: 常规求根', () => {
  it('x³-x 在 [-2,2] 内找到 3 个零点（-1, 0, 1），不遗漏不重复', () => {
    const f = (x: number): number => x ** 3 - x
    const df = (x: number): number => 3 * x * x - 1
    const roots = findRoots(f, -2, 2, { derivative: df })
    expect(roots).toHaveLength(3)
    const xs = roots.map((r) => r.x)
    expect(xs[0]).toBeCloseTo(-1, 10)
    expect(xs[1]).toBeCloseTo(0, 10)
    expect(xs[2]).toBeCloseTo(1, 10)
    expect(roots.every((r) => !r.repeated)).toBe(true)
  })

  it('sin(x) 在 [-2π, 2π] 内找到 5 个零点（±2π, ±π, 0）', () => {
    const roots = findRoots(Math.sin, -2 * Math.PI, 2 * Math.PI, { derivative: Math.cos })
    expect(roots).toHaveLength(5)
    const expected = [-2 * Math.PI, -Math.PI, 0, Math.PI, 2 * Math.PI]
    roots.forEach((root, i) => {
      expect(Math.abs(root.x - (expected[i] as number))).toBeLessThan(1e-10)
    })
  })

  it('导数恒为 0（牛顿步无效）时回退二分仍能找到全部根', () => {
    const f = (x: number): number => x ** 3 - x
    const roots = findRoots(f, -2, 2, { derivative: () => 0 })
    expect(roots).toHaveLength(3)
    expect(roots.map((r) => Math.round(r.x))).toEqual([-1, 0, 1])
  })

  it('无根函数返回空数组；非法范围返回空数组', () => {
    expect(findRoots((x) => x * x + 1, -5, 5)).toHaveLength(0)
    expect(findRoots(Math.sin, 5, 5)).toHaveLength(0)
    expect(findRoots(Math.sin, 1, -1)).toHaveLength(0)
  })
})

describe('numeric/roots: 重根与触根', () => {
  it('x²（偶数重根）：检测到 0 处唯一的触根并标记 repeated', () => {
    const roots = findRoots((x) => x * x, -2, 2)
    expect(roots).toHaveLength(1)
    expect(Math.abs((roots[0] as { x: number }).x)).toBeLessThan(1e-8)
    expect(roots[0]?.repeated).toBe(true)
  })

  it('(x-1)²(x+2)：混合根——-2 为常规根、(1) 为重根', () => {
    const f = (x: number): number => (x - 1) ** 2 * (x + 2)
    const roots = findRoots(f, -3, 3)
    expect(roots).toHaveLength(2)
    expect(roots[0]?.x).toBeCloseTo(-2, 8)
    expect(roots[0]?.repeated).toBe(false)
    expect(roots[1]?.x).toBeCloseTo(1, 8)
    expect(roots[1]?.repeated).toBe(true)
  })

  it('|x|（不可导触根）：作为 repeated 标记检出', () => {
    const roots = findRoots((x) => Math.abs(x), -2, 2)
    expect(roots).toHaveLength(1)
    expect(roots[0]?.repeated).toBe(true)
    expect(Math.abs((roots[0] as { x: number }).x)).toBeLessThan(1e-8)
  })

  it('1/x：跨极点的符号变化不产生伪根', () => {
    const roots = findRoots((x) => 1 / x, -2, 2)
    expect(roots).toHaveLength(0)
  })

  it('恒零函数按约定返回空数组', () => {
    expect(findRoots(() => 0, -2, 2)).toHaveLength(0)
  })

  it('floor(x) 的零平台只记一个根', () => {
    const roots = findRoots(Math.floor, -3, 3)
    expect(roots).toHaveLength(1)
    expect(roots[0]?.x).toBeCloseTo(0, 3)
  })
})

describe('numeric/roots: 曲线求交', () => {
  it('sin(x) 与 cos(x) 在 [-2π, 2π] 内找到全部 4 个交点', () => {
    const intersections = findIntersections(Math.sin, Math.cos, -2 * Math.PI, 2 * Math.PI, {
      derivative: Math.cos,
      derivative2: (x: number) => -Math.sin(x),
    })
    expect(intersections).toHaveLength(4)
    const expectedXs = [(-7 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI / 4, (5 * Math.PI) / 4]
    intersections.forEach((hit, i) => {
      expect(Math.abs(hit.x - (expectedXs[i] as number))).toBeLessThan(1e-10)
      expect(Math.abs(Math.abs(hit.y) - Math.SQRT1_2)).toBeLessThan(1e-10)
    })
  })

  it('无交点返回空数组；y 坐标来自第一条曲线', () => {
    expect(
      findIntersections(
        (x) => x + 1,
        (x) => x - 1,
        -5,
        5,
      ),
    ).toHaveLength(0)
    const hits = findIntersections(
      (x) => x,
      (x) => 2 * x,
      -5,
      5,
    )
    expect(hits).toHaveLength(1)
    expect(hits[0]?.x).toBeCloseTo(0, 10)
    expect(hits[0]?.y).toBeCloseTo(0, 10)
  })
})

describe('numeric/roots: 性能与预算', () => {
  it('常规函数求根在 1 秒内返回', () => {
    const t0 = performance.now()
    findRoots(Math.sin, -100, 100, { derivative: Math.cos, scanSamples: 4096 })
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(1000)
  })

  it('迭代次数有上限：病态函数不会死循环', () => {
    // 处处不连续的函数（sign）：不产生有效根，且快速返回
    const t0 = performance.now()
    const roots = findRoots((x) => (x > 0 ? 1 : -1), -1, 1, { maxIterations: 30 })
    expect(performance.now() - t0).toBeLessThan(500)
    expect(Array.isArray(roots)).toBe(true)
  })
})
