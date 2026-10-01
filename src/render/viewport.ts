import type { Size, ViewTransform } from '../state/types'
import { clampScale, viewBounds } from '../core/transform'

/** 精确视图范围输入（UI 表单） */
export interface ViewRangeInput {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** 当前视图的范围（供表单预填） */
export function currentRange(view: ViewTransform, size: Size): ViewRangeInput {
  const b = viewBounds(view, size)
  return { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY }
}

/**
 * 精确范围输入 → 新视图。
 * - 等比模式：取两轴中较小的比例，保证两个范围都完整可见（圆保持为正圆）；
 * - 对数坐标：范围必须为正，比例按"十倍程"计算；
 * - 非法输入返回原视图（调用方负责提示）。
 */
export function exactView(view: ViewTransform, size: Size, range: ViewRangeInput): ViewTransform {
  const { minX, maxX, minY, maxY } = range
  if (![minX, maxX, minY, maxY].every((v) => Number.isFinite(v))) return view
  if (!(maxX > minX) || !(maxY > minY)) return view

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  let spanX = maxX - minX
  let spanY = maxY - minY
  if (view.coordType === 'log') {
    if (!(minX > 0) || !(minY > 0)) return view
    spanX = Math.log10(maxX) - Math.log10(minX)
    spanY = Math.log10(maxY) - Math.log10(minY)
  }

  let scaleX = clampScale(size.width / spanX)
  let scaleY = clampScale(size.height / spanY)
  if (view.equalAspect) {
    const s = clampScale(Math.min(scaleX, scaleY))
    scaleX = s
    scaleY = s
  }

  return { ...view, centerX, centerY, scaleX, scaleY }
}
