/**
 * 色图（v0.8）：viridis / plasma / coolwarm / gray。
 * 每个色图以控制点（sRGB）定义，线性内插；用于曲面高度着色与散度/旋度着色。
 */

export type ColormapName = 'viridis' | 'plasma' | 'coolwarm' | 'gray'

export const COLORMAP_NAMES: readonly ColormapName[] = ['viridis', 'plasma', 'coolwarm', 'gray']

/** 控制点（#rrggbb），均匀分布于 [0, 1] */
const CONTROL_POINTS: Record<ColormapName, string[]> = {
  viridis: [
    '#440154',
    '#482878',
    '#3e4989',
    '#31688e',
    '#26828e',
    '#1f9e89',
    '#35b779',
    '#6ece58',
    '#b5de2b',
    '#fde725',
  ],
  plasma: [
    '#0d0887',
    '#46039f',
    '#7201a8',
    '#9c179e',
    '#bd3786',
    '#d8576b',
    '#ed7953',
    '#fb9f3a',
    '#fdca26',
    '#f0f921',
  ],
  coolwarm: ['#3b4cc0', '#7b9ff9', '#b8d0f0', '#dddddd', '#f0c9b2', '#e7745b', '#b40426'],
  gray: ['#ffffff', '#d9d9d9', '#a6a6a6', '#737373', '#404040', '#000000'],
}

const cache = new Map<ColormapName, [number, number, number][]>()

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255]
}

function controlRgb(name: ColormapName): [number, number, number][] {
  const cached = cache.get(name)
  if (cached) return cached
  const rgb = (CONTROL_POINTS[name] ?? CONTROL_POINTS.viridis).map(hexToRgb)
  cache.set(name, rgb)
  return rgb
}

/**
 * 采样色图：t ∈ [0, 1] → sRGB 三元组（0..1）。
 * 越界 t 会被夹取；NaN 按 0 处理。
 */
export function sampleColormap(name: ColormapName, t: number): [number, number, number] {
  const points = controlRgb(name)
  const clamped = Number.isNaN(t) ? 0 : Math.min(1, Math.max(0, t))
  const scaled = clamped * (points.length - 1)
  const index = Math.min(points.length - 2, Math.floor(scaled))
  const frac = scaled - index
  const a = points[index]!
  const b = points[index + 1]!
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac]
}

/** 相对亮度（检验色图单调性/顺序用） */
export function luminance(rgb: [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}
