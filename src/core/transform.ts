import type { Point2, Size, ViewTransform } from '../state/types'

/** 缩放（每个数学单位的 CSS 像素数）上下限 */
export const MIN_SCALE = 1e-6
export const MAX_SCALE = 1e9

/** 默认缩放：80 像素/单位 */
export const DEFAULT_SCALE = 80

export function createView(centerX = 0, centerY = 0, scale = DEFAULT_SCALE): ViewTransform {
  return { centerX, centerY, scale: clampScale(scale) }
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** 数学坐标 → 屏幕坐标（CSS 像素；数学 y 轴向上，屏幕 y 轴向下） */
export function mathToScreen(view: ViewTransform, size: Size, p: Point2): Point2 {
  return {
    x: (p.x - view.centerX) * view.scale + size.width / 2,
    y: size.height / 2 - (p.y - view.centerY) * view.scale,
  }
}

/** 屏幕坐标（CSS 像素）→ 数学坐标。与 mathToScreen 互为逆变换 */
export function screenToMath(view: ViewTransform, size: Size, p: Point2): Point2 {
  return {
    x: (p.x - size.width / 2) / view.scale + view.centerX,
    y: (size.height / 2 - p.y) / view.scale + view.centerY,
  }
}

/**
 * 以屏幕点 anchor 为锚点缩放：该屏幕点对应的数学坐标保持不动。
 * factor > 1 放大，0 < factor < 1 缩小。缩放结果受 MIN_SCALE / MAX_SCALE 约束。
 */
export function zoomAt(
  view: ViewTransform,
  size: Size,
  anchor: Point2,
  factor: number,
): ViewTransform {
  const scale = clampScale(view.scale * factor)
  if (scale === view.scale) return view

  const m = screenToMath(view, size, anchor)
  return {
    centerX: m.x - (anchor.x - size.width / 2) / scale,
    centerY: m.y + (anchor.y - size.height / 2) / scale,
    scale,
  }
}

/** 按屏幕像素平移视图（content 跟随指针移动的方向） */
export function panBy(view: ViewTransform, dxPx: number, dyPx: number): ViewTransform {
  return {
    centerX: view.centerX - dxPx / view.scale,
    centerY: view.centerY + dyPx / view.scale,
    scale: view.scale,
  }
}

/** 当前视图可见的数学坐标范围 */
export function viewBounds(
  view: ViewTransform,
  size: Size,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const halfW = size.width / 2 / view.scale
  const halfH = size.height / 2 / view.scale
  return {
    minX: view.centerX - halfW,
    maxX: view.centerX + halfW,
    minY: view.centerY - halfH,
    maxY: view.centerY + halfH,
  }
}
