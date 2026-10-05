/**
 * 自适应 Simpson 数值积分（v0.4 起；v2.9 加入均匀多段复核与振荡防护）。
 *
 * 算法：
 * 1) 自适应递归二分 + Richardson 外推（(S_left+S_right−S_whole)/15）——对光滑函数高效；
 * 2) **均匀多段对照**（v2.9）：按 8→16→32… 倍增的复合 Simpson 独立计算一遍；
 *    自适应采样可能与振荡函数的零点对齐（如 sin²(4x) 在 [0, π] 上五点采样全为零，
 *    误报 2.5e-31 与极小误差），均匀细分可暴露这种“假收敛”；
 * 3) **独立 Gauss–Legendre 复核**（v2.9）：两法不一致时，用 8 点 Gauss 复合（64 段）
 *    作第三方仲裁——节点为无理数位置，不会与周期函数的零点网格重合。
 *
 * 误差 field 为“估计值”：由 Richardson 项、均匀细分增量与两法差值组成，
 * 预算/深度耗尽时标 truncated 并放大估计。
 */
export interface IntegrateOptions {
  /** 目标绝对误差（默认 1e-10） */
  tolerance?: number
  /** 最大递归深度（默认 20） */
  maxDepth?: number
  /** 求值预算（默认 200000） */
  maxEvaluations?: number
}

export interface IntegrateVerification {
  /** matched：两种数值方法一致；resolved：曾不一致，已由 Gauss 复核裁定；mismatch：三法不一致（谨慎使用） */
  status: 'matched' | 'resolved' | 'mismatch'
  /** 均匀多段复合 Simpson 结果（不可用时 null） */
  uniform: number | null
  /** 独立 Gauss–Legendre 结果（仅不一致时计算） */
  gauss: number | null
}

export interface IntegrateResult {
  value: number
  /** 误差估计（Richardson 项累计；触顶/预算耗尽时偏大） */
  error: number
  evaluations: number
  /** 因深度或预算限制提前终止 */
  truncated: boolean
  verification: IntegrateVerification
}

/** 8 点 Gauss–Legendre 节点（[−1,1]）与权重 */
const GAUSS8_NODES = [0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363]
const GAUSS8_WEIGHTS = [
  0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
]

/** 复合 8 点 Gauss–Legendre 积分（独立于 Simpson 的采样方式；节点为无理数位置） */
export function compositeGauss(
  f: (x: number) => number,
  a: number,
  b: number,
  panels = 64,
): { value: number; evaluations: number } {
  let total = 0
  let evaluations = 0
  const h = (b - a) / panels
  for (let p = 0; p < panels; p++) {
    const x0 = a + p * h
    const mid = x0 + h / 2
    const half = h / 2
    let sum = 0
    for (let i = 0; i < GAUSS8_NODES.length; i++) {
      const node = GAUSS8_NODES[i]!
      const weight = GAUSS8_WEIGHTS[i]!
      const left = f(mid - half * node)
      const right = f(mid + half * node)
      evaluations += 2
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        return { value: Number.NaN, evaluations }
      }
      sum += weight * (left + right)
    }
    total += half * sum
  }
  return { value: total, evaluations }
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
  const emptyVerification: IntegrateVerification = { status: 'matched', uniform: null, gauss: null }

  const evalF = (x: number): number => {
    evaluations++
    return f(x)
  }

  if (!(b > a)) {
    return {
      value: b === a ? 0 : Number.NaN,
      error: Number.NaN,
      evaluations,
      truncated: false,
      verification: emptyVerification,
    }
  }

  const fa = evalF(a)
  const fb = evalF(b)
  const fm = evalF((a + b) / 2)
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || !Number.isFinite(fm)) {
    return {
      value: Number.NaN,
      error: Number.POSITIVE_INFINITY,
      evaluations,
      truncated: false,
      verification: emptyVerification,
    }
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
  const recValue = recurse(a, b, fa, fm, fb, whole, 0, tolerance)
  if (nonFinite || Number.isNaN(recValue)) {
    return {
      value: Number.NaN,
      error: Number.POSITIVE_INFINITY,
      evaluations,
      truncated,
      verification: emptyVerification,
    }
  }

  // ---------- v2.9：均匀多段复核 ----------
  const levelValues = (N: number, prev: number[] | null): number[] | null => {
    const h = (b - a) / N
    const values = new Array<number>(N + 1)
    if (prev) {
      for (let i = 0; i <= N; i += 2) values[i] = prev[i / 2]!
      for (let i = 1; i < N; i += 2) {
        const value = evalF(a + i * h)
        if (!Number.isFinite(value)) return null
        values[i] = value
      }
    } else {
      for (let i = 0; i <= N; i++) {
        const value = evalF(a + i * h)
        if (!Number.isFinite(value)) return null
        values[i] = value
      }
    }
    return values
  }
  const compositeOf = (values: number[], N: number): number => {
    const h = (b - a) / N
    let sum = (values[0] ?? 0) + (values[N] ?? 0)
    for (let i = 1; i < N; i++) sum += (i % 2 === 1 ? 4 : 2) * (values[i] ?? 0)
    return (h / 3) * sum
  }

  let uniformValue: number | null = null
  let uniformDelta = 0
  let uniformOk = true
  {
    let N = 8
    let prevValues = levelValues(N, null)
    if (!prevValues) {
      uniformOk = false
    } else {
      let prevComposite = compositeOf(prevValues, N)
      let value = prevComposite
      while (uniformOk) {
        N *= 2
        if (N > 65536 || evaluations > maxEvaluations) {
          truncated = true
          break
        }
        const values = levelValues(N, prevValues)
        if (!values) {
          uniformOk = false
          break
        }
        value = compositeOf(values, N)
        uniformDelta = Math.abs(value - prevComposite) / 15
        prevValues = values
        prevComposite = value
        const uniformTol = Math.max(tolerance, 1e-12 * Math.max(1, Math.abs(value)))
        if (uniformDelta <= uniformTol) break
      }
      if (uniformOk) uniformValue = value
    }
  }

  // ---------- 一致性判定与独立复核 ----------
  let value = recValue
  let error = errorPeak
  let status: IntegrateVerification['status'] = 'matched'
  let gaussValue: number | null = null
  if (uniformValue !== null && uniformOk) {
    const diff = Math.abs(recValue - uniformValue)
    const matchTol = Math.max(
      30 * tolerance,
      1e-9 * Math.max(1, Math.abs(recValue), Math.abs(uniformValue)),
    )
    if (diff > matchTol) {
      // 两法不一致：启用独立 Gauss–Legendre 仲裁（节点为无理数位置，避免网格对齐假象）
      const gauss = compositeGauss((x) => evalF(x), a, b, 64)
      gaussValue = Number.isFinite(gauss.value) ? gauss.value : null
      const diffRec =
        gaussValue === null ? Number.POSITIVE_INFINITY : Math.abs(gaussValue - recValue)
      const diffUni =
        gaussValue === null ? Number.POSITIVE_INFINITY : Math.abs(gaussValue - uniformValue)
      if (gaussValue !== null && diffUni <= diffRec) {
        value = uniformValue
        error = Math.max(uniformDelta, diffUni)
        status = 'resolved'
      } else if (gaussValue !== null) {
        value = recValue
        error = Math.max(errorPeak, diffRec)
        status = 'resolved'
      } else {
        value = uniformValue
        error = Math.max(uniformDelta, diff)
        status = 'mismatch'
      }
    } else {
      value = recValue
      error = Math.max(errorPeak, uniformDelta, diff)
    }
  }
  if (truncated) error = Math.max(error, tolerance)

  return {
    value,
    error,
    evaluations,
    truncated,
    verification: { status, uniform: uniformValue, gauss: gaussValue },
  }
}
