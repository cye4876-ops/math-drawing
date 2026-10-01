/**
 * 符号积分（v0.9，有限子集）：
 * - 多项式逐项积分（先经 astToPoly 精确处理）；
 * - 线性和/差、常数倍；
 * - c·(av+b)^n（n ≠ −1 → 幂公式；n = −1 → ln|av+b|）；
 * - A^{av+b}（含 e^{av+b}）；
 * - 初等函数表 + 线性内层换元：sin/cos/tan/ln/exp/sqrt/atan/asin；
 * - 有理二次分母：1/(A+Bv²)、1/√(A−v²)；
 * - 分部积分（(c1v+c0)·{sin v, cos v, e^v}）；
 * - 规则步数上限（超时保护）；失败返回 null（不做 Risch 完整算法）。
 */
import {
  evaluate,
  makeBinary,
  makeCall,
  makeNumber,
  makeUnary,
  type BinaryNode,
  type Expr,
} from '../expr'
import { freeOf, simplify } from './simplify'
import { astToPoly, polyDegree, polyToAst } from './poly'

class TimeoutError extends Error {}

const MAX_STEPS = 20000

function one(): Expr {
  return makeNumber(1)
}

function variable(name: string): Expr {
  return { type: 'variable', name }
}

function tryNumeric(expr: Expr): number | null {
  try {
    const value = evaluate(expr, {})
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function mulExpr(a: Expr, b: Expr): Expr {
  if (a.type === 'number' && a.value === 1) return b
  if (b.type === 'number' && b.value === 1) return a
  if (a.type === 'number' && a.value === -1) return negExpr(b)
  if (b.type === 'number' && b.value === -1) return negExpr(a)
  return makeBinary('*', a, b)
}

function negExpr(a: Expr): Expr {
  const value = tryNumeric(a)
  if (value !== null) return makeNumber(-value)
  return makeUnary('-', a)
}

/** a·v + b 的 AST（b = 0 时省略加法） */
function linearExpr(a: number, b: number, v: string): Expr {
  const scaled = a === 1 ? variable(v) : makeBinary('*', makeNumber(a), variable(v))
  return b === 0 ? scaled : makeBinary('+', scaled, makeNumber(b))
}

interface LinearForm {
  factor: Expr
  a: number
  b: number
}

/** 匹配 c·(av + b)（数值 a、b；非数值部分收进 factor） */
function matchLinearForm(expr: Expr, v: string): LinearForm | null {
  const value = tryNumeric(expr)
  if (value !== null) return { factor: one(), a: 0, b: value }
  if (expr.type === 'variable' && expr.name === v) return { factor: one(), a: 1, b: 0 }
  if (freeOf(expr, v)) return { factor: expr, a: 0, b: 0 }
  if (expr.type === 'unary' && expr.op === '-') {
    const inner = matchLinearForm(expr.operand, v)
    if (!inner) return null
    return { factor: inner.factor, a: -inner.a, b: -inner.b }
  }
  if (expr.type === 'binary' && (expr.op === '+' || expr.op === '-')) {
    const left = matchLinearForm(expr.left, v)
    const right = matchLinearForm(expr.right, v)
    if (!left || !right) return null
    const sign = expr.op === '-' ? -1 : 1
    return {
      factor: mulExpr(left.factor, right.factor),
      a: left.a + sign * right.a,
      b: left.b + sign * right.b,
    }
  }
  if (expr.type === 'binary' && expr.op === '*') {
    const left = matchLinearForm(expr.left, v)
    const right = matchLinearForm(expr.right, v)
    if (!left || !right) return null
    if (left.a === 0 && left.b !== 0) {
      return { factor: right.factor, a: left.b * right.a, b: left.b * right.b }
    }
    if (right.a === 0 && right.b !== 0) {
      return { factor: left.factor, a: right.b * left.a, b: right.b * left.b }
    }
    if (left.a === 0 && left.b === 0) {
      return { factor: mulExpr(left.factor, right.factor), a: right.a, b: right.b }
    }
    if (right.a === 0 && right.b === 0) {
      return { factor: mulExpr(left.factor, right.factor), a: left.a, b: left.b }
    }
    return null
  }
  if (expr.type === 'binary' && expr.op === '/') {
    const value2 = tryNumeric(expr.right)
    if (value2 === null || value2 === 0) return null
    const inner = matchLinearForm(expr.left, v)
    if (!inner) return null
    return { factor: inner.factor, a: inner.a / value2, b: inner.b / value2 }
  }
  return null
}

interface LinearPower {
  factor: Expr
  a: number
  b: number
  power: number
}

/** 匹配 c·(av + b)^n（n 可为负、分数 0.5 等） */
function matchLinearPower(expr: Expr, v: string): LinearPower | null {
  if (expr.type === 'binary' && expr.op === '^') {
    const exponent = tryNumeric(expr.right)
    if (exponent !== null) {
      const base = matchLinearForm(expr.left, v)
      if (base && base.a !== 0) {
        return { factor: base.factor, a: base.a, b: base.b, power: exponent }
      }
      return null
    }
  }
  if (expr.type === 'call' && expr.name === 'sqrt' && expr.args.length === 1) {
    const base = matchLinearForm(expr.args[0]!, v)
    if (base && base.a !== 0) return { factor: base.factor, a: base.a, b: base.b, power: 0.5 }
    return null
  }
  if (expr.type === 'binary' && expr.op === '*') {
    const left = matchLinearPower(expr.left, v)
    const right = matchLinearPower(expr.right, v)
    if (left && right) {
      if (left.power === 0 && left.a === 0) {
        return {
          factor: mulExpr(left.factor, right.factor),
          a: right.a,
          b: right.b,
          power: right.power,
        }
      }
      if (right.power === 0 && right.a === 0) {
        return {
          factor: mulExpr(left.factor, right.factor),
          a: left.a,
          b: left.b,
          power: left.power,
        }
      }
    }
    return null
  }
  if (expr.type === 'binary' && expr.op === '/') {
    const numerator = matchLinearPower(expr.left, v)
    if (!numerator) return null
    const denominatorValue = tryNumeric(expr.right)
    if (denominatorValue !== null && denominatorValue !== 0) {
      return {
        factor: numerator.factor,
        a: numerator.a / denominatorValue,
        b: numerator.b / denominatorValue,
        power: numerator.power,
      }
    }
    const denominator = matchLinearPower(expr.right, v)
    if (!denominator) return null
    // 纯常数分子（数值或符号）→ c/(av+b)^m
    if (numerator.a === 0 && numerator.power === 0) {
      const factor =
        numerator.b !== 0
          ? numerator.b === 1
            ? denominator.factor
            : mulExpr(makeNumber(numerator.b), denominator.factor)
          : mulExpr(numerator.factor, denominator.factor)
      return { factor, a: denominator.a, b: denominator.b, power: -denominator.power }
    }
    if (
      Math.abs(numerator.a - denominator.a) < 1e-9 &&
      Math.abs(numerator.b - denominator.b) < 1e-9
    ) {
      return {
        factor: numerator.factor,
        a: numerator.a,
        b: numerator.b,
        power: numerator.power - denominator.power,
      }
    }
    return null
  }
  const form = matchLinearForm(expr, v)
  if (!form) return null
  return { factor: form.factor, a: form.a, b: form.b, power: form.a === 0 ? 0 : 1 }
}

// ---------- 有理二次分母 ----------

function isVariable(expr: Expr, v: string): boolean {
  return expr.type === 'variable' && expr.name === v
}

/** 匹配 B·v²（v²、c·v²、v·v） */
function matchV2(expr: Expr, v: string): number | null {
  if (expr.type === 'binary' && expr.op === '^') {
    if (tryNumeric(expr.right) === 2 && isVariable(expr.left, v)) return 1
    return null
  }
  if (expr.type === 'binary' && expr.op === '*') {
    if (isVariable(expr.left, v) && isVariable(expr.right, v)) return 1
    const c = tryNumeric(expr.left)
    if (c !== null) {
      const inner = matchV2(expr.right, v)
      return inner === null ? null : c * inner
    }
    const c2 = tryNumeric(expr.right)
    if (c2 !== null) {
      const inner = matchV2(expr.left, v)
      return inner === null ? null : c2 * inner
    }
  }
  return null
}

/** 匹配 A + B·v²（数值 A、B） */
function matchAplusBv2(expr: Expr, v: string): { A: number; B: number } | null {
  if (expr.type !== 'binary' || (expr.op !== '+' && expr.op !== '-')) return null
  const leftNum = tryNumeric(expr.left)
  if (leftNum === null) return null
  const rightB = matchV2(expr.right, v)
  if (rightB === null) return null
  const sign = expr.op === '-' ? -1 : 1
  return { A: leftNum, B: sign * rightB }
}

/** 匹配 A − v²（数值 A > 0） */
function matchAminusV2(expr: Expr, v: string): number | null {
  if (expr.type !== 'binary' || expr.op !== '-') return null
  const leftNum = tryNumeric(expr.left)
  if (leftNum === null || leftNum <= 0) return null
  const rightB = matchV2(expr.right, v)
  if (rightB === null || Math.abs(rightB - 1) > 1e-12) return null
  return leftNum
}

function integrateQuadratic(expr: Expr, v: string): Expr | null {
  // c/(A + B·v²) 或 c·(A + B·v²)^{−1}
  let numeratorFactor: Expr = one()
  let denominator: Expr | null = null
  if (expr.type === 'binary' && expr.op === '/') {
    numeratorFactor = expr.left
    denominator = expr.right
  } else if (expr.type === 'binary' && expr.op === '^') {
    const exponent = tryNumeric(expr.right)
    if (exponent !== null && Math.abs(exponent + 1) < 1e-12) denominator = expr.left
  }
  if (!denominator) return null
  const c = tryNumeric(numeratorFactor)
  if (c === null) return null
  const quadratic = matchAplusBv2(denominator, v)
  if (!quadratic) return null
  const { A, B } = quadratic
  if (A > 0 && B > 0) {
    const scale = c / Math.sqrt(A * B)
    const argument = makeBinary('*', makeNumber(Math.sqrt(B / A)), variable(v))
    return makeBinary('*', makeNumber(scale), makeCall('atan', [argument]))
  }
  if (A > 0 && B < 0) {
    const sqrtA = Math.sqrt(A)
    const sqrtB = Math.sqrt(-B)
    const upper = makeBinary(
      '+',
      makeNumber(sqrtA),
      makeBinary('*', makeNumber(sqrtB), variable(v)),
    )
    const lower = makeBinary(
      '-',
      makeNumber(sqrtA),
      makeBinary('*', makeNumber(sqrtB), variable(v)),
    )
    const log = makeCall('ln', [makeCall('abs', [makeBinary('/', upper, lower)])])
    return makeBinary('*', makeNumber(c / (2 * Math.sqrt(A * Math.abs(B)))), log)
  }
  return null
}

/** c/√(A − v²) 或 c·(A − v²)^{−1/2} → c·asin(v/√A) */
function integrateArcsin(expr: Expr, v: string): Expr | null {
  let coefficient = 1
  let base: Expr | null = null
  if (expr.type === 'binary' && expr.op === '/') {
    const numerator = tryNumeric(expr.left)
    if (numerator === null) return null
    coefficient = numerator
    const denominator = expr.right
    if (
      denominator.type === 'call' &&
      denominator.name === 'sqrt' &&
      denominator.args.length === 1
    ) {
      base = denominator.args[0]!
    } else if (
      denominator.type === 'binary' &&
      denominator.op === '^' &&
      tryNumeric(denominator.right) === 0.5
    ) {
      base = denominator.left
    } else {
      return null
    }
  } else if (expr.type === 'binary' && expr.op === '^') {
    const exponent = tryNumeric(expr.right)
    if (exponent === null || Math.abs(exponent + 0.5) > 1e-12) return null
    base = expr.left
  }
  if (!base) return null
  const A = matchAminusV2(base, v)
  if (A === null) return null
  const argument = makeBinary('/', variable(v), makeNumber(Math.sqrt(A)))
  return makeBinary('*', makeNumber(coefficient), makeCall('asin', [argument]))
}

// ---------- 分部积分 ----------

function matchElementary(expr: Expr, v: string): 'sin' | 'cos' | 'exp' | null {
  if (expr.type === 'call' && expr.args.length === 1) {
    const argument = expr.args[0]!
    if (
      isVariable(argument, v) &&
      (expr.name === 'sin' || expr.name === 'cos' || expr.name === 'exp')
    ) {
      return expr.name
    }
  }
  if (expr.type === 'binary' && expr.op === '^') {
    if (expr.left.type === 'constant' && expr.left.name === 'e' && isVariable(expr.right, v))
      return 'exp'
  }
  return null
}

function matchLinearPolyFactor(expr: Expr, v: string): { c0: number; c1: number } | null {
  const poly = astToPoly(expr, v)
  if (!poly) return null
  if (polyDegree(poly) > 1) return null
  return { c0: poly[0] ?? 0, c1: poly[1] ?? 0 }
}

function integrateByParts(product: BinaryNode, v: string): Expr | null {
  const orders: [Expr, Expr][] = [
    [product.left, product.right],
    [product.right, product.left],
  ]
  for (const [polySide, otherSide] of orders) {
    const elementary = matchElementary(otherSide, v)
    if (!elementary) continue
    const linear = matchLinearPolyFactor(polySide, v)
    if (!linear) continue
    const { c0, c1 } = linear
    const inner = variable(v)
    const linearSum = makeBinary('+', makeBinary('*', makeNumber(c1), inner), makeNumber(c0))
    if (elementary === 'exp') {
      // ∫(c1 v + c0)e^v = (c1 v + c0 − c1)e^v
      const factorExpr = makeBinary('-', linearSum, makeNumber(c1))
      return makeBinary('*', factorExpr, makeCall('exp', [inner]))
    }
    if (elementary === 'sin') {
      const first = makeUnary('-', makeBinary('*', linearSum, makeCall('cos', [inner])))
      const second = makeBinary('*', makeNumber(c1), makeCall('sin', [inner]))
      return makeBinary('+', first, second)
    }
    const first = makeBinary('*', linearSum, makeCall('sin', [inner]))
    const second = makeBinary('*', makeNumber(c1), makeCall('cos', [inner]))
    return makeBinary('+', first, second)
  }
  return null
}

// ---------- 主递归 ----------

function integrateRec(expr: Expr, v: string, ctx: { steps: number }): Expr | null {
  if (++ctx.steps > MAX_STEPS) throw new TimeoutError('积分规则步数超限')

  // 与 v 无关 → c·v
  if (freeOf(expr, v)) return mulExpr(expr, variable(v))

  // 多项式（含展开的乘积/幂）：逐项积分
  const poly = astToPoly(expr, v)
  if (poly) {
    const integrated = poly.map((coefficient, degree) => coefficient / (degree + 1))
    integrated.unshift(0)
    return polyToAst(integrated, v)
  }

  // 线性和/差
  if (expr.type === 'binary' && (expr.op === '+' || expr.op === '-')) {
    const left = integrateRec(expr.left, v, ctx)
    const right = integrateRec(expr.right, v, ctx)
    if (!left || !right) return null
    return expr.op === '+' ? makeBinary('+', left, right) : makeBinary('-', left, right)
  }

  // 有理二次分母特例
  const quadratic = integrateQuadratic(expr, v)
  if (quadratic) return quadratic
  const arcsinForm = integrateArcsin(expr, v)
  if (arcsinForm) return arcsinForm

  // 一般线性幂
  const linearPower = matchLinearPower(expr, v)
  if (linearPower && linearPower.a !== 0 && linearPower.power !== 0) {
    const inner = linearExpr(linearPower.a, linearPower.b, v)
    if (Math.abs(linearPower.power + 1) < 1e-12) {
      const log = makeCall('ln', [makeCall('abs', [inner])])
      return mulExpr(linearPower.factor, makeBinary('/', log, makeNumber(linearPower.a)))
    }
    const newPower = linearPower.power + 1
    const powered = makeBinary('^', inner, makeNumber(newPower))
    const scale = 1 / (linearPower.a * newPower)
    return mulExpr(linearPower.factor, makeBinary('*', makeNumber(scale), powered))
  }

  // A^{av+b}（含 e^{av+b}）
  if (expr.type === 'binary' && expr.op === '^') {
    const exponentForm = matchLinearForm(expr.right, v)
    if (exponentForm && exponentForm.a !== 0) {
      const base = expr.left
      const baseValue = base.type === 'constant' && base.name === 'e' ? Math.E : tryNumeric(base)
      if (baseValue !== null && baseValue > 0 && Math.abs(baseValue - 1) > 1e-12) {
        const lnBase = Math.log(baseValue)
        const argument = linearExpr(exponentForm.a, exponentForm.b, v)
        const power = makeBinary('^', base, argument)
        return mulExpr(
          exponentForm.factor,
          makeBinary('/', power, makeNumber(exponentForm.a * lnBase)),
        )
      }
    }
  }

  // 初等函数表（线性内层换元）
  if (expr.type === 'call' && expr.args.length === 1) {
    const argument = expr.args[0]!
    const inner = matchLinearForm(argument, v)
    if (inner && inner.a !== 0) {
      const scale = makeNumber(inner.a)
      switch (expr.name) {
        case 'sin':
          return mulExpr(inner.factor, makeBinary('/', negExpr(makeCall('cos', [argument])), scale))
        case 'cos':
          return mulExpr(inner.factor, makeBinary('/', makeCall('sin', [argument]), scale))
        case 'tan':
          return mulExpr(
            inner.factor,
            makeBinary(
              '/',
              negExpr(makeCall('ln', [makeCall('abs', [makeCall('cos', [argument])])])),
              scale,
            ),
          )
        case 'exp':
          return mulExpr(inner.factor, makeBinary('/', makeCall('exp', [argument]), scale))
        case 'ln': {
          const term = makeBinary(
            '-',
            makeBinary('*', argument, makeCall('ln', [makeCall('abs', [argument])])),
            argument,
          )
          return mulExpr(inner.factor, makeBinary('/', term, scale))
        }
        case 'sqrt':
          return mulExpr(
            inner.factor,
            makeBinary(
              '/',
              makeBinary('*', makeNumber(2 / 3), makeBinary('^', argument, makeNumber(1.5))),
              scale,
            ),
          )
        case 'atan': {
          const term = makeBinary(
            '-',
            makeBinary('*', argument, makeCall('atan', [argument])),
            makeBinary(
              '/',
              makeCall('ln', [
                makeBinary('+', makeNumber(1), makeBinary('^', argument, makeNumber(2))),
              ]),
              makeNumber(2),
            ),
          )
          return mulExpr(inner.factor, makeBinary('/', term, scale))
        }
        case 'asin': {
          const term = makeBinary(
            '+',
            makeBinary('*', argument, makeCall('asin', [argument])),
            makeCall('sqrt', [
              makeBinary('-', makeNumber(1), makeBinary('^', argument, makeNumber(2))),
            ]),
          )
          return mulExpr(inner.factor, makeBinary('/', term, scale))
        }
        default:
          break
      }
    }
  }

  // 分部积分
  if (expr.type === 'binary' && expr.op === '*') {
    const partial = integrateByParts(expr, v)
    if (partial) return partial
  }

  return null
}

/**
 * 不定积分（返回原函数，不含 +C）。失败返回 null。
 */
export function integrate(expr: Expr, varName = 'x'): Expr | null {
  const ctx = { steps: 0 }
  try {
    const result = integrateRec(expr, varName, ctx)
    return result ? simplify(result) : null
  } catch (error) {
    if (error instanceof TimeoutError) return null
    throw error
  }
}
