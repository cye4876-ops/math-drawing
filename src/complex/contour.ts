/**
 * 复围道积分（v0.9）：沿圆的 ∮ f(z) dz 数值积分（留数定理演示用）。
 * 参数化 z(t) = c + r·e^{it}，dz = i r e^{it} dt；梯形法求和。
 */
import { cAdd, cExp, cMul, cScale, type Complex } from './complex'
import type { ComplexFn } from './evaluate'

export interface CirclePath {
  center: Complex
  radius: number
}

export interface ContourResult {
  /** ∮ f dz 的数值 */
  value: Complex
  /** |∮| */
  magnitude: number
  /** 相位（弧度） */
  phase: number
}

export function contourIntegral(fn: ComplexFn, path: CirclePath, samples = 2000): ContourResult {
  const n = Math.max(64, Math.min(20_000, Math.round(samples)))
  const dt = (2 * Math.PI) / n
  let sum: Complex = { re: 0, im: 0 }
  for (let k = 0; k < n; k++) {
    const t = k * dt
    const e = cExp({ re: 0, im: t })
    const z = cAdd(path.center, cScale(e, path.radius))
    // dz/dt = i·r·e^{it} → dz = i·r·e^{it}·dt
    const dz = cScale(cMul({ re: 0, im: 1 }, e), path.radius * dt)
    const f = fn(z)
    if (!Number.isFinite(f.re) || !Number.isFinite(f.im)) continue
    sum = cAdd(sum, cMul(f, dz))
  }
  const magnitude = Math.hypot(sum.re, sum.im)
  return { value: sum, magnitude, phase: Math.atan2(sum.im, sum.re) }
}

/** 常用被积函数的理论留数参考：1/(z−z0) 的留数为 1 → ∮ = 2πi（z0 在圆内） */
export function expectedResidueIntegral(residue: number): Complex {
  return { re: 0, im: 2 * Math.PI * residue }
}
