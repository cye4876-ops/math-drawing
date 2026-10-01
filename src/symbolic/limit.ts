/**
 * 符号极限（v0.9）：
 * - 直接代入（连续性检查）；
 * - 标准模式：sin u/u、tan u/u、u/sin u、(1−cos u)/u²、(e^u−1)/u；
 * - 多项式比（x → ±∞ 或有限点，精确）；
 * - 数值 Richardson 兜底（不收敛/振荡时报失败）。
 */
import { compile, type Expr } from '../expr'
import { astToPoly, polyDegree } from './poly'
import { exprEqual } from './simplify'

export type Approach = number | 'inf' | '-inf'

export interface LimitResult {
  ok: boolean
  value: number | null
  infinite: 0 | 1 | -1
  method: 'substitute' | 'polynomial-ratio' | 'pattern' | 'numeric' | 'none'
  message?: string
}

function tryNumeric(expr: Expr): number | null {
  try {
    const value = compile(expr)({})
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function matchStandardPatterns(expr: Expr, varName: string, approach: number): LimitResult | null {
  if (expr.type !== 'binary' || expr.op !== '/') return null
  const numerator = expr.left
  const denominator = expr.right
  const at = (target: Expr, x: number): number => {
    try {
      return compile(target)({ [varName]: x })
    } catch {
      return Number.NaN
    }
  }
  const denominatorValue = at(denominator, approach)
  const numeratorValue = at(numerator, approach)
  if (!Number.isFinite(denominatorValue) || Math.abs(denominatorValue) > 1e-9) return null
  // 标准模式均针对 0/0 型；分子在极限点也必须趋于 0
  if (!Number.isFinite(numeratorValue) || Math.abs(numeratorValue) > 1e-9) return null

  const numeratorCall = numerator.type === 'call' ? numerator : null
  const denominatorCall = denominator.type === 'call' ? denominator : null

  // sin u / u、tan u / u → 1（反之亦然）
  if (
    numeratorCall &&
    numeratorCall.args.length === 1 &&
    (numeratorCall.name === 'sin' || numeratorCall.name === 'tan') &&
    exprEqual(numeratorCall.args[0]!, denominator)
  ) {
    return {
      ok: true,
      value: 1,
      infinite: 0,
      method: 'pattern',
      message: `${numeratorCall.name}(u)/u → 1`,
    }
  }
  if (
    denominatorCall &&
    denominatorCall.args.length === 1 &&
    (denominatorCall.name === 'sin' || denominatorCall.name === 'tan') &&
    exprEqual(denominatorCall.args[0]!, numerator)
  ) {
    return {
      ok: true,
      value: 1,
      infinite: 0,
      method: 'pattern',
      message: `u/${denominatorCall.name}(u) → 1`,
    }
  }

  // (1 − cos u)/u² → 1/2
  if (numerator.type === 'binary' && numerator.op === '-') {
    const oneSide = tryNumeric(numerator.left)
    const cosSide =
      numerator.right.type === 'call' &&
      numerator.right.name === 'cos' &&
      numerator.right.args.length === 1
        ? numerator.right
        : null
    if (
      oneSide === 1 &&
      cosSide &&
      denominator.type === 'binary' &&
      denominator.op === '^' &&
      tryNumeric(denominator.right) === 2 &&
      exprEqual(denominator.left, cosSide.args[0]!)
    ) {
      return { ok: true, value: 0.5, infinite: 0, method: 'pattern', message: '(1−cos u)/u² → 1/2' }
    }
  }

  // (e^u − 1)/u → 1
  if (numerator.type === 'binary' && numerator.op === '-') {
    const oneSide = tryNumeric(numerator.right)
    const eSide = numerator.left
    if (
      oneSide === 1 &&
      eSide.type === 'binary' &&
      eSide.op === '^' &&
      eSide.left.type === 'constant' &&
      eSide.left.name === 'e' &&
      exprEqual(eSide.right, denominator)
    ) {
      return { ok: true, value: 1, infinite: 0, method: 'pattern', message: '(e^u−1)/u → 1' }
    }
  }

  return null
}

function polynomialRatio(
  expr: Expr,
  varName: string,
  approach: 'inf' | '-inf',
): LimitResult | null {
  let numerator = expr
  let denominator: Expr | null = null
  if (expr.type === 'binary' && expr.op === '/') {
    numerator = expr.left
    denominator = expr.right
  }
  const numeratorPoly = astToPoly(numerator, varName)
  if (!numeratorPoly) return null
  const numeratorDegree = polyDegree(numeratorPoly)
  if (numeratorDegree <= 0) return null
  const direction = approach === 'inf' ? 1 : -1
  if (!denominator) {
    // 整多项式 → ±∞
    const leading = numeratorPoly[numeratorDegree]!
    const sign = Math.sign(leading) * (direction === 1 || numeratorDegree % 2 === 0 ? 1 : -1)
    return {
      ok: true,
      value: null,
      infinite: sign >= 0 ? 1 : -1,
      method: 'polynomial-ratio',
      message: '多项式发散',
    }
  }
  const denominatorPoly = astToPoly(denominator, varName)
  if (!denominatorPoly) return null
  const denominatorDegree = polyDegree(denominatorPoly)
  if (denominatorDegree < 0) return null
  const ratio = numeratorPoly[numeratorDegree]! / denominatorPoly[denominatorDegree]!
  if (numeratorDegree < denominatorDegree) {
    return { ok: true, value: 0, infinite: 0, method: 'polynomial-ratio' }
  }
  if (numeratorDegree === denominatorDegree) {
    return { ok: true, value: ratio, infinite: 0, method: 'polynomial-ratio' }
  }
  const degreeGap = numeratorDegree - denominatorDegree
  const sign = Math.sign(ratio) * (direction === 1 || degreeGap % 2 === 0 ? 1 : -1)
  return {
    ok: true,
    value: null,
    infinite: sign >= 0 ? 1 : -1,
    method: 'polynomial-ratio',
    message: '分子次数更高，发散',
  }
}

function analyzeSequence(values: number[]): { value: number | null; infinite: 0 | 1 | -1 } {
  const finite = values.filter((item) => Number.isFinite(item))
  if (finite.length < 2) return { value: null, infinite: 0 }
  const last = values[values.length - 1]!
  const previous = values[values.length - 2]!
  if (!Number.isFinite(last) || Math.abs(last) > 1e8) {
    // 探测发散：最后几个有限值是否单调增
    const tail = values.slice(-3).filter((item) => Number.isFinite(item) && Math.abs(item) > 1)
    if (tail.length >= 2 && Math.abs(tail[tail.length - 1]!) > Math.abs(tail[0]!) * 5) {
      const sign = Math.sign(tail[tail.length - 1]!)
      return { value: null, infinite: sign >= 0 ? 1 : -1 }
    }
    return { value: null, infinite: 0 }
  }
  if (!Number.isFinite(previous)) return { value: null, infinite: 0 }
  const scale = 1 + Math.abs(last)
  if (Math.abs(last - previous) < 1e-6 * scale) {
    // Richardson 外推（O(h) 误差假设：2x 更细步长）
    const richardson = 2 * last - previous
    const refined = Math.abs(richardson - last) < 1e-3 * scale ? richardson : last
    return { value: refined, infinite: 0 }
  }
  return { value: null, infinite: 0 }
}

function numericLimit(evaluateAt: (x: number) => number, approach: Approach): LimitResult {
  if (approach === 'inf' || approach === '-inf') {
    const direction = approach === 'inf' ? 1 : -1
    const samples: number[] = []
    for (let power = 2; power <= 9; power++) samples.push(evaluateAt(direction * 10 ** power))
    const analysis = analyzeSequence(samples)
    if (analysis.infinite !== 0) {
      return {
        ok: true,
        value: null,
        infinite: analysis.infinite,
        method: 'numeric',
        message: '数值判定发散',
      }
    }
    if (analysis.value !== null) {
      return {
        ok: true,
        value: analysis.value,
        infinite: 0,
        method: 'numeric',
        message: '数值近似',
      }
    }
    return {
      ok: false,
      value: null,
      infinite: 0,
      method: 'none',
      message: '数值不收敛（可能振荡或无极限）',
    }
  }
  const rights: number[] = []
  const lefts: number[] = []
  for (let power = 1; power <= 7; power++) {
    const h = 10 ** -power
    rights.push(evaluateAt(approach + h))
    lefts.push(evaluateAt(approach - h))
  }
  const right = analyzeSequence(rights)
  const left = analyzeSequence(lefts)
  if (right.infinite !== 0 || left.infinite !== 0) {
    if (right.infinite === left.infinite && right.infinite !== 0) {
      return {
        ok: true,
        value: null,
        infinite: right.infinite,
        method: 'numeric',
        message: '数值判定发散',
      }
    }
    return { ok: false, value: null, infinite: 0, method: 'none', message: '两侧发散行为不一致' }
  }
  if (right.value !== null && left.value !== null) {
    const scale = 1 + Math.max(Math.abs(right.value), Math.abs(left.value))
    if (Math.abs(right.value - left.value) < 1e-3 * scale) {
      return {
        ok: true,
        value: (right.value + left.value) / 2,
        infinite: 0,
        method: 'numeric',
        message: '数值近似',
      }
    }
    return { ok: false, value: null, infinite: 0, method: 'none', message: '左右极限不相等' }
  }
  if (right.value !== null || left.value !== null) {
    const oneSide = right.value ?? left.value!
    return { ok: true, value: oneSide, infinite: 0, method: 'numeric', message: '单侧数值近似' }
  }
  return { ok: false, value: null, infinite: 0, method: 'none', message: '数值不收敛' }
}

/** 求极限 lim_{x→approach} expr */
export function limit(expr: Expr, varName = 'x', approach: Approach = 0): LimitResult {
  const f = compile(expr)
  const evaluateAt = (x: number): number => {
    try {
      return f({ [varName]: x })
    } catch {
      return Number.NaN
    }
  }

  if (typeof approach === 'number') {
    const pattern = matchStandardPatterns(expr, varName, approach)
    if (pattern) return pattern
    const at = evaluateAt(approach)
    if (Number.isFinite(at)) {
      const h = 1e-6
      const left = evaluateAt(approach - h)
      const right = evaluateAt(approach + h)
      const tolerance = 1e-5 * (1 + Math.abs(at))
      if (
        Number.isFinite(left) &&
        Number.isFinite(right) &&
        Math.abs(left - right) < 100 * tolerance &&
        Math.abs(at - left) < 100 * tolerance
      ) {
        return { ok: true, value: at, infinite: 0, method: 'substitute' }
      }
    }
  } else {
    const ratio = polynomialRatio(expr, varName, approach)
    if (ratio) return ratio
  }

  return numericLimit(evaluateAt, approach)
}
