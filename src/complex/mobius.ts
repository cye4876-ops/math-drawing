/**
 * Möbius 变换（v0.9）：f(z) = (az + b)/(cz + d)。
 * 用于演示：圆/直线映射为圆/直线、保角性（正交网格像仍正交）。
 * 网格映射输出已按「跑远/未定义处断开」处理，可直接折线绘制。
 */
import type { Point2 } from '../state/types'
import { cAdd, cDiv, cMul, type Complex } from './complex'

export interface MobiusParams {
  a: Complex
  b: Complex
  c: Complex
  d: Complex
}

export function mobius(p: MobiusParams, z: Complex): Complex {
  return cDiv(cAdd(cMul(p.a, z), p.b), cAdd(cMul(p.c, z), p.d))
}

/** 参数预设（单位变换、反演、经典 (z−1)/(z+1) 等） */
export interface MobiusPreset {
  id: string
  label: string
  params: MobiusParams
}

export const MOBIUS_PRESETS: MobiusPreset[] = [
  {
    id: 'identity',
    label: '恒等 z',
    params: { a: { re: 1, im: 0 }, b: { re: 0, im: 0 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } },
  },
  {
    id: 'inversion',
    label: '反演 1/z',
    params: { a: { re: 0, im: 0 }, b: { re: 1, im: 0 }, c: { re: 1, im: 0 }, d: { re: 0, im: 0 } },
  },
  {
    id: 'cayley',
    label: '(z−1)/(z+1)（上半平面→单位圆盘）',
    params: {
      a: { re: 1, im: 0 },
      b: { re: -1, im: 0 },
      c: { re: 1, im: 0 },
      d: { re: 1, im: 0 },
    },
  },
  {
    id: 'rotation',
    label: '旋转 e^{iπ/4}·z',
    params: {
      a: { re: Math.SQRT1_2, im: Math.SQRT1_2 },
      b: { re: 0, im: 0 },
      c: { re: 0, im: 0 },
      d: { re: 1, im: 0 },
    },
  },
]

/** z 平面直角网格线（一组横线与竖线） */
export function gridPolylines(extent: number, step: number): Point2[][] {
  const lines: Point2[][] = []
  const count = Math.max(2, Math.round((extent * 2) / step))
  for (let i = 0; i <= count; i++) {
    const t = -extent + i * step
    const horizontal: Point2[] = []
    const vertical: Point2[] = []
    const detail = 40
    for (let k = 0; k <= detail; k++) {
      const s = -extent + (2 * extent * k) / detail
      horizontal.push({ x: s, y: t })
      vertical.push({ x: t, y: s })
    }
    lines.push(horizontal, vertical)
  }
  return lines
}

/** 映射后的网格：跑远/未定义处自动断开（每段为连续折线） */
export function mappedGrid(
  params: MobiusParams,
  extent: number,
  step: number,
  clip: number,
): Point2[][] {
  const result: Point2[][] = []
  const detail = 120
  const emit = (getPoint: (s: number) => Point2): void => {
    let current: Point2[] = []
    for (let k = 0; k <= detail; k++) {
      const s = -extent + (2 * extent * k) / detail
      const z = getPoint(s)
      const w = mobius(params, { re: z.x, im: z.y })
      const finite = Number.isFinite(w.re) && Number.isFinite(w.im)
      const wild = !finite || Math.hypot(w.re, w.im) > clip
      if (wild) {
        if (current.length > 1) result.push(current)
        current = []
        continue
      }
      current.push({ x: w.re, y: w.im })
    }
    if (current.length > 1) result.push(current)
  }
  const count = Math.max(2, Math.round((extent * 2) / step))
  for (let i = 0; i <= count; i++) {
    const t = -extent + i * step
    emit((s) => ({ x: s, y: t }))
    emit((s) => ({ x: t, y: s }))
  }
  return result
}

/**
 * 圆 → 像（演示「圆映射为圆/直线」）：对给定圆采样逐点映射，返回（可能断开的）折线。
 * 圆由圆心与半径（z 平面）给定。
 */
export function mappedCircle(
  params: MobiusParams,
  center: Complex,
  radius: number,
  clip = 1e4,
): Point2[][] {
  const result: Point2[][] = []
  let current: Point2[] = []
  const detail = 360
  for (let k = 0; k <= detail; k++) {
    const t = (2 * Math.PI * k) / detail
    const z = { re: center.re + radius * Math.cos(t), im: center.im + radius * Math.sin(t) }
    const w = mobius(params, z)
    const finite = Number.isFinite(w.re) && Number.isFinite(w.im)
    if (!finite || Math.hypot(w.re, w.im) > clip) {
      if (current.length > 1) result.push(current)
      current = []
      continue
    }
    current.push({ x: w.re, y: w.im })
  }
  if (current.length > 1) result.push(current)
  return result
}
