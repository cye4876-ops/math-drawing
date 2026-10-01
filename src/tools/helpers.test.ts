import { beforeEach, describe, expect, it } from 'vitest'
import { createStore } from '../state/store'
import { analyzeAt, formatNum, getFs, nearestCurveHit, tangentEquation } from './helpers'
import { clearDerivativeCache } from './curve-access'
import { mathToScreen } from '../core/transform'
import type { ToolContext } from './tool-registry'

const SIZE = { width: 800, height: 600 }

function makeCtx(store: ReturnType<typeof createStore>): ToolContext {
  return {
    store,
    getView: () => store.getView(),
    getSize: () => SIZE,
    requestRender: () => {},
    notify: () => {},
  }
}

beforeEach(() => {
  clearDerivativeCache()
})

describe('tools/helpers: formatNum', () => {
  it('整数、舍入与有效数字', () => {
    expect(formatNum(0)).toBe('0')
    expect(formatNum(1)).toBe('1')
    expect(formatNum(-2.5)).toBe('-2.5')
    expect(formatNum(1 / 3)).toBe('0.333333')
    expect(formatNum(3.14159265)).toBe('3.14159')
  })

  it('非有限值与极端量级', () => {
    expect(formatNum(Number.NaN)).toBe('—')
    expect(formatNum(Number.POSITIVE_INFINITY)).toBe('∞')
    expect(formatNum(Number.NEGATIVE_INFINITY)).toBe('−∞')
    expect(formatNum(1.2345e8)).toBe('1.235e8')
    expect(formatNum(2.5e-5)).toBe('2.500e-5')
  })
})

describe('tools/helpers: tangentEquation', () => {
  it('斜截式与零截距', () => {
    expect(tangentEquation(1, 2, 3)).toBe('y = 3·x − 1')
    expect(tangentEquation(2, 6, 3)).toBe('y = 3·x')
  })

  it('竖直切线输出 x = x₀', () => {
    expect(tangentEquation(1.5, 2, Number.POSITIVE_INFINITY)).toBe('x = 1.5')
  })
})

describe('tools/helpers: nearestCurveHit', () => {
  it('命中曲线上给定数学坐标对应的屏幕点', () => {
    const store = createStore()
    store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    const ctx = makeCtx(store)
    const target = { x: 1, y: Math.sin(1) }
    const screen = mathToScreen(store.getView(), SIZE, target)

    const hit = nearestCurveHit(ctx, screen, 48)
    expect(hit).not.toBeNull()
    expect(hit!.curve.name).toBe('sin(x)')
    expect(Math.abs(hit!.x - 1)).toBeLessThan(0.02)
    expect(Math.abs(hit!.y - Math.sin(1))).toBeLessThan(0.02)
  })

  it('超出吸附距离或曲线不可见时返回 null', () => {
    const store = createStore()
    const curve = store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    const ctx = makeCtx(store)

    // 偏离曲线 0.05 单位（屏幕 4px）：小半径拒绝、大半径接受
    const near = mathToScreen(store.getView(), SIZE, { x: 1, y: Math.sin(1) + 0.05 })
    expect(nearestCurveHit(ctx, near, 2)).toBeNull()
    expect(nearestCurveHit(ctx, near, 48)).not.toBeNull()

    const far = mathToScreen(store.getView(), SIZE, { x: 1, y: 3.5 })
    expect(nearestCurveHit(ctx, far, 48)).toBeNull()

    store.updateCurve(curve.id, { visible: false })
    expect(nearestCurveHit(ctx, near, 48)).toBeNull()
  })
})

describe('tools/helpers: analyzeAt', () => {
  it('显式曲线给出符号一/二阶导与曲率', () => {
    const store = createStore()
    const curve = store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    const hit = { x: 1, y: Math.sin(1), t: 1, distancePx: 0 }

    const analysis = analyzeAt(curve, hit)
    expect(analysis.slope).toBeCloseTo(Math.cos(1), 8)
    expect(analysis.second).toBeCloseTo(-Math.sin(1), 8)
    const expected = -Math.sin(1) / (1 + Math.cos(1) ** 2) ** 1.5
    expect(analysis.signedCurvature).toBeCloseTo(expected, 8)
  })

  it('隐式曲线由梯度给出斜率，无二阶导', () => {
    const store = createStore()
    const curve = store.addCurve({ kind: 'implicit', expr: 'x^2 + y^2 - 4' })
    const hit = { x: Math.SQRT2, y: Math.SQRT2, t: null, distancePx: 0 }

    const analysis = analyzeAt(curve, hit)
    expect(analysis.slope).toBeCloseTo(-1, 8)
    expect(analysis.second).toBeNull()
    expect(analysis.signedCurvature).toBeNull()
  })

  it('解析失败的表达式返回不可用分析', () => {
    const store = createStore()
    const curve = store.addCurve({ kind: 'explicit', expr: 'sin(' })
    const analysis = analyzeAt(curve, { x: 0, y: 0, t: 0, distancePx: 0 })
    expect(analysis.slope).toBeNull()
  })
})

describe('tools/helpers: getFs', () => {
  it('仅收集可见显函数，可限制数量', () => {
    const store = createStore()
    store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    store.addCurve({ kind: 'explicit', expr: 'x^2' })
    store.addCurve({ kind: 'implicit', expr: 'x^2+y^2-4' })
    const hidden = store.addCurve({ kind: 'explicit', expr: 'cos(x)' })
    store.updateCurve(hidden.id, { visible: false })
    const ctx = makeCtx(store)

    const all = getFs(ctx)
    expect(all.map((f) => f.curve.name)).toEqual(['sin(x)', 'x^2'])
    expect(all[0]!.fn(0)).toBe(0)
    expect(all[0]!.derivative?.(0)).toBeCloseTo(1, 8)

    expect(getFs(ctx, 1)).toHaveLength(1)
  })
})
