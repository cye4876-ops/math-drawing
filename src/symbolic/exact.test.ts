/**
 * 精确值引擎测试（v2.8）：常量/根式/三角表/对数/指数/显示格式。
 */
import { describe, expect, it } from 'vitest'
import { parse } from '../expr'
import { ExactError, exactFromInt, evalExact, formatExact } from './exact'

function show(source: string): string {
  return formatExact(evalExact(parse(source)))
}

describe('精确值：常量与有理数', () => {
  it.each([
    ['2', '2'],
    ['1/3', '1/3'],
    ['-5/6', '−5/6'],
    ['pi', 'π'],
    ['tau', '2π'],
    ['pi/2', 'π/2'],
    ['2*pi', '2π'],
    ['pi^2', 'π²'],
    ['pi^2/2', 'π²/2'],
    ['3/(4*pi)', '3/(4π)'],
    ['(1+sqrt(5))/2', '√5/2 + 1/2'],
  ])('%s → %s', (source, expected) => {
    expect(show(source)).toBe(expected)
  })
})

describe('精确值：根式归一化', () => {
  it.each([
    ['sqrt(4)', '2'],
    ['sqrt(8)', '2√2'],
    ['sqrt(12)', '2√3'],
    ['sqrt(18)', '3√2'],
    ['sqrt(2)/2', '√2/2'],
    ['1/sqrt(2)', '√2/2'],
    ['4/3*sqrt(2)', '4√2/3'],
    ['sqrt(2)*sqrt(3)', '√6'],
    ['sqrt(2)*sqrt(8)', '4'],
    ['sqrt(2)^3', '2√2'],
    ['sqrt(1/2)', '√2/2'],
    ['2^(3/2)', '2√2'],
    ['sqrt(pi^2)', 'π'],
    ['sqrt(2*pi^2)', 'π·√2'],
  ])('%s → %s', (source, expected) => {
    expect(show(source)).toBe(expected)
  })
})

describe('精确值：三角函数表', () => {
  it.each([
    ['sin(0)', '0'],
    ['sin(pi)', '0'],
    ['sin(pi/6)', '1/2'],
    ['sin(pi/4)', '√2/2'],
    ['sin(pi/3)', '√3/2'],
    ['sin(pi/2)', '1'],
    ['sin(5*pi/6)', '1/2'],
    ['sin(7*pi/6)', '−1/2'],
    ['sin(-pi/6)', '−1/2'],
    ['sin(3*pi/2)', '−1'],
    ['cos(0)', '1'],
    ['cos(pi/3)', '1/2'],
    ['cos(2*pi/3)', '−1/2'],
    ['cos(pi)', '−1'],
    ['tan(pi/4)', '1'],
    ['tan(pi/3)', '√3'],
    ['tan(-pi/6)', '−√3/3'],
    ['asin(1)', 'π/2'],
    ['asin(1/2)', 'π/6'],
    ['acos(0)', 'π/2'],
    ['acos(-1)', 'π'],
    ['atan(1)', 'π/4'],
    ['atan(sqrt(3))', 'π/3'],
  ])('%s → %s', (source, expected) => {
    expect(show(source)).toBe(expected)
  })

  it('非表内角度抛 ExactError', () => {
    expect(() => evalExact(parse('sin(1)'))).toThrow(ExactError)
    expect(() => evalExact(parse('sin(pi/5)'))).toThrow(ExactError)
  })
})

describe('精确值：对数与指数', () => {
  it.each([
    ['ln(1)', '0'],
    ['ln(e)', '1'],
    ['ln(e^2)', '2'],
    ['ln(4)', '2 ln 2'],
    ['ln(1/2)', '−ln 2'],
    ['ln(6)', 'ln 2 + ln 3'],
    ['exp(0)', '1'],
    ['exp(1)', 'e'],
    ['exp(2)', 'e²'],
    ['exp(-1)', '1/e'],
    ['exp(-2)', '1/e²'],
    ['exp(ln(3))', '3'],
    ['exp(ln(2)/2)', '√2'],
    ['e^2*e^-1', 'e'],
    ['e - 1', 'e − 1'],
    ['e + e', '2e'],
  ])('%s → %s', (source, expected) => {
    expect(show(source)).toBe(expected)
  })

  it('对数与指数越界抛 ExactError', () => {
    expect(() => evalExact(parse('ln(0)'))).toThrow(ExactError)
    expect(() => evalExact(parse('ln(-1)'))).toThrow(ExactError)
    expect(() => evalExact(parse('exp(e)'))).toThrow(ExactError)
  })
})

describe('精确值：环境绑定与求值', () => {
  it('变量替换', () => {
    expect(formatExact(evalExact(parse('x^2'), { x: exactFromInt(3) }))).toBe('9')
    expect(formatExact(evalExact(parse('pi*x'), { x: exactFromInt(2) }))).toBe('2π')
  })

  it('未绑定变量抛错', () => {
    expect(() => evalExact(parse('x+1'))).toThrow(ExactError)
  })

  it('阶乘', () => {
    expect(formatExact(evalExact(parse('5!')))).toBe('120')
  })
})
