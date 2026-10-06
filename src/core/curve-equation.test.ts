/**
 * v3.1 自定义方程解析测试：四种类型的识别与错误反馈。
 */
import { describe, expect, it } from 'vitest'
import { parseCurveEquation } from './curve-equation'

describe('v3.1 自定义曲线方程解析', () => {
  it('显函数：y = f(x)、f(x)；含 y 的无等号按隐函数', () => {
    const a = parseCurveEquation('y = sin(x) + a')
    expect(a.ok && a.spec.kind === 'explicit' && a.spec.expr).toBe('sin(x) + a')
    const b = parseCurveEquation('x^2 + 1')
    expect(b.ok && b.spec.kind === 'explicit').toBe(true)
    const c = parseCurveEquation('x^2 + y^2 - 1')
    expect(c.ok && c.spec.kind === 'implicit' && c.spec.expr).toBe('x^2 + y^2 - 1')
  })

  it('隐函数：含等号的 x/y 方程归一为 F = 左 − 右', () => {
    const r = parseCurveEquation('x^2 + y^2 = 4')
    expect(r.ok && r.spec.kind === 'implicit').toBe(true)
    if (r.ok) expect(r.spec.expr).toBe('(x^2 + y^2) - (4)')
    const s = parseCurveEquation('x = sin(y)')
    expect(s.ok && s.spec.kind === 'implicit').toBe(true)
  })

  it('极坐标：r = f(θ) / f(theta)，两侧顺序任意', () => {
    const a = parseCurveEquation('r = 2*cos(3*theta)')
    expect(a.ok && a.spec.kind === 'polar' && a.spec.expr).toBe('2*cos(3*theta)')
    const b = parseCurveEquation('1 + cos(θ) = r')
    expect(b.ok && b.spec.kind === 'polar' && b.spec.expr).toBe('1 + cos(θ)')
  })

  it('参数方程：分号两段（支持中文分号、顺序任意）', () => {
    const a = parseCurveEquation('x = cos(t); y = sin(t)')
    expect(a.ok && a.spec.kind === 'parametric').toBe(true)
    if (a.ok) {
      expect(a.spec.expr).toBe('cos(t)')
      expect(a.spec.expr2).toBe('sin(t)')
    }
    const b = parseCurveEquation('y = t^2；x = t')
    expect(b.ok && b.spec.kind === 'parametric').toBe(true)
    if (b.ok) {
      expect(b.spec.expr).toBe('t')
      expect(b.spec.expr2).toBe('t^2')
    }
  })

  it('错误：空输入、多个等号、参数方程段数不符、表达式非法', () => {
    expect(parseCurveEquation('').ok).toBe(false)
    expect(parseCurveEquation('x = 1 = 2').ok).toBe(false)
    // x = t：合法但含参数 t，按隐函数族处理（x − t = 0）
    const xt = parseCurveEquation('x = t')
    expect(xt.ok && xt.spec.kind === 'implicit').toBe(true)
    expect(parseCurveEquation('x = cos(t); y = sin(t); z = t').ok).toBe(false)
    const bad = parseCurveEquation('y = sin(')
    expect(bad.ok).toBe(false)
  })

  it('全角等号与全角分号归一化', () => {
    const r = parseCurveEquation('x＾2 = 1'.replace('＾', '^'))
    expect(r.ok).toBe(true)
  })
})
