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
import {
  adaptiveSimpson,
  compositeGauss,
  type IntegrateVerification,
} from '../math/numeric/integrate'
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
  /** v2.9：数值器自身的多段/Gauss 复核状态 */
  verification: IntegrateVerification
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
  /** 附加说明（如“自适应数值曾不一致、已由 Gauss 复核确认”） */
  note?: string
}

/**
 * v2.9：解析与数值不一致时的“待核验”结果。
 * 不预设任何一方正确：并排保留解析候选、自适应数值与独立 Gauss 复核值，供使用者判断。
 */
export interface ConflictIntegralResult {
  kind: 'conflict'
  /** 符号积分候选 */
  exactDisplay: string
  exactValue: number
  reason: string
  antiderivative: Expr
  antiderivativeText: string
  loText: string
  hiText: string
  numeric: NumericBackup | null
  gaussValue: number | null
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

export type DefiniteOutcome = ExactIntegralResult | ConflictIntegralResult | FallbackIntegralResult

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
  const within = (a: number, b: number): boolean =>
    Math.abs(a - b) <= VERIFY_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b))
  const closeToExact =
    numeric !== null && Number.isFinite(numeric.value) && within(numeric.value, value)
  if (closeToExact) {
    return {
      kind: 'exact',
      display,
      value,
      exactValue: result,
      antiderivative,
      antiderivativeText,
      loText: formatExactSafe(loValue, ''),
      hiText: formatExactSafe(hiValue, ''),
      numeric: numeric!,
    }
  }

  // v2.9：自适应结果与解析不一致时，先启用独立 Gauss–Legendre 复核（不预设谁对）
  const gaussValue = withNumericFunction(expr, varName, loValue, hiValue, env, (fn, lo, hi) => {
    const gauss = compositeGauss(fn, lo, hi, 64)
    return Number.isFinite(gauss.value) ? gauss.value : null
  })
  if (gaussValue !== null && within(gaussValue, value)) {
    return {
      kind: 'exact',
      display,
      value,
      exactValue: result,
      antiderivative,
      antiderivativeText,
      loText: formatExactSafe(loValue, ''),
      hiText: formatExactSafe(hiValue, ''),
      numeric: numeric ?? {
        value: Number.NaN,
        error: Number.POSITIVE_INFINITY,
        evaluations: 0,
        truncated: false,
        verification: { status: 'matched', uniform: null, gauss: gaussValue },
      },
      note: '自适应数值结果与解析值曾不一致，已由独立 Gauss–Legendre 复核确认解析值。',
    }
  }

  // 任一方都无法裁定：并排保留证据，标“待核验”
  const numericUsable = numeric !== null && Number.isFinite(numeric.value)
  const reason =
    gaussValue === null && !numericUsable
      ? '数值校验不可用（区间内可能存在奇点或函数无定义），解析候选待核验'
      : numericUsable &&
          gaussValue !== null &&
          within(numericUsable ? numeric!.value : 0, gaussValue)
        ? '解析与数值结果不一致（两种数值方法彼此一致），待核验'
        : '解析与数值结果不一致（数值方法之间也不一致，可能振荡或存在奇点），待核验'
  return {
    kind: 'conflict',
    exactDisplay: display,
    exactValue: value,
    reason,
    antiderivative,
    antiderivativeText,
    loText: formatExactSafe(loValue, ''),
    hiText: formatExactSafe(hiValue, ''),
    numeric,
    gaussValue,
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

/** 自适应 Simpson 数值积分（端点转为数值；含 v2.9 均匀多段/Gauss 复核信息） */
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
  const fn = numericFunction(expr, varName, env)
  const result = adaptiveSimpson(fn, lo, hi, { tolerance: 1e-10 })
  return {
    value: result.value,
    error: result.error,
    evaluations: result.evaluations,
    truncated: result.truncated,
    verification: result.verification,
  }
}

/** 曲线数值函数（含参数环境） */
function numericFunction(expr: Expr, varName: string, env: ExactEnv): (x: number) => number {
  const scope: Record<string, number> = {}
  for (const [name, value] of Object.entries(env)) scope[name] = exactToNumber(value)
  return (x: number): number => {
    try {
      return evaluate(expr, { ...scope, [varName]: x })
    } catch {
      return Number.NaN
    }
  }
}

/** 在数值函数上执行一次带端点的独立复核（供 Gauss 仲裁使用） */
function withNumericFunction<T>(
  expr: Expr,
  varName: string,
  loValue: ExactValue,
  hiValue: ExactValue,
  env: ExactEnv,
  runner: (fn: (x: number) => number, lo: number, hi: number) => T,
): T | null {
  const lo = exactToNumber(loValue)
  const hi = exactToNumber(hiValue)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return null
  return runner(numericFunction(expr, varName, env), lo, hi)
}
