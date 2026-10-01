/**
 * 切平面（v0.8）：z = f(x, y) 在 (x0, y0) 的切平面与偏导数。
 * 偏导函数由**符号求导**（v0.2 differentiate）编译而来——UI 全链路与符号求导一致。
 */
import type { Vec3 } from './types'

export interface TangentPlane {
  x0: number
  y0: number
  z0: number
  /** ∂f/∂x、∂f/∂y（切点处） */
  fx: number
  fy: number
  /** 单位法向（z 分量为正：(−fx, −fy, 1)/|·|） */
  normal: Vec3
  zAt(x: number, y: number): number
}

export function tangentPlaneAt(
  f: (x: number, y: number) => number,
  dfx: (x: number, y: number) => number,
  dfy: (x: number, y: number) => number,
  x0: number,
  y0: number,
): TangentPlane {
  const z0 = f(x0, y0)
  const fx = dfx(x0, y0)
  const fy = dfy(x0, y0)
  const norm = Math.hypot(fx, fy, 1) || 1
  return {
    x0,
    y0,
    z0,
    fx,
    fy,
    normal: [-fx / norm, -fy / norm, 1 / norm],
    zAt: (x, y) => z0 + fx * (x - x0) + fy * (y - y0),
  }
}

/** 由法向构造平面上的正交基（切平面四方块渲染用） */
export function planeBasis(normal: Vec3): { u: Vec3; v: Vec3 } {
  const [nx, ny, nz] = normal
  // 选一个与法向不平行的参考轴
  const ref: Vec3 = Math.abs(nz) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  let ux = ny * ref[2] - nz * ref[1]
  let uy = nz * ref[0] - nx * ref[2]
  let uz = nx * ref[1] - ny * ref[0]
  const un = Math.hypot(ux, uy, uz) || 1
  ux /= un
  uy /= un
  uz /= un
  const vx = ny * uz - nz * uy
  const vy = nz * ux - nx * uz
  const vz = nx * uy - ny * ux
  return { u: [ux, uy, uz], v: [vx, vy, vz] }
}
