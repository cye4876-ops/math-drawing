/**
 * 切线工具（v0.4；v2.8.1 精确化）：拖动切点或输入 x 坐标定位；切线随动；显示切点、斜率与切线方程。
 * 输入精确坐标（如 pi/2）且函数在规则集内时，切点/斜率/方程均给精确式。
 */
import { createProjector, unitRangeSamples } from '../core/transform'
import { formatExact, type ExactValue } from '../symbolic/exact'
import type { Point2 } from '../state/types'
import {
  COORD_CHIPS,
  analyzeAt,
  evalCurveExact,
  exactValueFromText,
  formatNum,
  getFs,
  nearestCurveHit,
  parseCoordinate,
  tangentEquation,
  type CurveHit,
  type ExplicitCurveFs,
} from './helpers'
import type { Tool, ToolContext } from './tool-registry'

interface TangentState extends CurveHit {
  slope: number | null
}

/** 精确切点状态（仅来自手工输入的精确文本） */
interface ExactTangent {
  x: ExactValue
  y: ExactValue
  slope: ExactValue
}

/** 精确切线方程：点斜式（斜率为零 → 水平线） */
function tangentEquationExact(xText: string, yText: string, slopeText: string): string {
  if (slopeText === '0') return `y = ${yText}`
  const negative = slopeText.startsWith('−')
  const absSlope = negative ? slopeText.slice(1) : slopeText
  const coefficient = absSlope === '1' ? '' : `${absSlope}·`
  const core = xText === '0' ? `${coefficient}x` : `${coefficient}(x − ${xText})`
  if (yText === '0') return `y = ${negative ? '−' : ''}${core}`
  return `y = ${yText} ${negative ? '−' : '+'} ${core}`
}

export function createTangentTool(): Tool {
  let state: TangentState | null = null
  let dragging = false
  /** 坐标输入框内容（最近一次有效输入或拖动后的 x） */
  let inputText = ''
  /** 输入错误提示（解析失败/定义域外/无可用曲线），空串表示正常 */
  let errorText = ''
  /** 精确切点（仅在手工输入精确坐标且精确求值成功时存在；拖动/点击置空） */
  let exactState: ExactTangent | null = null

  const update = (ctx: Parameters<NonNullable<Tool['onPointerMove']>>[1], screen: Point2): void => {
    const hit = nearestCurveHit(ctx, screen, 72)
    if (!hit) {
      state = null
    } else {
      const analysis = analyzeAt(hit.curve, hit)
      state = { ...hit, slope: analysis.slope }
      inputText = formatNum(hit.x)
      errorText = ''
    }
    exactState = null
    ctx.notify()
    ctx.requestRender()
  }

  /** 目标曲线：优先当前切点所在曲线（仍存在且可见），否则第一条可见显函数 */
  const pickCurve = (ctx: ToolContext): ExplicitCurveFs | null => {
    const all = getFs(ctx, 8)
    if (all.length === 0) return null
    const currentId = state?.curve.id
    const current = currentId ? all.find((f) => f.curve.id === currentId) : undefined
    return current ?? all[0] ?? null
  }

  /** 按输入的 x 坐标在曲线上定位切点（显函数直接求值 + 符号导数） */
  const applyFromInput = (ctx: ToolContext, raw: string): void => {
    inputText = raw
    const x0 = parseCoordinate(raw)
    if (x0 === null) {
      errorText = '坐标无法解析：支持数字与常量表达式（如 1.5、pi/2）'
      ctx.notify()
      return
    }
    const fs = pickCurve(ctx)
    if (!fs) {
      errorText = '没有可用的显函数曲线'
      ctx.notify()
      return
    }
    const y = fs.fn(x0)
    if (!Number.isFinite(y)) {
      errorText = `该点不在定义域内：f(${formatNum(x0)}) 无定义`
      ctx.notify()
      return
    }
    const analysis = analyzeAt(fs.curve, { x: x0, y, t: x0, distancePx: 0 })
    state = { curve: fs.curve, x: x0, y, t: x0, distancePx: 0, slope: analysis.slope }
    errorText = ''
    // 精确路径：输入文本可精确求值，且函数与其导数在该点均可精确表示
    exactState = null
    const point = exactValueFromText(raw, fs.curve.params)
    if (point) {
      const yExact = evalCurveExact(fs.curve.expr, 'x', point, fs.curve.params, 0)
      const slopeExact = evalCurveExact(fs.curve.expr, 'x', point, fs.curve.params, 1)
      if (yExact && slopeExact) exactState = { x: point, y: yExact, slope: slopeExact }
    }
    ctx.notify()
    ctx.requestRender()
  }

  return {
    id: 'tangent',
    name: '切线',

    activate(ctx) {
      state = null
      dragging = false
      inputText = ''
      errorText = ''
      exactState = null
      ctx.notify()
    },

    deactivate() {
      state = null
      dragging = false
      inputText = ''
      errorText = ''
      exactState = null
    },

    onPointerDown(e, ctx) {
      const hit = nearestCurveHit(ctx, e.screen, 72)
      if (!hit) return false
      const analysis = analyzeAt(hit.curve, hit)
      state = { ...hit, slope: analysis.slope }
      inputText = formatNum(hit.x)
      errorText = ''
      exactState = null
      dragging = true
      ctx.notify()
      ctx.requestRender()
      return true
    },

    onPointerMove(e, ctx) {
      if (!dragging) return false
      update(ctx, e.screen)
      return true
    },

    onPointerUp() {
      dragging = false
      return true
    },

    drawOverlay(c, ctx) {
      if (!state || state.slope === null) return
      const view = ctx.getView()
      const size = ctx.getSize()
      const projector = createProjector(view, size)

      c.save()
      c.strokeStyle = '#0d9488'
      c.lineWidth = 1.6
      c.setLineDash([])
      c.beginPath()
      if (!Number.isFinite(state.slope)) {
        // 竖直切线（数学垂直线在任意坐标类型下都是屏幕竖直线）
        const p = projector.project({ x: state.x, y: state.y })
        const sx = Number.isFinite(p.x) ? p.x : 0
        c.moveTo(sx, 0)
        c.lineTo(sx, size.height)
      } else {
        // 沿可见 x 范围采样绘制：线性坐标下为直线，对数坐标下为正确曲线；
        // 投影失败/越界处自动断开（如 log 模式下切线越过 y ≤ 0 区域）
        const xLeft = projector.screenToMathX(0)
        const xRight = projector.screenToMathX(size.width)
        let started = false
        for (const x of unitRangeSamples(view, xLeft, xRight, 160)) {
          const y = state.y + state.slope * (x - state.x)
          const p = projector.project({ x, y })
          const ok =
            Number.isFinite(p.x) &&
            Number.isFinite(p.y) &&
            Math.abs(p.x) < 1e6 &&
            Math.abs(p.y) < 1e6
          if (!ok) {
            started = false
            continue
          }
          if (!started) {
            c.moveTo(p.x, p.y)
            started = true
          } else {
            c.lineTo(p.x, p.y)
          }
        }
      }
      c.stroke()

      // 切点标记（投影失败时不绘制，但不影响切线本体）
      const pointScreen = projector.project({ x: state.x, y: state.y })
      if (Number.isFinite(pointScreen.x) && Number.isFinite(pointScreen.y)) {
        c.fillStyle = '#0d9488'
        c.strokeStyle = '#ffffff'
        c.lineWidth = 2
        c.beginPath()
        c.arc(pointScreen.x, pointScreen.y, 5, 0, Math.PI * 2)
        c.fill()
        c.stroke()
      }
      c.restore()
      void c
    },

    getControls() {
      return [
        {
          kind: 'text' as const,
          id: 'x',
          label: '切点 x₀',
          value: inputText,
          placeholder: '输入 x 坐标，如 1、pi/2',
          chips: COORD_CHIPS,
        },
      ]
    },

    onControl(id, value, ctx) {
      if (id === 'x' && typeof value === 'string') applyFromInput(ctx, value)
    },

    getReadout() {
      if (!state) {
        return {
          title: '切线',
          rows: [],
          note: errorText || '在曲线上按下并拖动切点，或在下方输入 x 坐标直接定位',
        }
      }
      const exact = exactState
      const xText = exact ? formatExact(exact.x) : formatNum(state.x)
      const yText = exact ? formatExact(exact.y) : formatNum(state.y)
      const rows = [
        { label: '曲线', value: state.curve.name },
        { label: '切点', value: `(${xText}, ${yText})` },
        {
          label: '斜率 k',
          value:
            state.slope === null
              ? '不可用'
              : exact
                ? formatExact(exact.slope)
                : formatNum(state.slope),
        },
        {
          label: '切线方程',
          value:
            state.slope === null
              ? '—'
              : exact
                ? tangentEquationExact(xText, yText, formatExact(exact.slope))
                : tangentEquation(state.x, state.y, state.slope),
        },
      ]
      return {
        title: '切线',
        rows,
        note:
          errorText ||
          (exact
            ? '输入坐标为精确值且函数在精确规则集内：切点/斜率/方程为精确式（并随导数符号求导）。'
            : '也可输入 x 坐标直接定位切点（仅显函数）；输入 0、pi/2、sqrt(2) 等精确坐标可给出精确式。'),
      }
    },
  }
}
