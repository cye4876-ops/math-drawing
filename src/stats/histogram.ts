/**
 * 直方图（v0.7）：自动分箱（Freedman-Diaconis，退化时 Sturges）或手动分箱数。
 * 输出 edges/counts/density（density = count / (n·binWidth)，使面积归一）。
 */
import { quantileSorted } from './describe'

export interface HistogramResult {
  binWidth: number
  edges: number[]
  counts: number[]
  /** 密度（面积和 ≈ 1） */
  density: number[]
  n: number
}

/** 自动分箱数：FD 规则 2·IQR·n^(-1/3)；IQR 退化（外扩 ≤0）时用 Sturges: ceil(log2 n)+1 */
export function autoBinCount(values: number[]): number {
  const n = values.length
  if (n < 2) return 1
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantileSorted(sorted, 0.25)
  const q3 = quantileSorted(sorted, 0.75)
  const iqr = q3 - q1
  const range = sorted[n - 1]! - sorted[0]!
  if (!(range > 0)) return 1
  if (iqr > 0) {
    const width = (2 * iqr) / Math.cbrt(n)
    if (width > 0) {
      const bins = Math.ceil(range / width)
      return Math.min(200, Math.max(1, bins))
    }
  }
  return Math.min(200, Math.max(1, Math.ceil(Math.log2(n)) + 1))
}

/** 计算直方图；range 可选（默认取数据范围） */
export function histogram(
  values: number[],
  bins: number | 'auto' = 'auto',
  range?: { min: number; max: number },
): HistogramResult {
  const n = values.length
  if (n === 0) {
    return {
      binWidth: Number.NaN,
      edges: [Number.NaN, Number.NaN],
      counts: [0],
      density: [0],
      n: 0,
    }
  }
  let min = range?.min ?? Infinity
  let max = range?.max ?? -Infinity
  if (range === undefined) {
    for (const value of values) {
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  if (!(max > min)) {
    min -= 0.5
    max += 0.5
  }
  const binCount =
    bins === 'auto' ? autoBinCount(values) : Math.min(500, Math.max(1, Math.round(bins)))
  const binWidth = (max - min) / binCount
  const counts = new Array<number>(binCount).fill(0)
  for (const value of values) {
    if (value < min || value > max) continue
    const index = Math.min(binCount - 1, Math.floor((value - min) / binWidth))
    counts[index] = (counts[index] ?? 0) + 1
  }
  const edges = Array.from({ length: binCount + 1 }, (_, i) => min + i * binWidth)
  const density = counts.map((count) => count / (n * binWidth))
  return { binWidth, edges, counts, density, n }
}
