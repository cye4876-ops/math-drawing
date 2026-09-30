import { describe, expect, it } from 'vitest'
import { formatTick, niceStep, ticksForRange } from './ticks'

/** 提取步长的尾数（应为 1、2 或 5） */
function mantissaOf(step: number): number {
  const exponent = Math.floor(Math.log10(step))
  return step / 10 ** exponent
}

describe('ticks: niceStep', () => {
  it('步长始终是 {1,2,5}×10^k 形式', () => {
    for (let exp = -9; exp <= 9; exp++) {
      for (const factor of [1, 2, 3.7, 5, 9.9]) {
        const scale = factor * 10 ** exp
        const step = niceStep(scale)
        const mantissa = mantissaOf(step)
        const ok = [1, 2, 5].some((m) => Math.abs(mantissa - m) < 1e-9)
        expect(ok, `scale=${scale} step=${step} mantissa=${mantissa}`).toBe(true)
      }
    }
  })

  it('屏幕间距不低于下限，且不超过下限的 2.5 倍', () => {
    const minSpacing = 64
    for (let exp = -6; exp <= 9; exp++) {
      for (const factor of [1, 2, 3.7, 5, 9.9]) {
        const scale = factor * 10 ** exp
        const step = niceStep(scale, minSpacing)
        const spacing = step * scale
        expect(spacing, `scale=${scale}`).toBeGreaterThanOrEqual(minSpacing * (1 - 1e-9))
        expect(spacing, `scale=${scale}`).toBeLessThan(minSpacing * 2.5 * (1 + 1e-9))
      }
    }
  })
})

describe('ticks: ticksForRange', () => {
  it('生成范围内所有步长倍数', () => {
    const ticks = ticksForRange(-1.7, 2.3, 0.5)
    expect(ticks).toEqual([-1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2])
  })

  it('含边界刻度', () => {
    expect(ticksForRange(0, 1, 0.5)).toEqual([0, 0.5, 1])
  })

  it('非法参数返回空数组', () => {
    expect(ticksForRange(0, 1, 0)).toEqual([])
    expect(ticksForRange(1, 0, 0.5)).toEqual([])
    expect(ticksForRange(Number.NaN, 1, 0.5)).toEqual([])
  })
})

describe('ticks: formatTick', () => {
  it('按步长保留小数位', () => {
    expect(formatTick(0.600_000_000_000_000_1, 0.2)).toBe('0.6')
    expect(formatTick(-2.5, 0.5)).toBe('-2.5')
    expect(formatTick(3, 0.5)).toBe('3.0')
    expect(formatTick(2, 1)).toBe('2')
    expect(formatTick(1000, 5)).toBe('1000')
  })

  it('零统一输出 "0"，不出现 -0', () => {
    expect(formatTick(0, 0.2)).toBe('0')
    expect(formatTick(-0, 1)).toBe('0')
    expect(formatTick(-1e-17, 1e-7)).toBe('0')
  })

  it('极端量级退化为指数形式', () => {
    expect(formatTick(12_345_678, 1e5)).toBe('1.23e7')
    expect(formatTick(4e-7, 1e-7)).toBe('4e-7')
    expect(formatTick(-5.5e-7, 1e-7)).toBe('-5.5e-7')
  })

  it('同一组刻度的标签唯一（-0 不会与 0 重复）', () => {
    const labels = ticksForRange(-2, 2, 0.5).map((v) => formatTick(v, 0.5))
    expect(new Set(labels).size).toBe(labels.length)
  })
})
