/**
 * 回归分析（v0.7）：
 * - 线性/多项式：**QR 分解（修正 Gram-Schmidt）**最小二乘——不使用正规方程（病态矩阵数值不稳）；
 * - 指数/对数/幂：对数线性化 + 有效点过滤（y>0 / x>0 等）；
 * - 自定义：表达式模型 f(x, a, b…) + **Levenberg-Marquardt**（数值雅可比 + 阻尼正规方程）。
 * 统一输出系数、R²、调整 R²、残差标准误、预测函数、方程 LaTeX 与残差序列。
 */
import { compile, parse } from '../expr'
import type { RegressionKind } from './model'

export interface RegressionResult {
  kind: RegressionKind
  /** 系数：线性 [b0, b1]；多项式升幂；指数 [a, b]（y=a·e^(bx)）；对数 [a, b]（y=a+b·ln x）；幂 [a, b]（y=a·x^b）；自定义 [p1…] */
  coefficients: number[]
  predict: (x: number) => number
  r2: number
  adjustedR2: number
  residualStandardError: number
  /** 拟合所用有效点数（变换类会过滤无效点） */
  n: number
  equationLatex: string
  /** 参与拟合点的残差（与有效输入同序） */
  residuals: number[]
  /** 无效点被过滤的数量（变换类/自定义错误的说明） */
  filtered?: number
}

export interface RegressionError {
  error: string
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '?'
  const abs = Math.abs(value)
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e5)) {
    const [mantissa, exponent] = value.toExponential(3).split('e')
    return `${mantissa}\\times 10^{${Number(exponent)}}`
  }
  return String(Number(value.toPrecision(5)))
}

/** 修正 Gram-Schmidt QR 求解最小二乘（A: n×p，b: n）→ 系数（p） */
function solveLeastSquaresQR(a: number[][], b: number[]): number[] | null {
  const n = a.length
  const p = a[0]?.length ?? 0
  if (n < p || p === 0) return null
  const q: number[][] = Array.from({ length: p }, () => new Array<number>(n).fill(0))
  const r: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0))
  for (let j = 0; j < p; j++) {
    const v = a.map((row) => row[j]!)
    for (let k = 0; k < j; k++) {
      let dot = 0
      for (let i = 0; i < n; i++) dot += q[k]![i]! * v[i]!
      r[k]![j] = dot
      for (let i = 0; i < n; i++) v[i] = v[i]! - dot * q[k]![i]!
    }
    let norm = 0
    for (let i = 0; i < n; i++) norm += v[i]! * v[i]!
    norm = Math.sqrt(norm)
    if (norm < 1e-14) return null // 列线性相关
    r[j]![j] = norm
    for (let i = 0; i < n; i++) q[j]![i] = v[i]! / norm
  }
  // Qᵀb
  const qtb = new Array<number>(p).fill(0)
  for (let k = 0; k < p; k++) {
    let dot = 0
    for (let i = 0; i < n; i++) dot += q[k]![i]! * b[i]!
    qtb[k] = dot
  }
  // 回代 Rβ = Qᵀb
  const beta = new Array<number>(p).fill(0)
  for (let k = p - 1; k >= 0; k--) {
    let acc = qtb[k]!
    for (let j = k + 1; j < p; j++) acc -= r[k]![j]! * beta[j]!
    beta[k] = acc / r[k]![k]!
  }
  return beta
}

function goodness(
  y: number[],
  predict: (x: number) => number,
  x: number[],
  parameterCount: number,
): { r2: number; adjustedR2: number; residualStandardError: number; residuals: number[] } {
  const n = y.length
  const residuals = x.map((xi, i) => y[i]! - predict(xi))
  let ssRes = 0
  let meanY = 0
  for (const value of y) meanY += value
  meanY /= n
  let ssTot = 0
  for (const value of y) {
    const d = value - meanY
    ssTot += d * d
  }
  for (const value of residuals) ssRes += value * value
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1
  const dof = n - parameterCount - 1
  const adjustedR2 = dof > 0 ? 1 - ((1 - r2) * (n - 1)) / dof : Number.NaN
  const residualStandardError = dof > 0 ? Math.sqrt(ssRes / dof) : Number.NaN
  return { r2, adjustedR2, residualStandardError, residuals }
}

/** 线性回归 y = b0 + b1·x（QR） */
export function linearRegression(x: number[], y: number[]): RegressionResult | RegressionError {
  const n = Math.min(x.length, y.length)
  if (n < 2) return { error: '至少需要 2 个有效数据点' }
  const xs = x.slice(0, n)
  const ys = y.slice(0, n)
  const a = xs.map((xi) => [1, xi])
  const beta = solveLeastSquaresQR(a, ys)
  if (!beta) return { error: '数据无法拟合（列线性相关或样本不足）' }
  const [b0, b1] = [beta[0]!, beta[1]!]
  const predict = (xi: number): number => b0 + b1 * xi
  const g = goodness(ys, predict, xs, 1)
  return {
    kind: 'linear',
    coefficients: [b0, b1],
    predict,
    equationLatex: `y = ${fmt(b0)} ${b1 >= 0 ? '+' : '-'} ${fmt(Math.abs(b1))}\\,x`,
    n,
    ...g,
  }
}

/** 多项式回归（升幂系数，degree ≥ 1） */
export function polynomialRegression(
  x: number[],
  y: number[],
  degree: number,
): RegressionResult | RegressionError {
  const d = Math.min(8, Math.max(1, Math.round(degree)))
  const n = Math.min(x.length, y.length)
  if (n < d + 1) return { error: `至少需要 ${d + 1} 个有效数据点` }
  const xs = x.slice(0, n)
  const ys = y.slice(0, n)
  const a = xs.map((xi) => Array.from({ length: d + 1 }, (_, k) => Math.pow(xi, k)))
  const beta = solveLeastSquaresQR(a, ys)
  if (!beta) return { error: '数据无法拟合（列线性相关或样本不足）' }
  const predict = (xi: number): number => {
    let acc = 0
    for (let k = beta.length - 1; k >= 0; k--) acc = acc * xi + beta[k]!
    return acc
  }
  const g = goodness(ys, predict, xs, d)
  const terms: string[] = []
  for (let k = beta.length - 1; k >= 0; k--) {
    const c = beta[k]!
    if (k > 0) {
      terms.push(`${fmt(c)}\\,x^{${k}}`)
    } else {
      terms.push(fmt(c))
    }
  }
  return {
    kind: 'polynomial',
    coefficients: [...beta],
    predict,
    equationLatex: `y = ${terms.join(' + ')}`,
    n,
    ...g,
  }
}

/** 指数/对数/幂回归（对数线性化） */
export function transformRegression(
  kind: 'exponential' | 'logarithmic' | 'power',
  x: number[],
  y: number[],
): RegressionResult | RegressionError {
  const n = Math.min(x.length, y.length)
  const tx: number[] = []
  const ty: number[] = []
  let filtered = 0
  for (let i = 0; i < n; i++) {
    const xi = x[i]!
    const yi = y[i]!
    let ux: number
    let uy: number
    if (kind === 'logarithmic') {
      if (!(xi > 0)) {
        filtered++
        continue
      }
      ux = Math.log(xi)
      uy = yi
    } else {
      if (!(yi > 0)) {
        filtered++
        continue
      }
      uy = Math.log(yi)
      if (kind === 'power') {
        if (!(xi > 0)) {
          filtered++
          continue
        }
        ux = Math.log(xi)
      } else {
        ux = xi
      }
    }
    tx.push(ux)
    ty.push(uy)
  }
  if (tx.length < 2) return { error: '有效点不足（变换类回归要求 y>0 / x>0）' }
  const lin = linearRegression(tx, ty)
  if ('error' in lin) return lin
  const [c0, c1] = [lin.coefficients[0]!, lin.coefficients[1]!]
  let predict: (xi: number) => number
  let equationLatex: string
  let coefficients: number[]
  if (kind === 'exponential') {
    const a = Math.exp(c0)
    predict = (xi) => a * Math.exp(c1 * xi)
    equationLatex = `y = ${fmt(a)}\\,e^{${fmt(c1)}\\,x}`
    coefficients = [a, c1]
  } else if (kind === 'logarithmic') {
    predict = (xi) => (xi > 0 ? c0 + c1 * Math.log(xi) : Number.NaN)
    equationLatex = `y = ${fmt(c0)} + ${fmt(c1)}\\,\\ln x`
    coefficients = [c0, c1]
  } else {
    const a = Math.exp(c0)
    predict = (xi) => (xi > 0 ? a * Math.pow(xi, c1) : Number.NaN)
    equationLatex = `y = ${fmt(a)}\\,x^{${fmt(c1)}}`
    coefficients = [a, c1]
  }
  // 用原始空间评估拟合优度（对数空间 R² 无直接解释意义）
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < n; i++) {
    const xi = x[i]!
    const yi = y[i]!
    const value = predict(xi)
    if (Number.isFinite(value) && Number.isFinite(yi)) {
      xs.push(xi)
      ys.push(yi)
    }
  }
  const g = goodness(ys, predict, xs, 1)
  return {
    kind,
    coefficients,
    predict,
    equationLatex,
    n: xs.length,
    filtered,
    ...g,
  }
}

/** 自定义模型回归（Levenberg-Marquardt；模型形如 a*exp(b*x)+c，参数为单字母 a..z 中非 x 者） */
export function customRegression(
  x: number[],
  y: number[],
  modelExpr: string,
): RegressionResult | RegressionError {
  const expr = modelExpr.trim()
  if (expr === '') return { error: '请填写模型表达式（如 a*exp(b*x)）' }
  // 参数名：表达式中出现的单字母变量（排除 x/y/e）
  const letters = new Set<string>()
  for (const ch of expr) {
    if (/[a-df-wz]/.test(ch)) letters.add(ch)
  }
  if (letters.size === 0) return { error: '未识别到参数（使用 a、b、c… 字母）' }
  if (letters.size > 4) return { error: '参数过多（最多 4 个）' }
  const paramNames = [...letters].sort()
  let model: ((scope: Record<string, number>) => number) | null = null
  try {
    model = compile(parse(expr))
  } catch (error) {
    return { error: `模型解析失败：${error instanceof Error ? error.message : String(error)}` }
  }
  const n = Math.min(x.length, y.length)
  if (n < paramNames.length + 1) return { error: '数据点不足以拟合参数' }
  const xs = x.slice(0, n)
  const ys = y.slice(0, n)

  const evalModel = (params: number[], xi: number): number => {
    const scope: Record<string, number> = { x: xi }
    paramNames.forEach((name, i) => (scope[name] = params[i]!))
    return model!(scope)
  }

  // 初值：全部 1，必要时向 0.1 递减以获取有限残差
  let params = new Array<number>(paramNames.length).fill(1)
  const residualSum = (p: number[]): number => {
    let acc = 0
    for (let i = 0; i < xs.length; i++) {
      const value = evalModel(p, xs[i]!)
      const r = Number.isFinite(value) ? ys[i]! - value : 1e6
      acc += r * r
    }
    return acc
  }
  if (!Number.isFinite(residualSum(params)) || residualSum(params) > 1e10) {
    for (const scale of [0.1, 0.01, 10, 100]) {
      const trial = new Array<number>(paramNames.length).fill(scale)
      if (residualSum(trial) < residualSum(params)) params = trial
    }
  }

  let damping = 1e-3
  let current = residualSum(params)
  for (let iteration = 0; iteration < 200; iteration++) {
    // 数值雅可比 J (n×p)
    const p = params.length
    const jacobian: number[][] = Array.from({ length: xs.length }, () =>
      new Array<number>(p).fill(0),
    )
    const residualVector = new Array<number>(xs.length).fill(0)
    for (let i = 0; i < xs.length; i++) {
      const value = evalModel(params, xs[i]!)
      residualVector[i] = Number.isFinite(value) ? ys[i]! - value : 1e6
      for (let k = 0; k < p; k++) {
        const step = Math.max(1e-6, Math.abs(params[k]!) * 1e-6)
        const forward = [...params]
        forward[k] = params[k]! + step
        const v1 = evalModel(forward, xs[i]!)
        const derivative = (Number.isFinite(v1) ? v1 : 1e6) - (Number.isFinite(value) ? value : 1e6)
        jacobian[i]![k] = derivative / step
      }
    }
    // JᵀJ + λ·diag
    const jtj: number[][] = Array.from({ length: p }, () => new Array<number>(p).fill(0))
    const jtr = new Array<number>(p).fill(0)
    for (let a = 0; a < p; a++) {
      for (let b = a; b < p; b++) {
        let acc = 0
        for (let i = 0; i < xs.length; i++) acc += jacobian[i]![a]! * jacobian[i]![b]!
        jtj[a]![b] = acc
        jtj[b]![a] = acc
      }
      let acc = 0
      for (let i = 0; i < xs.length; i++) acc += jacobian[i]![a]! * residualVector[i]!
      jtr[a] = acc
    }
    let improved = false
    for (let attempt = 0; attempt < 8 && !improved; attempt++) {
      const damped = jtj.map((row, i) =>
        row.map((value, j) => (i === j ? value * (1 + damping) + 1e-12 : value)),
      )
      const delta = solveGaussian(damped, jtr)
      if (!delta) {
        damping *= 10
        continue
      }
      const candidate = params.map((value, i) => value + delta[i]!)
      const candidateSum = residualSum(candidate)
      if (candidateSum < current) {
        params = candidate
        current = candidateSum
        damping = Math.max(1e-9, damping * 0.5)
        improved = true
      } else {
        damping *= 10
      }
    }
    if (!improved) break
  }

  const predict = (xi: number): number => {
    const value = evalModel(params, xi)
    return Number.isFinite(value) ? value : Number.NaN
  }
  let finiteCount = 0
  for (const xi of xs) if (Number.isFinite(predict(xi))) finiteCount++
  if (finiteCount < paramNames.length + 1) return { error: '拟合未收敛（模型或初值不合适）' }
  const g = goodness(ys, predict, xs, paramNames.length)
  const equationLatex = `y = ${expr}`
  return {
    kind: 'custom',
    coefficients: params,
    predict,
    equationLatex,
    n: xs.length,
    ...g,
  }
}

/** 高斯消元解线性方程组（LM 的阻尼正规方程） */
function solveGaussian(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]!])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row
    }
    if (Math.abs(m[pivot]![col]!) < 1e-14) return null
    ;[m[col], m[pivot]] = [m[pivot]!, m[col]!]
    const lead = m[col]![col]!
    for (let j = col; j <= n; j++) m[col]![j] = m[col]![j]! / lead
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row]![col]!
      if (factor === 0) continue
      for (let j = col; j <= n; j++) m[row]![j] = m[row]![j]! - factor * m[col]![j]!
    }
  }
  return m.map((row) => row[n]!)
}

/** 统一入口 */
export function fitRegression(
  kind: RegressionKind,
  x: number[],
  y: number[],
  options: { degree?: number; modelExpr?: string } = {},
): RegressionResult | RegressionError {
  switch (kind) {
    case 'linear':
      return linearRegression(x, y)
    case 'polynomial':
      return polynomialRegression(x, y, options.degree ?? 2)
    case 'exponential':
    case 'logarithmic':
    case 'power':
      return transformRegression(kind, x, y)
    default:
      return customRegression(x, y, options.modelExpr ?? '')
  }
}
