/**
 * 追踪游标（v0.4）：沿曲线滑动显示坐标、一/二阶导与曲率半径（内切圆可视化）。
 * 吸附用屏幕空间最近点（多值曲线同样正确）。
 */
import { createProjector } from '../core/transform'
import { analyzeAt, formatNum, nearestCurveHit, type CurveHit } from './helpers'
import type { Tool } from './tool-registry'

interface TraceState extends CurveHit {
  slope: number | null
  second: number | null
  curvature: number | null
}

export function createTraceCursorTool(): Tool {
  let state: TraceState | null = null

  return {
    id: 'trace',
    name: '追踪游标',

    activate(ctx) {
      state = null
      ctx.notify()
    },

    deactivate() {
      state = null
    },

    onPointerMove(e, ctx) {
      const hit = nearestCurveHit(ctx, e.screen, 60)
      if (!hit) {
        if (state) {
          state = null
          ctx.notify()
          ctx.requestRender()
        }
        return false
      }
      const analysis = analyzeAt(hit.curve, hit)
      state = {
        ...hit,
        slope: analysis.slope,
        second: analysis.second,
        curvature: analysis.signedCurvature,
      }
      ctx.notify()
      ctx.requestRender()
      return false // 追踪不阻止平移
    },

    drawOverlay(c, ctx) {
      if (!state) return
      const projector = createProjector(ctx.getView(), ctx.getSize())
      const p = projector.project({ x: state.x, y: state.y })
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return

      // 曲率圆（内切圆）：圆心 = 点 + N/κs
      if (
        state.curvature !== null &&
        Number.isFinite(state.curvature) &&
        Math.abs(state.curvature) > 1e-9
      ) {
        const radius = Math.abs(1 / state.curvature)
        // 法线方向由切向量旋转得到（用一阶导近似切向）
        const k = state.slope
        let nx = 0
        let ny = 1
        if (k !== null && Number.isFinite(k)) {
          const norm = Math.hypot(k, 1)
          nx = -k / norm
          ny = 1 / norm
        } else if (k === Number.POSITIVE_INFINITY || k === Number.NEGATIVE_INFINITY) {
          nx = -1
          ny = 0
        }
        const centerX = state.x + nx / state.curvature
        const centerY = state.y + ny / state.curvature
        const centerScreen = projector.project({ x: centerX, y: centerY })
        const view = ctx.getView()
        const rx = radius * view.scaleX
        const ry = radius * view.scaleY
        if (
          Number.isFinite(centerScreen.x) &&
          Number.isFinite(centerScreen.y) &&
          rx < 1e5 &&
          ry < 1e5
        ) {
          c.save()
          c.strokeStyle = 'rgba(37, 99, 235, 0.5)'
          c.lineWidth = 1
          c.setLineDash([4, 4])
          c.beginPath()
          c.ellipse(centerScreen.x, centerScreen.y, rx, ry, 0, 0, Math.PI * 2)
          c.stroke()
          c.restore()
        }
      }

      c.save()
      c.fillStyle = '#2563eb'
      c.strokeStyle = '#ffffff'
      c.lineWidth = 2
      c.beginPath()
      c.arc(p.x, p.y, 5, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      c.restore()
    },

    getReadout(ctx) {
      const title = '追踪游标'
      if (!state) {
        return { title, rows: [], note: '将光标移到曲线上（吸附距离 60px）' }
      }
      const rows: { label: string; value: string }[] = [
        { label: '曲线', value: state.curve.name },
        { label: 'x', value: formatNum(state.x) },
        { label: 'y', value: formatNum(state.y) },
        {
          label: state.curve.kind === 'explicit' ? 'f′(x)' : 'dy/dx',
          value: state.slope === null ? '不可用' : formatNum(state.slope),
        },
        {
          label: state.curve.kind === 'explicit' ? 'f″(x)' : 'd²y/dx²',
          value: state.second === null ? '—' : formatNum(state.second),
        },
        {
          label: '曲率半径 ρ',
          value:
            state.curvature === null
              ? '—'
              : Math.abs(state.curvature) < 1e-9
                ? '∞（近似直线）'
                : formatNum(Math.abs(1 / state.curvature)),
        },
      ]
      void ctx
      const note =
        state.curve.kind === 'implicit' ? '隐函数：斜率由梯度计算，无二阶导与曲率圆' : undefined
      return note ? { title, rows, note } : { title, rows }
    },
  }
}
