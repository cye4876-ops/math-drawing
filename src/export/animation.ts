/**
 * 动画导出（v0.6）：
 * - 帧源：图算法播放器的步骤流——确定性逐帧渲染（当前步骤琥珀 + 累积轨迹玫红 + 底部进度条）；
 * - GIF：gifenc 逐帧量化编码（每帧独立调色板），逐帧让出主线程（UI 不冻结、可做进度）；
 * - WebM：MediaRecorder + canvas.captureStream(0) + track.requestFrame 逐帧推流。
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { runAlgorithm } from '../graph/algorithms'
import { computeTrail } from '../graph/algorithms/trail'
import { renderFrame } from './frame'
import type { SceneHighlight } from '../render/element-registry'
import type { DocState, GraphObject, Size, ViewTransform } from '../state/types'

export interface AnimationSource {
  algorithmId: string
  startId?: string
}

export interface AnimationFrame {
  highlight: SceneHighlight
  label: string
}

/** 生成算法演示帧序列（每步一帧；空步骤返回空数组） */
export function buildAlgorithmFrames(
  graph: GraphObject,
  source: AnimationSource,
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

export interface AnimationOptions {
  /** 帧率（2~12） */
  fps: number
  /** 渲染尺寸（CSS 像素；GIF 建议 ≤ 800 宽以控制体积） */
  size: Size
  format: 'gif' | 'webm'
}

const INFO_BAR_HEIGHT = 26

/** 逐帧渲染到共享画布（含底部信息条） */
function createFrameDrawer(
  ctx: CanvasRenderingContext2D,
  doc: DocState,
  view: ViewTransform,
  size: Size,
): (frame: AnimationFrame) => void {
  const { width, height } = size
  return (frame) => {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    renderFrame(ctx, doc, 'graph', view, size, {
      withGrid: false,
      highlight: frame.highlight,
    })
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
  const drawFrame = createFrameDrawer(ctx, doc, view, size)
  const delay = Math.max(50, Math.round(1000 / Math.max(1, options.fps)))

  if (options.format === 'gif') {
    return encodeGif(drawFrame, ctx, frames, size, delay)
  }
  return encodeWebm(drawFrame, canvas, frames, delay)
}
