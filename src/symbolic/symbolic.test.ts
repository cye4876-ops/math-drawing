/**
 * 符号计算模块测试（v0.9）：
 * 多项式引擎、化简（sin²+cos²）、解方程（复根/高次）、积分（数值导数对照）、
 * 极限（标准模式/多项式比）、LaTeX（KaTeX 渲染验证）。
 */
import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { compile, parse, type Expr } from '../expr'
import {
  astToPoly,
  durandKerner,
  factorOverRationals,
  polyAdd,
  polyDegree,
  polyDivMod,
  polyEval,
  polyGcd,
  polyMul,
  polyPow,
  polyRoots,
  polyToAst,
} from './poly'
import { exprEqual, simplify } from './simplify'
import { solveEquation, verifySolution } from './solve'
import { integrate } from './integrate'
import { limit } from './limit'
import { toLatex } from './latex'

const number = (value: number): Expr => ({ type: 'number', value })

describe('v0.9 符号：多项式引擎', () => {
  it('四则运算与幂', () => {
    expect(polyMul([-1, 0, 1], [-1, 1])).toEqual([1, -1, -1, 1]) // (x²−1)(x−1)
    expect(polyPow([0, 1], 3)).toEqual([0, 0, 0, 1])
    expect(polyAdd([1, 2], [-1, 1])).toEqual([0, 3])
    expect(polyEval([1, 2, 1], 3)).toBe(16)
  })

  it('长除法与 gcd', () => {
    const division = polyDivMod([1, -1, -1, 1], [-1, 1])
    expect(division?.quotient).toEqual([-1, 0, 1])
    expect(division?.remainder).toEqual([0])
    const gcd = polyGcd([-1, 0, 1], [-2, 1]) // (x²−1) 与 (x−2)：互素
    expect(polyDegree(gcd)).toBe(0)
    const gcd2 = polyGcd([-1, 0, 1], [-1, 1]) // 与 (x−1) → x−1
    expect(Math.abs(polyEval(gcd2, 1))).toBeLessThan(1e-9)
    expect(polyDegree(gcd2)).toBe(1)
  })

  it('astToPoly：多项式识别与拒绝', () => {
    expect(astToPoly(parse('(x+1)^2'), 'x')).toEqual([1, 2, 1])
    expect(astToPoly(parse('x/2'), 'x')).toEqual([0, 0.5])
    expect(astToPoly(parse('1/x'), 'x')).toBeNull()
    expect(astToPoly(parse('sin(x)'), 'x')).toBeNull()
    expect(astToPoly(parse('y*x'), 'x')).toBeNull() // 自由变量 y 不被接受为系数
  })

  it('polyToAst 往返', () => {
    const source = parse('3*x^3 - 2*x + 7')
    const poly = astToPoly(source, 'x')!
    const rebuilt = polyToAst(poly, 'x')
    expect(astToPoly(rebuilt, 'x')).toEqual(poly)
  })

  it('有理根因式分解：x²−1 与 (x−1)²(x+2)', () => {
    const simple = factorOverRationals([-1, 0, 1])!
    expect(simple.leading).toBe(1)
    expect(simple.linear).toEqual([
      { root: -1, multiplicity: 1 },
      { root: 1, multiplicity: 1 },
    ])
    expect(simple.remainder).toBeNull()
    // (x−1)²(x+2) = x³ − 3x + 2
    const multiple = factorOverRationals([2, -3, 0, 1])!
    expect(multiple.linear).toContainEqual({ root: 1, multiplicity: 2 })
    expect(multiple.linear).toContainEqual({ root: -2, multiplicity: 1 })
  })

  it('polyRoots：x³−6x²+11x−6 → 1,2,3；x²+1 → ±i', () => {
    const cubic = polyRoots([-6, 11, -6, 1])!
    expect(cubic.map((root) => Math.round(root.re))).toEqual([1, 2, 3])
    const quadratic = polyRoots([1, 0, 1])!
    expect(quadratic.length).toBe(2)
    expect(quadratic.some((root) => Math.abs(root.im - 1) < 1e-9)).toBe(true)
    expect(quadratic.some((root) => Math.abs(root.im + 1) < 1e-9)).toBe(true)
  })

  it('Durand-Kerner：x³−1 的三个根', () => {
    const roots = durandKerner([-1, 0, 0, 1])!
    expect(roots.length).toBe(3)
    const real = roots.find((root) => Math.abs(root.im) < 1e-6)!
    expect(Math.abs(real.re - 1)).toBeLessThan(1e-6)
    const complex = roots.filter((root) => Math.abs(root.im) > 0.5)
    expect(complex.length).toBe(2)
    for (const root of complex) {
      expect(Math.abs(root.re + 0.5)).toBeLessThan(1e-6)
      expect(Math.abs(Math.abs(root.im) - Math.sqrt(3) / 2)).toBeLessThan(1e-6)
    }
  })
})

describe('v0.9 符号：化简', () => {
  const check = (source: string, expected: Expr): void => {
    const result = simplify(parse(source))
    expect(exprEqual(result, expected), `${source} → ${JSON.stringify(result)}`).toBe(true)
  }

  it('常数折叠与恒等式', () => {
    check('2 + 3 * 4', number(14))
    check('x + 0', parse('x'))
    check('x * 1', parse('x'))
    check('x - x', number(0))
    check('x / x', number(1))
    check('x^1', parse('x'))
    check('ln(e)', number(1))
    check('-(-x)', parse('x'))
  })

  it('三角恒等式：sin²x + cos²x = 1', () => {
    check('sin(x)^2 + cos(x)^2', number(1))
    check('cos(x)^2 + sin(x)^2', number(1))
    check('1 + sin(x)^2 + cos(x)^2', number(2))
  })

  it('规则步数上限：深层表达式 1 秒内完成', () => {
    let source = 'x'
    for (let k = 0; k < 80; k++) source = `(${source} + 0) * 1`
    const start = performance.now()
    const result = simplify(parse(source))
    expect(performance.now() - start).toBeLessThan(1000)
    expect(exprEqual(result, parse('x'))).toBe(true)
  })
})

describe('v0.9 符号：解方程', () => {
  it('x²+1 = 0 → ±i', () => {
    const result = solveEquation('x^2 + 1 = 0')
    expect(result.ok).toBe(true)
    expect(result.method).toBe('polynomial')
    const texts = result.solutions.map((item) => item.text)
    expect(texts).toContain('i')
    expect(texts).toContain('-i')
  })

  it('x³−6x²+11x−6 = 0 → 1,2,3', () => {
    const result = solveEquation('x^3 - 6*x^2 + 11*x - 6 = 0')
    expect(result.ok).toBe(true)
    expect(result.solutions.map((item) => item.text)).toEqual(['1', '2', '3'])
  })

  it('线性方程与高次（x⁴−5x²+4 = 0 → ±1, ±2）', () => {
    expect(solveEquation('3*x = 7').solutions.map((item) => item.text)).toEqual(['7/3'])
    const quartic = solveEquation('x^4 - 5*x^2 + 4 = 0')
    expect(quartic.solutions.map((item) => item.text)).toEqual(['-2', '-1', '1', '2'])
  })

  it('简单超越：2^x = 8 → 3；ln(x) = 1 → e', () => {
    const exponential = solveEquation('2^x = 8')
    expect(exponential.method).toBe('exponential')
    expect(exponential.solutions[0]!.re).toBeCloseTo(3, 12)
    const logarithm = solveEquation('ln(x) = 1')
    expect(logarithm.method).toBe('logarithm')
    expect(logarithm.solutions[0]!.re).toBeCloseTo(Math.E, 9)
  })

  it('数值兜底：sin(x) = 0.5 找到 π/6 附近解', () => {
    const result = solveEquation('sin(x) = 0.5')
    expect(result.ok).toBe(true)
    expect(result.method).toBe('numeric')
    expect(result.solutions.some((item) => Math.abs(item.re - Math.PI / 6) < 1e-6)).toBe(true)
  })

  it('verifySolution 校验', () => {
    expect(verifySolution('x^2 - 4 = 0', 'x', 2)).toBe(true)
    expect(verifySolution('x^2 - 4 = 0', 'x', 3)).toBe(false)
  })
})

/** 数值导数对照：F′ ≈ f */
function checkAntiderivative(source: string, points: number[]): void {
  const f = parse(source)
  const F = integrate(f)
  expect(F, `∫ ${source} dx 应可积`).not.toBeNull()
  const fCompiled = compile(f)
  const FCompiled = compile(F!)
  for (const x of points) {
    const h = 1e-6
    const derivative = (FCompiled({ x: x + h }) - FCompiled({ x: x - h })) / (2 * h)
    const value = fCompiled({ x })
    const scale = 1 + Math.abs(value)
    expect(Math.abs(derivative - value), `x=${x}: F′=${derivative}，f=${value}`).toBeLessThan(
      1e-3 * scale,
    )
  }
}

describe('v0.9 符号：积分', () => {
  it('基本函数数值导数对照', () => {
    const defaultPoints = [-2.3, -0.7, 0.4, 1.2, 2.8]
    const positivePoints = [0.3, 0.8, 1.5, 3.2]
    checkAntiderivative('x^2', defaultPoints)
    checkAntiderivative('2*x + 3', defaultPoints)
    checkAntiderivative('sin(x)', defaultPoints)
    checkAntiderivative('cos(x)', defaultPoints)
    checkAntiderivative('e^x', defaultPoints)
    checkAntiderivative('exp(x)', defaultPoints)
    checkAntiderivative('1/x', [-2.3, -0.7, 0.4, 1.2, 2.8])
    checkAntiderivative('sqrt(x)', positivePoints)
    checkAntiderivative('ln(x)', positivePoints)
    checkAntiderivative('(3*x+1)^4', [-0.2, 0.3, 1.1])
    checkAntiderivative('1/(1+x^2)', defaultPoints)
    checkAntiderivative('1/(2*x+3)', [-0.2, 0.3, 1.1, -2.2])
    checkAntiderivative('cos(2*x+1)', defaultPoints)
  })

  it('分部积分：x·sin(x)、x·e^x', () => {
    const points = [-2.3, -0.7, 0.4, 1.2, 2.8]
    checkAntiderivative('x*sin(x)', points)
    checkAntiderivative('x*e^x', [-1.5, 0.2, 1.7])
  })

  it('有理二次分母：1/(4−x²)', () => {
    checkAntiderivative('1/(4-x^2)', [-2.5, -2.2, 0.4, 1.7, 2.4])
  })

  it('∫ x² dx = x³/3（结构检查）', () => {
    const result = integrate(parse('x^2'))!
    const poly = astToPoly(result, 'x')!
    expect(polyDegree(poly)).toBe(3)
    expect(poly[3]!).toBeCloseTo(1 / 3, 12)
  })

  it('不可积时返回 null（sin(x²)）', () => {
    expect(integrate(parse('sin(x^2)'))).toBeNull()
  })
})

describe('v0.9 符号：极限', () => {
  it('sin(x)/x → 1（标准模式）', () => {
    const result = limit(parse('sin(x)/x'), 'x', 0)
    expect(result.ok).toBe(true)
    expect(result.method).toBe('pattern')
    expect(result.value).toBeCloseTo(1, 12)
  })

  it('(1−cos x)/x² → 1/2；tan(x)/x → 1', () => {
    expect(limit(parse('(1-cos(x))/x^2'), 'x', 0).value).toBeCloseTo(0.5, 12)
    expect(limit(parse('tan(x)/x'), 'x', 0).value).toBeCloseTo(1, 12)
  })

  it('多项式比（x → ∞）', () => {
    const ratio = limit(parse('(2*x^3 - x)/(x^3 + 4)'), 'x', 'inf')
    expect(ratio.ok).toBe(true)
    expect(ratio.method).toBe('polynomial-ratio')
    expect(ratio.value).toBeCloseTo(2, 12)
    expect(limit(parse('(3*x + 1)/(x^2 - 2)'), 'x', 'inf').value).toBeCloseTo(0, 12)
    const diverging = limit(parse('x^2'), 'x', 'inf')
    expect(diverging.infinite).toBe(1)
  })

  it('发散与不收敛判定', () => {
    expect(limit(parse('x^2'), 'x', '-inf').value).toBeNull()
    expect(limit(parse('x^2'), 'x', '-inf').infinite).toBe(1)
    const oscillating = limit(parse('sin(x)'), 'x', 'inf')
    expect(oscillating.ok).toBe(false)
  })

  it('直接代入（连续函数）', () => {
    const result = limit(parse('x^2 + 3*x'), 'x', 2)
    expect(result.method).toBe('substitute')
    expect(result.value).toBeCloseTo(10, 9)
  })
})

describe('v0.9 符号：LaTeX 输出（KaTeX 渲染验证）', () => {
  const cases: [string, string][] = [
    ['x^2/2', '\\frac{x^{2}}{2}'],
    ['sqrt(x) + 1', '\\sqrt{x} + 1'],
    ['sin(x)', '\\sin\\left(x\\right)'],
    ['pi*r^2', '\\pi \\cdot r^{2}'],
    ['abs(x)', '\\left|x\\right|'],
    ['(x+1)/(x-1)', '\\frac{x + 1}{x - 1}'],
    ['x <= 2', 'x \\le 2'],
  ]

  it('关键结构输出', () => {
    for (const [source, expected] of cases) {
      expect(toLatex(parse(source)), source).toBe(expected)
    }
  })

  it('全部输出可被 KaTeX 渲染（throwOnError）', () => {
    const sources = [
      ...cases.map(([source]) => source),
      '(-2)^x',
      '3*x^2 - 2*x + 7',
      'ln(e)',
      'gamma(x)',
      'x!',
      'floor(x) + ceil(x)',
      'tanh(x) + atan(x) + asin(x)',
    ]
    for (const source of sources) {
      const latex = toLatex(parse(source))
      expect(
        () => katex.renderToString(latex, { throwOnError: true }),
        `${source} → ${latex}`,
      ).not.toThrow()
    }
  })
})
