/**
 * PNG 位图导出（v0.6）：
 * - 导出分辨率 = CSS 尺寸 × 倍数（1/2/4），与屏幕 devicePixelRatio 解耦——高分屏不模糊；
 * - 透明背景选项：透明时同时省略网格与坐标轴（适合叠加到其他素材上）；
 * - 范围三种：当前视窗 / 自动包含全部内容 / 指定数学区域。
 */
import { objectsOfMode, renderFrame, resolveView, type ExportRange } from './frame'
import type { DocState, Size, ViewTransform } from '../state/types'

export interface PngExportOptions {
  /** 分辨率倍数（1/2/4） */
  scale: number
  transparent: boolean
  range: ExportRange
  /** 不透明背景色（默认白） */
  background?: string
}

/** 离屏渲染 PNG 画布（尺寸单位为导出像素；绘制按 CSS 尺寸 + scale 变换） */
export function renderPngCanvas(
  doc: DocState,
  mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook' | 'matrix',
  baseView: ViewTransform,
  size: Size,
  options: PngExportOptions,
): HTMLCanvasElement {
  const width = Math.max(1, Math.round(size.width * options.scale))
  const height = Math.max(1, Math.round(size.height * options.scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建导出画布（Canvas 2D 不可用）')

  const objects = objectsOfMode(doc, mode)
  const view = resolveView(options.range, baseView, size, objects)
  if (!options.transparent) {
    ctx.fillStyle = options.background ?? '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.save()
  ctx.scale(options.scale, options.scale)
  renderFrame(ctx, doc, mode, view, size, { theme: 'light', withGrid: !options.transparent })
  ctx.restore()
  return canvas
}

/** 导出 PNG Blob（编码失败会 reject） */
export function exportPngBlob(
  doc: DocState,
  mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook' | 'matrix',
  baseView: ViewTransform,
  size: Size,
  options: PngExportOptions,
): Promise<Blob> {
  const canvas = renderPngCanvas(doc, mode, baseView, size, options)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 编码失败'))), 'image/png')
  })
}
