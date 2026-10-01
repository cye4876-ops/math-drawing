/**
 * 不等式求解测试（v0.9）：解集区间、开闭端点、孤立点、数轴文本。
 */
import { describe, expect, it } from 'vitest'
import { formatInterval, formatSolutionSet, solveInequality } from './inequality'

describe('v0.9 符号：不等式求解', () => {
  it('x² − 1 < 0 → (−1, 1)（开区间）', () => {
    const result = solveInequality('x^2 - 1 < 0')
    expect(result.ok).toBe(true)
    expect(result.intervals).toEqual([{ lo: -1, hi: 1, loClosed: false, hiClosed: false }])
    expect(formatSolutionSet(result.intervals)).toBe('(-1, 1)')
  })

  it('x² ≥ 4 → (−∞, −2] ∪ [2, +∞)（闭端点）', () => {
    const result = solveInequality('x^2 >= 4')
    expect(result.ok).toBe(true)
    expect(formatSolutionSet(result.intervals)).toBe('(-∞, -2] ∪ [2, +∞)')
    expect(result.intervals[0]!.hiClosed).toBe(true)
    expect(result.intervals[1]!.loClosed).toBe(true)
  })

  it('2x + 3 ≤ 0 → (−∞, −1.5]', () => {
    const result = solveInequality('2*x + 3 <= 0')
    expect(formatSolutionSet(result.intervals)).toBe('(-∞, -1.5]')
  })

  it('x² + 1 > 0 → 全体实数；x² + 1 < 0 → 无解', () => {
    const all = solveInequality('x^2 + 1 > 0')
    expect(all.ok).toBe(true)
    expect(all.intervals).toEqual([{ lo: null, hi: null, loClosed: false, hiClosed: false }])
    const none = solveInequality('x^2 + 1 < 0')
    expect(none.ok).toBe(true)
    expect(none.intervals).toEqual([])
    expect(none.message).toBe('无实数解')
  })

  it('孤立点：(x−1)² ≤ 0 → {1}', () => {
    const result = solveInequality('(x-1)^2 <= 0')
    expect(result.ok).toBe(true)
    expect(result.intervals).toEqual([{ lo: 1, hi: 1, loClosed: true, hiClosed: true }])
    expect(formatSolutionSet(result.intervals)).toBe('{1}')
  })

  it('高次：x³ − x > 0 → (−1, 0) ∪ (1, +∞)', () => {
    const result = solveInequality('x^3 - x > 0')
    expect(result.ok).toBe(true)
    expect(formatSolutionSet(result.intervals)).toBe('(-1, 0) ∪ (1, +∞)')
  })

  it('非严格不等式端点合并：x² ≤ 1 → [−1, 1]', () => {
    const result = solveInequality('x^2 <= 1')
    expect(formatSolutionSet(result.intervals)).toBe('[-1, 1]')
  })

  it('边界情形：与方程组联用（≤ 与 ≥ 且含退化）与错误输入', () => {
    // 0 ≤ 0（恒真）
    const always = solveInequality('0*x <= 0')
    expect(always.ok).toBe(true)
    // 非不等式 → 明确提示
    const wrong = solveInequality('x^2 = 1')
    expect(wrong.ok).toBe(false)
    expect(wrong.message).toContain('不等式')
    // 非多项式 → 明确提示
    const transcendental = solveInequality('sin(x) < 0')
    expect(transcendental.ok).toBe(false)
    expect(transcendental.message).toContain('多项式')
  })

  it('formatInterval 单区间文本', () => {
    expect(formatInterval({ lo: null, hi: null, loClosed: false, hiClosed: false })).toBe(
      '(-∞, +∞)',
    )
    expect(formatInterval({ lo: 2, hi: null, loClosed: true, hiClosed: false })).toBe('[2, +∞)')
  })
})
