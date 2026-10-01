/**
 * 分形（v0.9）：Mandelbrot / Julia 逃逸时间算法（平滑着色），渐进渲染由 UI 层驱动。
 */
import { sampleColormap, type ColormapName } from '../render3d/colormaps'

export interface FractalView {
  centerRe: number
  centerIm: number
  /** 视窗宽度（复平面单位） */
  span: number
  maxIter: number
}

export const DEFAULT_MANDELBROT_VIEW: FractalView = {
  centerRe: -0.6,
  centerIm: 0,
  span: 3.2,
  maxIter: 200,
}

/**
 * 平滑逃逸迭代数：逃逸则返回浮点迭代数（含 log2(log|z|) 平滑项），
 * 未逃逸返回 maxIter。
 */
export function mandelbrotEscape(cRe: number, cIm: number, maxIter: number): number {
  let zRe = 0
  let zIm = 0
  for (let i = 0; i < maxIter; i++) {
    const zRe2 = zRe * zRe
    const zIm2 = zIm * zIm
    if (zRe2 + zIm2 > 4) {
      const log2 = Math.log2(zRe2 + zIm2) / 2
      return i + 1 - Math.log2(log2 < 1e-12 ? 1e-12 : log2)
    }
    zIm = 2 * zRe * zIm + cIm
    zRe = zRe2 - zIm2 + cRe
  }
  return maxIter
}

/** Julia 集逃逸迭代（z 初值为参数，c 固定） */
export function juliaEscape(
  zRe0: number,
  zIm0: number,
  cRe: number,
  cIm: number,
  maxIter: number,
): number {
  let zRe = zRe0
  let zIm = zIm0
  for (let i = 0; i < maxIter; i++) {
    const zRe2 = zRe * zRe
    const zIm2 = zIm * zIm
    if (zRe2 + zIm2 > 4) {
      const log2 = Math.log2(zRe2 + zIm2) / 2
      return i + 1 - Math.log2(log2 < 1e-12 ? 1e-12 : log2)
    }
    zIm = 2 * zRe * zIm + cIm
    zRe = zRe2 - zIm2 + cRe
  }
  return maxIter
}

/**
 * 渲染迭代值矩阵（每像素一个浮点数）。view 视窗纵横比按 width/height 自适应。
 */
export function renderFractal(
  view: FractalView,
  width: number,
  height: number,
  kind: 'mandelbrot' | 'julia' = 'mandelbrot',
  juliaC?: { re: number; im: number },
): Float64Array {
  const iters = new Float64Array(width * height)
  const spanRe = view.span
  const spanIm = (view.span * height) / width
  const minRe = view.centerRe - spanRe / 2
  const maxIm = view.centerIm + spanIm / 2
  const stepRe = spanRe / width
  const stepIm = spanIm / height
  for (let y = 0; y < height; y++) {
    const im = maxIm - y * stepIm
    for (let x = 0; x < width; x++) {
      const re = minRe + x * stepRe
      iters[y * width + x] =
        kind === 'mandelbrot'
          ? mandelbrotEscape(re, im, view.maxIter)
          : juliaEscape(re, im, juliaC?.re ?? -0.8, juliaC?.im ?? 0.156, view.maxIter)
    }
  }
  return iters
}

/** 将迭代值矩阵着色为 RGBA（集内黑色，集外按色图循环） */
export function colorizeFractal(
  iters: Float64Array,
  maxIter: number,
  colormap: ColormapName = 'viridis',
  cycle = 24,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(iters.length * 4)
  for (let i = 0; i < iters.length; i++) {
    const value = iters[i]!
    const offset = i * 4
    if (value >= maxIter) {
      data[offset] = 6
      data[offset + 1] = 6
      data[offset + 2] = 10
      data[offset + 3] = 255
      continue
    }
    const t = (value % cycle) / cycle
    const rgb = sampleColormap(colormap, t)
    data[offset] = Math.round(rgb[0] * 255)
    data[offset + 1] = Math.round(rgb[1] * 255)
    data[offset + 2] = Math.round(rgb[2] * 255)
    data[offset + 3] = 255
  }
  return data
}
