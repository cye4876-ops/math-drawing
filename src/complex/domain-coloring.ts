/**
 * 复平面域着色（v0.9，Domain Coloring）：
 * - 相位（幅角）→ 色相；模长 → 明度条纹（等模环）；
 * - 两种色图：standard（平滑）/ highcontrast（粗环 + 相位细纹，零点/极点更醒目）；
 * - 网格线叠加：等相位线（每 15°）与等模线（|w| 每 2 倍）；
 * - 彩色输出为 RGBA（Uint8ClampedArray），可直接写入 ImageData。
 *
 * 特殊点约定：零点（|w| → 0）为**黑色**；极点/未定义（非有限）为**白色**（与外行直觉一致）。
 */
import type { Complex } from './complex'
import type { ComplexFn } from './evaluate'

export type DomainColormap = 'standard' | 'highcontrast'

export interface DomainColoringSpec {
  width: number
  height: number
  centerRe: number
  centerIm: number
  /** 每单位对应的像素数（缩放） */
  pixelsPerUnit: number
  colormap: DomainColormap
  /** 等相位网格线（每 15°） */
  phaseGrid: boolean
  /** 等模网格线（|w| 每倍频） */
  modulusGrid: boolean
}

/** HSV（h 0..1, s/v 0..1）→ RGB 0..255 */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      return [v * 255, t * 255, p * 255]
    case 1:
      return [q * 255, v * 255, p * 255]
    case 2:
      return [p * 255, v * 255, t * 255]
    case 3:
      return [p * 255, q * 255, v * 255]
    case 4:
      return [t * 255, p * 255, v * 255]
    default:
      return [v * 255, p * 255, q * 255]
  }
}

const HUE_LUT_SIZE = 2048
const STRIPE_LUT_SIZE = 4096
const PHASE_LUT_SIZE = 3072
let hueLutCache: Uint8ClampedArray | null = null
let stripeLutCache: Float64Array | null = null
let phaseLutCache: Float64Array | null = null

/** 色相 → 纯色（v = 1）查找表：hsvToRgb(h,1,v) = v × 查表值（逐通道线性） */
function hueLut(): Uint8ClampedArray {
  if (hueLutCache) return hueLutCache
  const lut = new Uint8ClampedArray(HUE_LUT_SIZE * 3)
  for (let i = 0; i < HUE_LUT_SIZE; i++) {
    const [r, g, b] = hsvToRgb(i / HUE_LUT_SIZE, 1, 1)
    lut[i * 3] = r
    lut[i * 3 + 1] = g
    lut[i * 3 + 2] = b
  }
  hueLutCache = lut
  return lut
}

/** |sin(π·x)| 的 x∈[0,2) 查找表（等模条纹） */
function stripeLut(): Float64Array {
  if (stripeLutCache) return stripeLutCache
  const lut = new Float64Array(STRIPE_LUT_SIZE)
  for (let i = 0; i < STRIPE_LUT_SIZE; i++) {
    lut[i] = Math.abs(Math.sin(Math.PI * ((i / STRIPE_LUT_SIZE) * 2)))
  }
  stripeLutCache = lut
  return lut
}

/** |sin(12φ)| 在 φ∈[0,2π) 上的查找表（等相位网格线） */
function phaseLut(): Float64Array {
  if (phaseLutCache) return phaseLutCache
  const lut = new Float64Array(PHASE_LUT_SIZE)
  for (let i = 0; i < PHASE_LUT_SIZE; i++) {
    lut[i] = Math.abs(Math.sin(12 * ((i / PHASE_LUT_SIZE) * 2 * Math.PI)))
  }
  phaseLutCache = lut
  return lut
}

/**
 * 渲染域着色像素（RGBA）。热点函数（多项式/有理函数）可全分辨率实时；
 * 重函数（Γ/ζ）建议低分辨率预览（见 docs/complex.md）。
 *
 * 性能（v0.9 规格：1024×1024 < 100ms）：色相走 2048 项 LUT、模长用平方根、
 * 网格线仅在开启时计算；standard 色图无额外超越函数。
 */
export function renderDomainColoring(fn: ComplexFn, spec: DomainColoringSpec): Uint8ClampedArray {
  const { width, height, centerRe, centerIm, pixelsPerUnit } = spec
  const data = new Uint8ClampedArray(width * height * 4)
  const lut = hueLut()
  const stripesLut = stripeLut()
  const gridLut = phaseLut()
  const halfW = width / 2
  const halfH = height / 2
  const phaseGrid = spec.phaseGrid
  const modulusGrid = spec.modulusGrid
  const highContrast = spec.colormap === 'highcontrast'
  const INV_TWO_PI = 1 / (2 * Math.PI)
  const step = 1 / pixelsPerUnit
  const startRe = centerRe - halfW * step
  const startIm = centerIm + halfH * step
  let offset = 0
  for (let y = 0; y < height; y++) {
    const zIm = startIm - y * step
    for (let x = 0; x < width; x++) {
      const zRe = startRe + x * step
      const w = fn({ re: zRe, im: zIm } as Complex)
      const wRe = w.re
      const wIm = w.im
      // 快速有限性检查（避免 Math.isfinite 调用）
      if (!(wRe >= -1e308 && wRe <= 1e308) || !(wIm >= -1e308 && wIm <= 1e308)) {
        // 极点/未定义：白色
        data[offset] = 245
        data[offset + 1] = 245
        data[offset + 2] = 250
        data[offset + 3] = 255
        offset += 4
        continue
      }
      const modulusSquared = wRe * wRe + wIm * wIm
      if (modulusSquared < 1e-24) {
        // 零点：黑色
        data[offset] = 8
        data[offset + 1] = 8
        data[offset + 2] = 12
        data[offset + 3] = 255
        offset += 4
        continue
      }
      const phase = Math.atan2(wIm, wRe)
      // log2 |w| = 0.5·log2(|w|²)：省一次开方
      const logModulus = 0.5 * Math.log2(modulusSquared)
      // |sin(π·log2|w|)|：周期 2 的条纹（查表）
      const half = logModulus * 0.5
      const wrapped = (half - Math.floor(half)) * 2
      const stripes = stripesLut[(wrapped * (STRIPE_LUT_SIZE / 2)) | 0]!
      let value: number
      if (highContrast) {
        value = 0.3 + 0.7 * (1 - stripes)
        value *= 1 - 0.22 * Math.abs(Math.sin(phase * 6))
      } else {
        value = 1 - 0.38 * stripes
      }
      if (phaseGrid) {
        let gridIndex = ((phase + Math.PI) * INV_TWO_PI * PHASE_LUT_SIZE) | 0
        if (gridIndex >= PHASE_LUT_SIZE) gridIndex = PHASE_LUT_SIZE - 1
        const distance = gridLut[gridIndex]!
        if (distance < 0.09) value *= 0.35 + 0.65 * (distance / 0.09)
      }
      if (modulusGrid) {
        const ghost = Math.abs(logModulus - Math.floor(logModulus + 0.5))
        if (ghost < 0.04) value *= 0.4 + 0.6 * (ghost / 0.04)
      }
      let hue = phase * INV_TWO_PI + 0.5
      hue -= Math.floor(hue)
      let scaled = value
      if (scaled > 1) scaled = 1
      else if (scaled < 0) scaled = 0
      const color = ((hue * HUE_LUT_SIZE) | 0) * 3
      // Uint8ClampedArray 赋值自动取整/夹取
      data[offset] = lut[color]! * scaled
      data[offset + 1] = lut[color + 1]! * scaled
      data[offset + 2] = lut[color + 2]! * scaled
      data[offset + 3] = 255
      offset += 4
    }
  }
  return data
}
