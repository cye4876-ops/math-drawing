/**
 * 常微分方程数值积分（v0.8）：
 * - 一阶 y' = f(x, y)：欧拉 / 改进欧拉（Heun 二阶）/ 经典 RK4（四阶），同图对比；
 * - 方向场（斜率场）采样；
 * - 2D 自治系统相图轨线（RK4，dx/dt = fx, dy/dt = fy）；
 * - 洛伦兹吸引子轨迹（3D）。
 *
 * 局限：全部为**固定步长**（刚性方程需要自适应步长——见 docs/3d.md「已知限制」）。
 */
import type { Point2 } from '../state/types'

export type OdeMethod = 'euler' | 'improved' | 'rk4'

/** 欧拉法一步：y_{n+1} = y_n + h·f(x_n, y_n) */
export function eulerStep(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h: number,
): number {
  return y + h * f(x, y)
}

/** 改进欧拉（Heun 二阶）：预测-校正 */
export function improvedEulerStep(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h: number,
): number {
  const k1 = f(x, y)
  const predictor = y + h * k1
  const k2 = f(x + h, predictor)
  return y + (h / 2) * (k1 + k2)
}

/** 经典 RK4 一步 */
export function rk4Step(
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h: number,
): number {
  const k1 = f(x, y)
  const k2 = f(x + h / 2, y + (h / 2) * k1)
  const k3 = f(x + h / 2, y + (h / 2) * k2)
  const k4 = f(x + h, y + h * k3)
  return y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
}

/** 一步推进（按方法分发） */
export function odeStep(
  method: OdeMethod,
  f: (x: number, y: number) => number,
  x: number,
  y: number,
  h: number,
): number {
  switch (method) {
    case 'euler':
      return eulerStep(f, x, y, h)
    case 'improved':
      return improvedEulerStep(f, x, y, h)
    default:
      return rk4Step(f, x, y, h)
  }
}

/**
 * 固定步长积分 y' = f(x, y)，从 (x0, y0) 前进到 xEnd（步数 = steps，可正可负方向）。
 * 返回 steps+1 个点；f 返回非有限值的点终止（保留已有前缀）。
 */
export function integrateOde(
  f: (x: number, y: number) => number,
  options: { x0: number; y0: number; xEnd: number; steps: number; method: OdeMethod },
): Point2[] {
  const { x0, y0, xEnd, steps, method } = options
  const count = Math.max(1, Math.min(20_000, Math.round(steps)))
  const h = (xEnd - x0) / count
  const points: Point2[] = [{ x: x0, y: y0 }]
  let x = x0
  let y = y0
  for (let i = 0; i < count; i++) {
    y = odeStep(method, f, x, y, h)
    x = x0 + (i + 1) * h
    if (!Number.isFinite(y)) break
    points.push({ x, y })
  }
  return points
}

export interface DirectionFieldArrow {
  x: number
  y: number
  /** 单位方向（由斜率得出） */
  u: number
  v: number
  /** 斜率 dy/dx = f(x, y) */
  slope: number
}

/**
 * 方向场：在规则网格上采样 y' = f(x, y) 的斜率并给出单位方向箭头。
 * 非有限斜率（如除零、NaN）的格点跳过。
 */
export function directionField(
  f: (x: number, y: number) => number,
  options: { xMin: number; xMax: number; yMin: number; yMax: number; cols: number; rows: number },
): DirectionFieldArrow[] {
  const { xMin, xMax, yMin, yMax } = options
  const cols = Math.max(1, Math.min(200, Math.round(options.cols)))
  const rows = Math.max(1, Math.min(200, Math.round(options.rows)))
  const arrows: DirectionFieldArrow[] = []
  const dx = (xMax - xMin) / Math.max(1, cols - 1)
  const dy = (yMax - yMin) / Math.max(1, rows - 1)
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = xMin + i * dx
      const y = yMin + j * dy
      const slope = f(x, y)
      if (!Number.isFinite(slope)) continue
      const norm = Math.hypot(1, slope)
      arrows.push({ x, y, u: 1 / norm, v: slope / norm, slope })
    }
  }
  return arrows
}

/**
 * 二维自治系统 (x', y') = f(x, y) 的轨线（相图）：RK4 固定步长 dt 前进 steps 步。
 */
export function phaseTrajectory(
  f: (x: number, y: number) => [number, number],
  options: { x0: number; y0: number; dt: number; steps: number },
): Point2[] {
  const { x0, y0, dt, steps } = options
  const count = Math.max(1, Math.min(200_000, Math.round(steps)))
  const points: Point2[] = [{ x: x0, y: y0 }]
  let x = x0
  let y = y0
  const k1x = (px: number, py: number): [number, number] => f(px, py)
  for (let i = 0; i < count; i++) {
    const [a1, b1] = k1x(x, y)
    const [a2, b2] = k1x(x + (dt / 2) * a1, y + (dt / 2) * b1)
    const [a3, b3] = k1x(x + (dt / 2) * a2, y + (dt / 2) * b2)
    const [a4, b4] = k1x(x + dt * a3, y + dt * b3)
    x += (dt / 6) * (a1 + 2 * a2 + 2 * a3 + a4)
    y += (dt / 6) * (b1 + 2 * b2 + 2 * b3 + b4)
    if (!Number.isFinite(x) || !Number.isFinite(y)) break
    points.push({ x, y })
  }
  return points
}

export interface LorenzOptions {
  sigma?: number
  rho?: number
  beta?: number
  x0?: number
  y0?: number
  z0?: number
  dt?: number
  steps?: number
}

/**
 * 洛伦兹吸引子轨迹（RK4）：默认经典参数 σ=10, ρ=28, β=8/3。
 * 返回 [x, y, z] 点列。
 */
export function lorenzTrajectory(options: LorenzOptions = {}): [number, number, number][] {
  const sigma = options.sigma ?? 10
  const rho = options.rho ?? 28
  const beta = options.beta ?? 8 / 3
  const dt = options.dt ?? 0.005
  const steps = Math.max(1, Math.min(200_000, Math.round(options.steps ?? 4000)))
  let x = options.x0 ?? 0.1
  let y = options.y0 ?? 0
  let z = options.z0 ?? 0
  const points: [number, number, number][] = [[x, y, z]]
  const f = (px: number, py: number, pz: number): [number, number, number] => [
    sigma * (py - px),
    px * (rho - pz) - py,
    px * py - beta * pz,
  ]
  for (let i = 0; i < steps; i++) {
    const [k1x, k1y, k1z] = f(x, y, z)
    const [k2x, k2y, k2z] = f(x + (dt / 2) * k1x, y + (dt / 2) * k1y, z + (dt / 2) * k1z)
    const [k3x, k3y, k3z] = f(x + (dt / 2) * k2x, y + (dt / 2) * k2y, z + (dt / 2) * k2z)
    const [k4x, k4y, k4z] = f(x + dt * k3x, y + dt * k3y, z + dt * k3z)
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x)
    y += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y)
    z += (dt / 6) * (k1z + 2 * k2z + 2 * k3z + k4z)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) break
    points.push([x, y, z])
  }
  return points
}
