/**
 * 动画导出（v0.6）：
 * - 帧源①图算法播放器步骤流（确定性逐帧：当前步骤琥珀 + 累积轨迹玫红）；
 * - 帧源②黎曼和动画（n = 1…N 递增，与工具同款矩形样式）；
 * - 帧源③泰勒展开动画（阶数递增，与工具同色 #d97706）；
 * - GIF：gifenc 逐帧量化编码（每帧独立调色板），逐帧让出主线程；
 * - WebM：MediaRecorder + canvas.captureStream(0) + track.requestFrame 逐帧推流。
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { runAlgorithm } from '../graph/algorithms'
import { computeTrail } from '../graph/algorithms/trail'
import { riemannSum, type RiemannMode } from '../math/numeric/riemann'
import { getDerivativeFn } from '../tools/curve-access'
import { compileCurveExpr } from '../render/curve-renderer'
import { mathToScreen, viewBounds } from '../core/transform'
import { renderFrame } from './frame'
import type { SceneHighlight } from '../render/element-registry'
import type { Curve, DocState, GraphObject, Size, ViewTransform } from '../state/types'

/** 动画帧源：图算法演示 / 黎曼和 / 泰勒展开 */
export type AnimationSource =
  | { kind: 'algorithm'; algorithmId: string; startId?: string }
  | { kind: 'riemann'; curveId: string; a: number; b: number; mode: RiemannMode; maxN: number }
  | { kind: 'taylor'; curveId: string; x0: number; maxOrder: number }

export interface AlgorithmAnimationSource {
  algorithmId: string
  startId?: string
}

export interface AnimationFrame {
  /** 图算法帧：画布高亮（当前步骤 + 轨迹） */
  highlight?: SceneHighlight
  label: string
  /** plot 帧（黎曼/泰勒）：在渲染帧上叠加绘制矩形/多项式（坐标系与导出视图一致） */
  overlay?: (ctx: CanvasRenderingContext2D, view: ViewTransform, size: Size) => void
}

/** 生成算法演示帧序列（每步一帧；空步骤返回空数组） */
export function buildAlgorithmFrames(
  graph: GraphObject,
  source: AlgorithmAnimationSource,
): AnimationFrame[] {
  const { steps } = runAlgorithm(source.algorithmId, graph, source.startId)
  if (steps.length === 0) return []
  return steps.map((step, index) => {
    const trail = computeTrail(steps, index)
    const highlight: SceneHighlight = {
      nodes: step.node ? [step.node] : [],
      edges: step.edge ? [{ source: step.edge.source, target: step.edge.target }] : [],
      trailNodes: trail.nodes,
      trailEdges: trail.edges,
    }
    const label = `步骤 ${index + 1}/${steps.length}${step.note ? ` · ${step.note}` : ''}`
    return { highlight, label }
  })
}

function firstExplicitCurve(doc: DocState, curveId: string): Curve | null {
  const curve = doc.objects.find(
    (object): object is Curve =>
      object.type === 'curve' &&
      object.kind === 'explicit' &&
      object.visible &&
      object.id === curveId,
  )
  return curve ?? null
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return String(Number(value.toPrecision(4)))
}

/** 黎曼和动画：n = 1…N 逐帧递增（矩形加密过程） */
export function buildRiemannFrames(
  doc: DocState,
  source: Extract<AnimationSource, { kind: 'riemann' }>,
): AnimationFrame[] {
  const curve = firstExplicitCurve(doc, source.curveId)
  if (!curve || !(source.b > source.a)) return []
  const compiled = compileCurveExpr(curve.expr)
  if (!compiled) return []
  const scope: Record<string, number> = { ...curve.params, x: 0 }
  const f = (x: number): number => {
    scope['x'] = x
    return compiled(scope)
  }
  const nMax = Math.min(100, Math.max(2, Math.round(source.maxN)))
  const frames: AnimationFrame[] = []
  for (let n = 1; n <= nMax; n++) {
    const sum = riemannSum(f, source.a, source.b, n, source.mode)
    frames.push({
      label: `n = ${n} · 黎曼和 ≈ ${formatValue(sum.value)}`,
      overlay: (ctx, view, size) =>
        drawRiemannOverlay(ctx, f, source.a, source.b, n, source.mode, view, size),
    })
  }
  return frames
}

/** 与黎曼和工具同款的矩形绘制（从 x 轴到函数值；半透明蓝） */
function drawRiemannOverlay(
  ctx: CanvasRenderingContext2D,
  f: (x: number) => number,
  a: number,
  b: number,
  n: number,
  mode: RiemannMode,
  view: ViewTransform,
  size: Size,
): void {
  const h = (b - a) / n
  const clamp = (v: number): number => (v > 1e5 ? 1e5 : v < -1e5 ? -1e5 : v)
  ctx.save()
  ctx.fillStyle = 'rgba(37, 99, 235, 0.14)'
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.75)'
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    const x0 = a + i * h
    const x1 = x0 + h
    const sample = mode === 'left' ? x0 : mode === 'right' ? x1 : (x0 + x1) / 2
    let value = mode === 'trapezoid' ? (f(x0) + f(x1)) / 2 : f(sample)
    if (!Number.isFinite(value)) continue
    value = clamp(value)
    const p0 = mathToScreen(view, size, { x: x0, y: 0 })
    const p1 = mathToScreen(view, size, { x: x1, y: value })
    if (!Number.isFinite(p0.x) || !Number.isFinite(p1.y)) continue
    const left = Math.min(p0.x, p1.x)
    const right = Math.max(p0.x, p1.x)
    if (right - left < 0.4) continue
    const top = Math.min(p0.y, p1.y)
    const bottom = Math.max(p0.y, p1.y)
    const height = Math.max(0.5, bottom - top)
    ctx.fillRect(left, top, right - left, height)
    ctx.strokeRect(left, top, right - left, height)
  }
  ctx.restore()
}

/** 泰勒展开动画：T1…Tk 逐阶叠加（系数来自 v0.2 符号求导） */
export function buildTaylorFrames(
  doc: DocState,
  source: Extract<AnimationSource, { kind: 'taylor' }>,
): AnimationFrame[] {
  const curve = firstExplicitCurve(doc, source.curveId)
  if (!curve) return []
  const maxOrder = Math.min(15, Math.max(1, Math.round(source.maxOrder)))
  const coeffs: number[] = []
  let factorial = 1
  for (let k = 0; k <= maxOrder; k++) {
    if (k > 0) factorial *= k
    const fn = getDerivativeFn(curve.expr, 'x', k)
    if (!fn) break
    const value = fn(source.x0)
    if (!Number.isFinite(value)) break
    coeffs.push(value / factorial)
  }
  if (coeffs.length < 2) return []
  const limit = Math.min(maxOrder, coeffs.length - 1)
  const frames: AnimationFrame[] = []
  for (let k = 1; k <= limit; k++) {
    frames.push({
      label: `T${k}(x)：展开至 ${k} 阶`,
      overlay: (ctx, view, size) => drawTaylorOverlay(ctx, coeffs, source.x0, k, view, size),
    })
  }
  return frames
}

/** 泰勒多项式折线（与工具同色 #d97706；大幅越界的段自动断开） */
function drawTaylorOverlay(
  ctx: CanvasRenderingContext2D,
  coeffs: number[],
  x0: number,
  order: number,
  view: ViewTransform,
  size: Size,
): void {
  const bounds = viewBounds(view, size)
  const steps = 400
  const heightLimit = size.height * 3
  ctx.save()
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = 2
  ctx.beginPath()
  let open = false
  for (let i = 0; i <= steps; i++) {
    const x = bounds.minX + ((bounds.maxX - bounds.minX) * i) / steps
    let y = 0
    for (let k = Math.min(order, coeffs.length - 1); k >= 0; k--) {
      y = y * (x - x0) + (coeffs[k] as number)
    }
    const p = mathToScreen(view, size, { x, y })
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      Math.abs(p.y - size.height / 2) > heightLimit
    ) {
      open = false
      continue
    }
    if (open) ctx.lineTo(p.x, p.y)
    else {
      ctx.moveTo(p.x, p.y)
      open = true
    }
  }
  ctx.stroke()
  ctx.restore()
}

/** 统一入口：按来源构建帧序列 */
export function buildAnimationFrames(doc: DocState, source: AnimationSource): AnimationFrame[] {
  if (source.kind === 'algorithm') {
    const graph = doc.objects.find((object): object is GraphObject => object.type === 'graph')
    if (!graph) return []
    return buildAlgorithmFrames(graph, source)
  }
  if (source.kind === 'riemann') return buildRiemannFrames(doc, source)
  return buildTaylorFrames(doc, source)
}

export interface AnimationOptions {
  /** 帧率（2~12） */
  fps: number
  /** 渲染尺寸（CSS 像素；GIF 建议 ≤ 800 宽以控制体积） */
  size: Size
  format: 'gif' | 'webm'
  /** 渲染管线：plot（网格 + 曲线 + overlay）/ graph（图 + 高亮） */
  mode: 'plot' | 'graph'
}

const INFO_BAR_HEIGHT = 26

/** 逐帧渲染到共享画布（含底部信息条与帧 overlay） */
function createFrameDrawer(
  ctx: CanvasRenderingContext2D,
  doc: DocState,
  view: ViewTransform,
  size: Size,
  mode: 'plot' | 'graph',
): (frame: AnimationFrame) => void {
  const { width, height } = size
  return (frame) => {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    renderFrame(ctx, doc, mode, view, size, {
      theme: 'light',
      withGrid: mode === 'plot',
      highlight: frame.highlight,
    })
    frame.overlay?.(ctx, view, size)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
    ctx.fillRect(0, height - INFO_BAR_HEIGHT, width, INFO_BAR_HEIGHT)
    ctx.fillStyle = '#374151'
    ctx.font = '13px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const label = frame.label.length > 100 ? `${frame.label.slice(0, 100)}…` : frame.label
    ctx.fillText(label, 10, height - INFO_BAR_HEIGHT / 2)
  }
}

/** 导出 GIF（逐帧量化；每帧间让出主线程） */
async function encodeGif(
  drawFrame: (frame: AnimationFrame) => void,
  ctx: CanvasRenderingContext2D,
  frames: AnimationFrame[],
  size: Size,
  delay: number,
): Promise<Blob> {
  const { width, height } = size
  const gif = GIFEncoder()
  for (const frame of frames) {
    drawFrame(frame)
    const image = ctx.getImageData(0, 0, width, height)
    const palette = quantize(image.data, 256)
    const index = applyPalette(image.data, palette)
    gif.writeFrame(index, width, height, { palette, delay })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  gif.finish()
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' })
}

/** 导出 WebM（captureStream(0) + 手动推帧；按帧率实时录制） */
async function encodeWebm(
  drawFrame: (frame: AnimationFrame) => void,
  canvas: HTMLCanvasElement,
  frames: AnimationFrame[],
  delay: number,
): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持 MediaRecorder（无法导出 WebM）')
  }
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0]
  if (!track || !('requestFrame' in track)) {
    throw new Error('当前浏览器不支持逐帧录制（captureStream 不可用）')
  }
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  const mimeType = candidates.find((mime) => MediaRecorder.isTypeSupported(mime))
  if (!mimeType) throw new Error('当前浏览器不支持 WebM 录制')

  const recorder = new MediaRecorder(stream, { mimeType })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve()
  })
  recorder.start()
  for (const frame of frames) {
    drawFrame(frame)
    ;(track as CanvasCaptureMediaStreamTrack).requestFrame()
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  recorder.stop()
  await stopped
  track.stop()
  return new Blob(chunks, { type: 'video/webm' })
}

/** 主导出入口：按格式渲染帧序列并编码为 GIF / WebM */
export async function exportAnimation(
  doc: DocState,
  view: ViewTransform,
  frames: AnimationFrame[],
  options: AnimationOptions,
): Promise<Blob> {
  if (frames.length === 0) throw new Error('没有可导出的动画帧（请先选择算法）')
  const width = Math.max(64, Math.round(options.size.width))
  const height = Math.max(64, Math.round(options.size.height))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建动画画布（Canvas 2D 不可用）')

  const size: Size = { width, height }
  const drawFrame = createFrameDrawer(ctx, doc, view, size, options.mode)
  const delay = Math.max(50, Math.round(1000 / Math.max(1, options.fps)))

  if (options.format === 'gif') {
    return encodeGif(drawFrame, ctx, frames, size, delay)
  }
  return encodeWebm(drawFrame, canvas, frames, delay)
}
