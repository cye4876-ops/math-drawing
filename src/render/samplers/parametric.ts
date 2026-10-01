import type { Point2 } from '../../state/types'
import {
  MAX_EVALUATIONS,
  MIN_CHORD_PX,
  type SamplePoint,
  type SampleTuning,
  type SampledPolyline,
} from './types'

/**
 * 参数方程 (x(t), y(t)) 的自适应采样。
 *
 * 与显函数采样同源（种子 + 递归弦偏差细分），区别：
 * - 不假设 x 单调：曲线上任意形状均可，细分准则是"屏幕空间中点到弦的垂距"；
 * - 无跳变/渐近线判定：任一分量非有限（或屏幕投影失败，如 log 域外）即视为不可绘制点，
 *   向有效区间二分行进后断开。
 *
 * 极坐标 r = f(θ) 由 samplePolar 转换为 (r·cosθ, r·sinθ) 后复用本函数
 * （按弧长/曲率自适应的等价形式，见 docs/sampling-algorithms.md）。
 */
export interface ParametricSampleOptions extends SampleTuning {
  /** 参数范围（t 或 θ） */
  tMin: number
  tMax: number
  /** 数学坐标 → 屏幕坐标；不可绘制的点返回含非有限值的结果 */
  project: (p: Point2) => Point2
}

interface Node {
  t: number
  x: number
  y: number
  sx: number
  sy: number
  valid: boolean
}

/** 种子数量：按参数跨度取，长跨度（如多圈螺旋）自动加密，且有上限 */
export function parametricSeedCount(tMin: number, tMax: number): number {
  const span = tMax - tMin
  return Math.min(1024, Math.max(32, Math.round((span / (2 * Math.PI)) * 128)))
}

export function sampleParametric(
  fx: (t: number) => number,
  fy: (t: number) => number,
  options: ParametricSampleOptions,
): SampledPolyline {
  const { tMin, tMax, project, tolerancePx, maxDepth } = options

  const segments: SamplePoint[][] = []
  let current: SamplePoint[] | null = null
  let evaluations = 0
  let budgetExceeded = false

  const makeNode = (t: number): Node => {
    evaluations++
    if (evaluations > MAX_EVALUATIONS) budgetExceeded = true
    const x = fx(t)
    const y = fy(t)
    const screen = project({ x, y })
    const valid =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(screen.x) &&
      Number.isFinite(screen.y)
    return { t, x, y, sx: screen.x, sy: screen.y, valid }
  }

  const emit = (node: Node): void => {
    if (!node.valid) return
    if (!current) {
      current = []
      segments.push(current)
    }
    const last = current[current.length - 1]
    if (last && last.x === node.x && last.y === node.y) return
    current.push({ x: node.x, y: node.y, t: node.t })
  }

  const breakSegment = (): void => {
    current = null
  }

  /** 点到弦的屏幕垂距 */
  const chordDeviation = (a: Node, b: Node, m: Node): number => {
    const dx = b.sx - a.sx
    const dy = b.sy - a.sy
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(m.sx - a.sx, m.sy - a.sy)
    let t = ((m.sx - a.sx) * dx + (m.sy - a.sy) * dy) / len2
    t = Math.min(1, Math.max(0, t))
    return Math.hypot(m.sx - (a.sx + t * dx), m.sy - (a.sy + t * dy))
  }

  const refine = (a: Node, b: Node, depth: number): void => {
    // 退化区间（浮点收敛）：直接终止
    if (a.t >= b.t) {
      emit(a)
      emit(b)
      return
    }

    if (!a.valid && !b.valid) {
      breakSegment()
      return
    }

    // 单端无效：向边界二分行进
    if (!a.valid || !b.valid) {
      if (depth >= maxDepth || budgetExceeded) {
        breakSegment()
        return
      }
      const m = makeNode((a.t + b.t) / 2)
      if (m.valid) {
        refine(a, m, depth + 1)
        emit(m)
        refine(m, b, depth + 1)
      } else if (b.valid) {
        refine(m, b, depth + 1)
      } else {
        refine(a, m, depth + 1)
      }
      return
    }

    if (depth >= maxDepth || budgetExceeded) {
      emit(a)
      emit(b)
      return
    }

    const m = makeNode((a.t + b.t) / 2)
    if (!m.valid) {
      refine(a, m, depth + 1)
      refine(m, b, depth + 1)
      return
    }

    const chord = Math.hypot(b.sx - a.sx, b.sy - a.sy)
    const dev = chordDeviation(a, b, m)
    if (dev > tolerancePx && chord > MIN_CHORD_PX) {
      refine(a, m, depth + 1)
      refine(m, b, depth + 1)
    } else {
      emit(a)
      emit(b)
    }
  }

  if (!(tMax > tMin)) return { segments, asymptoteXs: [], evaluations }

  const seedCount = parametricSeedCount(tMin, tMax)
  let prev: Node | null = null
  for (let i = 0; i <= seedCount; i++) {
    const t = tMin + ((tMax - tMin) * i) / seedCount
    const node = makeNode(t)
    if (prev) {
      refine(prev, node, 0)
    } else {
      emit(node)
    }
    prev = node
  }

  return { segments, asymptoteXs: [], evaluations }
}

/**
 * 极坐标曲线 r = f(θ)：转换为参数方程 (r·cosθ, r·sinθ) 后采样。
 * θ 范围由调用方给定（默认 [0, 2π]，见曲线渲染器）。
 */
export function samplePolar(
  r: (theta: number) => number,
  options: ParametricSampleOptions,
): SampledPolyline {
  const fx = (t: number): number => r(t) * Math.cos(t)
  const fy = (t: number): number => r(t) * Math.sin(t)
  return sampleParametric(fx, fy, options)
}
