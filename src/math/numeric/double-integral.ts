/**
 * 二重积分（v2.1）：矩形区域 [x0,x1]×[y0,y1] 上的复合 Simpson 求积。
 *
 * - 默认每方向 128 段（129×129 = 16641 个采样）；平滑函数精度约 1e-8；
 * - 区域内出现非有限值（NaN/±∞）时跳过该采样并计数（invalidSamples > 0 时结果不可靠，UI 提示）；
 * - 面向教学演示的数值工具（与 v0.4 数值库同一哲学：可视化精度，非工业级）。
 */

export interface DoubleIntegralOptions {
  /** x 方向段数（偶数，默认 128） */
  nx?: number
  /** y 方向段数（偶数，默认 128） */
  ny?: number
}

export interface DoubleIntegralResult {
  value: number
  /** 实际采样点数 */
  samples: number
  /** 非有限取值的采样数（> 0 时结果不可靠） */
  invalidSamples: number
}

function evenCount(raw: number | undefined, fallback: number): number {
  const n = Math.round(raw ?? fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.max(2, Math.min(512, n + (n % 2)))
}

/** 复合 Simpson 权重：端点 1，奇数点 4，偶数点 2 */
function simpsonWeight(index: number, count: number): number {
  if (index === 0 || index === count) return 1
  return index % 2 === 1 ? 4 : 2
}

export function doubleIntegral(
  f: (x: number, y: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  options: DoubleIntegralOptions = {},
): DoubleIntegralResult {
  const nx = evenCount(options.nx, 128)
  const ny = evenCount(options.ny, 128)
  const hx = (x1 - x0) / nx
  const hy = (y1 - y0) / ny

  let invalidSamples = 0

  /** 对固定 x 沿 y 方向做复合 Simpson */
  const innerAt = (x: number): number => {
    let sum = 0
    for (let j = 0; j <= ny; j++) {
      const value = f(x, y0 + j * hy)
      if (!Number.isFinite(value)) {
        invalidSamples++
        continue
      }
      sum += simpsonWeight(j, ny) * value
    }
    return (sum * hy) / 3
  }

  let total = 0
  for (let i = 0; i <= nx; i++) {
    total += simpsonWeight(i, nx) * innerAt(x0 + i * hx)
  }
  const value = (total * hx) / 3

  return { value, samples: (nx + 1) * (ny + 1), invalidSamples }
}
