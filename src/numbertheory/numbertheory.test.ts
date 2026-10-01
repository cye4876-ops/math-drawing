/**
 * 数论模块测试（v0.9）：筛/π(x)/间隙/约数、Ulam 坐标与渲染、模运算图案、Collatz。
 */
import { describe, expect, it } from 'vitest'
import {
  divisorCount,
  isPrime,
  primeCounting,
  primeCurvePoints,
  primeGaps,
  primesUpTo,
  sievePrimes,
} from './primes'
import { renderSacks, renderUlam, spiralCoord } from './ulam'
import { modularValue, renderModularPattern } from './modular'
import {
  collatzScatter,
  collatzSequence,
  collatzStoppingTimes,
  collatzTotalStoppingTime,
  renderCollatzHeat,
} from './collatz'

describe('v0.9 数论：筛法与 π(x)', () => {
  it('sievePrimes(30) 恰好标出前十个小质数', () => {
    const marks = sievePrimes(30)
    const primes: number[] = []
    for (let i = 0; i < marks.length; i++) if (marks[i] === 1) primes.push(i)
    expect(primes).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29])
  })

  it('π(100) = 25；primesUpTo 与筛一致', () => {
    expect(primeCounting(100)[100]).toBe(25)
    expect(primesUpTo(100).length).toBe(25)
  })

  it('isPrime 单点判定', () => {
    expect(isPrime(2)).toBe(true)
    expect(isPrime(97)).toBe(true)
    expect(isPrime(91)).toBe(false)
    expect(isPrime(1)).toBe(false)
    expect(isPrime(-7)).toBe(false)
  })

  it('质数间隙序列', () => {
    expect(primeGaps(30)).toEqual([1, 2, 2, 4, 2, 4, 2, 4, 6])
  })

  it('约数个数 σ₀', () => {
    expect(divisorCount(1)).toBe(1)
    expect(divisorCount(6)).toBe(4)
    expect(divisorCount(12)).toBe(6)
    expect(divisorCount(28)).toBe(6)
    expect(divisorCount(16)).toBe(5)
  })

  it('π(x) vs x/ln x 对比曲线数据', () => {
    const curve = primeCurvePoints(100, 300, 200)
    expect(curve.pi.length).toBe(513)
    // π(0) = 0 位于横轴底部；π(100) = 25 = 纵轴最大值 → 顶端
    expect(curve.pi[0]!.y).toBeCloseTo(200 - 12, 6)
    expect(curve.pi[curve.pi.length - 1]!.y).toBeCloseTo(12, 6)
    expect(curve.pi[curve.pi.length - 1]!.x).toBeCloseTo(300 - 34 + 34, 6)
    // x/ln x 曲线从 x=3 起（约 16 个采样点被跳过）
    expect(curve.xlog.length).toBeGreaterThan(490)
    const last = curve.xlog[curve.xlog.length - 1]!
    expect(last.y).toBeGreaterThan(curve.pi[curve.pi.length - 1]!.y)
    // 单调不降（π 与 x/ln x 在采样区间内均不减）
    for (let i = 1; i < curve.pi.length; i++) {
      expect(curve.pi[i]!.y).toBeLessThanOrEqual(curve.pi[i - 1]!.y + 1e-9)
    }
  })
})

describe('v0.9 Ulam 螺旋', () => {
  it('前 10 个数字的经典坐标', () => {
    expect(spiralCoord(1)).toEqual({ x: 0, y: 0 })
    expect(spiralCoord(2)).toEqual({ x: 1, y: 0 })
    expect(spiralCoord(3)).toEqual({ x: 1, y: 1 })
    expect(spiralCoord(4)).toEqual({ x: 0, y: 1 })
    expect(spiralCoord(5)).toEqual({ x: -1, y: 1 })
    expect(spiralCoord(6)).toEqual({ x: -1, y: 0 })
    expect(spiralCoord(7)).toEqual({ x: -1, y: -1 })
    expect(spiralCoord(8)).toEqual({ x: 0, y: -1 })
    expect(spiralCoord(9)).toEqual({ x: 1, y: -1 })
    expect(spiralCoord(10)).toEqual({ x: 2, y: -1 })
  })

  it('环结束点：(2k+1)² 位于 (k, −k)', () => {
    expect(spiralCoord(25)).toEqual({ x: 2, y: -2 })
    expect(spiralCoord(49)).toEqual({ x: 3, y: -3 })
  })

  it('坐标在 1..100 内两两不同（覆盖整片方形区域）', () => {
    const seen = new Set<string>()
    for (let n = 1; n <= 100; n++) {
      const { x, y } = spiralCoord(n)
      expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(5)
      seen.add(`${x},${y}`)
    }
    expect(seen.size).toBe(100)
  })

  it('renderUlam：尺寸正确、中心 1 为红色、质数 2 为金色', () => {
    const size = 5
    const data = renderUlam(size, 1)
    expect(data.length).toBe(size * size * 4)
    const half = Math.floor(size / 2)
    // n=1 在中心 (2,2)：(gx=0, gy=0) → px=2, py=2
    let offset = (half * size + half) * 4
    expect(data[offset]!).toBeGreaterThan(200) // 红
    // n=2 在 (1,0) → px=3, py=2
    offset = (half * size + half + 1) * 4
    expect(data[offset]!).toBeGreaterThan(200) // 金（红通道高）
    expect(data[offset + 2]!).toBeLessThan(150) // 蓝通道低
  })
})

describe('v0.9 Sacks 螺旋', () => {
  it('渲染尺寸与背景填充；含前景像素', () => {
    const data = renderSacks(200, 64, 64)
    expect(data.length).toBe(64 * 64 * 4)
    let foreground = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 30 || data[i + 1]! > 30) foreground++
    }
    expect(foreground).toBeGreaterThan(50)
  })
})

describe('v0.9 模运算图案', () => {
  it('modularValue：乘法 / 幂 / 最大公约数', () => {
    expect(modularValue(3, 4, 5, 'product')).toBe(2)
    expect(modularValue(2, 5, 7, 'power')).toBe(4) // 32 mod 7
    expect(modularValue(12, 18, 20, 'gcd')).toBe(6)
    // 幂第 1 列恒等于底数
    for (let i = 1; i <= 7; i++) expect(modularValue(i, 1, 7, 'power')).toBe(i % 7)
  })

  it('renderModularPattern：尺寸与零行特征', () => {
    const n = 8
    const cell = 2
    const data = renderModularPattern(n, 'product', cell)
    expect(data.length).toBe(n * cell * n * cell * 4)
    // i·j mod n = 0 的最小格 (1, n)（colormap t = 0 → 深紫；viridis(0) ≈ [68,1,84]）
    const j = n - 1
    const offset = j * cell * (n * cell) * 4
    expect(data[offset]!).toBeLessThan(90)
    expect(data[offset + 1]!).toBeLessThan(40)
  })
})

describe('v0.9 Collatz', () => {
  it('27 → 111 步', () => {
    expect(collatzTotalStoppingTime(27)).toBe(111)
  })

  it('小数列轨迹正确', () => {
    expect(collatzSequence(6)).toEqual([6, 3, 10, 5, 16, 8, 4, 2, 1])
    expect(collatzTotalStoppingTime(1)).toBe(0)
    expect(collatzTotalStoppingTime(2)).toBe(1)
  })

  it('记忆化结果与逐点计算一致', () => {
    const times = collatzStoppingTimes(200)
    for (const n of [7, 27, 97, 128, 199]) {
      expect(collatzTotalStoppingTime(n, times)).toBe(collatzTotalStoppingTime(n))
    }
    expect(times[27]).toBe(111)
  })

  it('散点数据量与渲染尺寸', () => {
    const points = collatzScatter(50)
    expect(points.length).toBe(50)
    expect(points[26]!.stoppingTime).toBe(111)
    const data = renderCollatzHeat(100, 64, 48)
    expect(data.length).toBe(64 * 48 * 4)
  })
})
