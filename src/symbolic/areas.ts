/**
 * 两曲线围成面积（v2.8）：
 * - 在 [a, b] 内数值求交点（采样 + 二分细化）；
 * - 交点吸附到简单有理数或 π 的有理倍（sin=cos 于 π/4 等），使常见情形得到精确结果；
 * - 每段按 |f − g| 积分：符号积分 + 精确端点求值（definiteIntegralExpr），逐段与总面积；
 * - 有段落无法精确时整条总面积标注 ≈ 数值（段行仍显示各自结果）。
 */
import { evaluate, makeBinary, parse, type Expr } from '../expr'
import { adaptiveSimpson } from '../math/numeric/integrate'
import {
  evalExact,
  exactAdd,
  exactFromNumber,
  exactToNumber,
  formatExact,
  snapNumber,
  type ExactEnv,
  type ExactValue,
} from './exact'
import { definiteIntegralExpr } from './definite'

export interface AreaSegment {
  lo: number
  hi: number
  /** 端点显示（精确式或数值） */
  loText: string
  hiText: string
  /** 该段面积显示（精确式或 ≈ 数值） */
  display: string
  value: number
  exact: boolean
}

export interface AreaResult {
  segments: AreaSegment[]
  total: { display: string; value: number; exact: boolean }
  /** [a, b] 内的交点（不含端点） */
  crossings: number[]
}

export interface AreaOutcome {
  result: AreaResult | null
  reason: string
}

export interface AreaOptions {
  /** 端点文本是否按精确值解析（默认 true；拖动端点的数值文本应传 false，只做吸附） */
  exactEndpoints?: boolean
}

const SAMPLE_COUNT = 2000
const ZERO_EPS = 1e-12

/** 数值求交点：f(x) − g(x) 的符号变化处二分细化（含采样点处的近零根） */
export function findCrossings(
  f: (x: number) => number,
  g: (x: number) => number,
  lo: number,
  hi: number,
  samples = SAMPLE_COUNT,
): number[] {
  if (!(hi > lo)) return []
  const diff = (x: number): number => f(x) - g(x)
  const roots: number[] = []
  const step = (hi - lo) / samples
  let prevX = lo
  let prev = diff(lo)
  if (Number.isFinite(prev) && Math.abs(prev) < ZERO_EPS) roots.push(lo)
  for (let i = 1; i <= samples; i++) {
    const x = lo + step * i
    const cur = diff(x)
    if (Number.isFinite(prev) && Number.isFinite(cur)) {
      if (cur !== 0 && prev !== 0 && prev * cur < 0) {
        roots.push(bisect(diff, prevX, x, prev))
      } else if (Math.abs(cur) < ZERO_EPS) {
        roots.push(x)
      }
    }
    prevX = x
    prev = cur
  }
  roots.push(hi) // 统一过滤端点
  const inside = roots.filter((root) => root > lo + ZERO_EPS && root < hi - ZERO_EPS)
  const deduped: number[] = []
  for (const root of inside.sort((a, b) => a - b)) {
    if (deduped.length === 0 || Math.abs(root - deduped[deduped.length - 1]!) > 1e-9) {
      deduped.push(root)
    }
  }
  return deduped
}

/** 二分细化符号变化区间（100 次迭代 ≈ 机器精度） */
function bisect(diff: (x: number) => number, x0: number, x1: number, v0: number): number {
  let lo = x0
  let hi = x1
  let flo = v0
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    const fmid = diff(mid)
    if (!Number.isFinite(fmid)) break
    if (fmid === 0) return mid
    if (flo * fmid < 0) {
      hi = mid
    } else {
      lo = mid
      flo = fmid
    }
    if (hi - lo < 1e-15 * Math.max(1, Math.abs(mid))) break
  }
  return (lo + hi) / 2
}

function formatValue(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return '—'
  return value
    .toFixed(digits)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
}

function exactFromText(text: string, env: ExactEnv): ExactValue | null {
  try {
    return evalExact(parse(text), env)
  } catch {
    return null
  }
}

/** 端点文本 → 数值（失败返回 NaN；支持 pi 等常量与参数） */
function numericFromText(text: string, scope: Record<string, number>): number {
  try {
    const value = evaluate(parse(text), scope)
    return Number.isFinite(value) ? value : Number.NaN
  } catch {
    return Number.NaN
  }
}

function evalNumeric(expr: Expr, x: number, scope: Record<string, number>): number {
  try {
    return evaluate(expr, { ...scope, x })
  } catch {
    return Number.NaN
  }
}

function numericArea(expr: Expr, scope: Record<string, number>, lo: number, hi: number): number {
  return adaptiveSimpson((x) => evalNumeric(expr, x, scope), lo, hi, { tolerance: 1e-10 }).value
}

/**
 * 计算 [a, b] 上两条显函数曲线围成的面积。
 * loText / hiText 支持精确写法（0、pi、sqrt(2)…）；params 为曲线滑杆参数。
 */
export function areasBetween(
  fText: string,
  gText: string,
  loText: string,
  hiText: string,
  params?: Record<string, number>,
  options?: AreaOptions,
): AreaOutcome {
  let fExpr: Expr
  let gExpr: Expr
  try {
    fExpr = parse(fText)
    gExpr = parse(gText)
  } catch {
    return { result: null, reason: '曲线表达式无法解析' }
  }
  const env: ExactEnv = {}
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      try {
        env[name] = exactFromNumber(value)
      } catch {
        /* 参数无法精确表示时忽略：端点精确求值会退回吸附或数值 */
      }
    }
  }
  const scope: Record<string, number> = {}
  for (const [name, value] of Object.entries(env)) scope[name] = exactToNumber(value)
  const f = (x: number): number => evalNumeric(fExpr, x, scope)
  const g = (x: number): number => evalNumeric(gExpr, x, scope)

  const useExactText = options?.exactEndpoints ?? true
  const loExact = useExactText ? exactFromText(loText, env) : null
  const hiExact = useExactText ? exactFromText(hiText, env) : null
  const a = numericFromText(loText, scope)
  const b = numericFromText(hiText, scope)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { result: null, reason: '区间端点无法解析（支持 0、pi、sqrt(2) 等）' }
  }
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (hi - lo < ZERO_EPS) return { result: null, reason: '区间长度为零' }

  const crossings = findCrossings(f, g, lo, hi)
  const boundary = (value: number, exact: ExactValue | null): ExactValue | null => {
    if (exact && Math.abs(exactToNumber(exact) - value) < ZERO_EPS) return exact
    // 拖动端点等数值边界只吸附“极简”值（整数、1/2、3/4…）：避免 2.34375 → 75/32 的伪精确
    return snapNumber(value, 8n)
  }
  const points: { value: number; exact: ExactValue | null }[] = [
    { value: lo, exact: boundary(lo, a <= b ? loExact : hiExact) },
    ...crossings.map((value) => ({ value, exact: snapNumber(value) })),
    { value: hi, exact: boundary(hi, a <= b ? hiExact : loExact) },
  ]

  const segments: AreaSegment[] = []
  let numericTotal = 0
  let exactTotal: ExactValue = []
  let allExact = true
  for (let i = 0; i + 1 < points.length; i++) {
    const start = points[i]!
    const end = points[i + 1]!
    if (end.value - start.value < ZERO_EPS) continue
    const mid = (start.value + end.value) / 2
    const fMid = f(mid)
    const gMid = g(mid)
    const segment: AreaSegment = {
      lo: start.value,
      hi: end.value,
      loText: start.exact ? formatExact(start.exact) : formatValue(start.value),
      hiText: end.exact ? formatExact(end.exact) : formatValue(end.value),
      display: '—',
      value: Number.NaN,
      exact: false,
    }
    if (!Number.isFinite(fMid) || !Number.isFinite(gMid)) {
      allExact = false
      segments.push(segment)
      numericTotal = Number.NaN
      continue
    }
    const diffExpr = fMid >= gMid ? makeBinary('-', fExpr, gExpr) : makeBinary('-', gExpr, fExpr)
    let exact = false
    if (start.exact && end.exact) {
      const outcome = definiteIntegralExpr(diffExpr, 'x', start.exact, end.exact, env)
      if (outcome.kind === 'exact') {
        segment.display = outcome.display
        segment.value = outcome.value
        segment.exact = true
        exact = true
        exactTotal = exactAdd(exactTotal, outcome.exactValue)
      } else if (outcome.numeric && Number.isFinite(outcome.numeric.value)) {
        segment.value = outcome.numeric.value
        segment.display = `≈ ${formatValue(segment.value)}`
      }
    }
    if (!exact) {
      allExact = false
      if (!Number.isFinite(segment.value)) {
        segment.value = numericArea(diffExpr, scope, start.value, end.value)
        segment.display = Number.isFinite(segment.value) ? `≈ ${formatValue(segment.value)}` : '—'
      }
    }
    numericTotal += Number.isFinite(segment.value) ? segment.value : Number.NaN
    segments.push(segment)
  }

  if (segments.length === 0) {
    return { result: null, reason: '区间内没有可积分的区域' }
  }
  const total = allExact
    ? { display: formatExact(exactTotal), value: exactToNumber(exactTotal), exact: true }
    : {
        display: Number.isFinite(numericTotal) ? `≈ ${formatValue(numericTotal)}` : '—',
        value: numericTotal,
        exact: false,
      }
  return {
    result: { segments, total, crossings },
    reason: Number.isFinite(numericTotal) ? '' : '部分段落无法求值（函数在区间内可能无定义）',
  }
}
