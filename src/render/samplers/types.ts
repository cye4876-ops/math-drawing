import type { Point2 } from '../../state/types'

/** 采样点：数学坐标 + 来源参数（显函数 t=x；参数方程 t=t；极坐标 t=θ；隐函数无 t） */
export interface SamplePoint extends Point2 {
  t?: number
}

/** 采样输出：数学坐标下的折线段（段与段之间断开，不跨段连线） */
export interface SampledPolyline {
  /** 每段是一条连续可画的折线（数学坐标，按参数/横坐标递增） */
  segments: SamplePoint[][]
  /** 检测到的垂直渐近线位置（数学 x，用于虚线标注） */
  asymptoteXs: number[]
  /** 函数求值次数（性能观察与测试用） */
  evaluations: number
}

/** 采样质量档位（由曲线的 quality 1..5 映射） */
export interface SampleTuning {
  /** 屏幕空间误差容差（CSS 像素） */
  tolerancePx: number
  /** 递归细分最大深度（防 sin(1/x) 类函数无限细分） */
  maxDepth: number
}

/** quality 1..5 → 容差（像素） */
const TOLERANCES = [1.5, 0.9, 0.5, 0.3, 0.15] as const
/** quality 1..5 → 最大递归深度 */
const DEPTHS = [10, 12, 14, 16, 18] as const

export function qualityToTuning(quality: number): SampleTuning {
  const index = Math.min(TOLERANCES.length, Math.max(1, Math.round(quality))) - 1
  return {
    tolerancePx: TOLERANCES[index] ?? 0.5,
    maxDepth: DEPTHS[index] ?? 14,
  }
}

/** 种子点间距（CSS 像素）：先均匀取种子，再自适应细分 */
export const SEED_SPACING_PX = 12

/** 细分停止的最小弦长（CSS 像素）：亚像素弦不再细分（sin(1/x) 防爆） */
export const MIN_CHORD_PX = 1

/** 相邻采样点屏幕纵向间距超过该系数 × 视口高度，视为疑似跳变 */
export const JUMP_GAP_FACTOR = 1

/** 屏幕位置离视口中心超过该系数 × 视口高度，视为"数值巨大"（渐近线判据） */
export const MAG_FACTOR = 20

/** 单次采样求值预算（防御病态函数） */
export const MAX_EVALUATIONS = 120_000
