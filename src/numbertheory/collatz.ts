/**
 * Collatz 序列（v0.9）：3n+1 轨迹、总停止时间与热图数据。
 */
import { sampleColormap, type ColormapName } from '../render3d/colormaps'

/** 完整轨迹 n → 1（含首尾） */
export function collatzSequence(n: number): number[] {
  const sequence: number[] = [n]
  let current = n
  let guard = 0
  while (current !== 1 && guard < 1_000_000) {
    current = current % 2 === 0 ? current / 2 : 3 * current + 1
    sequence.push(current)
    guard++
  }
  return sequence
}

/**
 * 总停止时间（到达 1 的步数）：27 → 111。
 * 传入 cache（Uint16Array）时启用记忆化，并回填路径上未计算的结点。
 */
export function collatzTotalStoppingTime(n: number, cache?: Uint16Array): number {
  if (n <= 1) return 0
  if (!cache) return collatzSequence(n).length - 1
  const limit = cache.length
  if (n < limit && cache[n]! > 0) return cache[n]!
  const trail: number[] = []
  let current = n
  let count = 0
  while (current !== 1) {
    if (current < limit && cache[current]! > 0) {
      count += cache[current]!
      break
    }
    trail.push(current)
    current = current % 2 === 0 ? current / 2 : 3 * current + 1
    count++
  }
  let back = count - (trail.length - 1)
  for (let i = trail.length - 1; i >= 0; i--) {
    const value = trail[i]!
    if (value < limit && cache[value] === 0) cache[value] = back
    back++
  }
  return count
}

/** 1..limit 的总停止时间数组（记忆化，limit ≤ 2^16 建议） */
export function collatzStoppingTimes(limit: number): Uint16Array {
  const n = Math.max(1, Math.floor(limit))
  const times = new Uint16Array(n + 1)
  times[1] = 0
  for (let k = 2; k <= n; k++) collatzTotalStoppingTime(k, times)
  return times
}

export interface CollatzPoint {
  n: number
  stoppingTime: number
}

/** 散点数据：1..limit 的 (n, 总停止时间) */
export function collatzScatter(limit: number): CollatzPoint[] {
  const times = collatzStoppingTimes(limit)
  const points: CollatzPoint[] = []
  for (let n = 1; n <= limit; n++) points.push({ n, stoppingTime: times[n]! })
  return points
}

/**
 * 渲染 Collatz 热图为 RGBA：横轴 n（1..limit），纵轴总停止时间（越高越亮），
 * 颜色取色图、按点密度叠加亮度。
 */
export function renderCollatzHeat(
  limit: number,
  width = 512,
  height = 384,
  colormap: ColormapName = 'plasma',
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 6
    data[i + 1] = 6
    data[i + 2] = 10
    data[i + 3] = 255
  }
  const times = collatzStoppingTimes(limit)
  let maxTime = 1
  for (let n = 2; n <= limit; n++) maxTime = Math.max(maxTime, times[n]!)
  for (let n = 1; n <= limit; n++) {
    const t = times[n]!
    const x = Math.min(width - 1, Math.floor(((n - 1) / limit) * width))
    const y = Math.min(height - 1, height - 1 - Math.floor((t / maxTime) * (height - 2)))
    const rgb = sampleColormap(colormap, t / maxTime)
    const offset = (y * width + x) * 4
    data[offset] = Math.max(data[offset]!, Math.min(255, Math.round(rgb[0] * 255) + 40))
    data[offset + 1] = Math.max(data[offset + 1]!, Math.min(255, Math.round(rgb[1] * 255) + 40))
    data[offset + 2] = Math.max(data[offset + 2]!, Math.min(255, Math.round(rgb[2] * 255) + 40))
  }
  return data
}
