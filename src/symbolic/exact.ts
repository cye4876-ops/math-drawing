/**
 * 精确值引擎（v2.8）：把表达式在"符号常量 + 根式 + 对数原子"层面精确求值。
 *
 * 设计目标（docs/versions/v0.7-statistics.md 之后的精度增强）：
 * - 绘图模块的定积分等结果不再只给近似小数，而是给出 2、π²/2、4√2/3、e − 1、2 ln 2 这类精确式；
 * - "不是有理数的地方用根式代替约数"：√8 → 2√2、1/√2 → √2/2、sin(π/4) → √2/2。
 *
 * 值模型：ExactValue = 若干"项"之和；项 = 有理系数 × 乘积原子幂。
 * 原子种类（求值时均为正实数）：
 * - π（pi^k）；e（e^k，k 可负 → 显示为 1/e^k）；
 * - √M（M 为无平方因子正整数 ≥ 2，幂在归一化后恒为 +1）；
 * - ln p（p 为素数，归一化保证：ln 4 → 2 ln 2、ln(1/2) → −ln 2、ln 1 → 0）。
 *
 * 任何超出支持范围的构造一律抛 ExactError，由调用方回退数值结果（安全网策略）。
 */
import {
  bigintSqrt,
  primeFactorize,
  rat,
  ratAdd,
  ratDiv,
  ratFromInt,
  ratFromNumber,
  ratIsInteger,
  ratMul,
  ratNeg,
  ratSub,
  ratToNumber,
  type Rat,
} from '../math/exact/rational'
import type { Expr } from '../expr'

export class ExactError extends Error {}

/** 根式/对数归一化的规模上限（试除分解的代价保护） */
const FACTOR_LIMIT = 10n ** 12n
/** 原子幂的绝对值上限（防指数爆炸） */
const POWER_LIMIT = 64
/** 乘积展开后的项数上限 */
const TERM_LIMIT = 1024

/** 单个因子：key 形如 pi / e / sqrt:2 / ln:3，power 为非零整数 */
interface Factor {
  key: string
  power: number
}

/** 项：有理系数 × 因子幂乘积（factors 按 key 升序） */
interface Term {
  coeff: Rat
  factors: Factor[]
}

/** 精确值 = 项之和（规范形：无零系数项、无重复因子签名、确定性排序） */
export type ExactValue = readonly Term[]

export const EXACT_ZERO: ExactValue = []
export const EXACT_ONE: ExactValue = [{ coeff: rat(1n), factors: [] }]

// ---------- 构造 ----------

export function exactFromRat(value: Rat): ExactValue {
  return value.n === 0n ? EXACT_ZERO : [{ coeff: value, factors: [] }]
}

export function exactFromInt(value: bigint | number): ExactValue {
  return exactFromRat(ratFromInt(value))
}

/**
 * 数值转精确值：
 * - 先尝试"简单有理数吸附"——浮点运算产生的 0.3333333333333333 应还原为 1/3
 *   （容差 1e-12，分母上限 10⁶；刻意写出的长小数不受影响）；
 * - 否则按十进制最短表示精确转换（0.5 → 1/2）。
 */
export function exactFromNumber(value: number): ExactValue {
  const snapped = snapToRational(value)
  return exactFromRat(snapped ?? ratFromNumber(value))
}

/** 向量化吸附的候选分母（π 的有理倍） */
const PI_DENOMINATORS = [1n, 2n, 3n, 4n, 6n] as const

/**
 * 数值吸附：接近 π 的有理倍（π/4、π/3…，容差 1e-9）或简单有理数（连分数）时
 * 返回精确值，否则 null。用于把数值算法得到的零点/交点/边界还原为精确式（π/6 而非 0.523599）。
 * maxDenominator 控制有理数分母上限：拖动端点等“非意图精确”场景用小数（如 8），
 * 避免 2.34375 → 75/32 这类无意义的大分母“精确值”。
 */
export function snapNumber(value: number, maxDenominator = 1000n): ExactValue | null {
  if (!Number.isFinite(value)) return null
  if (value === 0) return []
  const tolerance = 1e-9 * Math.max(1, Math.abs(value))
  // π 的有理倍优先：π 本身的有理逼近（355/113 等）不应抢先命中
  for (const denominator of PI_DENOMINATORS) {
    for (let k = -24n; k <= 24n; k++) {
      const ratio = rat(k, denominator)
      const candidate = (Number(ratio.n) / Number(ratio.d)) * Math.PI
      if (Math.abs(candidate - value) <= tolerance) {
        return ratio.n === 0n ? [] : [{ coeff: ratio, factors: [{ key: 'pi', power: 1 }] }]
      }
    }
  }
  const rational = snapToRational(value, maxDenominator)
  if (rational) return exactFromRat(rational)
  return null
}

/** 连分数收敛子吸附：浮点伪影（如 0.6666666666666666 → 2/3）在紧容差内还原为简单分数 */
export function snapToRational(value: number, maxDenominator = 1000n): Rat | null {
  if (!Number.isFinite(value)) return null
  if (Number.isInteger(value)) return ratFromNumber(value)
  if (Math.abs(value) > 1e9) return null
  const tolerance = 1e-12 * Math.max(1, Math.abs(value))
  let h1 = 1n
  let h2 = 0n
  let k1 = 0n
  let k2 = 1n
  let remainder = value
  for (let i = 0; i < 30; i++) {
    const a = Math.floor(remainder)
    if (!Number.isFinite(a) || Math.abs(a) > 1e15) return null
    const aBig = BigInt(a)
    const h = aBig * h1 + h2
    const k = aBig * k1 + k2
    h2 = h1
    h1 = h
    k2 = k1
    k1 = k
    if (k > maxDenominator || k < -maxDenominator) return null
    if (k === 0n) continue
    if (h !== 0n && Math.abs(Number(h) / Number(k) - value) <= tolerance) return rat(h, k)
    const fraction = remainder - a
    if (fraction === 0) return null
    remainder = 1 / fraction
  }
  return null
}

function sqrtAtom(n: bigint): ExactValue {
  return [{ coeff: rat(1n), factors: [{ key: `sqrt:${n}`, power: 1 }] }]
}

function piAtom(): ExactValue {
  return [{ coeff: rat(1n), factors: [{ key: 'pi', power: 1 }] }]
}

function eAtom(power = 1): ExactValue {
  return [{ coeff: rat(1n), factors: [{ key: 'e', power }] }]
}

/** √2、√3 等常用根式的缓存原子 */
const SQRT2 = sqrtAtom(2n)
const SQRT3 = sqrtAtom(3n)
const HALF_RAT = rat(1n, 2n)
const HALF = exactFromRat(HALF_RAT)
const TWO = exactFromInt(2n)
const THREE = exactFromInt(3n)

// ---------- 判定 ----------

export function exactIsZero(value: ExactValue): boolean {
  return value.length === 0
}

/** 纯有理数时返回 Rat，否则返回 null */
export function exactRational(value: ExactValue): Rat | null {
  if (value.length === 0) return rat(0n)
  if (value.length === 1 && value[0]!.factors.length === 0) return value[0]!.coeff
  return null
}

export function exactToNumber(value: ExactValue): number {
  let total = 0
  for (const term of value) {
    let factor = ratToNumber(term.coeff)
    for (const { key, power } of term.factors) factor *= Math.pow(atomValue(key), power)
    total += factor
  }
  return total
}

function atomValue(key: string): number {
  if (key === 'pi') return Math.PI
  if (key === 'e') return Math.E
  const [kind, raw] = key.split(':')
  const n = Number(raw)
  return kind === 'sqrt' ? Math.sqrt(n) : Math.log(n)
}

/** 符号判定：全部项同号时给出 ±1，混合时返回 null */
export function exactSign(value: ExactValue): -1 | 0 | 1 | null {
  if (value.length === 0) return 0
  let positive = true
  let negative = true
  for (const term of value) {
    if (term.coeff.n > 0n) negative = false
    else positive = false
  }
  if (positive) return 1
  if (negative) return -1
  return null
}

export function exactAbs(value: ExactValue): ExactValue {
  const sign = exactSign(value)
  if (sign === null) throw new ExactError('无法判定符号')
  return sign < 0 ? exactNeg(value) : value
}

// ---------- 归一化 ----------

function signature(factors: readonly Factor[]): string {
  return factors.map((f) => `${f.key}^${f.power}`).join('|')
}

/** 合并同签名项、去零、确定性排序（含因子项在前，纯有理项最后） */
function canonical(terms: Term[]): ExactValue {
  const merged = new Map<string, Term>()
  for (const term of terms) {
    if (term.coeff.n === 0n) continue
    const key = signature(term.factors)
    const existing = merged.get(key)
    if (existing) {
      const sum = ratAdd(existing.coeff, term.coeff)
      if (sum.n === 0n) merged.delete(key)
      else existing.coeff = sum
    } else {
      merged.set(key, term)
    }
  }
  const list = [...merged.values()]
  list.sort((x, y) => {
    const rx = x.factors.length === 0
    const ry = y.factors.length === 0
    if (rx !== ry) return rx ? 1 : -1
    return signature(x.factors).localeCompare(signature(y.factors))
  })
  return list
}

/**
 * 项归一化：合并同 key 幂；√ 因子统一乘成单个 √M（平方因子提出系数，负幂有理化）；
 * π/e/ln 因子保留整数幂（可负，显示时进入分母）。
 */
function normalizeTerm(coeff: Rat, raw: readonly Factor[]): Term {
  const powers = new Map<string, number>()
  for (const { key, power } of raw) powers.set(key, (powers.get(key) ?? 0) + power)

  let radicalNum = 1n
  let radicalDen = 1n
  let hasRadical = false
  for (const [key, power] of powers) {
    if (!key.startsWith('sqrt:') || power === 0) continue
    hasRadical = true
    const n = BigInt(key.slice(5))
    if (power > 0) radicalNum *= n ** BigInt(power)
    else radicalDen *= n ** BigInt(-power)
    powers.delete(key)
  }

  let outCoeff = coeff
  if (hasRadical) {
    // √a · √b = √(ab)；√(num/den) = √(num·den)/den，再提出平方因子
    const product = radicalNum * radicalDen
    if (product > FACTOR_LIMIT) throw new ExactError('根式合并规模过大')
    const { square, rest } = splitSquare(product)
    outCoeff = ratMul(outCoeff, rat(square, radicalDen))
    if (rest !== 1n) powers.set(`sqrt:${rest}`, 1)
  }

  const factors: Factor[] = []
  for (const [key, power] of powers) {
    if (power === 0) continue
    if (Math.abs(power) > POWER_LIMIT) throw new ExactError('幂指数过大')
    factors.push({ key, power })
  }
  factors.sort((a, b) => a.key.localeCompare(b.key))
  return { coeff: outCoeff, factors }
}

/** n = square² · rest（rest 无平方因子） */
function splitSquare(n: bigint): { square: bigint; rest: bigint } {
  const factors = primeFactorize(n)
  let square = 1n
  let rest = 1n
  for (const [prime, exponent] of factors) {
    if (exponent >= 2) square *= prime ** BigInt(Math.floor(exponent / 2))
    if (exponent % 2 === 1) rest *= prime
  }
  return { square, rest }
}

// ---------- 运算 ----------

export function exactAdd(a: ExactValue, b: ExactValue): ExactValue {
  return canonical([...a.map(cloneTerm), ...b.map(cloneTerm)])
}

export function exactNeg(value: ExactValue): ExactValue {
  return value.map((term) => ({ coeff: ratNeg(term.coeff), factors: term.factors }))
}

export function exactSub(a: ExactValue, b: ExactValue): ExactValue {
  return exactAdd(a, exactNeg(b))
}

export function exactScale(value: ExactValue, factor: Rat): ExactValue {
  return canonical(
    value.map((term) => ({ coeff: ratMul(term.coeff, factor), factors: term.factors })),
  )
}

export function exactMul(a: ExactValue, b: ExactValue): ExactValue {
  if (a.length * b.length > TERM_LIMIT) throw new ExactError('乘积展开项数过多')
  const terms: Term[] = []
  for (const left of a) {
    for (const right of b) {
      const coeff = ratMul(left.coeff, right.coeff)
      terms.push(normalizeTerm(coeff, [...left.factors, ...right.factors]))
    }
  }
  return canonical(terms)
}

/** 单项倒数：系数取倒数、因子幂取反（√ 因子在归一化时自动有理化） */
function reciprocalTerm(term: Term): Term {
  if (term.coeff.n === 0n) throw new ExactError('除数为零')
  return normalizeTerm(
    ratDiv(rat(1n), term.coeff),
    term.factors.map((f) => ({ key: f.key, power: -f.power })),
  )
}

export function exactDiv(a: ExactValue, b: ExactValue): ExactValue {
  if (exactIsZero(b)) throw new ExactError('除数为零')
  if (b.length === 1) return exactMul(a, [reciprocalTerm(b[0]!)])
  if (exactIsZero(a)) return EXACT_ZERO
  throw new ExactError('不支持的非有理分母')
}

export function exactReciprocal(value: ExactValue): ExactValue {
  if (value.length !== 1) throw new ExactError('不支持的非单项倒数')
  return canonical([reciprocalTerm(value[0]!)])
}

/** 整数幂（支持负指数，仅单项才有倒数） */
export function exactPowInt(value: ExactValue, exponent: number): ExactValue {
  if (!Number.isInteger(exponent)) throw new ExactError('幂指数须为整数')
  if (exponent === 0) return EXACT_ONE
  if (exponent < 0) return exactReciprocal(exactPowInt(value, -exponent))
  if (exactIsZero(value)) return EXACT_ZERO
  let result = EXACT_ONE
  let base = value
  let remaining = exponent
  while (remaining > 0) {
    if (remaining & 1) result = exactMul(result, base)
    remaining >>= 1
    if (remaining > 0) base = exactMul(base, base)
  }
  return result
}

/** √value：有理数 → 根式归一化；单项（幂全为偶）→ 逐因子取半 */
export function exactSqrt(value: ExactValue): ExactValue {
  const negative = exactSign(value)
  if (negative === null) throw new ExactError('无法判定被开方数符号')
  if (negative < 0) throw new ExactError('负数开平方')
  if (negative === 0) return EXACT_ZERO
  if (value.length !== 1) throw new ExactError('不支持的多项开平方')
  const term = value[0]!
  for (const { power } of term.factors) {
    if (power % 2 !== 0) throw new ExactError('不支持的非完全平方项开平方')
  }
  const rationalPart = radicalSqrt(term.coeff)
  const halved: Factor[] = term.factors.map((f) => ({ key: f.key, power: f.power / 2 }))
  return canonical([
    normalizeTerm(rationalPart[0]?.coeff ?? rat(1n), [
      ...(rationalPart[0]?.factors ?? []),
      ...halved,
    ]),
  ])
}

/** 正有理数的精确平方根：完全平方 → 有理数；否则归一化为 系数 × √M */
function radicalSqrt(value: Rat): ExactValue {
  if (value.n < 0n) throw new ExactError('负数开平方')
  if (value.n === 0n) return EXACT_ZERO
  // √(a/b) = √(ab)/b
  const product = value.n * value.d
  if (product > FACTOR_LIMIT) throw new ExactError('根式规模过大')
  const rootN = bigintSqrt(value.n)
  const rootD = bigintSqrt(value.d)
  if (rootN * rootN === value.n && rootD * rootD === value.d) {
    return exactFromRat(rat(rootN, rootD))
  }
  const { square, rest } = splitSquare(product)
  const coeff = rat(square, value.d)
  if (rest === 1n) return exactFromRat(coeff)
  return canonical([normalizeTerm(coeff, [{ key: `sqrt:${rest}`, power: 1 }])])
}

// ---------- 求值 ----------

/** 环境：变量名 → 精确值（积分端点、参数等） */
export type ExactEnv = Record<string, ExactValue>

/** 对 AST 精确求值；遇到不支持的结构抛 ExactError */
export function evalExact(expr: Expr, env: ExactEnv = {}): ExactValue {
  try {
    return evalNode(expr, { ...env })
  } catch (error) {
    if (error instanceof ExactError) throw error
    throw new ExactError(error instanceof Error ? error.message : String(error))
  }
}

function evalNode(expr: Expr, env: ExactEnv): ExactValue {
  switch (expr.type) {
    case 'number':
      return exactFromNumber(expr.value)
    case 'constant':
      return constantValue(expr.name)
    case 'variable': {
      const value = env[expr.name]
      if (!value) throw new ExactError(`变量未绑定：${expr.name}`)
      return value
    }
    case 'unary': {
      const operand = evalNode(expr.operand, env)
      return expr.op === '-' ? exactNeg(operand) : operand
    }
    case 'binary':
      return evalBinary(expr, env)
    case 'call':
      return evalCall(expr.name, expr.args, env)
    case 'factorial': {
      const value = exactRational(evalNode(expr.operand, env))
      if (!value || !ratIsInteger(value) || value.n < 0n || value.n > 12n) {
        throw new ExactError('阶乘仅支持 0!…12!')
      }
      let result = 1n
      for (let i = 2n; i <= value.n; i++) result *= i
      return exactFromInt(result)
    }
    case 'assignment': {
      const value = evalNode(expr.value, env)
      env[expr.name] = value
      return value
    }
    default:
      throw new ExactError(`不支持的结构：${expr.type}`)
  }
}

function constantValue(name: 'pi' | 'e' | 'phi' | 'tau'): ExactValue {
  switch (name) {
    case 'pi':
      return piAtom()
    case 'e':
      return eAtom()
    case 'tau':
      return exactScale(piAtom(), rat(2n))
    case 'phi':
      // φ = (1 + √5)/2
      return exactMul(HALF, exactAdd(EXACT_ONE, sqrtAtom(5n)))
  }
}

function evalBinary(expr: Extract<Expr, { type: 'binary' }>, env: ExactEnv): ExactValue {
  switch (expr.op) {
    case '+':
      return exactAdd(evalNode(expr.left, env), evalNode(expr.right, env))
    case '-':
      return exactSub(evalNode(expr.left, env), evalNode(expr.right, env))
    case '*':
      return exactMul(evalNode(expr.left, env), evalNode(expr.right, env))
    case '/':
      return exactDiv(evalNode(expr.left, env), evalNode(expr.right, env))
    case '^':
      return exactPow(evalNode(expr.left, env), evalNode(expr.right, env))
    default:
      throw new ExactError(`不支持的运算符：${expr.op}`)
  }
}

/** a^b：b 为有理数且分母 ∈ {1, 2} 时精确计算（其余回退数值） */
function exactPow(base: ExactValue, exponent: ExactValue): ExactValue {
  const ratio = exactRational(exponent)
  if (!ratio) throw new ExactError('指数须为有理数')
  const numerator = ratio.n
  const denominator = ratio.d
  if (denominator === 1n) {
    if (numerator > BigInt(POWER_LIMIT) || numerator < -BigInt(POWER_LIMIT)) {
      throw new ExactError('幂指数过大')
    }
    return exactPowInt(base, Number(numerator))
  }
  if (denominator === 2n) {
    if (numerator > BigInt(POWER_LIMIT) || numerator < -BigInt(POWER_LIMIT)) {
      throw new ExactError('幂指数过大')
    }
    return exactSqrt(exactPowInt(base, Number(numerator)))
  }
  throw new ExactError('不支持的有理指数')
}

function evalCall(name: string, args: Expr[], env: ExactEnv): ExactValue {
  const values = args.map((arg) => evalNode(arg, env))
  switch (name) {
    case 'sqrt':
      requireArgs(name, values, 1)
      return exactSqrt(values[0]!)
    case 'abs':
      requireArgs(name, values, 1)
      return exactAbs(values[0]!)
    case 'sin':
      requireArgs(name, values, 1)
      if (exactIsZero(values[0]!)) return EXACT_ZERO
      return sinOfPiMultiple(piMultipleOf(values[0]!))
    case 'cos':
      requireArgs(name, values, 1)
      if (exactIsZero(values[0]!)) return EXACT_ONE
      return cosOfPiMultiple(piMultipleOf(values[0]!))
    case 'tan': {
      requireArgs(name, values, 1)
      if (exactIsZero(values[0]!)) return EXACT_ZERO
      const k = piMultipleOf(values[0]!)
      return exactDiv(sinOfPiMultiple(k), cosOfPiMultiple(k))
    }
    case 'asin':
      requireArgs(name, values, 1)
      return inverseTrig(values[0]!, 'asin')
    case 'acos':
      requireArgs(name, values, 1)
      return exactSub(exactMul(HALF, piAtom()), inverseTrig(values[0]!, 'asin'))
    case 'atan':
      requireArgs(name, values, 1)
      return inverseTrig(values[0]!, 'atan')
    case 'ln':
    case 'log':
      requireArgs(name, values, 1)
      return lnExact(values[0]!)
    case 'exp':
      requireArgs(name, values, 1)
      return expExact(values[0]!)
    default:
      throw new ExactError(`不支持的函数：${name}`)
  }
}

function requireArgs(name: string, values: ExactValue[], count: number): void {
  if (values.length !== count) throw new ExactError(`${name} 参数个数不匹配`)
}

// ---------- 三角表 ----------

/** 参数必须恰为 k·π（k 有理），返回 k */
function piMultipleOf(value: ExactValue): Rat {
  if (value.length !== 1) throw new ExactError('三角函数的参数须为 π 的有理倍')
  const term = value[0]!
  if (term.factors.length !== 1 || term.factors[0]!.key !== 'pi' || term.factors[0]!.power !== 1) {
    throw new ExactError('三角函数的参数须为 π 的有理倍')
  }
  return term.coeff
}

/** sin(u·π)，u ∈ [0,1]，支持的分母为 1/2/3/4/6 */
function sinUnitTable(u: Rat): ExactValue | null {
  const n = u.n
  const d = u.d
  const fraction = `${n}/${d}`
  switch (fraction) {
    case '0/1':
    case '1/1':
      return EXACT_ZERO
    case '1/6':
    case '5/6':
      return HALF
    case '1/4':
    case '3/4':
      return exactMul(HALF, SQRT2)
    case '1/3':
    case '2/3':
      return exactMul(HALF, SQRT3)
    case '1/2':
      return EXACT_ONE
    default:
      return null
  }
}

function sinOfPiMultiple(k: Rat): ExactValue {
  const u = rationalMod(k, 2n) // k mod 2 ∈ [0, 2)
  if (ratToNumber(u) <= 1) {
    const value = sinUnitTable(u)
    if (value) return value
    throw new ExactError('sin 参数不在精确表内')
  }
  const mirrored = ratSub(u, rat(1n)) // sin((1+t)π) = −sin(tπ)
  const value = sinUnitTable(mirrored)
  if (value) return exactNeg(value)
  throw new ExactError('sin 参数不在精确表内')
}

function cosOfPiMultiple(k: Rat): ExactValue {
  // cos(t) = sin(t + π/2)
  return sinOfPiMultiple(ratAdd(k, HALF_RAT))
}

/** 有理数取模：a mod m ∈ [0, m)（m > 0） */
function rationalMod(a: Rat, m: bigint): Rat {
  const dividend = a.n
  const divisor = a.d * m
  let remainder = dividend % divisor
  if (remainder < 0n) remainder += divisor
  return rat(remainder, a.d)
}

/** asin / atan 的小表（输入必须是精确可识别值） */
function inverseTrig(value: ExactValue, kind: 'asin' | 'atan'): ExactValue {
  const sign = exactSign(value)
  if (sign === null) throw new ExactError('无法判定符号')
  const magnitude = sign < 0 ? exactNeg(value) : value
  if (exactIsZero(magnitude)) return EXACT_ZERO
  const table =
    kind === 'asin'
      ? [
          { arg: HALF, result: exactDiv(piAtom(), exactFromInt(6n)) }, // π/6
          { arg: exactMul(HALF, SQRT2), result: exactDiv(piAtom(), exactFromInt(4n)) }, // π/4
          { arg: exactMul(HALF, SQRT3), result: exactDiv(piAtom(), THREE) }, // π/3
          { arg: EXACT_ONE, result: exactDiv(piAtom(), TWO) }, // π/2
        ]
      : [
          { arg: exactDiv(EXACT_ONE, SQRT3), result: exactDiv(piAtom(), exactFromInt(6n)) }, // π/6
          { arg: EXACT_ONE, result: exactDiv(piAtom(), exactFromInt(4n)) }, // π/4
          { arg: SQRT3, result: exactDiv(piAtom(), THREE) }, // π/3
        ]
  for (const { arg, result } of table) {
    if (exactIsZero(exactSub(magnitude, arg))) return sign < 0 ? exactNeg(result) : result
  }
  throw new ExactError(`${kind} 参数不在精确表内`)
}

// ---------- 对数与指数 ----------

function lnExact(value: ExactValue): ExactValue {
  const sign = exactSign(value)
  if (sign === null) throw new ExactError('无法判定符号')
  if (sign <= 0) throw new ExactError('对数的参数须为正')
  // ln(e^k) = k
  if (value.length === 1) {
    const term = value[0]!
    if (
      term.factors.length === 1 &&
      term.factors[0]!.key === 'e' &&
      term.coeff.n === 1n &&
      term.coeff.d === 1n
    ) {
      return exactFromInt(term.factors[0]!.power)
    }
  }
  const ratio = exactRational(value)
  if (!ratio || ratio.n <= 0n) throw new ExactError('仅支持正有理数的对数')
  if (ratio.n === ratio.d) return EXACT_ZERO
  const numFactors = primeFactorize(guardFactor(ratio.n))
  const denFactors = primeFactorize(guardFactor(ratio.d))
  const terms: Term[] = []
  for (const [prime, exponent] of numFactors) terms.push(lnTerm(prime, exponent))
  for (const [prime, exponent] of denFactors) terms.push(lnTerm(prime, -exponent))
  return canonical(terms)
}

function guardFactor(value: bigint): bigint {
  if (value > FACTOR_LIMIT) throw new ExactError('对数归一化规模过大')
  return value
}

function lnTerm(prime: bigint, exponent: number): Term {
  return { coeff: rat(BigInt(exponent)), factors: [{ key: `ln:${prime}`, power: 1 }] }
}

function expExact(value: ExactValue): ExactValue {
  if (exactIsZero(value)) return EXACT_ONE
  if (value.length !== 1) throw new ExactError('exp 参数须为单项')
  const term = value[0]!
  const coeff = term.coeff

  // 纯有理指数 → e^k（k 为整数）
  if (term.factors.length === 0) {
    if (!ratIsInteger(coeff)) throw new ExactError('exp 的有理指数须为整数')
    const k = Number(coeff.n)
    if (Math.abs(k) > POWER_LIMIT) throw new ExactError('exp 指数过大')
    return eAtom(k)
  }

  // 全部为 ln 因子 → ∏ p^(power·c)（指数均为整数时：p^m 或 1/p^|m|）
  if (term.factors.every((f) => f.key.startsWith('ln:'))) {
    const allInteger = term.factors.every((f) => (BigInt(f.power) * coeff.n) % coeff.d === 0n)
    if (allInteger) {
      let result = EXACT_ONE
      for (const f of term.factors) {
        const prime = BigInt(f.key.slice(3))
        const exponent = (BigInt(f.power) * coeff.n) / coeff.d
        if (exponent > BigInt(POWER_LIMIT) || exponent < -BigInt(POWER_LIMIT)) {
          throw new ExactError('exp 指数过大')
        }
        result = exactMul(result, exactPowInt(exactFromInt(prime), Number(exponent)))
      }
      return result
    }
    // 单个 ln 因子且系数分母为 2：p^{m/2} = √(p^m)
    if (term.factors.length === 1 && coeff.d === 2n) {
      const f = term.factors[0]!
      const exponent = BigInt(f.power) * coeff.n
      if (exponent > BigInt(POWER_LIMIT) || exponent < -BigInt(POWER_LIMIT)) {
        throw new ExactError('exp 指数过大')
      }
      return exactSqrt(exactPowInt(exactFromInt(BigInt(f.key.slice(3))), Number(exponent)))
    }
  }
  throw new ExactError('exp 参数不在精确表内')
}

// ---------- 显示 ----------

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

function powerSuffix(power: number): string {
  if (power === 1) return ''
  if (power >= 2 && power <= 9) return SUPERSCRIPTS[String(power)] ?? `^${power}`
  const digits = String(power)
  return digits
    .split('')
    .map((d) => SUPERSCRIPTS[d] ?? d)
    .join('')
}

function formatFactor(key: string, power: number): string {
  if (key === 'pi') return `π${powerSuffix(power)}`
  if (key === 'e') return `e${powerSuffix(power)}`
  if (key.startsWith('sqrt:')) return `√${key.slice(5)}${powerSuffix(power)}`
  if (key.startsWith('ln:')) {
    const body = `ln ${key.slice(3)}`
    return power === 1 ? body : `(${body})${powerSuffix(power)}`
  }
  return `${key}${powerSuffix(power)}`
}

function joinParts(parts: string[]): string {
  let out = ''
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (i === 0) {
      out = part
      continue
    }
    const previous = parts[i - 1]!
    const digitsBefore = /^\d+$/.test(previous)
    const implicitAfterDigits =
      digitsBefore && (part.startsWith('π') || part.startsWith('e') || part.startsWith('√'))
    if (implicitAfterDigits) out += part
    else if (part.startsWith('ln ')) out += ` ${part}`
    else out += `·${part}`
  }
  return out
}

function cloneTerm(term: Term): Term {
  return { coeff: term.coeff, factors: term.factors }
}

/** 精确值 → 人类可读文本（π²/2、4√2/3、e − 1、2 ln 2、1/e、3/(4π)…） */
export function formatExact(value: ExactValue): string {
  if (value.length === 0) return '0'
  const chunks: string[] = []
  value.forEach((term, index) => {
    const negative = term.coeff.n < 0n
    const absCoeff = negative ? ratNeg(term.coeff) : term.coeff
    const body = formatTermBody(absCoeff, term.factors)
    if (index === 0) chunks.push(`${negative ? '−' : ''}${body}`)
    else chunks.push(`${negative ? ' − ' : ' + '}${body}`)
  })
  return chunks.join('')
}

function formatTermBody(absCoeff: Rat, factors: readonly Factor[]): string {
  const numParts: string[] = []
  if (absCoeff.n !== 1n || factors.every((f) => f.power < 0)) numParts.push(absCoeff.n.toString())
  const denParts: string[] = []
  if (absCoeff.d !== 1n) denParts.push(absCoeff.d.toString())
  const positive = factors.filter((f) => f.power > 0).sort((a, b) => a.key.localeCompare(b.key))
  const negative = factors.filter((f) => f.power < 0).sort((a, b) => a.key.localeCompare(b.key))
  for (const f of positive) numParts.push(formatFactor(f.key, f.power))
  for (const f of negative) denParts.push(formatFactor(f.key, -f.power))
  const numStr = numParts.length > 0 ? joinParts(numParts) : '1'
  if (denParts.length === 0) return numStr
  const denStr = joinParts(denParts)
  return denParts.length > 1 ? `${numStr}/(${denStr})` : `${numStr}/${denStr}`
}
