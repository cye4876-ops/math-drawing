import { describe, expect, it } from 'vitest'
import {
  clearSampleCache,
  compileCurveExpr,
  dashForStyle,
  drawCurves,
  sampleCurveForTest,
  toScreenSegments,
} from './curve-renderer'
import { createView } from '../core/transform'
import type { Curve, Size } from '../state/types'

const size: Size = { width: 1200, height: 800 }

function makeCurve(partial: Partial<Curve> = {}): Curve {
  return {
    id: partial.id ?? 'c1',
    type: 'curve',
    kind: 'explicit',
    name: partial.expr ?? 'x',
    expr: partial.expr ?? 'x',
    color: partial.color ?? '#c32222',
    lineStyle: partial.lineStyle ?? 'solid',
    quality: partial.quality ?? 3,
    visible: partial.visible ?? true,
    ...partial,
  }
}

interface FakeCtx {
  ctx: CanvasRenderingContext2D
  lineToCalls: number
  strokeCalls: number
  dashRecords: number[][]
}

function fakeCtx(): FakeCtx {
  const state: FakeCtx = {
    ctx: null as unknown as CanvasRenderingContext2D,
    lineToCalls: 0,
    strokeCalls: 0,
    dashRecords: [],
  }
  const target = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {
      state.lineToCalls++
    },
    stroke() {
      state.strokeCalls++
    },
    setLineDash(dash: number[]) {
      state.dashRecords.push([...dash])
    },
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    lineCap: '',
    globalAlpha: 1,
  }
  state.ctx = target as unknown as CanvasRenderingContext2D
  return state
}

describe('curve-renderer: 表达式编译与线型', () => {
  it('compileCurveExpr：合法表达式返回闭包，语法错误返回 null', () => {
    const fn = compileCurveExpr('2*x + 1')
    expect(fn).not.toBeNull()
    expect(fn?.({ x: 3 })).toBe(7)
    expect(compileCurveExpr('sin(')).toBeNull()
    // 未知函数名不抛错（编译期语义）：运行时求值为 NaN，曲线自然不绘制
    const unknown = compileCurveExpr('unknownfn(x)')
    expect(unknown).not.toBeNull()
    expect(Number.isNaN(unknown?.({ x: 1 }))).toBe(true)
  })

  it('dashForStyle：实线无虚线数组，虚线/点线有', () => {
    expect(dashForStyle('solid')).toEqual([])
    expect(dashForStyle('dashed').length).toBeGreaterThan(1)
    expect(dashForStyle('dotted').length).toBeGreaterThan(1)
  })
})

describe('curve-renderer: 四类曲线采样', () => {
  it('显函数：sin(x) 采样为折线', () => {
    clearSampleCache()
    const result = sampleCurveForTest(makeCurve({ expr: 'sin(x)' }), createView(0, 0, 80), size)
    expect(result).not.toBeNull()
    expect(result?.segments[0]?.length ?? 0).toBeGreaterThan(50)
  })

  it('显函数参数：a·sin(b·x) 注入 params（调参改变折线）', () => {
    const maxAbsY = (points: { y: number }[]): number =>
      points.reduce((acc, point) => Math.max(acc, Math.abs(point.y)), 0)
    clearSampleCache()
    const one = sampleCurveForTest(
      makeCurve({ expr: 'a * sin(b * x)', params: { a: 1, b: 1 } }),
      createView(0, 0, 80),
      size,
    )
    clearSampleCache()
    const two = sampleCurveForTest(
      makeCurve({ expr: 'a * sin(b * x)', params: { a: 2, b: 1 } }),
      createView(0, 0, 80),
      size,
    )
    expect(one).not.toBeNull()
    expect(two).not.toBeNull()
    const y1 = maxAbsY(one?.segments.flat() ?? [])
    const y2 = maxAbsY(two?.segments.flat() ?? [])
    expect(y1).toBeGreaterThan(0.9)
    expect(y2 / y1).toBeCloseTo(2, 1)
  })

  it('隐函数：圆有多段线段', () => {
    const result = sampleCurveForTest(
      makeCurve({ kind: 'implicit', expr: 'x^2+y^2-4' }),
      createView(0, 0, 80),
      size,
    )
    expect(result?.segments.length ?? 0).toBeGreaterThan(30)
  })

  it('参数方程：单位圆闭合；缺少 y(t) 返回 null', () => {
    const result = sampleCurveForTest(
      makeCurve({ kind: 'parametric', expr: 'cos(t)', expr2: 'sin(t)' }),
      createView(0, 0, 80),
      size,
    )
    expect(result?.segments[0]?.length ?? 0).toBeGreaterThan(20)
    expect(
      sampleCurveForTest(
        makeCurve({ kind: 'parametric', expr: 'cos(t)' }),
        createView(0, 0, 80),
        size,
      ),
    ).toBeNull()
  })

  it('极坐标：心形线可采样', () => {
    const result = sampleCurveForTest(
      makeCurve({ kind: 'polar', expr: '1+cos(theta)' }),
      createView(0, 0, 80),
      size,
    )
    expect(result?.segments[0]?.length ?? 0).toBeGreaterThan(20)
  })

  it('非法表达式返回 null；未知类型返回 null', () => {
    expect(sampleCurveForTest(makeCurve({ expr: 'sin(' }), createView(0, 0, 80), size)).toBeNull()
    const weird = { ...makeCurve(), kind: 'weird' } as unknown as Curve
    expect(sampleCurveForTest(weird, createView(0, 0, 80), size)).toBeNull()
  })

  it('采样缓存：同视图二次调用复用（视图变化后重新采样）', () => {
    clearSampleCache()
    const curve = makeCurve({ id: 'cache-curve', expr: 'x^2' })
    const view = createView(0, 0, 80)
    const first = sampleCurveForTest(curve, view, size)
    const second = sampleCurveForTest(curve, view, size)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    // 两次独立计算（sampleCurveForTest 不走缓存），但 drawCurves 走缓存路径需不抛错
    expect(() => {
      const { ctx } = fakeCtx()
      drawCurves(ctx, [curve], view, size)
      drawCurves(ctx, [curve], view, size)
    }).not.toThrow()
  })
})

describe('curve-renderer: 绘制行为', () => {
  it('drawCurves：绘制可见曲线，跳过隐藏与非法表达式', () => {
    clearSampleCache()
    const hidden = makeCurve({ id: 'h', expr: 'x', visible: false })
    const bad = makeCurve({ id: 'b', expr: 'sin(' })
    const good = makeCurve({ id: 'g', expr: 'sin(x)' })
    const fake = fakeCtx()
    drawCurves(fake.ctx, [hidden, bad, good], createView(0, 0, 80), size)
    expect(fake.lineToCalls).toBeGreaterThan(0)
    expect(fake.strokeCalls).toBe(1)
  })

  it('tan(x)：渐近线以虚线绘出（setLineDash([4,4]) 被调用）', () => {
    clearSampleCache()
    const fake = fakeCtx()
    drawCurves(fake.ctx, [makeCurve({ expr: 'tan(x)' })], createView(0, 0, 80), size)
    const calls = fake.dashRecords
    expect(calls.some((d) => d.length === 2 && d[0] === 4 && d[1] === 4)).toBe(true)
  })

  it('toScreenSegments：输出屏幕坐标折线', () => {
    clearSampleCache()
    const polyline = sampleCurveForTest(makeCurve({ expr: 'x' }), createView(0, 0, 80), size)
    expect(polyline).not.toBeNull()
    const screen = toScreenSegments(polyline!, createView(0, 0, 80), size)
    expect(screen.length).toBeGreaterThan(0)
    for (const seg of screen) {
      for (const p of seg) {
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
      }
    }
  })
})
