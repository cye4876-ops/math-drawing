/**
 * 自适应 Simpson 数值积分（v0.4 定积分工具）。
 *
 * 在区间上递归二分，用 Richardson 外推（(S_left+S_right−S_whole)/15）估计误差；
 * 误差超过容差则继续细分（容差随深度减半），直到满足或达到深度/求值预算。
 * 区间内出现非有限函数值（如 1/x 跨 0）时快速失败返回 NaN（不支持奇异积分，写入文档）。
 */
export interface IntegrateOptions {
  /** 目标绝对误差（默认 1e-10） */
  tolerance?: number
  /** 最大递归深度（默认 20） */
  maxDepth?: number
  /** 求值预算（默认 200000） */
  maxEvaluations?: number
}

export interface IntegrateResult {
  value: number
  /** 误差估计（Richardson 项累计；触顶/预算耗尽时偏大） */
  error: number
  evaluations: number
  /** 因深度或预算限制提前终止 */
  truncated: boolean
}

export function adaptiveSimpson(
  f: (x: number) => number,
  a: number,
  b: number,
  options: IntegrateOptions = {},
): IntegrateResult {
  const tolerance = options.tolerance ?? 1e-10
  const maxDepth = options.maxDepth ?? 20
  const maxEvaluations = options.maxEvaluations ?? 200_000

  let evaluations = 0
  let errorPeak = 0
  let truncated = false
  let nonFinite = false

  const evalF = (x: number): number => {
    evaluations++
    return f(x)
  }

  if (!(b > a)) {
    return { value: b === a ? 0 : Number.NaN, error: Number.NaN, evaluations, truncated: false }
  }

  const fa = evalF(a)
  const fb = evalF(b)
  const fm = evalF((a + b) / 2)
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || !Number.isFinite(fm)) {
    return { value: Number.NaN, error: Number.POSITIVE_INFINITY, evaluations, truncated: false }
  }

  const simpson = (f0: number, f1: number, f2: number, x0: number, x2: number): number =>
    ((x2 - x0) / 6) * (f0 + 4 * f1 + f2)

  const recurse = (
    x0: number,
    x2: number,
    f0: number,
    f1: number,
    f2: number,
    whole: number,
    depth: number,
    eps: number,
  ): number => {
    const x1 = (x0 + x2) / 2
    const xl = (x0 + x1) / 2
    const xr = (x1 + x2) / 2
    if (evaluations > maxEvaluations) {
      truncated = true
      return whole
    }
    const fl = evalF(xl)
    const fr = evalF(xr)
    if (!Number.isFinite(fl) || !Number.isFinite(fr)) {
      nonFinite = true
      return Number.NaN
    }
    const left = simpson(f0, fl, f1, x0, x1)
    const right = simpson(f1, fr, f2, x1, x2)
    const delta = left + right - whole
    const richardson = Math.abs(delta) / 15

    if (depth >= maxDepth) {
      // 深度用尽：接受粗化结果，用当前 Richardson 项作为保守误差
      errorPeak = Math.max(errorPeak, richardson)
      truncated = true
      return left + right + delta / 15
    }
    if (Math.abs(delta) <= 15 * eps) {
      // 接受叶子：误差估计只累计被接受的层级（根级未细化的 delta 不计入）
      errorPeak = Math.max(errorPeak, richardson)
      return left + right + delta / 15
    }
    const leftValue = recurse(x0, x1, f0, fl, f1, left, depth + 1, eps / 2)
    if (Number.isNaN(leftValue)) return Number.NaN
    const rightValue = recurse(x1, x2, f1, fr, f2, right, depth + 1, eps / 2)
    if (Number.isNaN(rightValue)) return Number.NaN
    return leftValue + rightValue
  }

  const whole = simpson(fa, fm, fb, a, b)
  const value = recurse(a, b, fa, fm, fb, whole, 0, tolerance)
  if (nonFinite || Number.isNaN(value)) {
    return { value: Number.NaN, error: Number.POSITIVE_INFINITY, evaluations, truncated }
  }
  return {
    value,
    error: truncated ? Math.max(errorPeak, tolerance) : errorPeak,
    evaluations,
    truncated,
  }
}
