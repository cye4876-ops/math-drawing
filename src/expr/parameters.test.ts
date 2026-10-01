import { describe, expect, it } from 'vitest'
import { ExprFormatError } from './errors'
import { parse, parseProgram } from './parser'
import {
  DEFAULT_PARAMETER_BOUNDS,
  deserializeParameters,
  extractParameters,
  serializeParameters,
} from './parameters'

describe('parameters: 自由变量识别', () => {
  it('a*sin(b*x + c) 识别出参数 {a, b, c}', () => {
    expect(extractParameters(parse('a*sin(b*x + c)'))).toEqual([
      { name: 'a', value: 1, ...DEFAULT_PARAMETER_BOUNDS },
      { name: 'b', value: 1, ...DEFAULT_PARAMETER_BOUNDS },
      { name: 'c', value: 1, ...DEFAULT_PARAMETER_BOUNDS },
    ])
  })

  it('自变量 x/y/t/theta 不作为参数', () => {
    expect(extractParameters(parse('x + y + t + theta'))).toEqual([])
  })

  it('无变量表达式没有参数', () => {
    expect(extractParameters(parse('2 + 3'))).toEqual([])
  })

  it('常量不参与', () => {
    expect(extractParameters(parse('pi*x + e'))).toEqual([])
  })
})

describe('parameters: 赋值定义默认值', () => {
  it('常数赋值作为默认值', () => {
    const params = extractParameters(parseProgram('a = 3; b = 2; y = a*sin(b*x)'))
    expect(params.map((p) => [p.name, p.value])).toEqual([
      ['a', 3],
      ['b', 2],
    ])
  })

  it('常量表达式默认值（2*pi）', () => {
    const params = extractParameters(parse('a = 2*pi'))
    expect(params).toEqual([{ name: 'a', value: 2 * Math.PI, ...DEFAULT_PARAMETER_BOUNDS }])
  })

  it('含变量的赋值默认回退为 1', () => {
    const params = extractParameters(parse('a = x + 1'))
    expect(params).toEqual([{ name: 'a', value: 1, ...DEFAULT_PARAMETER_BOUNDS }])
  })
})

describe('parameters: 序列化', () => {
  const sample = [
    { name: 'a', value: 2, min: -5, max: 5, step: 0.5 },
    { name: 'b', value: 1, min: -10, max: 10, step: 0.1 },
  ]

  it('JSON 往返一致', () => {
    expect(deserializeParameters(serializeParameters(sample))).toEqual(sample)
  })

  it('序列化结果是合法 JSON', () => {
    expect(() => JSON.parse(serializeParameters(sample))).not.toThrow()
  })

  it('拒绝非法输入', () => {
    expect(() => deserializeParameters('{}')).toThrowError(ExprFormatError)
    expect(() => deserializeParameters('[1]')).toThrowError(ExprFormatError)
    expect(() => deserializeParameters('[{"name":"a"}]')).toThrowError(/value/)
    expect(() =>
      deserializeParameters('[{"name":"","value":1,"min":0,"max":1,"step":0.1}]'),
    ).toThrowError(/name/)
    expect(() =>
      deserializeParameters('[{"name":"a","value":"x","min":0,"max":1,"step":0.1}]'),
    ).toThrowError(/有限数/)
  })
})
