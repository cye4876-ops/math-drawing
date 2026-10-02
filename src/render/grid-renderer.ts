import type { Size, ViewTransform } from '../state/types'
import { mathToScreen, viewBounds } from '../core/transform'
import { formatTick, niceStep, ticksForRange } from '../core/ticks'

/** 相邻主刻度标签的最小屏幕间距（像素），同时约束标签不重叠 */
export const MIN_TICK_SPACING = 64

export type GridTheme = 'light' | 'dark'

const LIGHT_PALETTE = { grid: '#e5e7eb', minor: '#f1f2f4', axis: '#9ca3af', label: '#6b7280' }
const DARK_PALETTE = { grid: '#243149', minor: '#1a2438', axis: '#64748b', label: '#94a3b8' }

let GRID_COLOR = DARK_PALETTE.grid
let MINOR_GRID_COLOR = DARK_PALETTE.minor
let AXIS_COLOR = DARK_PALETTE.axis
let LABEL_COLOR = DARK_PALETTE.label

/** 切换网格配色（v2.0）：屏幕渲染默认 dark；导出管线临时切 light 保持打印友好的浅色。
 *  渲染为同步绘制，调用方在 try/finally 中切回即可。 */
export function setGridTheme(theme: GridTheme): void {
  const palette = theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE
  GRID_COLOR = palette.grid
  MINOR_GRID_COLOR = palette.minor
  AXIS_COLOR = palette.axis
  LABEL_COLOR = palette.label
}
const LABEL_FONT = '12px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
const LABEL_OFFSET = 6
const LABEL_HEIGHT = 14
const ARROW_SIZE = 7

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 主步长的小刻度划分数（1→5、2→4、5→5） */
function minorDivisions(step: number): number {
  const exponent = Math.floor(Math.log10(step))
  const mantissa = Math.round(step / 10 ** exponent)
  if (mantissa === 1) return 5
  if (mantissa === 2) return 4
  return 5
}

interface TickSet {
  /** 主刻度（带标签） */
  major: number[]
  /** 次刻度（浅色网格，无标签） */
  minor: number[]
  /** 主刻度的格式化步长 */
  step: number
}

/** 直角坐标的刻度集（含次刻度） */
function linearTicks(min: number, max: number, scale: number, isLog: boolean): TickSet {
  if (isLog) {
    if (!(min > 0)) return { major: [], minor: [], step: 1 }
    const kMin = Math.floor(Math.log10(min))
    const kMax = Math.ceil(Math.log10(max))
    const major: number[] = []
    const minor: number[] = []
    for (let k = kMin; k <= kMax; k++) {
      const decade = 10 ** k
      if (decade >= min && decade <= max) major.push(decade)
      for (let m = 2; m <= 9; m++) {
        const v = m * decade
        if (v >= min && v <= max) minor.push(v)
      }
    }
    if (major.length === 0 && minor.length === 0) {
      // 视口落在单个十倍程内部：退化为十倍程内十等分的线性细分
      const k = Math.floor(Math.log10(min))
      const subStep = 10 ** k / 10
      const subMajor = ticksForRange(min, max, subStep)
      const subMinor = ticksForRange(min, max, subStep / 10).filter(
        (v) => Math.abs(v / subStep - Math.round(v / subStep)) > 1e-9,
      )
      return { major: subMajor, minor: subMinor, step: subStep }
    }
    return { major, minor, step: 0 }
  }
  const step = niceStep(scale, MIN_TICK_SPACING)
  const major = ticksForRange(min, max, step)
  const minorStep = step / minorDivisions(step)
  const minor = ticksForRange(min, max, minorStep).filter(
    (v) => Math.abs(v / step - Math.round(v / step)) > 1e-9,
  )
  return { major, minor, step }
}

/** 绘制网格线（直角 / 对数共用）；距离为 1px 细线在设备像素上对齐 */
function drawLinearGrid(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  size: Size,
  dpr: number,
): void {
  const bounds = viewBounds(view, size)
  const isLog = view.coordType === 'log'
  const xs = linearTicks(bounds.minX, bounds.maxX, view.scaleX, isLog)
  const ys = linearTicks(bounds.minY, bounds.maxY, view.scaleY, isLog)

  const snap = (v: number): number => (Math.round(v * dpr) + 0.5) / dpr
  const centerX = view.centerX
  const centerY = view.centerY

  // 次刻度（浅色）
  ctx.strokeStyle = MINOR_GRID_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const x of xs.minor) {
    const sx = snap(mathToScreen(view, size, { x, y: centerY }).x)
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, size.height)
  }
  for (const y of ys.minor) {
    const sy = snap(mathToScreen(view, size, { x: centerX, y }).y)
    ctx.moveTo(0, sy)
    ctx.lineTo(size.width, sy)
  }
  ctx.stroke()

  // 主刻度
  ctx.strokeStyle = GRID_COLOR
  ctx.beginPath()
  for (const x of xs.major) {
    const sx = snap(mathToScreen(view, size, { x, y: centerY }).x)
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, size.height)
  }
  for (const y of ys.major) {
    const sy = snap(mathToScreen(view, size, { x: centerX, y }).y)
    ctx.moveTo(0, sy)
    ctx.lineTo(size.width, sy)
  }
  ctx.stroke()
}

/** 极坐标网格：同心圆 + 射线（30° 间隔，60° 标注角度） */
function drawPolarGrid(ctx: CanvasRenderingContext2D, view: ViewTransform, size: Size): void {
  const origin = mathToScreen(view, size, { x: 0, y: 0 })
  const maxScreen = Math.hypot(size.width, size.height)
  const maxRadius = maxScreen / Math.min(view.scaleX, view.scaleY)
  const rStep = niceStep(Math.min(view.scaleX, view.scaleY), MIN_TICK_SPACING)

  // 同心圆（scaleX≠scaleY 时为椭圆）
  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1
  for (let r = rStep; r <= maxRadius; r += rStep) {
    ctx.beginPath()
    ctx.ellipse(origin.x, origin.y, r * view.scaleX, r * view.scaleY, 0, 0, Math.PI * 2)
    ctx.stroke()
  }

  // 射线
  ctx.beginPath()
  const rayLength = maxScreen
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg * Math.PI) / 180
    ctx.moveTo(origin.x, origin.y)
    ctx.lineTo(origin.x + Math.cos(rad) * rayLength, origin.y - Math.sin(rad) * rayLength)
  }
  ctx.stroke()

  // 半径标签（沿 +x 方向）与角度标签（每 60°）
  ctx.fillStyle = LABEL_COLOR
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let r = rStep; r <= maxRadius; r += rStep) {
    const sx = origin.x + r * view.scaleX
    if (sx < 16 || sx > size.width - 16) continue
    const sy = clamp(origin.y, 0, size.height - LABEL_HEIGHT - 2)
    ctx.fillText(formatTick(r, rStep), sx, sy + LABEL_OFFSET)
  }
  ctx.textBaseline = 'middle'
  const labelRadius = Math.min(rStep * 2, maxRadius)
  for (let deg = 60; deg < 360; deg += 60) {
    const rad = (deg * Math.PI) / 180
    const lx = origin.x + Math.cos(rad) * labelRadius * view.scaleX
    const ly = origin.y - Math.sin(rad) * labelRadius * view.scaleY
    if (lx < 20 || lx > size.width - 20 || ly < 10 || ly > size.height - 10) continue
    ctx.fillText(`${deg}°`, lx, ly)
  }
}

/** 箭头（指向 dir 方向） */
function arrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: 'left' | 'right' | 'up' | 'down',
): void {
  const s = ARROW_SIZE
  ctx.beginPath()
  if (dir === 'right' || dir === 'left') {
    const sign = dir === 'right' ? 1 : -1
    ctx.moveTo(x, y)
    ctx.lineTo(x - sign * s, y - s * 0.6)
    ctx.lineTo(x - sign * s, y + s * 0.6)
  } else {
    const sign = dir === 'down' ? 1 : -1
    ctx.moveTo(x, y)
    ctx.lineTo(x - s * 0.6, y - sign * s)
    ctx.lineTo(x + s * 0.6, y - sign * s)
  }
  ctx.closePath()
  ctx.fill()
}

/** 坐标轴（可移动位置、可隐藏、端点箭头） */
function drawAxes(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  size: Size,
  dpr: number,
): void {
  const snap = (v: number): number => (Math.round(v * dpr) + 0.5) / dpr
  const axisScreenY = mathToScreen(view, size, { x: view.centerX, y: view.axisX }).y
  const axisScreenX = mathToScreen(view, size, { x: view.axisY, y: view.centerY }).x

  ctx.strokeStyle = AXIS_COLOR
  ctx.fillStyle = AXIS_COLOR
  ctx.lineWidth = 1

  const hVisible = Number.isFinite(axisScreenY) && axisScreenY >= 0 && axisScreenY <= size.height
  const vVisible = Number.isFinite(axisScreenX) && axisScreenX >= 0 && axisScreenX <= size.width

  if (hVisible) {
    const sy = snap(axisScreenY)
    ctx.beginPath()
    ctx.moveTo(0, sy)
    ctx.lineTo(size.width, sy)
    ctx.stroke()
    arrowHead(ctx, size.width - 1, sy, 'right')
    arrowHead(ctx, 1, sy, 'left')
  }
  if (vVisible) {
    const sx = snap(axisScreenX)
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, size.height)
    ctx.stroke()
    arrowHead(ctx, sx, 1, 'up')
    arrowHead(ctx, sx, size.height - 1, 'down')
  }
}

/** 刻度数字：沿（移动后的）轴位置绘制；轴在视口外时贴边显示 */
function drawTickLabels(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  size: Size,
  dpr: number,
): void {
  const bounds = viewBounds(view, size)
  const isLog = view.coordType === 'log'
  const xs = linearTicks(bounds.minX, bounds.maxX, view.scaleX, isLog)
  const ys = linearTicks(bounds.minY, bounds.maxY, view.scaleY, isLog)
  void dpr

  const axisScreenY = mathToScreen(view, size, { x: view.centerX, y: view.axisX }).y
  const axisScreenX = mathToScreen(view, size, { x: view.axisY, y: view.centerY }).x

  ctx.fillStyle = LABEL_COLOR
  ctx.font = LABEL_FONT

  const xAxisY = clamp(axisScreenY, 0, size.height)
  const yAxisX = clamp(axisScreenX, 0, size.width)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const labelFor = (v: number, set: TickSet): string => formatTick(v, set.step > 0 ? set.step : v)
  for (const x of xs.major) {
    const label = labelFor(x, xs)
    const sx = mathToScreen(view, size, { x, y: 0 }).x
    const half = ctx.measureText(label).width / 2
    const lx = clamp(sx, half + 2, size.width - half - 2)
    const below = xAxisY + LABEL_OFFSET
    const ly = below + LABEL_HEIGHT <= size.height ? below : xAxisY - LABEL_HEIGHT - LABEL_OFFSET
    ctx.fillText(label, lx, ly)
  }

  ctx.textBaseline = 'middle'
  for (const y of ys.major) {
    const label = labelFor(y, ys)
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

/**
 * 绘制坐标系：网格（直角主/次刻度、极坐标、对数）、可移动坐标轴（含箭头）、刻度数字。
 * 绘制坐标系为 CSS 像素（由 Canvas 层设置 dpr 变换），dpr 用于 1px 细线的设备像素对齐。
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  size: Size,
  dpr: number,
): void {
  ctx.clearRect(0, 0, size.width, size.height)

  if (view.coordType === 'polar') {
    drawPolarGrid(ctx, view, size)
  } else {
    drawLinearGrid(ctx, view, size, dpr)
  }

  if (view.axisVisible) {
    drawAxes(ctx, view, size, dpr)
  }

  if (view.coordType !== 'polar') {
    drawTickLabels(ctx, view, size, dpr)
  }
}
