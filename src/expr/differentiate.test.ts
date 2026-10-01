import { describe, expect, it } from 'vitest'
import {
  makeBinary as bin,
  makeCall as call,
  makeConstant as cnst,
  makeNumber as num,
  makePiecewise as pw,
  makeUnary as un,
  makeVariable as v,
} from './ast'
import { differentiate, simplify } from './differentiate'
import { ExprEvaluationError } from './errors'
import { compile } from './evaluate'
import { parse } from './parser'

/** 确定性随机数（mulberry32） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 数值微分（Richardson 外推，精度优于普通中心差分） */
function numericDerivative(f: (x: number) => number, x: number): number {
  const h = 1e-3
  const d1 = (f(x + h) - f(x - h)) / (2 * h)
  const d2 = (f(x + h / 2) - f(x - h / 2)) / h
  return (4 * d2 - d1) / 3
}

function symbolicDerivative(source: string, x: number): number {
  const df = compile(differentiate(parse(source)))
  return df({ x })
}

function assertDerivativeMatchesNumeric(source: string, x: number): void {
  const f = compile(parse(source))
  const numeric = numericDerivative((value) => f({ x: value }), x)
  const symbolic = symbolicDerivative(source, x)
  expect(
    Math.abs(symbolic - numeric),
    `${source} 在 x=${x}：符号=${symbolic} 数值=${numeric}`,
  ).toBeLessThanOrEqual(1e-6 * Math.abs(numeric) + 1e-8)
}

describe('differentiate: 基础规则', () => {
  it('常数与常量的导数为 0', () => {
    expect(differentiate(parse('5'))).toEqual(num(0))
    expect(differentiate(parse('pi'))).toEqual(num(0))
  })

  it('变量的导数', () => {
    expect(differentiate(parse('x'))).toEqual(num(1))
    expect(differentiate(parse('y'))).toEqual(num(0))
    expect(differentiate(parse('y'), 'y')).toEqual(num(1))
  })

  it('幂法则：x^2 → 2x（含保守化简）', () => {
    expect(differentiate(parse('x^2'))).toEqual(bin('*', num(2), v('x')))
    expect(differentiate(parse('x^3'))).toEqual(bin('*', num(3), bin('^', v('x'), num(2))))
  })

  it('和差法则', () => {
    expect(differentiate(parse('x + 7'))).toEqual(num(1))
    expect(differentiate(parse('x - x'))).toEqual(num(0))
    expect(differentiate(parse('x + y'), 'x')).toEqual(num(1))
  })

  it('常数倍保持常数：d(5x) = 5', () => {
    expect(differentiate(parse('5*x'))).toEqual(num(5))
  })

  it('乘积法则：x*sin(x) → sin(x) + x*cos(x)', () => {
    expect(differentiate(parse('x*sin(x)'))).toEqual(
      bin('+', call('sin', [v('x')]), bin('*', v('x'), call('cos', [v('x')]))),
    )
  })

  it('商法则：x/2 → 0.5（常量折叠）', () => {
    expect(differentiate(parse('x/2'))).toEqual(num(0.5))
  })

  it('商法则：1/x', () => {
    expect(differentiate(parse('1/x'))).toEqual(bin('/', num(-1), bin('^', v('x'), num(2))))
  })

  it('链式法则：sin(x) → cos(x)', () => {
    expect(differentiate(parse('sin(x)'))).toEqual(call('cos', [v('x')]))
    expect(differentiate(parse('cos(x)'))).toEqual(un('-', call('sin', [v('x')])))
  })

  it('指数法则：2^x 与 e^x', () => {
    expect(differentiate(parse('2^x'))).toEqual(bin('*', bin('^', num(2), v('x')), num(Math.LN2)))
    expect(differentiate(parse('e^x'))).toEqual(
      bin('*', bin('^', cnst('e'), v('x')), call('ln', [cnst('e')])),
    )
  })

  it('一般幂式（底与指数都含变量）：x^x', () => {
    const result = differentiate(parse('x^x'))
    expect(result.type).toBe('binary')
  })
})

describe('differentiate: 初等函数导数表（数值验证）', () => {
  const cases: [string, number][] = [
    ['sin(x)', 0.5],
    ['cos(x)', 0.5],
    ['tan(x)', 0.4],
    ['asin(x)', 0.3],
    ['acos(x)', 0.3],
    ['atan(x)', 0.4],
    ['sinh(x)', 0.4],
    ['cosh(x)', 0.4],
    ['tanh(x)', 0.4],
    ['asinh(x)', 0.4],
    ['acosh(x)', 1.5],
    ['atanh(x)', 0.3],
    ['exp(x)', 0.5],
    ['ln(x)', 1.5],
    ['log(x)', 1.5],
    ['log(x, 3)', 1.5],
    ['log2(x)', 1.5],
    ['log10(x)', 1.5],
    ['sqrt(x)', 1.5],
    ['cbrt(x)', 1.5],
    ['abs(x)', -0.7],
    ['erf(x)', 0.5],
    ['pow(x, 2.2)', 1.3],
    ['x*sin(x)', 0.7],
    ['sin(x)/x', 1.3],
    ['(x + 1)/(x - 1)', 2.2],
    ['sin(x)*exp(-x^2)', 0.37],
    ['{x < 0: x^2, x >= 0: x^3}', 1.2],
  ]

  for (const [source, x] of cases) {
    it(`d/dx ${source} 在 x=${x} 与数值微分一致`, () => {
      assertDerivativeMatchesNumeric(source, x)
    })
  }
})

describe('differentiate: 规格验收（sin(x)*exp(-x^2) 100 点对比）', () => {
  const source = 'sin(x)*exp(-x^2)'

  it('与中心差分对比，相对误差 < 1e-6（x 在 [-2.5, 2.5] 随机 100 点）', () => {
    const expr = parse(source)
    const df = compile(differentiate(expr))
    const f = compile(expr)
    const rng = mulberry32(42)

    for (let i = 0; i < 100; i++) {
      const x = -2.5 + 5 * rng()
      const symbolic = df({ x })
      const numeric = numericDerivative((value) => f({ x: value }), x)
      // 相对误差 < 1e-6；绝对项 1e-8 为数值微分方法自身的精度下限（f' 接近 0 处）
      expect(
        Math.abs(symbolic - numeric),
        `x=${x}：符号=${symbolic} 数值=${numeric}`,
      ).toBeLessThanOrEqual(1e-6 * Math.abs(symbolic) + 1e-8)
    }
  })

  it('解析解对照：f′(0) = 1、f′(1) = e⁻¹(cos1 − 2sin1)', () => {
    const df = compile(differentiate(parse(source)))
    expect(df({ x: 0 })).toBeCloseTo(1, 10)
    expect(df({ x: 1 })).toBeCloseTo(Math.exp(-1) * (Math.cos(1) - 2 * Math.sin(1)), 10)
  })
})

describe('differentiate: 分段函数', () => {
  it('对每个分支的值求导，条件保持不变', () => {
    expect(differentiate(parse('{x < 0: x^2, x >= 0: x}'))).toEqual(
      pw([
        { condition: bin('<', v('x'), num(0)), value: bin('*', num(2), v('x')) },
        { condition: bin('>=', v('x'), num(0)), value: num(1) },
      ]),
    )
  })
})

describe('differentiate: 不支持的情形给出结构化错误', () => {
  const unsupported = [
    'floor(x)',
    'ceil(x)',
    'round(x)',
    'gamma(x)',
    'x % 2',
    'x < 1',
    'x!',
    'atan2(y, x)',
    'min(x, 1)',
  ]

  for (const source of unsupported) {
    it(`不可求导：${source}`, () => {
      try {
        differentiate(parse(source))
        expect.unreachable('应当抛出错误')
      } catch (error) {
        expect(error).toBeInstanceOf(ExprEvaluationError)
        expect((error as Error).message).toContain('不可求导')
      }
    })
  }

  it('赋值语句不可求导', () => {
    expect(() => differentiate(parse('a = x'))).toThrowError(/赋值语句不可求导/)
  })
})

describe('differentiate: simplify 导出', () => {
  it('常数折叠', () => {
    expect(simplify(parse('2 + 3'))).toEqual(num(5))
    expect(simplify(parse('2 * 3^2'))).toEqual(num(18))
  })

  it('单位元规则', () => {
    expect(simplify(parse('1*x'))).toEqual(v('x'))
    expect(simplify(parse('x*1'))).toEqual(v('x'))
    expect(simplify(parse('x + 0'))).toEqual(v('x'))
    expect(simplify(parse('x - 0'))).toEqual(v('x'))
    expect(simplify(parse('x/1'))).toEqual(v('x'))
    expect(simplify(parse('x^1'))).toEqual(v('x'))
    expect(simplify(parse('x^0'))).toEqual(num(1))
  })

  it('函数常数折叠', () => {
    expect(simplify(parse('sin(0)'))).toEqual(num(0))
    expect(simplify(parse('cos(0)'))).toEqual(num(1))
  })
})
