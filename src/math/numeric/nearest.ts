/**
 * 折线最近点（v0.4 追踪游标"吸附"）：在**屏幕空间**求采样折线上离光标最近的点。
 *
 * 用屏幕空间而非"同 x 取点"，保证参数方程、极坐标、多值曲线上的吸附同样正确
 * （规格明确要求；同 x 取点在这些曲线上完全失效）。
 */
import type { Point2 } from '../../state/types'
import type { SamplePoint } from '../../render/samplers/types'

export interface NearestPoint {
  /** 最近点的数学坐标 */
  x: number
  y: number
  /** 屏幕像素距离 */
  distancePx: number
  /** 最近点处的曲线参数（显函数 =x，参数方程 = t，极坐标 = θ；隐函数为 null） */
  t: number | null
}

/**
 * 在所有折线段中找离 target（屏幕坐标）最近的点。
 * project 把数学坐标投影到屏幕；投影失败（非有限）的段自动跳过。
 */
export function nearestPointOnPolylines(
  segments: readonly (readonly SamplePoint[])[],
  project: (p: Point2) => Point2,
  target: Point2,
  maxDistancePx = Number.POSITIVE_INFINITY,
): NearestPoint | null {
  let best: NearestPoint | null = null

  for (const segment of segments) {
    if (segment.length === 0) continue
    if (segment.length === 1) {
      const only = segment[0] as SamplePoint
      const p = project(only)
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      const distance = Math.hypot(p.x - target.x, p.y - target.y)
      if (distance <= maxDistancePx && (best === null || distance < best.distancePx)) {
        best = { x: only.x, y: only.y, distancePx: distance, t: only.t ?? null }
      }
      continue
    }

    let prev = segment[0] as SamplePoint
    let prevScreen = project(prev)
    for (let i = 1; i < segment.length; i++) {
      const curr = segment[i] as SamplePoint
      const currScreen = project(curr)
      if (
        Number.isFinite(prevScreen.x) &&
        Number.isFinite(prevScreen.y) &&
        Number.isFinite(currScreen.x) &&
        Number.isFinite(currScreen.y)
      ) {
        const hit = projectToSegment(target, prevScreen, currScreen)
        if (hit.distance <= maxDistancePx && (best === null || hit.distance < best.distancePx)) {
          const x = prev.x + (curr.x - prev.x) * hit.t
          const y = prev.y + (curr.y - prev.y) * hit.t
          let t: number | null = null
          if (prev.t !== undefined && curr.t !== undefined) {
            t = prev.t + (curr.t - prev.t) * hit.t
          } else if (prev.t !== undefined) {
            t = prev.t
          } else if (curr.t !== undefined) {
            t = curr.t
          }
          best = { x, y, distancePx: hit.distance, t }
        }
      }
      prev = curr
      prevScreen = currScreen
    }
  }

  return best
}

/** 点到线段的投影：返回线段参数 t ∈ [0,1] 与像素距离 */
function projectToSegment(p: Point2, a: Point2, b: Point2): { t: number; distance: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return { t: 0, distance: Math.hypot(p.x - a.x, p.y - a.y) }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.min(1, Math.max(0, t))
  const px = a.x + t * dx
  const py = a.y + t * dy
  return { t, distance: Math.hypot(p.x - px, p.y - py) }
}
