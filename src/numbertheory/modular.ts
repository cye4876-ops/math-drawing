/**
 * 模运算图案（v0.9）：n×n 网格，格 (i, j) 按 i·j mod n、i^j mod n、gcd(i, j) 取值着色，
 * 直观展示模乘法的对称结构、幂次循环与互质模式。
 */
import { sampleColormap, type ColormapName } from '../render3d/colormaps'

export type ModularMode = 'product' | 'power' | 'gcd'

export const MODULAR_MODES: readonly ModularMode[] = ['product', 'power', 'gcd']

/** 行/列下标从 1 开始（i, j ∈ [1, n]），返回值域 [0, n] */
export function modularValue(i: number, j: number, n: number, mode: ModularMode): number {
  const size = Math.max(2, Math.floor(n))
  switch (mode) {
    case 'product':
      return (i * j) % size
    case 'power': {
      let result = 1
      let base = i % size
      let exp = j
      while (exp > 0) {
        if (exp & 1) result = (result * base) % size
        base = (base * base) % size
        exp >>= 1
      }
      return result
    }
    case 'gcd': {
      let a = i
      let b = j
      while (b !== 0) {
        const t = a % b
        a = b
        b = t
      }
      return a
    }
  }
}

/**
 * 渲染模运算图案为 RGBA。cell 为每格外放像素，默认 4；n 大时自动下限 1。
 */
export function renderModularPattern(
  n: number,
  mode: ModularMode,
  cell = 4,
  colormap: ColormapName = 'viridis',
): Uint8ClampedArray {
  const size = Math.max(2, Math.floor(n))
  const scale = Math.max(1, Math.min(16, Math.floor(cell)))
  const width = size * scale
  const data = new Uint8ClampedArray(width * width * 4)
  const max = mode === 'gcd' ? size : size - 1
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const value = modularValue(i + 1, j + 1, size, mode)
      const t = max === 0 ? 0 : value / max
      const rgb = sampleColormap(colormap, t)
      const r = Math.round(rgb[0] * 255)
      const g = Math.round(rgb[1] * 255)
      const b = Math.round(rgb[2] * 255)
      for (let dy = 0; dy < scale; dy++) {
        const y = j * scale + dy
        let offset = (y * width + i * scale) * 4
        for (let dx = 0; dx < scale; dx++) {
          data[offset] = r
          data[offset + 1] = g
          data[offset + 2] = b
          data[offset + 3] = 255
          offset += 4
        }
      }
    }
  }
  return data
}
