/**
 * 特殊函数与概率分布（v0.7）。
 *
 * 数值实现（Numerical Recipes 风格，double 精度）：
 * - lnGamma（Lanczos g=7，误差 ~1e-15，含反射公式）；
 * - 正则化不完全伽马 P(a,x)/Q(a,x)（级数 + 连分数）；
 * - 正则化不完全贝塔 I_x(a,b)（连分数 betacf）；
 * - 高精度 erf/erfc：erf(x)=sign(x)·P(1/2, x²)——精度 ~1e-15（高于 v0.2 的 A&S 近似，统计验收要求 1e-6 以上）。
 *
 * 分布注册表覆盖 10 种分布：normal / student-t / chi2 / f / binomial / poisson / uniform / exponential / beta / gamma。
 * 分位数：正态用 Acklam 有理逼近（~1e-9），其余用 CDF 单调二分（100 次迭代）。
 */
import type { DistributionId } from './model'

// ---------- 特殊函数 ----------

const LANCZOS_G = 7
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/** ln|Γ(x)|（x > 0 精确；x < 0 用反射公式） */
export function lnGamma(x: number): number {
  if (x <= 0 && Number.isInteger(x)) return Number.POSITIVE_INFINITY
  if (x < 0.5) {
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x)
  }
  const z = x - 1
  let acc = LANCZOS_C[0]!
  for (let i = 1; i < LANCZOS_C.length; i++) acc += LANCZOS_C[i]! / (z + i)
  const t = z + LANCZOS_G + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(acc)
}

/** Γ(x)（x > 0） */
export function gammaFn(x: number): number {
  return Math.exp(lnGamma(x))
}

/** 级数展开：P(a,x)（x < a+1 时适用） */
function gammaPSeries(a: number, x: number): number {
  const gln = lnGamma(a)
  let ap = a
  let sum = 1 / a
  let del = sum
  for (let n = 0; n < 500; n++) {
    ap += 1
    del *= x / ap
    sum += del
    if (Math.abs(del) < Math.abs(sum) * 1e-16) break
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln)
}

/** 连分数：Q(a,x)（x ≥ a+1 时适用） */
function gammaQContinued(a: number, x: number): number {
  const gln = lnGamma(a)
  const FPMIN = 1e-300
  let b = x + 1 - a
  let c = 1 / FPMIN
  let d = 1 / b
  let h = d
  for (let i = 1; i <= 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = b + an / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h
}

/** 正则化下不完全伽马 P(a,x) */
export function gammaP(a: number, x: number): number {
  if (!(a > 0) || x < 0) return Number.NaN
  if (x === 0) return 0
  return x < a + 1 ? gammaPSeries(a, x) : 1 - gammaQContinued(a, x)
}

/** 正则化上不完全伽马 Q(a,x) */
export function gammaQ(a: number, x: number): number {
  if (!(a > 0) || x < 0) return Number.NaN
  if (x === 0) return 1
  return x < a + 1 ? 1 - gammaPSeries(a, x) : gammaQContinued(a, x)
}

/** 不完全贝塔连分数 */
function betaContinued(a: number, b: number, x: number): number {
  const FPMIN = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return h
}

/** 正则化不完全贝塔 I_x(a,b)（x ∈ [0,1]） */
export function betaI(a: number, b: number, x: number): number {
  if (x < 0 || x > 1) return Number.NaN
  if (x === 0) return 0
  if (x === 1) return 1
  const front = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  )
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinued(a, b, x)) / a
    : 1 - (front * betaContinued(b, a, 1 - x)) / b
}

/** 高精度 erf（基于正则化不完全伽马：erf(x) = sign(x)·P(1/2, x²)） */
export function erfHigh(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN
  if (x === 0) return 0
  const value = gammaP(0.5, x * x)
  return x > 0 ? value : -value
}

/** 高精度 erfc */
export function erfcHigh(x: number): number {
  if (!Number.isFinite(x)) return Number.NaN
  return x >= 0 ? 1 - gammaP(0.5, x * x) : 1 + gammaP(0.5, x * x)
}

// ---------- 分布 ----------

export interface DistributionParam {
  key: string
  label: string
  default: number
  min: number
  max: number
  step: number
  integer?: boolean
}

export interface DistributionDef {
  id: DistributionId
  name: string
  discrete: boolean
  params: DistributionParam[]
  pdf: (x: number, params: Record<string, number>) => number
  cdf: (x: number, params: Record<string, number>) => number
  quantile: (p: number, params: Record<string, number>) => number
  mean: (params: Record<string, number>) => number
  variance: (params: Record<string, number>) => number
}

/** 参数取值（带默认值与合法性约束） */
function param(
  params: Record<string, number>,
  key: string,
  fallback: number,
  min = -Infinity,
  max = Infinity,
): number {
  const value = params[key]
  const v = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, v))
}

/** 通用分位数：CDF 单调二分（100 次迭代 → ~1e-15 相对精度） */
function quantileByBisect(
  cdf: (x: number) => number,
  lower: number,
  upper: number,
  p: number,
): number {
  if (p <= 0) return lower
  if (p >= 1) return upper
  let lo = lower
  let hi = upper
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    if (!Number.isFinite(mid)) break
    if (cdf(mid) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** Acklam 标准正态分位逼近（相对误差 < 1.15e-9） */
function normalQuantileStandard(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pLow = 0.02425
  const pHigh = 1 - pLow
  let q: number
  let r: number
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    )
  }
  if (p <= pHigh) {
    q = p - 0.5
    r = q * q
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    )
  }
  q = Math.sqrt(-2 * Math.log(1 - p))
  return (
    -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  )
}

/** 简单积分（离散分布 CDF 用） */
function sumPmf(pmf: (k: number) => number, from: number, to: number): number {
  let acc = 0
  for (let k = from; k <= to; k++) acc += pmf(k)
  return acc
}

const normal: DistributionDef = {
  id: 'normal',
  name: '正态 N(μ, σ²)',
  discrete: false,
  params: [
    { key: 'mu', label: 'μ', default: 0, min: -20, max: 20, step: 0.1 },
    { key: 'sigma', label: 'σ', default: 1, min: 0.05, max: 10, step: 0.05 },
  ],
  pdf: (x, params) => {
    const mu = param(params, 'mu', 0)
    const sigma = param(params, 'sigma', 1, 1e-3)
    const z = (x - mu) / sigma
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI))
  },
  cdf: (x, params) => {
    const mu = param(params, 'mu', 0)
    const sigma = param(params, 'sigma', 1, 1e-3)
    return 0.5 * erfcHigh(-(x - mu) / (sigma * Math.SQRT2))
  },
  quantile: (p, params) => {
    const mu = param(params, 'mu', 0)
    const sigma = param(params, 'sigma', 1, 1e-3)
    return mu + sigma * normalQuantileStandard(p)
  },
  mean: (params) => param(params, 'mu', 0),
  variance: (params) => {
    const sigma = param(params, 'sigma', 1, 1e-3)
    return sigma * sigma
  },
}

const studentT: DistributionDef = {
  id: 'student-t',
  name: 't 分布 t(ν)',
  discrete: false,
  params: [{ key: 'nu', label: 'ν', default: 5, min: 1, max: 100, step: 1, integer: true }],
  pdf: (x, params) => {
    const nu = param(params, 'nu', 5, 1)
    const l = lnGamma((nu + 1) / 2) - lnGamma(nu / 2) - 0.5 * Math.log(nu * Math.PI)
    return Math.exp(l - ((nu + 1) / 2) * Math.log(1 + (x * x) / nu))
  },
  cdf: (x, params) => {
    const nu = param(params, 'nu', 5, 1)
    const z = x
    const p = 0.5 * betaI(nu / 2, 0.5, nu / (nu + z * z))
    return z >= 0 ? 1 - p : p
  },
  quantile: (p, params) => {
    const nu = param(params, 'nu', 5, 1)
    const def = studentT
    return quantileByBisect((x) => def.cdf(x, { nu }), -1e6, 1e6, p)
  },
  mean: (params) => (param(params, 'nu', 5, 1) > 1 ? 0 : Number.NaN),
  variance: (params) => {
    const nu = param(params, 'nu', 5, 1)
    if (nu <= 1) return Number.NaN
    if (nu <= 2) return Number.POSITIVE_INFINITY
    return nu / (nu - 2)
  },
}

const chi2: DistributionDef = {
  id: 'chi2',
  name: '卡方 χ²(k)',
  discrete: false,
  params: [{ key: 'k', label: 'k', default: 4, min: 1, max: 100, step: 1, integer: true }],
  pdf: (x, params) => {
    const k = param(params, 'k', 4, 1)
    if (x <= 0) return 0
    const l = (k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - lnGamma(k / 2)
    return Math.exp(l)
  },
  cdf: (x, params) => {
    const k = param(params, 'k', 4, 1)
    return x <= 0 ? 0 : gammaP(k / 2, x / 2)
  },
  quantile: (p, params) => {
    const k = param(params, 'k', 4, 1)
    return quantileByBisect((x) => chi2.cdf(x, { k }), 0, Math.max(2000, k * 20), p)
  },
  mean: (params) => param(params, 'k', 4, 1),
  variance: (params) => 2 * param(params, 'k', 4, 1),
}

const fDist: DistributionDef = {
  id: 'f',
  name: 'F 分布 F(d₁, d₂)',
  discrete: false,
  params: [
    { key: 'd1', label: 'd₁', default: 5, min: 1, max: 100, step: 1, integer: true },
    { key: 'd2', label: 'd₂', default: 10, min: 1, max: 100, step: 1, integer: true },
  ],
  pdf: (x, params) => {
    const d1 = param(params, 'd1', 5, 1)
    const d2 = param(params, 'd2', 10, 1)
    if (x <= 0) return 0
    const l =
      (d1 / 2) * Math.log(d1) +
      (d2 / 2) * Math.log(d2) +
      (d1 / 2 - 1) * Math.log(x) -
      ((d1 + d2) / 2) * Math.log(d2 + d1 * x) -
      (lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2))
    return Math.exp(l)
  },
  cdf: (x, params) => {
    const d1 = param(params, 'd1', 5, 1)
    const d2 = param(params, 'd2', 10, 1)
    if (x <= 0) return 0
    return betaI(d1 / 2, d2 / 2, (d1 * x) / (d1 * x + d2))
  },
  quantile: (p, params) => {
    const d1 = param(params, 'd1', 5, 1)
    const d2 = param(params, 'd2', 10, 1)
    return quantileByBisect((x) => fDist.cdf(x, { d1, d2 }), 0, 1e5, p)
  },
  mean: (params) => {
    const d2 = param(params, 'd2', 10, 1)
    return d2 > 2 ? d2 / (d2 - 2) : Number.NaN
  },
  variance: (params) => {
    const d1 = param(params, 'd1', 5, 1)
    const d2 = param(params, 'd2', 10, 1)
    if (d2 <= 4) return Number.NaN
    return (2 * d2 * d2 * (d1 + d2 - 2)) / (d1 * (d2 - 2) * (d2 - 2) * (d2 - 4))
  },
}

const binomial: DistributionDef = {
  id: 'binomial',
  name: '二项 B(n, p)',
  discrete: true,
  params: [
    { key: 'n', label: 'n', default: 10, min: 1, max: 200, step: 1, integer: true },
    { key: 'p', label: 'p', default: 0.5, min: 0, max: 1, step: 0.01 },
  ],
  pdf: (k, params) => {
    const n = Math.round(param(params, 'n', 10, 1, 5000))
    const p = param(params, 'p', 0.5, 0, 1)
    const rk = Math.round(k)
    if (rk < 0 || rk > n) return 0
    if (n <= 200 && Number.isInteger(rk)) {
      // 小 n：直接组合数（精确）
      let c = 1
      for (let i = 1; i <= rk; i++) c = (c * (n - rk + i)) / i
      return c * Math.pow(p, rk) * Math.pow(1 - p, n - rk)
    }
    const l = lnGamma(n + 1) - lnGamma(rk + 1) - lnGamma(n - rk + 1)
    return Math.exp(
      l + (rk === 0 ? 0 : rk * Math.log(p)) + (n - rk === 0 ? 0 : (n - rk) * Math.log(1 - p)),
    )
  },
  cdf: (x, params) => {
    const n = Math.round(param(params, 'n', 10, 1, 5000))
    const p = param(params, 'p', 0.5, 0, 1)
    const kmax = Math.min(n, Math.floor(x))
    if (kmax < 0) return 0
    if (kmax >= n) return 1
    let acc = 0
    for (let k = 0; k <= kmax; k++) acc += binomial.pdf(k, { n, p })
    return Math.min(1, acc)
  },
  quantile: (p, params) => {
    const n = Math.round(param(params, 'n', 10, 1, 5000))
    let acc = 0
    for (let k = 0; k <= n; k++) {
      acc += binomial.pdf(k, params)
      if (acc >= p) return k
    }
    return n
  },
  mean: (params) => param(params, 'n', 10, 1) * param(params, 'p', 0.5, 0, 1),
  variance: (params) => {
    const n = param(params, 'n', 10, 1)
    const p = param(params, 'p', 0.5, 0, 1)
    return n * p * (1 - p)
  },
}

const poisson: DistributionDef = {
  id: 'poisson',
  name: '泊松 P(λ)',
  discrete: true,
  params: [{ key: 'lambda', label: 'λ', default: 3, min: 0.1, max: 30, step: 0.1 }],
  pdf: (k, params) => {
    const lambda = param(params, 'lambda', 3, 1e-6)
    const rk = Math.round(k)
    if (rk < 0) return 0
    return Math.exp(-lambda + rk * Math.log(lambda) - lnGamma(rk + 1))
  },
  cdf: (x, params) => {
    const lambda = param(params, 'lambda', 3, 1e-6)
    const kmax = Math.floor(x)
    if (kmax < 0) return 0
    return Math.min(
      1,
      sumPmf((k) => poisson.pdf(k, { lambda }), 0, kmax),
    )
  },
  quantile: (p, params) => {
    const lambda = param(params, 'lambda', 3, 1e-6)
    const limit = Math.ceil(lambda + 12 * Math.sqrt(lambda) + 20)
    let acc = 0
    for (let k = 0; k <= limit; k++) {
      acc += poisson.pdf(k, { lambda })
      if (acc >= p) return k
    }
    return limit
  },
  mean: (params) => param(params, 'lambda', 3, 1e-6),
  variance: (params) => param(params, 'lambda', 3, 1e-6),
}

const uniform: DistributionDef = {
  id: 'uniform',
  name: '均匀 U(a, b)',
  discrete: false,
  params: [
    { key: 'a', label: 'a', default: 0, min: -10, max: 10, step: 0.1 },
    { key: 'b', label: 'b', default: 1, min: -10, max: 10, step: 0.1 },
  ],
  pdf: (x, params) => {
    const a = param(params, 'a', 0)
    const b = param(params, 'b', 1)
    if (!(b > a)) return Number.NaN
    return x >= a && x <= b ? 1 / (b - a) : 0
  },
  cdf: (x, params) => {
    const a = param(params, 'a', 0)
    const b = param(params, 'b', 1)
    if (x <= a) return 0
    if (x >= b) return 1
    return (x - a) / (b - a)
  },
  quantile: (p, params) => {
    const a = param(params, 'a', 0)
    const b = param(params, 'b', 1)
    return a + p * (b - a)
  },
  mean: (params) => (param(params, 'a', 0) + param(params, 'b', 1)) / 2,
  variance: (params) => {
    const a = param(params, 'a', 0)
    const b = param(params, 'b', 1)
    return ((b - a) * (b - a)) / 12
  },
}

const exponential: DistributionDef = {
  id: 'exponential',
  name: '指数 Exp(λ)',
  discrete: false,
  params: [{ key: 'lambda', label: 'λ', default: 1, min: 0.1, max: 10, step: 0.05 }],
  pdf: (x, params) => {
    const lambda = param(params, 'lambda', 1, 1e-6)
    return x >= 0 ? lambda * Math.exp(-lambda * x) : 0
  },
  cdf: (x, params) => {
    const lambda = param(params, 'lambda', 1, 1e-6)
    return x >= 0 ? 1 - Math.exp(-lambda * x) : 0
  },
  quantile: (p, params) => {
    const lambda = param(params, 'lambda', 1, 1e-6)
    return -Math.log(1 - p) / lambda
  },
  mean: (params) => 1 / param(params, 'lambda', 1, 1e-6),
  variance: (params) => 1 / Math.pow(param(params, 'lambda', 1, 1e-6), 2),
}

const betaDist: DistributionDef = {
  id: 'beta',
  name: 'Beta B(α, β)',
  discrete: false,
  params: [
    { key: 'alpha', label: 'α', default: 2, min: 0.1, max: 30, step: 0.1 },
    { key: 'beta', label: 'β', default: 5, min: 0.1, max: 30, step: 0.1 },
  ],
  pdf: (x, params) => {
    const a = param(params, 'alpha', 2, 1e-6)
    const b = param(params, 'beta', 5, 1e-6)
    if (x <= 0 || x >= 1) return 0
    const l =
      (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (lnGamma(a) + lnGamma(b) - lnGamma(a + b))
    return Math.exp(l)
  },
  cdf: (x, params) => {
    const a = param(params, 'alpha', 2, 1e-6)
    const b = param(params, 'beta', 5, 1e-6)
    if (x <= 0) return 0
    if (x >= 1) return 1
    return betaI(a, b, x)
  },
  quantile: (p, params) => {
    const a = param(params, 'alpha', 2, 1e-6)
    const b = param(params, 'beta', 5, 1e-6)
    return quantileByBisect((x) => betaDist.cdf(x, { alpha: a, beta: b }), 0, 1, p)
  },
  mean: (params) => {
    const a = param(params, 'alpha', 2, 1e-6)
    const b = param(params, 'beta', 5, 1e-6)
    return a / (a + b)
  },
  variance: (params) => {
    const a = param(params, 'alpha', 2, 1e-6)
    const b = param(params, 'beta', 5, 1e-6)
    return (a * b) / ((a + b) * (a + b) * (a + b + 1))
  },
}

const gammaDist: DistributionDef = {
  id: 'gamma',
  name: 'Gamma Γ(k, θ)',
  discrete: false,
  params: [
    { key: 'k', label: 'k', default: 2, min: 0.1, max: 30, step: 0.1 },
    { key: 'theta', label: 'θ', default: 1, min: 0.1, max: 20, step: 0.1 },
  ],
  pdf: (x, params) => {
    const k = param(params, 'k', 2, 1e-6)
    const theta = param(params, 'theta', 1, 1e-6)
    if (x <= 0) return 0
    const l = (k - 1) * Math.log(x) - x / theta - k * Math.log(theta) - lnGamma(k)
    return Math.exp(l)
  },
  cdf: (x, params) => {
    const k = param(params, 'k', 2, 1e-6)
    const theta = param(params, 'theta', 1, 1e-6)
    return x <= 0 ? 0 : gammaP(k, x / theta)
  },
  quantile: (p, params) => {
    const k = param(params, 'k', 2, 1e-6)
    const theta = param(params, 'theta', 1, 1e-6)
    return quantileByBisect(
      (x) => gammaDist.cdf(x, { k, theta }),
      0,
      Math.max(100, (k + 20 * Math.sqrt(k)) * theta * 2),
      p,
    )
  },
  mean: (params) => param(params, 'k', 2, 1e-6) * param(params, 'theta', 1, 1e-6),
  variance: (params) => {
    const k = param(params, 'k', 2, 1e-6)
    const theta = param(params, 'theta', 1, 1e-6)
    return k * theta * theta
  },
}

export const DISTRIBUTIONS: DistributionDef[] = [
  normal,
  studentT,
  chi2,
  fDist,
  binomial,
  poisson,
  uniform,
  exponential,
  betaDist,
  gammaDist,
]

export function getDistribution(id: DistributionId): DistributionDef {
  return DISTRIBUTIONS.find((def) => def.id === id) ?? normal
}

/** 分布绘图默认 x 范围（连续：分位 [0.001, 0.999] 外扩 5%；离散：0..高分位） */
export function distributionDomain(
  def: DistributionDef,
  params: Record<string, number>,
): { min: number; max: number } {
  if (def.discrete) {
    const max = Math.max(5, Math.ceil(def.quantile(0.999, params)) + 1)
    return { min: 0, max }
  }
  const lo = def.quantile(0.001, params)
  const hi = def.quantile(0.999, params)
  const pad = (hi - lo) * 0.05
  return { min: lo - pad, max: hi + pad }
}
