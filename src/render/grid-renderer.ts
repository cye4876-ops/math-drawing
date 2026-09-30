import type { Size, ViewTransform } from '../state/types'
import { mathToScreen, viewBounds } from '../core/transform'
import { formatTick, niceStep, ticksForRange } from '../core/ticks'

/** 相邻刻度标签的最小屏幕间距（像素），同时约束标签不重叠 */
export const MIN_TICK_SPACING = 64

const GRID_COLOR = '#e5e7eb'
const AXIS_COLOR = '#9ca3af'
const LABEL_COLOR = '#6b7280'
const LABEL_FONT = '12px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
const LABEL_OFFSET = 6
const LABEL_HEIGHT = 14

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * 绘制坐标系：网格线、坐标轴、刻度数字。
 * 绘制坐标系为 CSS 像素（由 Canvas 层设置 dpr 变换），dpr 用于 1px 细线的设备像素对齐。
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  size: Size,
  dpr: number,
): void {
  const bounds = viewBounds(view, size)
  const step = niceStep(view.scale, MIN_TICK_SPACING)
  const xs = ticksForRange(bounds.minX, bounds.maxX, step)
  const ys = ticksForRange(bounds.minY, bounds.maxY, step)

  // 1px 线落在设备像素边界上，避免发虚
  const snap = (v: number): number => (Math.round(v * dpr) + 0.5) / dpr

  ctx.clearRect(0, 0, size.width, size.height)

  // 网格线
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const x of xs) {
    const sx = snap(mathToScreen(view, size, { x, y: 0 }).x)
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, size.height)
  }
  for (const y of ys) {
    const sy = snap(mathToScreen(view, size, { x: 0, y }).y)
    ctx.moveTo(0, sy)
    ctx.lineTo(size.width, sy)
  }
  ctx.stroke()

  // 坐标轴（仅当 x=0 / y=0 在视口内）
  const originScreen = mathToScreen(view, size, { x: 0, y: 0 })
  const axisXVisible = bounds.minX <= 0 && 0 <= bounds.maxX
  const axisYVisible = bounds.minY <= 0 && 0 <= bounds.maxY

  ctx.strokeStyle = AXIS_COLOR
  ctx.beginPath()
  if (axisYVisible) {
    const sy = snap(originScreen.y)
    ctx.moveTo(0, sy)
    ctx.lineTo(size.width, sy)
  }
  if (axisXVisible) {
    const sx = snap(originScreen.x)
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, size.height)
  }
  ctx.stroke()

  // 刻度数字
  ctx.fillStyle = LABEL_COLOR
  ctx.font = LABEL_FONT

  const xAxisY = clamp(originScreen.y, 0, size.height)
  const yAxisX = clamp(originScreen.x, 0, size.width)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const x of xs) {
    const label = formatTick(x, step)
    const sx = mathToScreen(view, size, { x, y: 0 }).x
    const half = ctx.measureText(label).width / 2
    const lx = clamp(sx, half + 2, size.width - half - 2)
    const below = xAxisY + LABEL_OFFSET
    const ly = below + LABEL_HEIGHT <= size.height ? below : xAxisY - LABEL_HEIGHT - LABEL_OFFSET
    ctx.fillText(label, lx, ly)
  }

  ctx.textBaseline = 'middle'
  for (const y of ys) {
    const label = formatTick(y, step)
    const sy = mathToScreen(view, size, { x: 0, y }).y
    const ly = clamp(sy, 8, size.height - 8)
    if (yAxisX >= 48) {
      ctx.textAlign = 'right'
      ctx.fillText(label, yAxisX - LABEL_OFFSET, ly)
    } else {
      ctx.textAlign = 'left'
      ctx.fillText(label, yAxisX + LABEL_OFFSET, ly)
    }
  }
}
