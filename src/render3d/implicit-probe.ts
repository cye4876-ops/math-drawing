/**
 * 隐式曲面空判定（v3.1.3）：在包围盒上采样 F，判断 F = 0 是否有解。
 *
 * Marching Cubes 只提取符号变化处的等值面；当 F 在整个范围内恒正/恒负（或恒非有限）时，
 * 场景里不会出现任何三角形——用户在界面上看到「添加成功但没有画面」。
 * 本模块用于对象面板给出明确警告与修正建议。
 */
import { compileExpr } from './compile'

export interface ImplicitBox {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  zMin: number
  zMax: number
}

export type ImplicitProbe =
  { status: 'ok' } | { status: 'empty'; min: number; max: number } | { status: 'invalid' }

/** 每轴采样段数（默认 24 → 25³ = 15625 次求值，毫秒量级） */
export function probeImplicitSurface(expr: string, box: ImplicitBox, samples = 24): ImplicitProbe {
  const f = compileExpr(expr, ['x', 'y', 'z'])
  if (!f) return { status: 'invalid' }
  const steps = Math.max(2, Math.round(samples))
  let min = Infinity
  let max = -Infinity
  let finite = 0
  for (let i = 0; i <= steps; i++) {
    const x = box.xMin + ((box.xMax - box.xMin) * i) / steps
    for (let j = 0; j <= steps; j++) {
      const y = box.yMin + ((box.yMax - box.yMin) * j) / steps
      for (let k = 0; k <= steps; k++) {
        const z = box.zMin + ((box.zMax - box.zMin) * k) / steps
        let value: number
        try {
          value = f(x, y, z)
        } catch {
          continue
        }
        if (!Number.isFinite(value)) continue
        finite++
        if (value < min) min = value
        if (value > max) max = value
      }
    }
  }
  if (finite === 0) return { status: 'invalid' }
  if (min > 0 || max < 0) return { status: 'empty', min, max }
  return { status: 'ok' }
}
