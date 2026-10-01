/**
 * 核密度估计（v0.7）：高斯 / Epanechnikov 核；Silverman 规则自动带宽。
 * 网格求值输出的密度函数积分 ≈ 1（单测验收 < 1e-6）。
 */
import { quantileSorted } from './describe'
import type { KdeKernel } from './model'

/** 标准核函数 */
export function kernelFn(kernel: KdeKernel): (u: number) => number {
  if (kernel === 'epanechnikov') {
    return (u) => (Math.abs(u) <= 1 ? 0.75 * (1 - u * u) : 0)
  }
  return (u) => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI)
}

/** Silverman 规则带宽：0.9·min(σ, IQR/1.34)·n^(-1/5) */
export function silvermanBandwidth(values: number[]): number {
  const n = values.length
  if (n < 2) return 1
  let mean = 0
  for (const value of values) mean += value
  mean /= n
  let variance = 0
  for (const value of values) {
    const d = value - mean
    variance += d * d
  }
  variance /= n - 1
  const sigma = Math.sqrt(variance)
  const sorted = [...values].sort((a, b) => a - b)
  const iqr = quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25)
  const scale = Math.min(sigma > 0 ? sigma : Infinity, iqr > 0 ? iqr / 1.34 : Infinity)
  if (!Number.isFinite(scale)) return 1
  return Math.max(1e-9, 0.9 * scale * Math.pow(n, -0.2))
}

/** O(n²) 直接 KDE（大数据由调用方抽稀；> 2 万样本自动随机抽稀到 2 万） */
export function kdeEvaluate(
  values: number[],
  grid: number[],
  kernel: KdeKernel = 'gaussian',
  bandwidth?: number,
): number[] {
  if (values.length === 0) return grid.map(() => 0)
  let sample = values
  if (sample.length > 20_000) {
    // 均匀抽稀（保持分布形态）
    const step = sample.length / 20_000
    const thinned: number[] = []
    for (let i = 0; i < sample.length; i += step) thinned.push(sample[Math.floor(i)]!)
    sample = thinned
  }
  const h = bandwidth ?? silvermanBandwidth(values)
  const k = kernelFn(kernel)
  return grid.map((x) => {
    let acc = 0
    for (const value of sample) acc += k((x - value) / h)
    return acc / (sample.length * h)
  })
}

/** 在数据范围内生成均匀网格（按带宽外扩：max(5% 范围, 3×Silverman 带宽)，保证核尾部完整） */
export function kdeGrid(values: number[], points = 200): number[] {
  if (values.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!(max > min)) {
    min -= 0.5
    max += 0.5
  }
  const bandwidth = silvermanBandwidth(values)
  const pad = Math.max((max - min) * 0.05, bandwidth * 3)
  const lo = min - pad
  const hi = max + pad
  return Array.from({ length: points }, (_, i) => lo + ((hi - lo) * i) / (points - 1))
}
