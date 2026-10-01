/**
 * 向量场（v0.8）：箭头场采样（2D/3D）、流线积分（RK4）、散度与旋度（中心差分）。
 * 场由表达式编译后的函数提供；散度/旋度数值误差 O(h²)，h 自适应于坐标量级。
 */
import type { Point2 } from '../state/types'
import type { Vec3 } from './types'

export interface FieldArrow2D {
  x: number
  y: number
  /** 原始向量 */
  u: number
  v: number
  /** 模长（非有限值已跳过） */
  magnitude: number
}

/** 2D 箭头场：规则网格采样；非有限向量的格点跳过 */
export function arrowField2D(
  f: (x: number, y: number) => [number, number],
  options: { xMin: number; xMax: number; yMin: number; yMax: number; cols: number; rows: number },
): FieldArrow2D[] {
  const cols = Math.max(1, Math.min(200, Math.round(options.cols)))
  const rows = Math.max(1, Math.min(200, Math.round(options.rows)))
  const arrows: FieldArrow2D[] = []
  const dx = (options.xMax - options.xMin) / Math.max(1, cols - 1)
  const dy = (options.yMax - options.yMin) / Math.max(1, rows - 1)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = options.xMin + i * dx
      const y = options.yMin + j * dy
      const [u, v] = f(x, y)
      if (!Number.isFinite(u) || !Number.isFinite(v)) continue
      arrows.push({ x, y, u, v, magnitude: Math.hypot(u, v) })
    }
  }
  return arrows
}

export interface FieldArrow3D {
  position: Vec3
  direction: Vec3
  magnitude: number
}

/** 3D 箭头场：divisions³ 规则网格采样 */
export function arrowField3D(
  f: (x: number, y: number, z: number) => [number, number, number],
  options: {
    min: Vec3
    max: Vec3
    divisions: number
  },
): FieldArrow3D[] {
  const divisions = Math.max(1, Math.min(24, Math.round(options.divisions)))
  const arrows: FieldArrow3D[] = []
  const step: Vec3 = [
    (options.max[0] - options.min[0]) / Math.max(1, divisions - 1),
    (options.max[1] - options.min[1]) / Math.max(1, divisions - 1),
    (options.max[2] - options.min[2]) / Math.max(1, divisions - 1),
  ]
  for (let k = 0; k < divisions; k++) {
    for (let j = 0; j < divisions; j++) {
      for (let i = 0; i < divisions; i++) {
        const x = options.min[0] + i * step[0]
        const y = options.min[1] + j * step[1]
        const z = options.min[2] + k * step[2]
        const [u, v, w] = f(x, y, z)
        if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(w)) continue
        arrows.push({ position: [x, y, z], direction: [u, v, w], magnitude: Math.hypot(u, v, w) })
      }
    }
  }
  return arrows
}

/**
 * 2D 流线（RK4 固定步长）。options.both 时同时向负方向积分（相图轨线用），
 * 返回「负向段反向 + 起点 + 正向段」的连续折线。
 */
export function streamline2D(
  f: (x: number, y: number) => [number, number],
  start: [number, number],
  options: { dt: number; steps: number; both?: boolean },
): Point2[] {
  const steps = Math.max(1, Math.min(100_000, Math.round(options.steps)))
  const integrate = (sign: 1 | -1): Point2[] => {
    const points: Point2[] = []
    let x = start[0]
    let y = start[1]
    for (let i = 0; i < steps; i++) {
      const [a1, b1] = f(x, y)
      const [a2, b2] = f(x + (sign * options.dt * a1) / 2, y + (sign * options.dt * b1) / 2)
      const [a3, b3] = f(x + (sign * options.dt * a2) / 2, y + (sign * options.dt * b2) / 2)
      const [a4, b4] = f(x + sign * options.dt * a3, y + sign * options.dt * b3)
      x += (sign * options.dt * (a1 + 2 * a2 + 2 * a3 + a4)) / 6
      y += (sign * options.dt * (b1 + 2 * b2 + 2 * b3 + b4)) / 6
      if (!Number.isFinite(x) || !Number.isFinite(y)) break
      points.push({ x, y })
    }
    return points
  }
  const forward = integrate(1)
  if (!options.both) return [{ x: start[0], y: start[1] }, ...forward]
  const backward = integrate(-1)
  backward.reverse()
  return [...backward, { x: start[0], y: start[1] }, ...forward]
}

/** 3D 流线（RK4 固定步长） */
export function streamline3D(
  f: (x: number, y: number, z: number) => [number, number, number],
  start: Vec3,
  options: { dt: number; steps: number },
): Vec3[] {
  const steps = Math.max(1, Math.min(100_000, Math.round(options.steps)))
  const points: Vec3[] = [start]
  let [x, y, z] = start
  const h = options.dt
  for (let i = 0; i < steps; i++) {
    const [a1, b1, c1] = f(x, y, z)
    const [a2, b2, c2] = f(x + (h * a1) / 2, y + (h * b1) / 2, z + (h * c1) / 2)
    const [a3, b3, c3] = f(x + (h * a2) / 2, y + (h * b2) / 2, z + (h * c2) / 2)
    const [a4, b4, c4] = f(x + h * a3, y + h * b3, z + h * c3)
    x += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4)
    y += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4)
    z += (h / 6) * (c1 + 2 * c2 + 2 * c3 + c4)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) break
    points.push([x, y, z])
  }
  return points
}

/** 中心差分步长（自适应坐标量级） */
function diffStep(...coordinates: number[]): number {
  let scale = 1
  for (const value of coordinates) scale = Math.max(scale, Math.abs(value))
  return 1e-6 * scale
}

/** 2D 散度 ∇·F = ∂u/∂x + ∂v/∂y（中心差分） */
export function divergence2D(
  f: (x: number, y: number) => [number, number],
  x: number,
  y: number,
): number {
  const h = diffStep(x, y)
  const ux = (f(x + h, y)[0] - f(x - h, y)[0]) / (2 * h)
  const vy = (f(x, y + h)[1] - f(x, y - h)[1]) / (2 * h)
  return ux + vy
}

/** 2D 旋度（z 分量）∂v/∂x − ∂u/∂y */
export function curl2D(
  f: (x: number, y: number) => [number, number],
  x: number,
  y: number,
): number {
  const h = diffStep(x, y)
  const vx = (f(x + h, y)[1] - f(x - h, y)[1]) / (2 * h)
  const uy = (f(x, y + h)[0] - f(x, y - h)[0]) / (2 * h)
  return vx - uy
}

/** 3D 散度 ∇·F */
export function divergence3D(
  f: (x: number, y: number, z: number) => [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  const h = diffStep(x, y, z)
  const ux = (f(x + h, y, z)[0] - f(x - h, y, z)[0]) / (2 * h)
  const vy = (f(x, y + h, z)[1] - f(x, y - h, z)[1]) / (2 * h)
  const wz = (f(x, y, z + h)[2] - f(x, y, z - h)[2]) / (2 * h)
  return ux + vy + wz
}

/** 3D 旋度 ∇×F */
export function curl3D(
  f: (x: number, y: number, z: number) => [number, number, number],
  x: number,
  y: number,
  z: number,
): Vec3 {
  const h = diffStep(x, y, z)
  const wzY = (f(x, y + h, z)[2] - f(x, y - h, z)[2]) / (2 * h)
  const vyZ = (f(x, y, z + h)[1] - f(x, y, z - h)[1]) / (2 * h)
  const uxZ = (f(x, y, z + h)[0] - f(x, y, z - h)[0]) / (2 * h)
  const wzX = (f(x + h, y, z)[2] - f(x - h, y, z)[2]) / (2 * h)
  const vyX = (f(x + h, y, z)[1] - f(x - h, y, z)[1]) / (2 * h)
  const uxY = (f(x, y + h, z)[0] - f(x, y - h, z)[0]) / (2 * h)
  return [wzY - vyZ, uxZ - wzX, vyX - uxY]
}
