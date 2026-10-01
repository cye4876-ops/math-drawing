/**
 * 符号方程求解（v0.9）：
 * - 多项式：有理根 + 二次公式（复根）+ 高次 Durand-Kerner 数值；
 * - 简单超越：a^x = b、ln(u) = c；
 * - 兜底：区间扫描 + 二分（符号方法失败时）。
 */
import { compile, parse, type Expr } from '../expr'
import { approximateFraction, astToPoly, polyRoots, type ComplexRoot } from './poly'
import { simplify, freeOf } from './simplify'

export interface SolutionValue {
  re: number
  im: number
  /** 展示文本，如 "1"、"2 ± i"、"1/2" */
  text: string
}

export type SolveMethod = 'polynomial' | 'exponential' | 'logarithm' | 'numeric'

export interface SolveResult {
  ok: boolean
  method: SolveMethod | null
  solutions: SolutionValue[]
  message?: string
}

/** 格式化实数：近整数 → 整数；近分数 → p/q；否则 6 位有效数字 */
export function formatReal(value: number): string {
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) < 1e-9) return String(rounded)
  const fraction = approximateFraction(value)
  if (fraction && Math.abs(fraction.q) > 1 && Math.abs(fraction.p) <= 100000) {
    const sign = fraction.p < 0 ? '-' : ''
    return `${sign}${Math.abs(fraction.p)}/${fraction.q}`
  }
  const text = value.toPrecision(6)
  return text.includes('e') ? text : text.replace(/0+$/, '').replace(/\.$/, '')
}

/** 格式化复数根 */
export function formatRoot(re: number, im: number): string {
  const real = Math.abs(re) < 1e-9 ? 0 : re
  const imag = Math.abs(im) < 1e-9 ? 0 : im
  if (imag === 0) return formatReal(real)
  const imagAbs = Math.abs(imag)
  const coefficient = Math.abs(imagAbs - 1) < 1e-9 ? '' : formatReal(imagAbs)
  const imagText = `${coefficient}i`
  if (real === 0) return `${imag < 0 ? '-' : ''}${imagText}`
  return `${formatReal(real)} ${imag < 0 ? '-' : '+'} ${imagText}`
}

function toSolutionValues(roots: ComplexRoot[]): SolutionValue[] {
  const values: SolutionValue[] = []
  for (const root of roots) {
    const text = formatRoot(root.re, root.im)
    const target = values.find((item) => item.text === text)
    if (target) continue
    values.push({ re: root.re, im: root.im, text })
  }
  return values
}

/** 数值求根：区间扫描变号 + 二分（触零检测） */
export function numericRoots(
  f: (x: number) => number,
  lo: number,
  hi: number,
  samples = 4000,
): number[] {
  const roots: number[] = []
  const step = (hi - lo) / samples
  let prevX = lo
  let prevY = f(lo)
  const pushRoot = (x: number): void => {
    if (roots.every((item) => Math.abs(item - x) > 1e-6)) roots.push(x)
  }
  for (let i = 1; i <= samples; i++) {
    const x = lo + i * step
    const y = f(x)
    if (Number.isFinite(prevY) && Number.isFinite(y)) {
      if (prevY === 0) pushRoot(prevX)
      else if (Math.abs(y) < 1e-12) pushRoot(x)
      else if (prevY * y < 0) {
        // 二分
        let a = prevX
        let b = x
        let fa = prevY
        for (let iteration = 0; iteration < 80; iteration++) {
          const mid = (a + b) / 2
          const fm = f(mid)
          if (fm === 0 || b - a < 1e-12) {
            a = mid
            b = mid
            break
          }
          if (fa * fm < 0) {
            b = mid
          } else {
            a = mid
            fa = fm
          }
        }
        pushRoot((a + b) / 2)
      }
    }
    prevX = x
    prevY = y
  }
  return roots
}

function solvePolynomial(f: Expr, varName: string): SolveResult | null {
  const poly = astToPoly(f, varName)
  if (!poly) return null
  if (poly.every((coefficient) => Math.abs(coefficient) < 1e-12)) {
    return { ok: true, method: 'polynomial', solutions: [], message: '恒等式（任意 x 都是解）' }
  }
  const roots = polyRoots(poly)
  if (!roots) return null
  if (roots.length === 0) {
    return { ok: true, method: 'polynomial', solutions: [], message: '无解' }
  }
  return { ok: true, method: 'polynomial', solutions: toSolutionValues(roots) }
}

function solveExponential(f: Expr, varName: string): SolveResult | null {
  // a^x = b（b 与 varName 无关）
  if (f.type !== 'binary' || f.op !== '=') return null
  const tryMatch = (power: Expr, value: Expr): SolveResult | null => {
    if (power.type !== 'binary' || power.op !== '^') return null
    const exponent = power.right
    const base = power.left
    if (exponent.type !== 'variable' || exponent.name !== varName) return null
    if (!freeOf(base, varName) || !freeOf(value, varName)) return null
    const scope = { [varName]: 0 }
    const baseValue = compile(base)(scope)
    const targetValue = compile(value)(scope)
    if (!(baseValue > 0) || Math.abs(baseValue - 1) < 1e-12 || !(targetValue > 0)) return null
    const value2 = Math.log(targetValue) / Math.log(baseValue)
    return {
      ok: true,
      method: 'exponential',
      solutions: [{ re: value2, im: 0, text: formatRoot(value2, 0) }],
    }
  }
  return tryMatch(f.left, f.right) ?? tryMatch(f.right, f.left)
}

function solveLogarithmic(f: Expr, varName: string): SolveResult | null {
  // ln(u) = c（c 与 varName 无关）
  if (f.type !== 'binary' || f.op !== '=') return null
  const tryMatch = (logSide: Expr, value: Expr): SolveResult | null => {
    if (logSide.type !== 'call' || logSide.name !== 'ln' || logSide.args.length !== 1) return null
    if (!freeOf(value, varName)) return null
    const argument = logSide.args[0]!
    const scope = { [varName]: 0 }
    const target = Math.exp(compile(value)(scope))
    // u(x) = e^c → 解 u(x) − e^c = 0（复用多项式路径）
    const shifted: Expr = {
      type: 'binary',
      op: '-',
      left: argument,
      right: { type: 'number', value: target },
    }
    const polynomial = solvePolynomial(simplify(shifted), varName)
    if (!polynomial) return null
    return { ...polynomial, method: 'logarithm' }
  }
  return tryMatch(f.left, f.right) ?? tryMatch(f.right, f.left)
}

/**
 * 求解方程（输入可以是 'x^2 + 1 = 0' 字符串或 AST）。
 */
export function solveEquation(equation: Expr | string, varName = 'x'): SolveResult {
  let parsed: Expr
  try {
    parsed = typeof equation === 'string' ? parse(equation) : equation
  } catch (error) {
    return {
      ok: false,
      method: null,
      solutions: [],
      message: `解析失败：${(error as Error).message}`,
    }
  }
  let f: Expr
  if (parsed.type === 'binary' && parsed.op === '=') {
    const exponential = solveExponential(parsed, varName)
    if (exponential) return exponential
    const logarithmic = solveLogarithmic(parsed, varName)
    if (logarithmic) return logarithmic
    f = simplify({
      type: 'binary',
      op: '-',
      left: parsed.left,
      right: parsed.right,
    })
  } else {
    f = simplify(parsed)
  }
  const polynomial = solvePolynomial(f, varName)
  if (polynomial) return polynomial
  // 数值兜底
  try {
    const compiled = compile(f)
    const scope: Record<string, number> = {}
    const roots = numericRoots(
      (x) => {
        scope[varName] = x
        return compiled(scope)
      },
      -50,
      50,
    )
    if (roots.length > 0) {
      return {
        ok: true,
        method: 'numeric',
        solutions: roots.map((root) => ({ re: root, im: 0, text: formatRoot(root, 0) })),
        message: '数值近似解（区间 [−50, 50] 内）',
      }
    }
    return { ok: false, method: null, solutions: [], message: '无法求解（或该范围内无实根）' }
  } catch (error) {
    return {
      ok: false,
      method: null,
      solutions: [],
      message: `求值失败：${(error as Error).message}`,
    }
  }
}

/** 检查给定点是否为方程的解（数值容差） */
export function verifySolution(equation: Expr | string, varName: string, point: number): boolean {
  try {
    const parsed = typeof equation === 'string' ? parse(equation) : equation
    const f =
      parsed.type === 'binary' && parsed.op === '='
        ? ({ type: 'binary', op: '-', left: parsed.left, right: parsed.right } as Expr)
        : parsed
    const value = compile(f)({ [varName]: point })
    return Math.abs(value) < 1e-6
  } catch {
    return false
  }
}
