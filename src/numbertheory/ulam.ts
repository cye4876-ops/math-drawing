/**
 * Ulam 螺旋与 Sacks 螺旋（v0.9）。
 * - Ulam：自然数按方螺旋排布，质数形成对角线图案；
 * - Sacks：k 置于 (√k·cos 2π√k, √k·sin 2π√k)，约数个数形成螺线簇。
 */
import { sampleColormap } from '../render3d/colormaps'
import { divisorCount, sievePrimes } from './primes'

export interface GridCoord {
  x: number
  y: number
}

/**
 * Ulam 螺旋坐标（经典版：1 居中，2 在右，逆时针）。
 * 环 k 起始于 (k, −(k+1)) 处、值 (2k−1)²+1。
 */
export function spiralCoord(n: number): GridCoord {
  if (n <= 1) return { x: 0, y: 0 }
  const k = Math.ceil((Math.sqrt(n) - 1) / 2)
  let v = (2 * k - 1) ** 2
  let x = k
  let y = 1 - k
  v += 1
  if (n === v) return { x, y }
  const up = Math.min(2 * k - 1, n - v)
  y += up
  v += up
  if (n === v) return { x, y }
  const left = Math.min(2 * k, n - v)
  x -= left
  v += left
  if (n === v) return { x, y }
  const down = Math.min(2 * k, n - v)
  y -= down
  v += down
  if (n === v) return { x, y }
  x += n - v
  return { x, y }
}

/**
 * 渲染 Ulam 螺旋为 RGBA：质数金色、合数深蓝、1 红色。
 * 返回尺寸为 (size·cell)² 的像素数据。
 */
export function renderUlam(size: number, cell = 1): Uint8ClampedArray {
  const side = Math.max(1, Math.floor(size))
  const scale = Math.max(1, Math.floor(cell))
  const width = side * scale
  const data = new Uint8ClampedArray(width * width * 4)
  // 背景
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 10
    data[i + 1] = 14
    data[i + 2] = 26
    data[i + 3] = 255
  }
  const half = Math.floor(side / 2)
  const marks = sievePrimes(side * side)
  const paint = (gx: number, gy: number, r: number, g: number, b: number): void => {
    const px = gx + half
    const py = half - gy
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const x = px * scale + dx
        const y = py * scale + dy
        if (x < 0 || y < 0 || x >= width || y >= width) continue
        const offset = (y * width + x) * 4
        data[offset] = r
        data[offset + 1] = g
        data[offset + 2] = b
      }
    }
  }
  for (let n = 1; n <= side * side; n++) {
    const { x, y } = spiralCoord(n)
    if (n === 1) {
      paint(x, y, 230, 70, 70)
    } else if (marks[n] === 1) {
      paint(x, y, 250, 205, 90)
    } else {
      paint(x, y, 40, 62, 120)
    }
  }
  return data
}

/**
 * 渲染 Sacks 螺旋为 RGBA：点颜色按约数个数取 viridis 色图。
 * count 为数字个数；返回 width×height（默认 512×512）像素数据。
 */
export function renderSacks(count: number, width = 512, height = 512): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  // 背景
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 8
    data[i + 1] = 8
    data[i + 2] = 12
    data[i + 3] = 255
  }
  const total = Math.max(1, Math.floor(count))
  const rMax = Math.sqrt(total)
  const scale = Math.min(width, height) / 2 / (rMax + 1)
  const cx = width / 2
  const cy = height / 2
  // 约数个数的典型上界（>20 罕见），映射到 [0,1]
  const dMax = 24
  for (let k = 1; k <= total; k++) {
    const r = Math.sqrt(k) * scale
    const theta = 2 * Math.PI * Math.sqrt(k)
    const x = Math.round(cx + r * Math.cos(theta))
    const y = Math.round(cy + r * Math.sin(theta))
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const t = Math.min(1, divisorCount(k) / dMax)
    const rgb = sampleColormap('viridis', t)
    const offset = (y * width + x) * 4
    data[offset] = Math.min(255, Math.round(70 + rgb[0] * 185))
    data[offset + 1] = Math.min(255, Math.round(70 + rgb[1] * 185))
    data[offset + 2] = Math.min(255, Math.round(70 + rgb[2] * 185))
  }
  return data
}
