/**
 * 定积分精确结果（v2.8）：
 * - 符号积分求原函数 F（symbolic/integrate 的有限规则集）；
 * - 端点用精确值引擎求值（0、pi、e、sqrt 等），F(b) − F(a) 得到 2、π²/2、4√2/3 这类精确式；
 * - **数值对照安全网**：自适应 Simpson 独立算一遍，二者不一致时拒绝解析值、回退数值，
 *   防止符号积分实现的缺陷导致错误显示（原缺陷：∫₀^π sin x 只给近似 2.000000…）。
 *
 * 回退策略（kind='none'/'approx' 时 UI 显示数值结果与原因）：
 * - 表达式/端点无法解析或无法精确求值；
 * - 符号积分未找到原函数（超出有限规则集）；
 * - 数值积分不收敛（区间内可能存在奇点）。
 */
import { evaluate, parse, type Expr } from '../expr'
import { adaptiveSimpson } from '../math/numeric/integrate'
import {
  exactFromNumber,
  evalExact,
  exactSub,
  exactToNumber,
  formatExact,
  type ExactEnv,
  type ExactValue,
} from './exact'
import { exprText } from './expr-text'
import { integrate } from './integrate'
import { simplify } from './simplify'

export interface NumericBackup {
  value: number
  error: number
  evaluations: number
  truncated: boolean
}

export interface ExactIntegralResult {
  kind: 'exact'
  /** 精确显示文本（2、π²/2、4√2/3…） */
  display: string
  value: number
  /** 精确值本身（可与其他精确值相加，如面积工具逐段求和） */
  exactValue: ExactValue
  antiderivative: Expr
  antiderivativeText: string
  loText: string
  hiText: string
  numeric: NumericBackup
}

export interface FallbackIntegralResult {
  kind: 'approx' | 'none'
  reason: string
  numeric: NumericBackup | null
  /** 符号积分成功但未通过数值校验时的解析候选（仅供提示，不采信） */
  candidate: { display: string; value: number } | null
  antiderivative: Expr | null
  antiderivativeText: string | null
  loText: string | null
  hiText: string | null
}

export type DefiniteOutcome = ExactIntegralResult | FallbackIntegralResult

const VERIFY_TOLERANCE = 1e-6

/** 文本入口：解析函数与端点文本（端点支持 pi、e、sqrt(2) 等精确写法） */
export function definiteIntegral(
  fnText: string,
  varName: string,
  loText: string,
  hiText: string,
  params?: Record<string, number>,
): DefiniteOutcome {
  let expr: Expr
  let loValue: ExactValue
  let hiValue: ExactValue
  try {
    expr = parse(fnText)
  } catch {
    return none('表达式无法解析')
  }
  const env: ExactEnv = {}
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      try {
        env[name] = exactFromNumber(value)
      } catch {
        return none('参数无法精确表示')
      }
    }
  }
  try {
    loValue = evalExact(parse(loText), env)
    hiValue = evalExact(parse(hiText), env)
  } catch {
    return none('端点无法精确求值（可用 0、pi、e、sqrt(2) 等精确端点）')
  }
  const outcome = definiteIntegralExpr(expr, varName, loValue, hiValue, env)
  return {
    ...outcome,
    loText: formatExactSafe(loValue, loText),
    hiText: formatExactSafe(hiValue, hiText),
  }
}

/** AST 入口：端点已是精确值（供面积工具的分段积分复用） */
export function definiteIntegralExpr(
  expr: Expr,
  varName: string,
  loValue: ExactValue,
  hiValue: ExactValue,
  env: ExactEnv = {},
): DefiniteOutcome {
  const numeric = numericIntegral(expr, varName, loValue, hiValue, env)
  const antiderivative = integrate(expr, varName)
  if (!antiderivative) {
    return {
      ...none('符号积分未找到原函数（超出解析解规则集）'),
      numeric,
      loText: formatExactSafe(loValue, ''),
      hiText: formatExactSafe(hiValue, ''),
    }
  }
  const antiderivativeText = exprText(simplify(antiderivative))

  let result: ExactValue
  try {
    const atUpper = evalExact(antiderivative, { ...env, [varName]: hiValue })
    const atLower = evalExact(antiderivative, { ...env, [varName]: loValue })
    result = exactSub(atUpper, atLower)
  } catch {
    return {
      ...none('原函数在端点处无法精确求值'),
      numeric,
      antiderivative,
      antiderivativeText,
      loText: formatExactSafe(loValue, ''),
      hiText: formatExactSafe(hiValue, ''),
    }
  }

  const display = formatExact(result)
  const value = exactToNumber(result)
  if (!numeric || !Number.isFinite(numeric.value)) {
    return {
      ...none('数值校验不可用（区间内可能存在奇点），未采信解析值'),
      numeric,
      candidate: { display, value },
      antiderivative,
      antiderivativeText,
      loText: formatExactSafe(loValue, ''),
      hiText: formatExactSafe(hiValue, ''),
    }
  }
  const tolerance = VERIFY_TOLERANCE * Math.max(1, Math.abs(numeric.value))
  if (Math.abs(value - numeric.value) > tolerance) {
    return {
      ...none('解析结果与数值积分不一致，已回退数值（疑似符号积分缺陷）'),
      numeric,
      candidate: { display, value },
      antiderivative,
      antiderivativeText,
      loText: formatExactSafe(loValue, ''),
      hiText: formatExactSafe(hiValue, ''),
    }
  }
  return {
    kind: 'exact',
    display,
    value,
    exactValue: result,
    antiderivative,
    antiderivativeText,
    loText: formatExactSafe(loValue, ''),
    hiText: formatExactSafe(hiValue, ''),
    numeric,
  }
}

function none(reason: string): FallbackIntegralResult {
  return {
    kind: 'none',
    reason,
    numeric: null,
    candidate: null,
    antiderivative: null,
    antiderivativeText: null,
    loText: null,
    hiText: null,
  }
}

function formatExactSafe(value: ExactValue, fallback: string): string {
  try {
    return formatExact(value)
  } catch {
    return fallback
  }
}

/** 自适应 Simpson 数值积分（端点转为数值） */
export function numericIntegral(
  expr: Expr,
  varName: string,
  loValue: ExactValue,
  hiValue: ExactValue,
  env: ExactEnv = {},
): NumericBackup | null {
  const lo = exactToNumber(loValue)
  const hi = exactToNumber(hiValue)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return null
  const scope: Record<string, number> = {}
  for (const [name, value] of Object.entries(env)) {
    if (value) scope[name] = exactToNumber(value)
  }
  const fn = (x: number): number => {
    try {
      return evaluate(expr, { ...scope, [varName]: x })
    } catch {
      return Number.NaN
    }
  }
  const result = adaptiveSimpson(fn, lo, hi, { tolerance: 1e-10 })
  return {
    value: result.value,
    error: result.error,
    evaluations: result.evaluations,
    truncated: result.truncated,
  }
}
