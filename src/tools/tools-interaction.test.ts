/**
 * 各分析工具的交互逻辑测试（非绘制像素级）：
 * - 通过 ToolRegistry 转发指针/键盘事件，验证状态机与读数面板内容；
 * - drawOverlay 用 mock 2D 上下文执行（验证绘制分支不抛异常、调用预期 API）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createStore, type AppStore } from '../state/store'
import {
  ToolRegistry,
  type Tool,
  type ToolContext,
  type ToolControl,
  type ToolPointerEvent,
} from './tool-registry'
import { createTraceCursorTool } from './trace-cursor'
import { createTangentTool } from './tangent'
import { createRootsTool } from './roots'
import { createIntersectionTool } from './intersection'
import { createIntegralTool } from './integral'
import { createAreaTool } from './area'
import { createRiemannTool } from './riemann'
import { createTaylorTool } from './taylor'
import { mathToScreen } from '../core/transform'
import { clearDerivativeCache } from './curve-access'
import type { ToolReadout } from './tool-registry'

const SIZE = { width: 800, height: 600 }

interface Fixture {
  store: AppStore
  registry: ToolRegistry
  ctx: ToolContext
  renders: { count: number }
}

function createFixture(tools: Tool[]): Fixture {
  const store = createStore()
  const renders = { count: 0 }
  const ctx: ToolContext = {
    store,
    getView: () => store.getView(),
    getSize: () => SIZE,
    requestRender: () => {
      renders.count++
    },
    notify: () => registry.notify(),
    hitTest: () => null,
  }
  const registry = new ToolRegistry(ctx)
  for (const tool of tools) registry.register(tool)
  return { store, registry, ctx, renders }
}

/** 构造工具指针事件：屏幕坐标由数学坐标投影得到 */
function pointerEvent(store: AppStore, x: number, y: number): ToolPointerEvent {
  return {
    screen: mathToScreen(store.getView(), SIZE, { x, y }),
    math: { x, y },
    pointer: {} as PointerEvent,
  }
}

/** mock 2D 上下文：记录被访问的 API 名，方法调用一律 no-op */
function mockCanvas(): CanvasRenderingContext2D & { ops: string[] } {
  const ops: string[] = []
  const base: Record<string, unknown> = { ops, measureText: () => ({ width: 8 }) }
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as string]
      if (typeof prop === 'symbol') return undefined
      ops.push(prop)
      return () => undefined
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D & { ops: string[] }
}

function readoutOf(fixture: Fixture): ToolReadout {
  const tool = fixture.registry.getActive()
  expect(tool).not.toBeNull()
  const readout = tool!.getReadout?.(fixture.ctx)
  expect(readout).toBeTruthy()
  return readout!
}

/** 读取 text 控件的快捷符号数量（非 text 控件返回 0） */
function chipsOf(control: ToolControl | undefined): number {
  return control && control.kind === 'text' ? (control.chips?.length ?? 0) : 0
}

beforeEach(() => {
  clearDerivativeCache()
})

describe('tools/trace-cursor: 追踪游标', () => {
  it('吸附曲线后给出坐标/导数/曲率读数，覆盖层绘制圆点与曲率圆', () => {
    const f = createFixture([createTraceCursorTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('trace')

    f.registry.handlePointerMove(pointerEvent(f.store, 1, Math.sin(1)))
    const readout = readoutOf(f)
    expect(readout.rows[0]).toEqual({ label: '曲线', value: 'sin(x)' })
    // 吸附点为屏幕空间最近点，x 在目标附近小幅偏移
    const x = Number(readout.rows[1]!.value)
    const y = Number(readout.rows[2]!.value)
    expect(Math.abs(x - 1)).toBeLessThan(0.01)
    // y 取自绘制用采样折线（线性插值），与解析值相差在采样容差内
    expect(Math.abs(y - Math.sin(x))).toBeLessThan(5e-3)
    expect(Number(readout.rows[3]!.value)).toBeCloseTo(Math.cos(x), 4)

    const canvas = mockCanvas()
    f.registry.getActive()!.drawOverlay?.(canvas, f.ctx)
    expect(canvas.ops).toContain('arc')
    expect(canvas.ops).toContain('ellipse') // 曲率圆
  })

  it('远离曲线后读数清空', () => {
    const f = createFixture([createTraceCursorTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('trace')

    f.registry.handlePointerMove(pointerEvent(f.store, 1, Math.sin(1)))
    expect(readoutOf(f).rows.length).toBeGreaterThan(0)

    f.registry.handlePointerMove(pointerEvent(f.store, 1, 4))
    const readout = readoutOf(f)
    expect(readout.rows).toHaveLength(0)
    expect(readout.note).toBeTruthy()
  })
})

describe('tools/tangent: 切线', () => {
  it('按下切点、拖动更新、给出切线方程', () => {
    const f = createFixture([createTangentTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('tangent')

    const handled = f.registry.handlePointerDown(pointerEvent(f.store, 1, Math.sin(1)))
    expect(handled).toBe(true)
    let rows = readoutOf(f).rows
    expect(rows[0]!.value).toBe('sin(x)')
    expect(rows[3]!.value).toMatch(/^y = .+·x .+$/)

    // 拖到 x = 2 处（吸附点允许小幅偏移）
    f.registry.handlePointerMove(pointerEvent(f.store, 2, Math.sin(2)))
    rows = readoutOf(f).rows
    const px = Number(rows[1]!.value.replace(/[()]/g, '').split(',')[0])
    expect(Math.abs(px - 2)).toBeLessThan(0.01)

    f.registry.handlePointerUp(pointerEvent(f.store, 2, Math.sin(2)))
    const canvas = mockCanvas()
    f.registry.getActive()!.drawOverlay?.(canvas, f.ctx)
    expect(canvas.ops).toContain('stroke')
    expect(canvas.ops).toContain('arc')
  })

  it('未命中曲线时不设置切点', () => {
    const f = createFixture([createTangentTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('tangent')

    const handled = f.registry.handlePointerDown(pointerEvent(f.store, 2, 2.5))
    expect(handled).toBe(false)
    expect(readoutOf(f).rows).toHaveLength(0)
  })

  it('输入 x 坐标直接定位切点（支持 pi 等常量表达式）', () => {
    const f = createFixture([createTangentTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('tangent')
    const tool = f.registry.getActive()!

    const controls = tool.getControls!(f.ctx)
    expect(controls[0]).toMatchObject({ kind: 'text', id: 'x' })
    expect(chipsOf(controls[0])).toBeGreaterThan(0)

    tool.onControl!('x', 'pi/2', f.ctx)
    const rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('(π/2, 1)') // 精确切点 (π/2, sin(π/2))
    expect(rows[2]!.value).toBe('0') // k = cos(π/2) = 0（精确）
    expect(rows[3]!.value).toBe('y = 1') // 水平切线（精确）

    // 非精确坐标（sin(1) 无精确表示）→ 回落数值显示
    tool.onControl!('x', '1', f.ctx)
    const numericRows = readoutOf(f).rows
    expect(numericRows[1]!.value).toBe('(1, 0.841471)')
    expect(numericRows[2]!.value).toBe('0.540302')
    expect(numericRows[3]!.value).toContain('y = ')

    // 非法输入：提示错误且保留上次有效切点
    tool.onControl!('x', 'abc', f.ctx)
    const readout = readoutOf(f)
    expect(readout.note).toContain('无法解析')
    expect(readout.rows[1]!.value).toContain('(1,')
  })

  it('输入坐标但无曲线 / 点不在定义域时给出提示', () => {
    const empty = createFixture([createTangentTool()])
    empty.registry.activate('tangent')
    empty.registry.getActive()!.onControl!('x', '1', empty.ctx)
    expect(readoutOf(empty).note).toContain('没有可用的显函数曲线')

    const f = createFixture([createTangentTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'log(x)' })
    f.registry.activate('tangent')
    const tool = f.registry.getActive()!
    tool.onControl!('x', '-1', f.ctx)
    expect(readoutOf(f).note).toContain('不在定义域')
  })

  it('对数坐标下切线仍绘制（越过 y≤0 的部分自动断开）', () => {
    const f = createFixture([createTangentTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'log(x)' })
    f.store.setView({ ...f.store.getView(), coordType: 'log' }) // 归一化后 center=(1,1)
    f.registry.activate('tangent')
    const tool = f.registry.getActive()!

    tool.onControl!('x', '2', f.ctx) // 切点 (2, ln2)，y>0 在 log 下可投影
    const canvas = mockCanvas()
    tool.drawOverlay!(canvas, f.ctx)
    expect(canvas.ops).toContain('moveTo')
    expect(canvas.ops).toContain('lineTo') // 切线本体（y≤0 段断开，y>0 段绘制）
    expect(canvas.ops).toContain('arc') // 切点标记
  })
})

describe('tools/roots: 零点', () => {
  it('激活时计算零点，文档变化后自动重算', () => {
    const f = createFixture([createRootsTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'x^3 - x' })
    f.registry.activate('roots')

    let readout = readoutOf(f)
    expect(readout.title).toBe('零点（共 3 个）')
    expect(readout.rows[0]!.value).toBe('−1，0，1')

    // 订阅文档变化：新增 x²（0 为二重根）
    f.store.addCurve({ kind: 'explicit', expr: 'x^2' })
    readout = readoutOf(f)
    expect(readout.title).toBe('零点（共 4 个）')
    expect(readout.rows[1]!.value).toContain('重根')
  })

  it('取消激活后清理订阅（文档变化不再触发重算）', () => {
    const f = createFixture([createRootsTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'x^3 - x' })
    f.registry.activate('roots')
    f.registry.activate(null)
    f.store.addCurve({ kind: 'explicit', expr: 'x^2' })
    // 重新激活应为干净状态
    f.registry.activate('roots')
    expect(readoutOf(f).title).toBe('零点（共 4 个）')
  })
})

describe('tools/intersection: 交点', () => {
  it('显函数两两求交', () => {
    const f = createFixture([createIntersectionTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.store.addCurve({ kind: 'explicit', expr: 'x^3 - x' })
    f.registry.activate('intersection')

    const readout = readoutOf(f)
    expect(readout.title).toBe('交点（共 3 个）')
    expect(readout.rows[0]!.value).toContain('(0, 0)')
    expect(readout.rows[0]!.value).toContain('1.3172')

    const canvas = mockCanvas()
    f.registry.getActive()!.drawOverlay?.(canvas, f.ctx)
    expect(canvas.ops).toContain('arc')
  })
})

describe('tools/integral: 定积分', () => {
  it('默认区间给出 Simpson 积分值', () => {
    const f = createFixture([createIntegralTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'x^2' })
    f.registry.activate('integral')

    const rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('[-2.5, 2.5]')
    expect(Number(rows[2]!.value)).toBeCloseTo((2.5 ** 3 * 2) / 3, 6)
  })

  it('拖拽端点改变区间并重算', () => {
    const f = createFixture([createIntegralTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'x^2' })
    f.registry.activate('integral')

    // 左端点位于 (−2.5, 0) 的屏幕位置
    const handled = f.registry.handlePointerDown(pointerEvent(f.store, -2.5, 0))
    expect(handled).toBe(true)
    f.registry.handlePointerMove(pointerEvent(f.store, -3, 0))
    f.registry.handlePointerUp(pointerEvent(f.store, -3, 0))

    const rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('[-3, 2.5]')
    expect(Number(rows[2]!.value)).toBeCloseTo((27 + 15.625) / 3, 6)
  })

  it('振荡函数（sin²(4x)）仍给精确 π/2（回归：数值假收敛不得否决解析值）', () => {
    const f = createFixture([createIntegralTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(4*x)^2' })
    f.registry.activate('integral')
    const tool = f.registry.getActive()!
    tool.onControl!('a', '0', f.ctx)
    tool.onControl!('b', 'pi', f.ctx)
    const rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('[0, π]')
    expect(rows[2]!.value).toBe('π/2')
  })

  it('覆盖层绘制阴影区域', () => {
    const f = createFixture([createIntegralTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'x^2' })
    f.registry.activate('integral')

    const canvas = mockCanvas()
    f.registry.getActive()!.drawOverlay?.(canvas, f.ctx)
    expect(canvas.ops).toContain('fill')
    expect(canvas.ops).toContain('lineTo')
  })

  it('输入/chips 设置区间端点（支持常量表达式）', () => {
    const f = createFixture([createIntegralTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'x^2' })
    f.registry.activate('integral')
    const tool = f.registry.getActive()!

    const controls = tool.getControls!(f.ctx)
    expect(controls[0]).toMatchObject({ kind: 'text', id: 'a' })
    expect(controls[1]).toMatchObject({ kind: 'text', id: 'b' })
    expect(chipsOf(controls[0])).toBeGreaterThan(0)

    // a = π、b = 0 → 区间排序后 [0, π]，∫x² = π³/3（精确）
    tool.onControl!('a', 'pi', f.ctx)
    tool.onControl!('b', '0', f.ctx)
    const rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('[0, π]')
    expect(rows[2]!.value).toBe('π³/3')

    // 非法输入：提示且保留上次有效区间
    tool.onControl!('a', 'oops', f.ctx)
    expect(readoutOf(f).note).toContain('无法解析')
    expect(readoutOf(f).rows[1]!.value).toBe('[0, 3.14159]')

    // 拖动端点后输入框回落到数值显示，错误提示清除
    // （a=π 的屏幕位置在 x≈651，从该处按下拖动）
    expect(f.registry.handlePointerDown(pointerEvent(f.store, Math.PI, 0))).toBe(true)
    f.registry.handlePointerMove(pointerEvent(f.store, -3, 0))
    f.registry.handlePointerUp(pointerEvent(f.store, -3, 0))
    expect(tool.getControls!(f.ctx)[0]).toMatchObject({ value: '-3' })
    expect(readoutOf(f).note).not.toContain('无法解析')
  })
})

describe('tools/area: 围成面积', () => {
  it('y = x 与 y = x² 在 [0, 1] 上精确面积 1/6', () => {
    const f = createFixture([createAreaTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'x' })
    f.store.addCurve({ kind: 'explicit', expr: 'x^2' })
    f.registry.activate('area')
    const tool = f.registry.getActive()!
    tool.onControl!('a', '0', f.ctx)
    tool.onControl!('b', '1', f.ctx)

    const readout = readoutOf(f)
    expect(readout.title).toBe('围成面积')
    // rows: 曲线A、曲线B、区间、交点、第 1 段、总面积
    expect(readout.rows.at(-1)!.label).toBe('总面积（精确）')
    expect(readout.rows.at(-1)!.value).toBe('1/6')
  })

  it('两条曲线选择控件存在；单条曲线时提示需要两条', () => {
    const f = createFixture([createAreaTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('area')
    const tool = f.registry.getActive()!
    expect(readoutOf(f).note).toContain('两条')

    f.store.addCurve({ kind: 'explicit', expr: 'cos(x)' })
    const controls = tool.getControls!(f.ctx)
    expect(controls.some((control) => control.id === 'curve-a')).toBe(true)
    expect(controls.some((control) => control.id === 'curve-b')).toBe(true)
  })

  it('覆盖层绘制两曲线间阴影与端点手柄', () => {
    const f = createFixture([createAreaTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'x' })
    f.store.addCurve({ kind: 'explicit', expr: 'x^2' })
    f.registry.activate('area')
    const canvas = mockCanvas()
    f.registry.getActive()!.drawOverlay?.(canvas, f.ctx)
    expect(canvas.ops).toContain('fill')
    expect(canvas.ops).toContain('lineTo')
  })
})

describe('tools/riemann: 黎曼和', () => {
  it('n 滑杆/模式/步进/重置与空格播放', () => {
    const f = createFixture([createRiemannTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('riemann')
    const tool = f.registry.getActive()!

    // 控件：模式按钮组 + n 滑杆 + 播放按钮组
    const controls = tool.getControls!(f.ctx)
    expect(controls.map((c) => c.kind)).toEqual(['buttons', 'slider', 'actions'])

    tool.onControl!('n', 50, f.ctx)
    expect(readoutOf(f).rows[3]!.value).toBe('50')
    tool.onControl!('mode', 'left', f.ctx)
    expect(readoutOf(f).rows[2]!.value).toBe('左端点')

    tool.onControl!('step', '', f.ctx)
    expect(readoutOf(f).rows[3]!.value).toBe('51')
    tool.onControl!('reset', '', f.ctx)
    expect(readoutOf(f).rows[3]!.value).toBe('1')

    // 空格切换播放状态
    expect(tool.onKeyDown!({ key: ' ' } as KeyboardEvent, f.ctx)).toBe(true)
    expect(tool.isAnimating!(f.ctx)).toBe(true)
    expect(tool.onKeyDown!({ key: ' ' } as KeyboardEvent, f.ctx)).toBe(true)
    expect(tool.isAnimating!(f.ctx)).toBe(false)
  })

  it('播放状态下覆盖层绘制矩形并请求续帧', () => {
    const f = createFixture([createRiemannTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('riemann')
    const tool = f.registry.getActive()!
    tool.onControl!('n', 10, f.ctx)

    const canvas = mockCanvas()
    tool.drawOverlay!(canvas, f.ctx)
    expect(canvas.ops).toContain('fill')

    tool.onControl!('toggle', '', f.ctx)
    const before = f.renders.count
    tool.drawOverlay!(canvas, f.ctx) // playing：应请求重绘
    expect(f.renders.count).toBeGreaterThan(before)
  })
})

describe('tools/taylor: 泰勒展开', () => {
  it('点击设置展开点，步进/滑杆设置阶数，展开式含系数', () => {
    const f = createFixture([createTaylorTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('taylor')
    const tool = f.registry.getActive()!

    f.registry.handlePointerDown(pointerEvent(f.store, 1, 0))
    const rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('1') // 展开点
    expect(rows[2]!.value).toBe('1') // 阶数
    expect(rows[3]!.value).toContain('0.841471') // sin(1)
    expect(rows[3]!.value).toContain('0.540302') // cos(1)
    expect(rows[3]!.value).toContain('(x−1)')

    tool.onControl!('step', '', f.ctx)
    expect(readoutOf(f).rows[2]!.value).toBe('2')
    tool.onControl!('order', 7, f.ctx)
    expect(readoutOf(f).rows[2]!.value).toBe('7')
    tool.onControl!('reset', '', f.ctx)
    expect(readoutOf(f).rows[2]!.value).toBe('1')
  })

  it('播放动画标记 isAnimating 并绘制标注文本', () => {
    const f = createFixture([createTaylorTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('taylor')
    const tool = f.registry.getActive()!

    f.registry.handlePointerDown(pointerEvent(f.store, 0.5, 0))
    tool.onControl!('toggle', '', f.ctx)
    expect(tool.isAnimating!(f.ctx)).toBe(true)

    const canvas = mockCanvas()
    tool.drawOverlay!(canvas, f.ctx)
    expect(canvas.ops).toContain('fillText')
    expect(canvas.ops).toContain('stroke')
  })

  it('输入 x 坐标设置展开点（无需点击画布）', () => {
    const f = createFixture([createTaylorTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('taylor')
    const tool = f.registry.getActive()!

    const controls = tool.getControls!(f.ctx)
    expect(controls[0]).toMatchObject({ kind: 'text', id: 'x0', value: '' })
    expect(chipsOf(controls[0])).toBeGreaterThan(0)

    tool.onControl!('x0', '1', f.ctx)
    let rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('1') // 展开点
    expect(rows[3]!.value).toContain('0.540302') // cos(1)
    expect(rows[3]!.value).toContain('(x−1)')
    // 输入回显
    expect(tool.getControls!(f.ctx)[0]).toMatchObject({ value: '1' })

    // 非法输入：提示且保留上次展开点
    tool.onControl!('x0', '??', f.ctx)
    expect(readoutOf(f).note).toContain('无法解析')
    rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('1')
  })

  it('精确展开点（pi/2）给出精确系数', () => {
    const f = createFixture([createTaylorTool()])
    f.store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    f.registry.activate('taylor')
    const tool = f.registry.getActive()!

    tool.onControl!('x0', 'pi/2', f.ctx)
    let rows = readoutOf(f).rows
    expect(rows[1]!.value).toBe('π/2') // 精确展开点
    expect(rows[3]!.value).toBe('T1(x) = 1') // sin(π/2) = 1、cos(π/2) = 0

    tool.onControl!('step', '', f.ctx) // n = 2
    tool.onControl!('step', '', f.ctx) // n = 3（三阶项系数为 0，正确省略）
    rows = readoutOf(f).rows
    expect(rows[2]!.value).toBe('3')
    expect(rows[3]!.value).toBe('T3(x) = 1 − 1/2·(x−π/2)^2')
  })
})
