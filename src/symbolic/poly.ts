/**
 * 符号多项式引擎（v0.9）：
 * - 升幂系数数组表示（poly[0] 为常数项）；
 * - 四则运算、长除法、gcd、首一化；
 * - AST ↔ 多项式转换（astToPoly / polyToAst）；
 * - 有理根因式分解（BigInt 精确判定）；
 * - 全根求解：有理根 + 二次公式（复根），更高次用 Durand-Kerner 数值兜底。
 */
import { makeBinary, makeNumber, makeUnary, makeVariable, type Expr } from '../expr'

export type Poly = number[]

export const ZERO_POLY: Poly = [0]
const EPS = 1e-12

export function polyTrim(poly: Poly): Poly {
  let end = poly.length - 1
  while (end > 0 && Math.abs(poly[end]!) < EPS) end--
  return poly.slice(0, end + 1)
}

export function polyIsZero(poly: Poly): boolean {
  return poly.every((c) => Math.abs(c) < EPS)
}

/** 次数（零多项式为 −1） */
export function polyDegree(poly: Poly): number {
  if (polyIsZero(poly)) return -1
  const p = polyTrim(poly)
  return p.length - 1
}

export function polyAdd(a: Poly, b: Poly): Poly {
  const length = Math.max(a.length, b.length)
  const result: Poly = new Array<number>(length).fill(0)
  for (let k = 0; k < length; k++) result[k] = (a[k] ?? 0) + (b[k] ?? 0)
  return polyTrim(result)
}

export function polySub(a: Poly, b: Poly): Poly {
  const length = Math.max(a.length, b.length)
  const result: Poly = new Array<number>(length).fill(0)
  for (let k = 0; k < length; k++) result[k] = (a[k] ?? 0) - (b[k] ?? 0)
  return polyTrim(result)
}

export function polyScale(poly: Poly, factor: number): Poly {
  return polyTrim(poly.map((c) => c * factor))
}

export function polyMul(a: Poly, b: Poly): Poly {
  if (polyIsZero(a) || polyIsZero(b)) return [0]
  const result: number[] = new Array<number>(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    if (ai === 0) continue
    for (let j = 0; j < b.length; j++) result[i + j]! += ai * b[j]!
  }
  return polyTrim(result)
}

/** 非负整数幂（快速幂） */
export function polyPow(poly: Poly, exponent: number): Poly {
  let n = Math.max(0, Math.round(exponent))
  let base = polyTrim(poly)
  let result: Poly = [1]
  while (n > 0) {
    if (n & 1) result = polyMul(result, base)
    base = polyMul(base, base)
    n >>= 1
  }
  return polyTrim(result)
}

export function polyEval(poly: Poly, x: number): number {
  let acc = 0
  for (let k = poly.length - 1; k >= 0; k--) acc = acc * x + poly[k]!
  return acc
}

export function polyDerivative(poly: Poly): Poly {
  if (poly.length <= 1) return [0]
  const result: number[] = []
  for (let k = 1; k < poly.length; k++) result.push(poly[k]! * k)
  return polyTrim(result)
}

/** 长除法：a = b·q + r（b 非零）；b 首项为 0 时返回 null */
export function polyDivMod(a: Poly, b: Poly): { quotient: Poly; remainder: Poly } | null {
  const divisor = polyTrim(b)
  const divisorDegree = polyDegree(divisor)
  if (divisorDegree < 0) return null
  let remainder = polyTrim(a)
  if (polyDegree(remainder) < divisorDegree) return { quotient: [0], remainder }
  const quotient: number[] = new Array<number>(polyDegree(remainder) - divisorDegree + 1).fill(0)
  const lead = divisor[divisorDegree]!
  while (polyDegree(remainder) >= divisorDegree) {
    const remDegree = polyDegree(remainder)
    if (remDegree < 0) break
    const factor = remainder[remDegree]! / lead
    const shift = remDegree - divisorDegree
    quotient[shift] = factor
    const scaled: number[] = new Array<number>(divisor.length + shift).fill(0)
    for (let k = 0; k < divisor.length; k++) scaled[k + shift] = divisor[k]! * factor
    remainder = polySub(remainder, scaled)
  }
  return { quotient: polyTrim(quotient), remainder: polyTrim(remainder) }
}

/** 欧几里得算法求首一 gcd */
export function polyGcd(a: Poly, b: Poly): Poly {
  let x = polyTrim(a)
  let y = polyTrim(b)
  let guard = 0
  while (polyDegree(y) >= 0 && guard < 200) {
    const division = polyDivMod(x, y)
    if (!division) break
    x = y
    y = division.remainder
    guard++
  }
  const degree = polyDegree(x)
  if (degree < 0) return [0]
  return polyScale(x, 1 / x[degree]!)
}

// ---------- AST ↔ 多项式 ----------

/** AST → 多项式（varName 之外无自由变量，指数须为非负整数常数） */
export function astToPoly(expr: Expr, varName = 'x'): Poly | null {
  switch (expr.type) {
    case 'number':
      return [expr.value]
    case 'variable':
      return expr.name === varName ? [0, 1] : null
    case 'unary': {
      const inner = astToPoly(expr.operand, varName)
      if (!inner) return null
      return expr.op === '-' ? polyScale(inner, -1) : inner
    }
    case 'binary': {
      const left = astToPoly(expr.left, varName)
      const right = astToPoly(expr.right, varName)
      switch (expr.op) {
        case '+':
          return left && right ? polyAdd(left, right) : null
        case '-':
          return left && right ? polySub(left, right) : null
        case '*':
          return left && right ? polyMul(left, right) : null
        case '/': {
          if (!left || !right) return null
          const denominatorDegree = polyDegree(right)
          if (denominatorDegree !== 0) return null
          const c = right[0]!
          if (Math.abs(c) < EPS) return null
          return polyScale(left, 1 / c)
        }
        case '^': {
          if (!left || !right) return null
          if (polyDegree(right) !== 0) return null
          const n = right[0]!
          if (n < 0 || Math.abs(n - Math.round(n)) > 1e-9 || n > 64) return null
          return polyPow(left, Math.round(n))
        }
        default:
          return null
      }
    }
    default:
      return null
  }
}

/** 多项式 → AST（高次在前、系数 1 省略去、负系数转为减法） */
export function polyToAst(poly: Poly, varName = 'x'): Expr {
  const p = polyTrim(poly)
  let result: Expr | null = null
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k]!
    if (Math.abs(c) < EPS) continue
    const variable = makeVariable(varName)
    let term: Expr
    if (k === 0) {
      term = makeNumber(Math.abs(c))
    } else {
      const power = k === 1 ? variable : makeBinary('^', variable, makeNumber(k))
      term = Math.abs(c) === 1 ? power : makeBinary('*', makeNumber(Math.abs(c)), power)
    }
    if (c < 0) term = makeUnary('-', term)
    if (result === null) {
      result = term
    } else if (c < 0) {
      const positive = term.type === 'unary' ? term.operand : term
      result = makeBinary('-', result, positive)
    } else {
      result = makeBinary('+', result, term)
    }
  }
  return result ?? makeNumber(0)
}

// ---------- 有理根因式分解 ----------

/** 近似有理数识别（分母 ≤ maxDen） */
export function approximateFraction(x: number, maxDen = 1024): { p: number; q: number } | null {
  if (Math.abs(x - Math.round(x)) < 1e-12) return { p: Math.round(x), q: 1 }
  for (let q = 1; q <= maxDen; q++) {
    const p = Math.round(x * q)
    if (Math.abs(x * q - p) < 1e-9) return { p, q }
  }
  return null
}

function gcdInt(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x || 1
}

/** 系数整数化（近有理系数 → 整数，返回元组 [整数数组, 缩放因子]） */
function integerize(poly: Poly): { ints: number[]; scale: number } | null {
  let lcm = 1
  for (const c of poly) {
    const fraction = approximateFraction(c)
    if (!fraction) return null
    lcm = (lcm * fraction.q) / gcdInt(lcm, fraction.q)
    if (lcm > 1e9) return null
  }
  const ints = poly.map((c) => {
    const fraction = approximateFraction(c)!
    return Math.round((fraction.p * lcm) / fraction.q)
  })
  return { ints, scale: lcm }
}

/** 在有理点 p/q 处整数值 × q^deg（BigInt 精确） */
function evaluateIntAtFraction(ints: number[], p: number, q: number): bigint {
  const degree = ints.length - 1
  let sum = 0n
  const bigP = BigInt(p)
  const bigQ = BigInt(q)
  for (let k = 0; k <= degree; k++) {
    sum += BigInt(ints[k]!) * bigP ** BigInt(k) * bigQ ** BigInt(degree - k)
  }
  return sum
}

function divisorsOf(value: number): number[] {
  const n = Math.abs(Math.round(value))
  if (n === 0) return [1]
  const result: number[] = []
  for (let d = 1; d * d <= n; d++) {
    if (n % d === 0) {
      result.push(d)
      if (d * d !== n) result.push(n / d)
    }
  }
  return result
}

export interface RationalRoot {
  root: number
  multiplicity: number
}

export interface Factorization {
  /** 最高次系数（poly = leading × ∏(x − ri) × remainder） */
  leading: number
  linear: RationalRoot[]
  /** 首一化的剩余因子（不可再分的有理系数部分；null 表示完全分解） */
  remainder: Poly | null
}

/** 有理根因式分解（有理根定理 + 综合除法；BigInt 精确判定候选根） */
export function factorOverRationals(poly: Poly): Factorization | null {
  const p = polyTrim(poly)
  const degree = polyDegree(p)
  if (degree < 0) return null
  const leading = p[degree]!
  let remaining = p.map((c) => c / leading)
  const linear: RationalRoot[] = []

  let guard = 0
  while (polyDegree(remaining) > 0 && guard < 64) {
    guard++
    const info = integerize(remaining)
    if (!info) break
    const { ints } = info
    const remDegree = ints.length - 1
    const constant = ints[0]!
    const leadingInt = ints[remDegree]!
    if (constant === 0) {
      // 根 0
      removeRoot(remaining, 0, linear)
      remaining = divideByRoot(remaining, 0)
      continue
    }
    const candidates: number[] = []
    for (const numer of divisorsOf(constant)) {
      for (const denom of divisorsOf(leadingInt)) {
        const value = numer / denom
        candidates.push(value, -value)
      }
    }
    let found = false
    for (const candidate of candidates) {
      const fraction = approximateFraction(candidate)
      if (!fraction) continue
      if (evaluateIntAtFraction(ints, fraction.p, fraction.q) === 0n) {
        // 多重根：反复提取
        let multiplicity = 0
        while (polyDegree(remaining) > 0) {
          const value = polyEval(remaining, candidate)
          if (Math.abs(value) > 1e-9) break
          remaining = divideByRoot(remaining, candidate)
          multiplicity++
        }
        if (multiplicity > 0) {
          linear.push({ root: candidate, multiplicity })
          found = true
          break
        }
      }
    }
    if (!found) break
  }

  let remainder: Poly | null = polyTrim(remaining)
  if (polyDegree(remainder) === 0) remainder = null
  linear.sort((a, b) => a.root - b.root)
  return { leading, linear, remainder }
}

function divideByRoot(poly: Poly, root: number): Poly {
  const division = polyDivMod(poly, [-root, 1])
  return division ? division.quotient : poly
}

function removeRoot(poly: Poly, root: number, linear: RationalRoot[]): void {
  let multiplicity = 0
  let current = poly
  while (polyDegree(current) > 0 && Math.abs(polyEval(current, root)) < 1e-9) {
    current = divideByRoot(current, root)
    multiplicity++
  }
  if (multiplicity > 0) linear.push({ root, multiplicity })
}

// ---------- 全根求解 ----------

export interface ComplexRoot {
  re: number
  im: number
  multiplicity: number
}

/** Durand-Kerner 数值全根（对任意次数收敛时返回，否则 null） */
export function durandKerner(poly: Poly): ComplexRoot[] | null {
  const p = polyTrim(poly)
  const degree = polyDegree(p)
  if (degree < 0) return null
  if (degree === 0) return []
  const monic = p.map((c) => c / p[degree]!)
  let scale = 1
  for (const c of monic) scale = Math.max(scale, Math.abs(c))
  const radius = 1 + scale
  const roots = Array.from({ length: degree }, (_, k) => {
    const angle = (2 * Math.PI * k) / degree + 0.4
    return { re: radius * Math.cos(angle), im: radius * Math.sin(angle) }
  })
  const evaluateAt = (re: number, im: number): { re: number; im: number } => {
    let accRe = 0
    let accIm = 0
    for (let k = degree; k >= 0; k--) {
      const nextRe = accRe * re - accIm * im + monic[k]!
      const nextIm = accRe * im + accIm * re
      accRe = nextRe
      accIm = nextIm
    }
    return { re: accRe, im: accIm }
  }
  for (let iteration = 0; iteration < 300; iteration++) {
    let maxDelta = 0
    for (let i = 0; i < degree; i++) {
      const zi = roots[i]!
      const value = evaluateAt(zi.re, zi.im)
      let denRe = 1
      let denIm = 0
      for (let j = 0; j < degree; j++) {
        if (j === i) continue
        const zj = roots[j]!
        const dr = zi.re - zj.re
        const di = zi.im - zj.im
        const nextRe = denRe * dr - denIm * di
        const nextIm = denRe * di + denIm * dr
        denRe = nextRe
        denIm = nextIm
      }
      const denMag = denRe * denRe + denIm * denIm
      if (denMag < 1e-300) continue
      const qr = (value.re * denRe + value.im * denIm) / denMag
      const qi = (value.im * denRe - value.re * denIm) / denMag
      zi.re -= qr
      zi.im -= qi
      maxDelta = Math.max(maxDelta, Math.hypot(qr, qi))
    }
    if (maxDelta < 1e-14) break
  }
  const tolerance = 1e-6 * (1 + radius) ** degree
  for (const z of roots) {
    const value = evaluateAt(z.re, z.im)
    if (!Number.isFinite(value.re) || Math.hypot(value.re, value.im) > tolerance) return null
  }
  return roots.map((z) => ({ re: z.re, im: z.im, multiplicity: 1 }))
}

/**
 * 全根求解：
 * - 先提取有理根（含重数）；
 * - 剩余 1 次/2 次用公式（含复根）；
 * - 更高次用 Durand-Kerner 数值。
 */
export function polyRoots(poly: Poly): ComplexRoot[] | null {
  const p = polyTrim(poly)
  const degree = polyDegree(p)
  if (degree < 0) return null
  if (degree === 0) return []
  const factorization = factorOverRationals(p)
  if (!factorization) return null
  const roots: ComplexRoot[] = factorization.linear.map((item) => ({
    re: item.root,
    im: 0,
    multiplicity: item.multiplicity,
  }))
  const remaining = factorization.remainder
  if (remaining) {
    const remDegree = polyDegree(remaining)
    if (remDegree === 1) {
      roots.push({ re: -remaining[0]! / remaining[1]!, im: 0, multiplicity: 1 })
    } else if (remDegree === 2) {
      const a = remaining[2]!
      const b = remaining[1]!
      const c = remaining[0]!
      const discriminant = b * b - 4 * a * c
      if (discriminant >= 0) {
        const sqrtDisc = Math.sqrt(discriminant)
        roots.push({ re: (-b + sqrtDisc) / (2 * a), im: 0, multiplicity: 1 })
        roots.push({ re: (-b - sqrtDisc) / (2 * a), im: 0, multiplicity: 1 })
      } else {
        const sqrtDisc = Math.sqrt(-discriminant)
        roots.push({ re: -b / (2 * a), im: sqrtDisc / (2 * a), multiplicity: 1 })
        roots.push({ re: -b / (2 * a), im: -sqrtDisc / (2 * a), multiplicity: 1 })
      }
    } else {
      const numeric = durandKerner(remaining)
      if (!numeric) return null
      roots.push(...numeric)
    }
  }
  return mergeRoots(roots)
}

/** 近重根合并 + 排序（实部、虚部） */
export function mergeRoots(roots: ComplexRoot[]): ComplexRoot[] {
  const merged: ComplexRoot[] = []
  for (const root of roots) {
    const target = merged.find(
      (item) => Math.abs(item.re - root.re) < 1e-6 && Math.abs(item.im - root.im) < 1e-6,
    )
    if (target) {
      target.multiplicity += root.multiplicity
    } else {
      merged.push({ ...root })
    }
  }
  merged.sort((a, b) => a.re - b.re || a.im - b.im)
  return merged
}
