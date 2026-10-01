import type { Point2, Size, ViewTransform } from '../state/types'

/** 缩放（每个数学单位/十倍程的 CSS 像素数）上下限 */
export const MIN_SCALE = 1e-6
export const MAX_SCALE = 1e9

/** 默认缩放：80 像素/单位 */
export const DEFAULT_SCALE = 80

/** log 模式下 center 的"单位空间"（log10）可取范围，防止 10^x 溢出/下溢 */
const LOG_UNIT_LIMIT = 300

export function createView(centerX = 0, centerY = 0, scale = DEFAULT_SCALE): ViewTransform {
  const s = clampScale(scale)
  return {
    centerX,
    centerY,
    scaleX: s,
    scaleY: s,
    equalAspect: true,
    coordType: 'rect',
    axisVisible: true,
    axisX: 0,
    axisY: 0,
  }
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_SCALE
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * "单位空间"换算：线性模式下单位空间 === 数学值；
 * log 模式下单位空间 = log10(值)（非正数返回 NaN / -Infinity，由调用方过滤）。
 * 所有变换公式统一在单位空间中书写，从而同时支持两种坐标。
 */
function xToUnit(view: ViewTransform, x: number): number {
  return view.coordType === 'log' ? Math.log10(x) : x
}

function yToUnit(view: ViewTransform, y: number): number {
  return view.coordType === 'log' ? Math.log10(y) : y
}

function xFromUnit(view: ViewTransform, u: number): number {
  return view.coordType === 'log' ? 10 ** clamp(u, -LOG_UNIT_LIMIT, LOG_UNIT_LIMIT) : u
}

function yFromUnit(view: ViewTransform, u: number): number {
  return view.coordType === 'log' ? 10 ** clamp(u, -LOG_UNIT_LIMIT, LOG_UNIT_LIMIT) : u
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 中心在单位空间的坐标（仅 log 模式做溢出钳制；线性模式绝不钳制——大坐标中心必须保持原值） */
function centerUnits(view: ViewTransform): { cx: number; cy: number } {
  const cx = xToUnit(view, view.centerX)
  const cy = yToUnit(view, view.centerY)
  if (view.coordType !== 'log') return { cx, cy }
  return {
    cx: clamp(cx, -LOG_UNIT_LIMIT, LOG_UNIT_LIMIT),
    cy: clamp(cy, -LOG_UNIT_LIMIT, LOG_UNIT_LIMIT),
  }
}

/** 数学坐标 → 屏幕坐标（CSS 像素；数学 y 轴向上，屏幕 y 轴向下） */
export function mathToScreen(view: ViewTransform, size: Size, p: Point2): Point2 {
  const { cx, cy } = centerUnits(view)
  return {
    x: (xToUnit(view, p.x) - cx) * view.scaleX + size.width / 2,
    y: size.height / 2 - (yToUnit(view, p.y) - cy) * view.scaleY,
  }
}

/** 屏幕坐标（CSS 像素）→ 数学坐标。与 mathToScreen 互为逆变换 */
export function screenToMath(view: ViewTransform, size: Size, p: Point2): Point2 {
  const { cx, cy } = centerUnits(view)
  return {
    x: xFromUnit(view, (p.x - size.width / 2) / view.scaleX + cx),
    y: yFromUnit(view, (size.height / 2 - p.y) / view.scaleY + cy),
  }
}

/** 数学坐标的单位空间值（供采样器/渲染器在 log 模式下过滤非法域）；线性模式即原值 */
export function mathToUnitSpace(view: ViewTransform, p: Point2): Point2 {
  return { x: xToUnit(view, p.x), y: yToUnit(view, p.y) }
}

/** 视图中心的单位空间坐标（采样器换算用） */
export function viewCenterUnits(view: ViewTransform): Point2 {
  const { cx, cy } = centerUnits(view)
  return { x: cx, y: cy }
}

/** 投影器：坐标轴独立的免分配投影（采样热路径使用） */
export interface Projector {
  screenX(x: number): number
  screenY(y: number): number
  screenToMathX(sx: number): number
  screenToMathY(sy: number): number
  project(p: Point2): Point2
}

export function createProjector(view: ViewTransform, size: Size): Projector {
  const { cx, cy } = centerUnits(view)
  const halfW = size.width / 2
  const halfH = size.height / 2
  const scaleX = view.scaleX
  const scaleY = view.scaleY
  return {
    screenX: (x) => (xToUnit(view, x) - cx) * scaleX + halfW,
    screenY: (y) => halfH - (yToUnit(view, y) - cy) * scaleY,
    screenToMathX: (sx) => xFromUnit(view, (sx - halfW) / scaleX + cx),
    screenToMathY: (sy) => yFromUnit(view, (halfH - sy) / scaleY + cy),
    project: (p) => ({
      x: (xToUnit(view, p.x) - cx) * scaleX + halfW,
      y: halfH - (yToUnit(view, p.y) - cy) * scaleY,
    }),
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
  const scaleX = clampScale(view.scaleX * factor)
  const scaleY = clampScale(view.scaleY * factor)
  if (scaleX === view.scaleX && scaleY === view.scaleY) return view

  // 锚点不变量在单位空间中成立：centerUnit' = anchorUnit - (anchor - size/2) / scale
  const m = screenToMath(view, size, anchor)
  return {
    ...view,
    centerX: xFromUnit(view, xToUnit(view, m.x) - (anchor.x - size.width / 2) / scaleX),
    centerY: yFromUnit(view, yToUnit(view, m.y) + (anchor.y - size.height / 2) / scaleY),
    scaleX,
    scaleY: view.equalAspect ? scaleX : scaleY,
  }
}

/** 按屏幕像素平移视图（content 跟随指针移动的方向） */
export function panBy(view: ViewTransform, dxPx: number, dyPx: number): ViewTransform {
  const { cx, cy } = centerUnits(view)
  return {
    ...view,
    centerX: xFromUnit(view, cx - dxPx / view.scaleX),
    centerY: yFromUnit(view, cy + dyPx / view.scaleY),
  }
}

/** 当前视图可见的数学坐标范围 */
export function viewBounds(
  view: ViewTransform,
  size: Size,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const { cx, cy } = centerUnits(view)
  const halfW = size.width / 2 / view.scaleX
  const halfH = size.height / 2 / view.scaleY
  return {
    minX: xFromUnit(view, cx - halfW),
    maxX: xFromUnit(view, cx + halfW),
    minY: yFromUnit(view, cy - halfH),
    maxY: yFromUnit(view, cy + halfH),
  }
}

/** 切换等比模式；开启时把 scaleY 对齐到 scaleX（可预测语义） */
export function withEqualAspect(view: ViewTransform, equalAspect: boolean): ViewTransform {
  if (equalAspect === view.equalAspect) return view
  if (!equalAspect) return { ...view, equalAspect }
  return { ...view, equalAspect, scaleY: view.scaleX }
}
