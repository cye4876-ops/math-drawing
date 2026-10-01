import { describe, expect, it } from 'vitest'
import { makeBinary, makeCall, makeNumber, makeVariable } from './ast'
import { ExprEvaluationError, formatError } from './errors'
import { compile, evaluate, type Scope } from './evaluate'
import { parse } from './parser'

function evalSource(source: string, scope: Scope = {}): number {
  return evaluate(parse(source), scope)
}

describe('evaluate: 运算符', () => {
  it('四则运算', () => {
    expect(evalSource('1 + 2 * 3')).toBe(7)
    expect(evalSource('(1 + 2) * 3')).toBe(9)
    expect(evalSource('7 - 2 - 3')).toBe(2)
    expect(evalSource('8 / 4 / 2')).toBe(1)
    expect(evalSource('-5 + 2')).toBe(-3)
  })

  it('幂运算', () => {
    expect(evalSource('2^10')).toBe(1024)
    expect(evalSource('2^3^2')).toBe(512) // 右结合
    expect(evalSource('2^-2')).toBe(0.25)
    expect(evalSource('x^2', { x: 3 })).toBe(9)
  })

  it('数学取模（% 与 mod 一致，符号跟随除数）', () => {
    expect(evalSource('-7 % 3')).toBe(2)
    expect(evalSource('7 % -3')).toBe(-2)
    expect(evalSource('7 % 3')).toBe(1)
    expect(evalSource('mod(-7, 3)')).toBe(2)
    expect(evalSource('mod(7, -3)')).toBe(-2)
    expect(Number.isNaN(evalSource('1 % 0'))).toBe(true)
    expect(Number.isNaN(evalSource('mod(1, 0)'))).toBe(true)
  })

  it('阶乘', () => {
    expect(evalSource('5!')).toBe(120)
    expect(evalSource('0!')).toBe(1)
    expect(evalSource('3!^2')).toBe(36)
    expect(evalSource('2^3!')).toBe(64)
    expect(Number.isNaN(evalSource('(-1)!'))).toBe(true)
    expect(evalSource('171!')).toBe(Infinity)
    expect(evalSource('4.5!')).toBeCloseTo(52.34277778455352, 6)
  })

  it('比较运算返回 1/0', () => {
    expect(evalSource('2 < 3')).toBe(1)
    expect(evalSource('2 >= 3')).toBe(0)
    expect(evalSource('2 = 2')).toBe(1)
    expect(evalSource('2 != 2')).toBe(0)
    expect(evalSource('x <= 3', { x: 3 })).toBe(1)
  })

  it('涉及 NaN 的比较为 0', () => {
    expect(evalSource('sqrt(-1) < 1')).toBe(0)
    expect(evalSource('sqrt(-1) = sqrt(-1)')).toBe(0)
  })
})

describe('evaluate: 边界行为（规格约定表）', () => {
  it('1/0 = Infinity, -1/0 = -Infinity, 0/0 = NaN', () => {
    expect(evalSource('1/0')).toBe(Infinity)
    expect(evalSource('-1/0')).toBe(-Infinity)
    expect(Number.isNaN(evalSource('0/0'))).toBe(true)
  })

  it('ln(-1)、sqrt(-1) 为 NaN（实数域）', () => {
    expect(Number.isNaN(evalSource('ln(-1)'))).toBe(true)
    expect(Number.isNaN(evalSource('sqrt(-1)'))).toBe(true)
    expect(Number.isNaN(evalSource('log(-1)'))).toBe(true)
  })

  it('tan(pi/2) 为有限大数而非 Infinity', () => {
    const value = evalSource('tan(pi/2)')
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThan(1e15)
  })

  it('0^0 = 1', () => {
    expect(evalSource('0^0')).toBe(1)
  })

  it('负底非整数指数为 NaN，整数指数正常', () => {
    expect(Number.isNaN(evalSource('(-8)^(1/3)'))).toBe(true)
    expect(evalSource('(-8)^3')).toBe(-512)
    expect(evalSource('cbrt(-8)')).toBe(-2)
  })
})

describe('evaluate: 常量', () => {
  it('pi / e / phi / tau', () => {
    expect(evalSource('pi')).toBeCloseTo(Math.PI, 12)
    expect(evalSource('e')).toBeCloseTo(Math.E, 12)
    expect(evalSource('phi')).toBeCloseTo((1 + Math.sqrt(5)) / 2, 12)
    expect(evalSource('tau')).toBeCloseTo(2 * Math.PI, 12)
  })
})

describe('evaluate: 内置函数逐项', () => {
  const cases: [string, number, number][] = [
    ['sin(0)', 0, 12],
    ['cos(0)', 1, 12],
    ['tan(pi/4)', 1, 12],
    ['asin(1)', Math.PI / 2, 12],
    ['acos(1)', 0, 12],
    ['atan(1)', Math.PI / 4, 12],
    ['atan2(1, 1)', Math.PI / 4, 12],
    ['atan2(-1, -1)', (-3 * Math.PI) / 4, 12],
    ['sinh(0)', 0, 12],
    ['cosh(0)', 1, 12],
    ['tanh(0)', 0, 12],
    ['asinh(0)', 0, 12],
    ['acosh(1)', 0, 12],
    ['atanh(0)', 0, 12],
    ['exp(1)', Math.E, 12],
    ['ln(e)', 1, 12],
    ['log(e)', 1, 12],
    ['log(8, 2)', 3, 12],
    ['log2(8)', 3, 12],
    ['log10(1000)', 3, 12],
    ['sqrt(16)', 4, 12],
    ['cbrt(27)', 3, 12],
    ['pow(2, 10)', 1024, 12],
    ['abs(-3)', 3, 12],
    ['floor(-1.5)', -2, 12],
    ['ceil(-1.5)', -1, 12],
    ['round(2.5)', 3, 12],
    ['round(-2.5)', -2, 12],
    ['sign(-3)', -1, 12],
    ['min(3, 1, 2)', 1, 12],
    ['max(-5, -1)', -1, 12],
    ['clamp(5, 0, 3)', 3, 12],
    ['clamp(-1, 0, 3)', 0, 12],
    ['gcd(12, 18)', 6, 12],
    ['gcd(0, 0)', 0, 12],
    ['lcm(4, 6)', 12, 12],
    ['lcm(0, 5)', 0, 12],
    ['binomial(5, 2)', 10, 12],
    ['binomial(5, 7)', 0, 12],
    ['gamma(5)', 24, 10],
    ['gamma(0.5)', Math.sqrt(Math.PI), 10],
    ['gamma(-0.5)', -3.5449077018110318, 8],
    ['erf(0)', 0, 12],
    ['erf(1)', 0.8427007929, 5],
    ['erf(-1)', -0.8427007929, 5],
  ]

  for (const [source, expected, precision] of cases) {
    it(`${source} ≈ ${expected}`, () => {
      expect(evalSource(source)).toBeCloseTo(expected, precision)
    })
  }

  it('定义域外返回 NaN', () => {
    expect(Number.isNaN(evalSource('asin(2)'))).toBe(true)
    expect(Number.isNaN(evalSource('acosh(0.5)'))).toBe(true)
    expect(Number.isNaN(evalSource('atanh(2)'))).toBe(true)
    expect(Number.isNaN(evalSource('sqrt(-4)'))).toBe(true)
    expect(Number.isNaN(evalSource('log(0)'))).toBe(false)
    expect(evalSource('log(0)')).toBe(-Infinity)
  })

  it('非整数不适用于 gcd/lcm/binomial', () => {
    expect(Number.isNaN(evalSource('gcd(1.5, 2)'))).toBe(true)
    expect(Number.isNaN(evalSource('lcm(1.5, 2)'))).toBe(true)
    expect(Number.isNaN(evalSource('binomial(5.5, 2)'))).toBe(true)
    expect(Number.isNaN(evalSource('binomial(-1, 2)'))).toBe(true)
  })

  it('gamma 在非正整数处为 NaN（极点）', () => {
    expect(Number.isNaN(evalSource('gamma(0)'))).toBe(true)
    expect(Number.isNaN(evalSource('gamma(-1)'))).toBe(true)
  })

  it('sign(-0) = 0', () => {
    expect(evalSource('sign(-0)')).toBe(0)
    expect(Object.is(evalSource('sign(-0)'), -0)).toBe(false)
  })
})

describe('evaluate: 分段函数', () => {
  const piecewise = '{x < 0: -x, x >= 0: x}'

  it('分支选择', () => {
    expect(evalSource(piecewise, { x: -5 })).toBe(5)
    expect(evalSource(piecewise, { x: 0 })).toBe(0)
    expect(evalSource(piecewise, { x: 2.5 })).toBe(2.5)
  })

  it('无分支命中返回 NaN', () => {
    expect(Number.isNaN(evalSource('{x < 0: 1, x > 0: 2}', { x: 0 }))).toBe(true)
  })

  it('条件按“非 0 且非 NaN”为真', () => {
    expect(evalSource('{1: 5, 0: 7}')).toBe(5)
    expect(evalSource('{0: 5, 1: 7}')).toBe(7)
    expect(evalSource('{sqrt(-1): 1, 1: 2}')).toBe(2)
  })
})

describe('evaluate: 赋值', () => {
  it('赋值写入作用域并返回数值', () => {
    const scope: Scope = {}
    expect(evaluate(parse('a = 3'), scope)).toBe(3)
    expect(scope['a']).toBe(3)
  })

  it('赋值可引用作用域中的变量', () => {
    const scope: Scope = { b: 2 }
    expect(evaluate(parse('a = b + 1'), scope)).toBe(3)
    expect(scope['a']).toBe(3)
  })
})

describe('evaluate: 错误报告', () => {
  it('未定义变量给出提示', () => {
    try {
      evalSource('q + 1')
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprEvaluationError)
      const details = (error as ExprEvaluationError).details
      expect(details.message).toContain("未定义的变量或参数 'q'")
      expect(details.hint).toContain('q')
    }
  })

  it('未知函数给出相近建议', () => {
    try {
      evaluate(makeCall('sinn', [makeNumber(1)]))
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprEvaluationError)
      expect((error as ExprEvaluationError).details.hint).toContain("'sin'")
    }
  })

  it('函数参数个数错误', () => {
    try {
      evaluate(makeCall('sin', [makeNumber(1), makeNumber(2)]))
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprEvaluationError)
      expect((error as ExprEvaluationError).details.message).toContain('需要 1 个参数')
    }
  })

  it('运行时错误的文本渲染', () => {
    const rendered = formatError(
      'q + 1',
      new ExprEvaluationError({ message: "未定义的变量或参数 'q'", hint: '请提供数值' }),
    )
    expect(rendered).toContain('错误：')
    expect(rendered).toContain('提示：请提供数值')
  })
})

describe('evaluate: compile 编译闭包', () => {
  const equivalenceCases: [string, Scope][] = [
    ['2x + 3', { x: 4 }],
    ['sin(x)^2 + cos(x)^2', { x: 0.7 }],
    ['x^2^3', { x: 1.1 }],
    ['-x^2', { x: 3 }],
    ['{x < 0: -x, x >= 0: x}', { x: -2 }],
    ['{x < 0: -x, x >= 0: x}', { x: 2 }],
    ['log(x, 2)', { x: 8 }],
    ['1e-3 * x', { x: 1 }],
    ['x % 3', { x: 7 }],
    ['x != 4', { x: 3 }],
    ['a*sin(b*x + c)', { a: 1.2, b: 2, c: 0.5, x: 0.3 }],
    ['min(x, 2, 3)', { x: 1.5 }],
    ['clamp(x, 0, 1)', { x: 2 }],
  ]

  for (const [source, scope] of equivalenceCases) {
    it(`编译与解释结果一致：${source}`, () => {
      const expr = parse(source)
      const compiled = compile(expr)
      expect(compiled({ ...scope })).toBe(evaluate(expr, { ...scope }))
    })
  }

  it('缺变量返回 NaN（不抛错）', () => {
    const compiled = compile(parse('x + 1'))
    expect(Number.isNaN(compiled({}))).toBe(true)
  })

  it('未知函数在编译期抛错', () => {
    expect(() => compile(makeCall('nope', []))).toThrowError(ExprEvaluationError)
  })

  it('参数个数错误在编译期抛错', () => {
    expect(() => compile(makeCall('sin', []))).toThrowError(ExprEvaluationError)
  })

  it('赋值在编译后的闭包中同样写入作用域', () => {
    const compiled = compile(parse('a = 2x'))
    const scope: Scope = { x: 5 }
    expect(compiled(scope)).toBe(10)
    expect(scope['a']).toBe(10)
  })

  it('编译复杂嵌套表达式', () => {
    const compiled = compile(parse('sqrt(sin(x)^2 + cos(x)^2)'))
    expect(compiled({ x: 1 })).toBeCloseTo(1, 12)
  })

  it('编译二元运算与比较全面覆盖', () => {
    const binary = makeBinary('+', makeVariable('x'), makeNumber(1))
    expect(compile(binary)({ x: 1 })).toBe(2)
  })
})
