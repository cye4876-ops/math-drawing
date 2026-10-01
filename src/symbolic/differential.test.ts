/**
 * 符号计算 × nerdamer 差分测试（v0.9）：
 * 随机生成用例，对比「展开」「有理因式分解」「方程求解」结果（数值采样等价），
 * 要求一致率 ≥ 95%（规格验收）。
 */
import { describe, expect, it } from 'vitest'
import nerdamer from 'nerdamer'
import 'nerdamer/Algebra'
import 'nerdamer/Calculus'
import 'nerdamer/Solve'
import { compile, makeBinary, makeNumber, makeVariable, parse, type Expr } from '../expr'
import { astToPoly, factorOverRationals, polyMul, polyToAst, type Poly } from './poly'
import { solveEquation } from './solve'

/** 线性同余伪随机（确定性） */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    return state / 0x100000000
  }
}

const SAMPLE_POINTS = [-3.7, -1.9, -0.6, 0.3, 1.4, 2.8, 4.1]

/** 采样等价判定：所有点数值一致（容差 1e-9 相对） */
function equivalent(a: Expr, b: Expr, points = SAMPLE_POINTS): boolean {
  let fa: (scope: Record<string, number>) => number
  let fb: (scope: Record<string, number>) => number
  try {
    fa = compile(a)
    fb = compile(b)
  } catch {
    return false
  }
  for (const x of points) {
    const va = fa({ x })
    const vb = fb({ x })
    if (Number.isFinite(va) && Number.isFinite(vb)) {
      if (Math.abs(va - vb) > 1e-9 * (1 + Math.abs(va) + Math.abs(vb))) return false
    } else if (!Number.isFinite(va) && !Number.isFinite(vb)) {
      continue
    } else {
      return false
    }
  }
  return true
}

function tryParse(source: string): Expr | null {
  try {
    return parse(source)
  } catch {
    return null
  }
}

/** nerdamer 表达式 → 我们的 AST（解析其 toString 输出） */
function toOurExpr(input: string): Expr | null {
  try {
    return tryParse(nerdamer(input).toString())
  } catch {
    return null
  }
}

describe('v0.9 差分：展开（nerdamer expand）', () => {
  it('30 例展开一致率 ≥ 95%', () => {
    const rand = lcg(20240601)
    const sources: string[] = [
      '(x+5)*(x-3)',
      '(2*x-3)*(x+5)',
      '(x+2)*(x-3)*(x^2+1)',
      '(x-1)^3',
      '(x+1)*(x+2)*(x+3)*(x+4)',
      '(3*x-2)^2',
      'x*(x-1)*(x+1)',
      '(x^2+2*x+1)*(x-2)',
      '(2*x+1)*(3*x-4)*(x+7)',
      '(x-5)*(x^2+5*x+25)',
    ]
    for (let k = 0; k < 20; k++) {
      const a1 = 1 + Math.floor(rand() * 3)
      const b1 = Math.floor(rand() * 13) - 6 || -1
      const a2 = 1 + Math.floor(rand() * 3)
      const b2 = Math.floor(rand() * 13) - 6 || -1
      const c = 1 + Math.floor(rand() * 4)
      sources.push(`(${a1}*x+${b1})*(${a2}*x+${b2})*(x^2+${c})`)
    }
    let consistent = 0
    const failures: string[] = []
    for (const source of sources) {
      const oursPoly = astToPoly(parse(source), 'x')
      const reference = toOurExpr(`expand(${source})`)
      const ours = oursPoly ? polyToAst(oursPoly, 'x') : null
      if (ours && reference && equivalent(ours, reference)) consistent++
      else failures.push(source)
    }
    if (failures.length > 0) console.warn('展开不一致：', failures)
    expect(consistent / sources.length).toBeGreaterThanOrEqual(0.95)
  })
})

describe('v0.9 差分：有理因式分解（nerdamer factor）', () => {
  it('30 例因式分解一致率 ≥ 95%', () => {
    const rand = lcg(777001)
    const cases: Poly[] = [
      [-1, 0, 1],
      [6, -5, 1],
      [2, -3, 0, 1],
      [4, 0, -5, 0, 1],
      [-6, 11, -6, 1],
    ]
    for (let k = 0; k < 25; k++) {
      const leading = 1 + Math.floor(rand() * 3)
      const roots = [0, 1, 2].map(() => Math.floor(rand() * 13) - 6)
      let poly: Poly = [leading]
      for (const root of roots) poly = polyMul(poly, [-root, 1])
      cases.push(poly)
    }
    let consistent = 0
    const failures: string[] = []
    for (const poly of cases) {
      const expanded = polyToAst(poly, 'x')
      const factorization = factorOverRationals(poly)
      const reference = toOurExpr(`factor(${expandedToSource(expanded)})`)
      const ours = factorization ? rebuild(factorization) : null
      if (ours && reference && equivalent(ours, reference)) consistent++
      else failures.push(expandedToSource(expanded))
    }
    if (failures.length > 0) console.warn('因式分解不一致：', failures)
    expect(consistent / cases.length).toBeGreaterThanOrEqual(0.95)
  })

  function expandedToSource(expr: Expr): string {
    // polyToAst 的输出与解析器语法兼容，可直接作为字符串
    return exprToSource(expr)
  }

  function exprToSource(expr: Expr): string {
    switch (expr.type) {
      case 'number':
        return expr.value < 0 ? `(${expr.value})` : String(expr.value)
      case 'variable':
        return expr.name
      case 'unary':
        return `(-${exprToSource(expr.operand)})`
      case 'binary':
        return `(${exprToSource(expr.left)} ${expr.op} ${exprToSource(expr.right)})`
      default:
        throw new Error('不支持')
    }
  }

  function rebuild(factorization: ReturnType<typeof factorOverRationals>): Expr {
    const f = factorization!
    let result: Expr = makeNumber(f.leading)
    for (const item of f.linear) {
      for (let k = 0; k < item.multiplicity; k++) {
        result = makeBinary('*', result, {
          type: 'binary',
          op: '-',
          left: makeVariable('x'),
          right: makeNumber(item.root),
        })
      }
    }
    if (f.remainder) result = makeBinary('*', result, polyToAst(f.remainder, 'x'))
    return result
  }
})

describe('v0.9 差分：方程求解（nerdamer solve）', () => {
  it('15 例实数根集一致率 ≥ 95%', () => {
    const rand = lcg(424242)
    const polys: Poly[] = [
      [6, -5, 1],
      [-6, 11, -6, 1],
      [-4, 0, 1],
      [-1, 0, 1],
      [2, -3, 0, 1],
    ]
    for (let k = 0; k < 10; k++) {
      const roots = [0, 1].map(() => Math.floor(rand() * 11) - 5)
      let poly: Poly = [1]
      for (const root of roots) poly = polyMul(poly, [-root, 1])
      polys.push(poly)
    }
    let consistent = 0
    const failures: string[] = []
    for (const poly of polys) {
      const source = `${exprSource(polyToAst(poly, 'x'))} = 0`
      const oursResult = solveEquation(source)
      const ours = oursResult.solutions
        .filter((item) => Math.abs(item.im) < 1e-9)
        .map((item) => item.re)
        .sort((a, b) => a - b)
      let reference: number[] | null
      try {
        const elements = nerdamer(`solve(${source}, x)`).symbol.elements
        reference = []
        for (const element of elements) {
          const text = String(element)
          if (text.includes('i')) {
            reference = null
            break
          }
          const expr = tryParse(text)
          if (!expr) {
            reference = null
            break
          }
          const value = compile(expr)({})
          if (Number.isFinite(value)) reference.push(value)
        }
        reference?.sort((a, b) => a - b)
      } catch {
        reference = null
      }
      const equal =
        reference !== null &&
        reference.length === ours.length &&
        reference.every((value, index) => Math.abs(value - ours[index]!) < 1e-6)
      if (equal) consistent++
      else failures.push(source)
    }
    if (failures.length > 0) console.warn('求解不一致：', failures)
    expect(consistent / polys.length).toBeGreaterThanOrEqual(0.95)
  })

  function exprSource(expr: Expr): string {
    switch (expr.type) {
      case 'number':
        return expr.value < 0 ? `(${expr.value})` : String(expr.value)
      case 'variable':
        return expr.name
      case 'unary':
        return `(-${exprSource(expr.operand)})`
      case 'binary':
        return `(${exprSource(expr.left)} ${expr.op} ${exprSource(expr.right)})`
      default:
        throw new Error('不支持')
    }
  }
})
