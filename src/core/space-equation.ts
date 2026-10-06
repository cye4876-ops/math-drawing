/**
 * 3D 自定义方程解析（v3.1.1）：把输入的方程归一化为 3D 对象（曲面 / 空间曲线）。
 *
 * 支持的写法：
 * - `z = f(x, y)` 或直接 `f(x, y)`（不含 z 的表达式）→ 显式曲面；
 * - `F(x, y, z) = 0`（任意含 z 的等式/表达式）→ 隐式曲面（Marching Cubes）；
 * - `x = f(u, v); y = g(u, v); z = h(u, v)` → 参数曲面（u、v ∈ [0, 2π]）；
 * - `x = f(t); y = g(t); z = h(t)` → 空间曲线（t ∈ [0, 2π]；只写两段时 z = 0）；
 * - `r = f(x)` → 旋转体（母线绕 x 轴，x ∈ [−π, π]）。
 */
import type { Curve3D, Surface3D } from '../state/types'
import { expressionError, hasVariable, normalizeEquationText } from './equation-utils'

type SurfaceFields = Partial<Omit<Surface3D, 'id' | 'type'>>
type CurveFields = Partial<Omit<Curve3D, 'id' | 'type'>>

export type SpaceEquationResult =
  | { ok: true; target: 'surface'; fields: SurfaceFields; note: string }
  | { ok: true; target: 'curve'; fields: CurveFields; note: string }
  | { ok: false; error: string }

/** 隐式曲面的默认包围盒与分辨率（Marching Cubes 成本） */
const IMPLICIT_BOX = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, zMin: -5, zMax: 5, resolution: 48 }

export function parseSpaceEquation(input: string): SpaceEquationResult {
  const raw = normalizeEquationText(input)
  if (!raw) return { ok: false, error: '请输入方程' }

  // —— 分号分隔的参数写法：x = …; y = …(; z = …) ——
  if (raw.includes(';')) {
    const parts = raw
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
    const readPart = (name: string): string | null => {
      const part = parts.find((item) => new RegExp(`^${name}\\s*=`, 'i').test(item))
      return part ? part.replace(new RegExp(`^${name}\\s*=\\s*`, 'i'), '').trim() : null
    }
    const x = readPart('x')
    const y = readPart('y')
    const z = readPart('z')
    if (
      (parts.length !== 2 && parts.length !== 3) ||
      x === null ||
      y === null ||
      (parts.length === 3 && z === null)
    ) {
      return { ok: false, error: '参数写法：x = f(t); y = g(t); z = h(t)（两段时 z = 0）' }
    }
    const forCheck: [string, string | null][] = [
      ['x', x],
      ['y', y],
      ['z', z],
    ]
    for (const [label, expr] of forCheck) {
      if (expr === null) continue
      const error = expressionError(expr, `${label} 分量`)
      if (error) return { ok: false, error }
    }
    const usesUv = [x, y, z ?? ''].some((expr) => hasVariable(expr, 'u') || hasVariable(expr, 'v'))
    if (usesUv && z !== null) {
      return {
        ok: true,
        target: 'surface',
        fields: {
          kind: 'parametric',
          expr: x,
          expr2: y,
          expr3: z,
          name: raw,
          xMin: 0,
          xMax: Math.PI * 2,
          yMin: 0,
          yMax: Math.PI * 2,
        },
        note: '识别为参数曲面 (u, v)；参数域 u、v ∈ [0, 2π] 可在对象面板调整',
      }
    }
    return {
      ok: true,
      target: 'curve',
      fields: {
        kind: 'parametric',
        expr: x,
        expr2: y,
        expr3: z ?? '0',
        name: raw,
        tMin: 0,
        tMax: Math.PI * 2,
        steps: 400,
      },
      note: z !== null ? '识别为空间曲线 (t)；t ∈ [0, 2π]' : '识别为空间曲线（z = 0，t ∈ [0, 2π]）',
    }
  }

  const segments = raw.split('=')
  if (segments.length > 2) return { ok: false, error: '一个方程最多包含一个等号' }

  if (segments.length === 2) {
    const lhs = (segments[0] ?? '').trim()
    const rhs = (segments[1] ?? '').trim()
    if (!lhs || !rhs) return { ok: false, error: '等号两侧都要有内容' }

    // 显式曲面：z = f(x, y)（另一侧不含 z）
    if (lhs === 'z' && !hasVariable(rhs, 'z')) {
      const error = expressionError(rhs, 'f(x, y)')
      if (error) return { ok: false, error }
      return {
        ok: true,
        target: 'surface',
        fields: { kind: 'explicit', expr: rhs, name: raw },
        note: '识别为显式曲面 z = f(x, y)',
      }
    }

    // 旋转体：r = f(x)
    if (lhs === 'r' && !hasVariable(rhs, 'r')) {
      const error = expressionError(rhs, 'r(x)')
      if (error) return { ok: false, error }
      return {
        ok: true,
        target: 'surface',
        fields: {
          kind: 'revolve',
          expr: rhs,
          name: raw,
          xMin: -Math.PI,
          xMax: Math.PI,
          resolution: 72,
        },
        note: '识别为旋转体 r(x)（母线绕 x 轴，x ∈ [−π, π]）',
      }
    }

    // 其余等式：隐式曲面 F = 左 − 右
    const expr = `(${lhs}) - (${rhs})`
    const error = expressionError(expr, 'F(x, y, z)')
    if (error) return { ok: false, error }
    return {
      ok: true,
      target: 'surface',
      fields: { kind: 'implicit', expr, name: raw, ...IMPLICIT_BOX },
      note: '识别为隐式曲面 F(x, y, z) = 0（F = 左 − 右）',
    }
  }

  // —— 无等号 ——
  if (hasVariable(raw, 'z')) {
    const error = expressionError(raw, 'F(x, y, z)')
    if (error) return { ok: false, error }
    return {
      ok: true,
      target: 'surface',
      fields: { kind: 'implicit', expr: raw, name: raw, ...IMPLICIT_BOX },
      note: '含 z 且无等号：按隐式曲面 F(x, y, z) = 0 处理',
    }
  }
  const error = expressionError(raw, 'f(x, y)')
  if (error) return { ok: false, error }
  return {
    ok: true,
    target: 'surface',
    fields: { kind: 'explicit', expr: raw, name: raw },
    note: '识别为显式曲面 z = f(x, y)',
  }
}
