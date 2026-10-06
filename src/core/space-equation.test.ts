/**
 * v3.1.1 3D 自定义方程解析测试：曲面 / 空间曲线的识别与错误反馈。
 */
import { describe, expect, it } from 'vitest'
import { parseSpaceEquation } from './space-equation'

describe('v3.1.1 3D 自定义方程解析', () => {
  it('显式曲面：z = f(x, y) 与不含 z 的无等号表达式', () => {
    const a = parseSpaceEquation('z = x^2 + y^2')
    expect(a.ok && a.target === 'surface').toBe(true)
    if (a.ok && a.target === 'surface') {
      expect(a.fields.kind).toBe('explicit')
      expect(a.fields.expr).toBe('x^2 + y^2')
      expect(a.fields.name).toBe('z = x^2 + y^2')
    }
    const b = parseSpaceEquation('sin(x)*cos(y)')
    expect(b.ok && b.target === 'surface' && b.fields.kind === 'explicit').toBe(true)
  })

  it('隐式曲面：含 z 的等式归一为 F = 左 − 右；含 z 的无等号原样', () => {
    const a = parseSpaceEquation('x^2 + y^2 + z^2 = 1')
    expect(a.ok && a.target === 'surface').toBe(true)
    if (a.ok && a.target === 'surface') {
      expect(a.fields.kind).toBe('implicit')
      expect(a.fields.expr).toBe('(x^2 + y^2 + z^2) - (1)')
      expect(a.fields.xMin).toBe(-5)
      expect(a.fields.resolution).toBe(48)
    }
    const b = parseSpaceEquation('x^2 + y^2 + z^2 - 1')
    expect(b.ok && b.target === 'surface' && b.fields.kind === 'implicit').toBe(true)
    if (b.ok && b.target === 'surface') expect(b.fields.expr).toBe('x^2 + y^2 + z^2 - 1')
  })

  it('旋转体：r = f(x)', () => {
    const r = parseSpaceEquation('r = 1 + cos(x)')
    expect(r.ok && r.target === 'surface' && r.fields.kind === 'revolve').toBe(true)
    if (r.ok && r.target === 'surface') expect(r.fields.expr).toBe('1 + cos(x)')
  })

  it('参数曲面：三段分号且使用 u、v（含中文分号）', () => {
    const r = parseSpaceEquation('x = sin(u)*cos(v)；y = sin(u)*sin(v); z = cos(u)')
    expect(r.ok && r.target === 'surface' && r.fields.kind === 'parametric').toBe(true)
    if (r.ok && r.target === 'surface') {
      expect(r.fields.expr2).toBe('sin(u)*sin(v)')
      expect(r.fields.xMax).toBeCloseTo(Math.PI * 2)
    }
  })

  it('空间曲线：三段用 t；两段时 z = 0', () => {
    const a = parseSpaceEquation('x = cos(t); y = sin(t); z = t/5')
    expect(a.ok && a.target === 'curve').toBe(true)
    if (a.ok && a.target === 'curve') {
      expect(a.fields.kind).toBe('parametric')
      expect(a.fields.expr3).toBe('t/5')
      expect(a.fields.steps).toBe(400)
    }
    const b = parseSpaceEquation('x = cos(t); y = sin(t)')
    expect(b.ok && b.target === 'curve').toBe(true)
    if (b.ok && b.target === 'curve') expect(b.fields.expr3).toBe('0')
  })

  it('错误：空输入、多个等号、段名不符、段数不符、语法错误', () => {
    expect(parseSpaceEquation('').ok).toBe(false)
    expect(parseSpaceEquation('x = 1 = 2').ok).toBe(false)
    expect(parseSpaceEquation('a = 1; b = 2').ok).toBe(false)
    expect(parseSpaceEquation('x = t; y = t; z = t; w = t').ok).toBe(false)
    expect(parseSpaceEquation('z = sin(').ok).toBe(false)
  })
})
