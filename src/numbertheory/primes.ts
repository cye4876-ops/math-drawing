/**
 * 数论基础（v0.9）：埃氏筛、质数计数 π(x)、间隙分布、约数个数（Sacks 螺旋用）。
 */

/** 筛法：返回 0..limit 的标记数组（1 = 质数） */
export function sievePrimes(limit: number): Uint8Array {
  const n = Math.max(1, Math.floor(limit))
  const marks = new Uint8Array(n + 1)
  if (n >= 2) marks.fill(1, 2)
  for (let p = 2; p * p <= n; p++) {
    if (marks[p] === 1) {
      for (let m = p * p; m <= n; m += p) marks[m] = 0
    }
  }
  return marks
}

/** 不超过 limit 的全部质数 */
export function primesUpTo(limit: number): number[] {
  const marks = sievePrimes(limit)
  const primes: number[] = []
  for (let i = 2; i < marks.length; i++) if (marks[i] === 1) primes.push(i)
  return primes
}

/** π(x) 前缀计数数组（下标 0..limit，值 = 不超过该下标的质数个数） */
export function primeCounting(limit: number): Int32Array {
  const marks = sievePrimes(limit)
  const counts = new Int32Array(marks.length)
  let running = 0
  for (let i = 0; i < marks.length; i++) {
    running += marks[i] === 1 ? 1 : 0
    counts[i] = running
  }
  return counts
}

/** 单点质数判定（试除，适合小数字；大范围请用筛） */
export function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false
  if (n < 4) return true
  if (n % 2 === 0) return false
  for (let d = 3; d * d <= n; d += 2) {
    if (n % d === 0) return false
  }
  return true
}

/** 相邻质数间隙（p_{k+1} − p_k） */
export function primeGaps(limit: number): number[] {
  const primes = primesUpTo(limit)
  const gaps: number[] = []
  for (let i = 1; i < primes.length; i++) gaps.push(primes[i]! - primes[i - 1]!)
  return gaps
}

/** 约数个数 σ₀(n)（Sacks 螺旋按此着色） */
export function divisorCount(n: number): number {
  if (n < 1 || !Number.isInteger(n)) return 0
  let count = 0
  const root = Math.floor(Math.sqrt(n))
  for (let d = 1; d <= root; d++) {
    if (n % d === 0) count += d * d === n ? 1 : 2
  }
  return count
}

export interface PrimeCurvePoint {
  x: number
  y: number
}

export interface PrimeCurve {
  /** π(x) 折线（像素坐标；已含边距映射） */
  pi: PrimeCurvePoint[]
  /** x / ln x 近似曲线 */
  xlog: PrimeCurvePoint[]
  /** 纵轴最大值（绘图标注用） */
  maxValue: number
}

/**
 * π(x) 对比曲线数据（像素坐标）：π(x) 实测阶梯近似 vs x/ln x 近似。
 * 边距：左侧 34px（纵轴标签）、上下 12px；横轴 0..limit，纵轴 0..maxValue。
 */
export function primeCurvePoints(
  limit: number,
  width: number,
  height: number,
  samples = 512,
): PrimeCurve {
  const counts = primeCounting(limit)
  const count = Math.max(8, Math.min(4096, samples))
  const marginLeft = 34
  const marginY = 12
  const maxValue = Math.max(counts[limit] ?? 0, limit / Math.log(Math.max(limit, Math.E)))
  const toX = (value: number): number => marginLeft + (value / limit) * (width - marginLeft)
  const toY = (value: number): number =>
    height - marginY - (value / maxValue) * (height - 2 * marginY)
  const pi: PrimeCurvePoint[] = []
  const xlog: PrimeCurvePoint[] = []
  for (let k = 0; k <= count; k++) {
    const x = (k / count) * limit
    const index = Math.min(limit, Math.round(x))
    pi.push({ x: toX(x), y: toY(counts[index] ?? 0) })
    if (x >= 3) xlog.push({ x: toX(x), y: toY(x / Math.log(x)) })
  }
  return { pi, xlog, maxValue }
}
