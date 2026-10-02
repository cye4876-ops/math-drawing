/**
 * 参数动画录制（v1.0）：按帧扫描环境参数值，把当前文档逐帧渲染并编码为 GIF。
 * - 参数注入走 v1.0 的「环境参数」机制（Notebook 变量同源）；
 * - 编码复用 gifenc（与 v0.6 动画导出、v0.8 旋转 GIF 同一方案）。
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { renderFrame } from '../export/frame'
import { timestampName } from '../export/download'
import { getAmbientParameters, setAmbientParameters } from '../render/curve-renderer'
import type { AppStore } from '../state/store'
import type { DocState, Size } from '../state/types'

export interface ParamAnimationOptions {
  parameter: string
  from: number
  to: number
  /** 帧数（2..120） */
  frames: number
  /** 帧率（1..30） */
  fps: number
  /** 渲染宽度（像素，320..1600）；高度按 16:10 推算 */
  width: number
}

export interface ParamAnimationResult {
  blob: Blob
  filename: string
  frameCount: number
}

/** 均匀采样参数值（含端点；frames ≥ 1；非有限输入做安全兜底） */
export function paramValues(from: number, to: number, frames: number): number[] {
  const safeFrames = Number.isFinite(frames) ? frames : 24
  const count = Math.max(1, Math.round(safeFrames))
  if (count === 1 || !Number.isFinite(from) || !Number.isFinite(to)) return [to]
  const values: number[] = []
  for (let k = 0; k < count; k++) values.push(from + ((to - from) * k) / (count - 1))
  return values
}

function inferMode(doc: DocState): 'plot' | 'graph' | 'stats' {
  if (doc.objects.some((object) => object.type === 'graph')) return 'graph'
  if (doc.objects.some((object) => object.type === 'dataset')) return 'stats'
  return 'plot'
}

/** 录制参数动画（同步；帧数大时可能耗时数百毫秒——UI 层以 busy 状态提示） */
export function recordParamAnimation(
  store: AppStore,
  options: ParamAnimationOptions,
): ParamAnimationResult {
  const doc = store.getDoc()
  const view = store.getView()
  const mode = inferMode(doc)
  const width = Math.max(320, Math.min(1600, Math.round(options.width)))
  const size: Size = { width, height: Math.round(width * 0.625) }
  const frames = paramValues(options.from, options.to, options.frames)
  const fps = Math.max(1, Math.min(30, Math.round(options.fps)))
  const delay = Math.max(30, Math.round(1000 / fps))

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建渲染画布（Canvas 2D 不可用）')

  const gif = GIFEncoder()
  const original = { ...getAmbientParameters() }
  try {
    for (const value of frames) {
      setAmbientParameters({ ...original, [options.parameter]: value })
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, size.width, size.height)
      renderFrame(context, doc, mode, view, size, { theme: 'light', withGrid: true })
      const imageData = context.getImageData(0, 0, size.width, size.height)
      const palette = quantize(imageData.data, 256)
      const index = applyPalette(imageData.data, palette)
      gif.writeFrame(index, size.width, size.height, { palette, delay })
    }
    gif.finish()
  } finally {
    setAmbientParameters(original)
  }
  const bytes = Uint8Array.from(gif.bytes()).buffer
  return {
    blob: new Blob([bytes], { type: 'image/gif' }),
    filename: timestampName('gif'),
    frameCount: frames.length,
  }
}
