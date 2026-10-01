/**
 * 描述统计（v0.7）：均值/中位数/众数/方差/标准差/分位数/偏度/峰度/相关系数/箱线数据。
 * 偏度与峰度采用常用样本定义（偏度 g1 与超额峰度 g2），小样本时给出但标注不适用。
 */

export interface DescribeResult {
  count: number
  mean: number
  median: number
  /** 众数（出现次数最多的值；多众数取最小者；无重复时取 null） */
  mode: number | null
  variance: number
  std: number
  min: number
  max: number
  q1: number
  q3: number
  iqr: number
  /** 样本偏度（三阶标准化矩，Fisher-Pearson 无偏修正） */
  skewness: number
  /** 超额峰度（正态为 0） */
  kurtosis: number
}

/** 分位数（线性插值法，与主流统计软件一致） */
export function quantileSorted(sorted: number[], p: number): number {
  const n = sorted.length
  if (n === 0) return Number.NaN
  if (n === 1) return sorted[0]!
  const position = (n - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const weight = position - lower
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight
}

export function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN
  let sum = 0
  for (const value of values) sum += value
  return sum / values.length
}

export function variance(values: number[], sample = true): number {
  const n = values.length
  if (n < 2) return Number.NaN
  const m = mean(values)
  let acc = 0
  for (const value of values) {
    const diff = value - m
    acc += diff * diff
  }
  return acc / (sample ? n - 1 : n)
}

export function describe(values: number[]): DescribeResult {
  const n = values.length
  if (n === 0) {
    return {
      count: 0,
      mean: Number.NaN,
      median: Number.NaN,
      mode: null,
      variance: Number.NaN,
      std: Number.NaN,
      min: Number.NaN,
      max: Number.NaN,
      q1: Number.NaN,
      q3: Number.NaN,
      iqr: Number.NaN,
      skewness: Number.NaN,
      kurtosis: Number.NaN,
    }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const m = mean(values)
  const v = variance(values)
  const sd = Math.sqrt(v)
  // 众数：计数
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let mode: number | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && (mode === null || value < mode))) {
      bestCount = count
      mode = value
    }
  }
  if (bestCount <= 1) mode = null

  // 偏度/峰度（样本矩）
  let m2 = 0
  let m3 = 0
  let m4 = 0
  for (const value of values) {
    const d = value - m
    m2 += d * d
    m3 += d * d * d
    m4 += d * d * d * d
  }
  m2 /= n
  m3 /= n
  m4 /= n
  const skewness =
    m2 > 0 ? (m3 / Math.pow(m2, 1.5)) * (n > 2 ? Math.sqrt(n * (n - 1)) / (n - 2) : 1) : Number.NaN
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : Number.NaN

  return {
    count: n,
    mean: m,
    median: quantileSorted(sorted, 0.5),
    mode,
    variance: v,
    std: sd,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    q1: quantileSorted(sorted, 0.25),
    q3: quantileSorted(sorted, 0.75),
    iqr: quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25),
    skewness,
    kurtosis,
  }
}

export interface BoxPlotData {
  min: number
  q1: number
  median: number
  q3: number
  max: number
  /** 1.5×IQR 之外的离群点 */
  outliers: number[]
}

/** 箱线图数据（Tukey：须为 1.5×IQR 内的最远数据点） */
export function boxPlot(values: number[]): BoxPlotData {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) {
    return {
      min: Number.NaN,
      q1: Number.NaN,
      median: Number.NaN,
      q3: Number.NaN,
      max: Number.NaN,
      outliers: [],
    }
  }
  const q1 = quantileSorted(sorted, 0.25)
  const q3 = quantileSorted(sorted, 0.75)
  const iqr = q3 - q1
  const lowerFence = q1 - 1.5 * iqr
  const upperFence = q3 + 1.5 * iqr
  const inside = sorted.filter((value) => value >= lowerFence && value <= upperFence)
  const outliers = sorted.filter((value) => value < lowerFence || value > upperFence)
  return {
    min: inside[0] ?? sorted[0]!,
    q1,
    median: quantileSorted(sorted, 0.5),
    q3,
    max: inside[inside.length - 1] ?? sorted[n - 1]!,
    outliers,
  }
}

/** Pearson 相关系数 */
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 2) return Number.NaN
  const mx = mean(x.slice(0, n))
  const my = mean(y.slice(0, n))
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx
    const dy = y[i]! - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  const denom = Math.sqrt(sxx * syy)
  return denom > 0 ? sxy / denom : Number.NaN
}

/** 秩（平均秩处理并列值） */
function ranks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index }))
  order.sort((a, b) => a.value - b.value)
  const out = new Array<number>(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1]!.value === order[i]!.value) j++
    const average = (i + j) / 2 + 1 // 1-based 平均秩
    for (let k = i; k <= j; k++) out[order[k]!.index] = average
    i = j + 1
  }
  return out
}

/** Spearman 秩相关 */
export function spearman(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 2) return Number.NaN
  return pearson(ranks(x.slice(0, n)), ranks(y.slice(0, n)))
}
