/**
 * 定积分精确结果测试（v2.8）：精确显示 + 数值对照安全网 + 回退策略。
 */
import { describe, expect, it } from 'vitest'
import { definiteIntegral, type FallbackIntegralResult } from './definite'

function exactDisplay(fn: string, lo: string, hi: string): string {
  const outcome = definiteIntegral(fn, 'x', lo, hi)
  if (outcome.kind !== 'exact') {
    throw new Error(`期望精确结果，实际：${outcome.kind} / ${outcome.reason}`)
  }
  return outcome.display
}

function fallbackOf(fn: string, lo: string, hi: string): FallbackIntegralResult {
  const outcome = definiteIntegral(fn, 'x', lo, hi)
  if (outcome.kind !== 'none' && outcome.kind !== 'approx') {
    throw new Error(`期望回退结果，实际为：${outcome.kind}`)
  }
  return outcome
}

describe('定积分：精确结果', () => {
  it.each([
    ['sin(x)', '0', 'pi', '2'],
    ['x^2', '0', '1', '1/3'],
    ['1/x', '1', 'e', '1'],
    ['1/x', '1', '4', '2 ln 2'],
    ['exp(x)', '0', '1', 'e − 1'],
    ['exp(x)', '0', '2', 'e² − 1'],
    ['x', '0', 'pi', 'π²/2'],
    ['x^2', '0', 'pi', 'π³/3'],
    ['sqrt(x)', '0', '2', '4√2/3'],
    ['sqrt(x)', '0', '1', '2/3'],
    ['cos(x)', '0', 'pi/2', '1'],
    ['cos(x)', '-pi/2', 'pi/2', '2'],
    ['sin(x)', '0', 'pi/2', '1'],
    ['ln(x)', '1', 'e', '1'],
    ['x', '-1', '1', '0'],
    ['2*x+1', '0', '1', '2'],
    ['sin(x)^2', '0', 'pi', 'π/2'],
    ['sin(4*x)^2', '0', 'pi', 'π/2'],
    ['cos(x)^2', '0', 'pi/2', 'π/4'],
    ['tan(x)^2', '0', 'pi/4', '−π/4 + 1'],
    ['sin(x)*cos(x)', '0', 'pi/2', '1/2'],
  ])('∫ %s dx on [%s, %s] = %s', (fn, lo, hi, expected) => {
    expect(exactDisplay(fn, lo, hi)).toBe(expected)
  })

  it('数值校验一致时给出数值与原函数', () => {
    const outcome = definiteIntegral('sin(x)', 'x', '0', 'pi')
    if (outcome.kind !== 'exact') throw new Error('期望精确结果')
    expect(outcome.value).toBeCloseTo(2, 12)
    expect(outcome.numeric.value).toBeCloseTo(2, 10)
    expect(outcome.antiderivativeText.length).toBeGreaterThan(0)
    expect(outcome.loText).toBe('0')
    expect(outcome.hiText).toBe('π')
  })
})

describe('定积分：回退策略', () => {
  it('端点无法精确求值 → 回退数值且给出原因', () => {
    const outcome = fallbackOf('sin(x)', '0', '1')
    expect(outcome.numeric?.value).toBeCloseTo(1 - Math.cos(1), 9)
    expect(outcome.reason).toContain('端点')
  })

  it('超过符号积分规则集 → 回退数值', () => {
    const outcome = fallbackOf('sin(x^2)', '0', '2')
    expect(outcome.reason).toContain('原函数')
    expect(outcome.numeric?.value).toBeCloseTo(0.8047764893, 8)
  })

  it('表达式无法解析 → 回退', () => {
    const outcome = fallbackOf('sin(', '0', 'pi')
    expect(outcome.reason).toContain('解析')
  })

  it('参数代入（滑杆参数）', () => {
    const outcome = definiteIntegral('a*x', 'x', '0', '1', { a: 0.5 })
    if (outcome.kind !== 'exact') throw new Error(`期望精确结果：${outcome.reason}`)
    expect(outcome.display).toBe('1/4')
  })

  it('符号系数（参数）在三角函数中进入分母', () => {
    const outcome = definiteIntegral('sin(a*x)', 'x', '0', 'pi/2', { a: 2 })
    if (outcome.kind !== 'exact') throw new Error(`期望精确结果：${outcome.reason}`)
    expect(outcome.display).toBe('1')
  })
})
