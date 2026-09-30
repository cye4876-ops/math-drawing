/**
 * 刻度（ticker）算法：为坐标轴与网格选择"好看"的步长并生成刻度值与标签。
 * 参考 Matplotlib ticker 的 1-2-5 系列做法（见 docs/TECH-STACK.md 参考实现清单）。
 */

/** 步长尾数候选：1、2、5 × 10^k */
const TICK_MANTISSAS = [1, 2, 5] as const

/** 单次生成刻度的数量上限（防御异常参数导致死循环） */
const MAX_TICKS = 10_000

/**
 * 选择"好看"的刻度步长：
 * 在 {1,2,5}×10^k 中取满足「屏幕上相邻刻度间距 ≥ minPixelSpacing」的最小步长。
 */
export function niceStep(scale: number, minPixelSpacing = 64): number {
  const target = minPixelSpacing / scale
  if (!Number.isFinite(target) || target <= 0) return 1

  const exponent = Math.floor(Math.log10(target))
  const pow = 10 ** exponent

  for (const mantissa of TICK_MANTISSAS) {
    const step = mantissa * pow
    if (step >= target) return step
  }
  return 10 * pow
}

/**
 * 生成 [min, max] 范围内所有 step 的倍数（含边界内最近的刻度）。
 * 采用「索引 × 步长」而非累加，避免浮点误差累积。非法参数返回空数组。
 */
export function ticksForRange(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(step > 0) || !Number.isFinite(step)) {
    return []
  }
  if (max < min) return []

  const startIndex = Math.ceil(min / step)
  const endIndex = Math.floor(max / step)
  if (endIndex - startIndex > MAX_TICKS) return []

  const out: number[] = []
  for (let i = startIndex; i <= endIndex; i++) {
    out.push(i * step)
  }
  return out
}

/**
 * 格式化刻度标签：
 * - 按步长决定小数位（步长 0.2 → 一位小数），各刻度标签宽度一致；
 * - 0 统一输出 "0"（消除 -0）；
 * - 极端量级（|v| ≥ 1e7 或 0 < |v| < 1e-6）退化为指数形式。
 */
export function formatTick(value: number, step: number): string {
  // 步长的倍数中只有 0 可能小于半个步长：借此消除 -0 与浮点毛刺
  const v = Math.abs(value) < step / 2 ? 0 : value
  if (v === 0) return '0'

  const absV = Math.abs(v)
  if (absV >= 1e7 || absV < 1e-6) {
    const [mantissa = '', exponent = '0'] = v.toExponential(2).split('e')
    const trimmed = mantissa.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
    return `${trimmed}e${Number(exponent)}`
  }

  const decimals = Math.max(0, Math.min(12, -Math.floor(Math.log10(step))))
  return v.toFixed(decimals)
}
