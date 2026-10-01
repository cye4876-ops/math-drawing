/**
 * 切平面测试（v0.8）——覆盖规格「关键正确性测试」：
 * 切平面偏导数与**符号求导**结果一致（误差 < 1e-6）；一阶相切（差 O(h²)）；法向单位长。
 */
import { describe, expect, it } from 'vitest'
import { compileDerivative, compileExpr } from './compile'
import { planeBasis, tangentPlaneAt } from './tangent'

describe('v0.8 切平面', () => {
  it('f = x²+y²：偏导与符号求导一致（2x, 2y，误差 < 1e-6）', () => {
    const f = compileExpr('x^2 + y^2', ['x', 'y'])!
    const dfx = compileDerivative('x^2 + y^2', 'x', ['x', 'y'])!
    const dfy = compileDerivative('x^2 + y^2', 'y', ['x', 'y'])!
    const plane = tangentPlaneAt(f, dfx, dfy, 1.5, -0.7)
    expect(Math.abs(plane.fx - 3.0)).toBeLessThan(1e-6)
    expect(Math.abs(plane.fy - -1.4)).toBeLessThan(1e-6)
    expect(plane.z0).toBeCloseTo(1.5 * 1.5 + 0.7 * 0.7, 12)
  })

  it('非线性函数 f = sin(x)·cos(y)：符号偏导与数值中心差分一致（1e-6）', () => {
    const f = compileExpr('sin(x)*cos(y)', ['x', 'y'])!
    const dfx = compileDerivative('sin(x)*cos(y)', 'x', ['x', 'y'])!
    const dfy = compileDerivative('sin(x)*cos(y)', 'y', ['x', 'y'])!
    const x0 = 0.8
    const y0 = -0.3
    const plane = tangentPlaneAt(f, dfx, dfy, x0, y0)
    const h = 1e-6
    const numericFx = (f(x0 + h, y0) - f(x0 - h, y0)) / (2 * h)
    const numericFy = (f(x0, y0 + h) - f(x0, y0 - h)) / (2 * h)
    expect(Math.abs(plane.fx - numericFx)).toBeLessThan(1e-6)
    expect(Math.abs(plane.fy - numericFy)).toBeLessThan(1e-6)
  })

  it('切点处平面与曲面重合', () => {
    const f = compileExpr('x^2 - y^2', ['x', 'y'])!
    const plane = tangentPlaneAt(
      f,
      compileDerivative('x^2 - y^2', 'x', ['x', 'y'])!,
      compileDerivative('x^2 - y^2', 'y', ['x', 'y'])!,
      0.4,
      1.2,
    )
    expect(Math.abs(plane.zAt(0.4, 1.2) - f(0.4, 1.2))).toBeLessThan(1e-12)
  })

  it('一阶相切：沿 x 偏移 h，误差 O(h²)（二次函数下 ≈ h² 精确）', () => {
    const f = compileExpr('x^2 + y^2', ['x', 'y'])!
    const plane = tangentPlaneAt(
      f,
      compileDerivative('x^2 + y^2', 'x', ['x', 'y'])!,
      compileDerivative('x^2 + y^2', 'y', ['x', 'y'])!,
      1,
      2,
    )
    const h = 1e-3
    const diff = plane.zAt(1 + h, 2) - f(1 + h, 2)
    expect(Math.abs(diff)).toBeLessThan(1e-5)
    // 抛物面上切平面在上方：差 = −h²（二次函数下精确）
    expect(Math.abs(-diff - h * h)).toBeLessThan(1e-9)
  })

  it('法向为单位向量且 z 分量为正', () => {
    const plane = tangentPlaneAt(
      (x, y) => x + y,
      () => 1,
      () => 1,
      0,
      0,
    )
    const [nx, ny, nz] = plane.normal
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 12)
    expect(nz).toBeGreaterThan(0)
    expect(nx).toBeCloseTo(-1 / Math.sqrt(3), 12)
  })

  it('planeBasis 正交且与法向垂直', () => {
    const { u, v } = planeBasis([-1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)])
    expect(Math.hypot(...u)).toBeCloseTo(1, 12)
    expect(Math.hypot(...v)).toBeCloseTo(1, 12)
    const dotUV = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
    expect(dotUV).toBeCloseTo(0, 12)
    // 与法向垂直
    const n = [-1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)]
    expect(u[0] * n[0]! + u[1] * n[1]! + u[2] * n[2]!).toBeCloseTo(0, 12)
    expect(v[0] * n[0]! + v[1] * n[1]! + v[2] * n[2]!).toBeCloseTo(0, 12)
  })
})
