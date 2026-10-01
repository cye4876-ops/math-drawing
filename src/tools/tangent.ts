/**
 * 切线工具（v0.4）：拖动切点，切线随动；显示切点、斜率与切线方程。
 */
import { createProjector } from '../core/transform'
import type { Point2 } from '../state/types'
import { analyzeAt, formatNum, nearestCurveHit, tangentEquation, type CurveHit } from './helpers'
import type { Tool } from './tool-registry'

interface TangentState extends CurveHit {
  slope: number | null
}

export function createTangentTool(): Tool {
  let state: TangentState | null = null
  let dragging = false

  const update = (ctx: Parameters<NonNullable<Tool['onPointerMove']>>[1], screen: Point2): void => {
    const hit = nearestCurveHit(ctx, screen, 72)
    if (!hit) {
      state = null
    } else {
      const analysis = analyzeAt(hit.curve, hit)
      state = { ...hit, slope: analysis.slope }
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
      ctx.notify()
    },

    deactivate() {
      state = null
      dragging = false
    },

    onPointerDown(e, ctx) {
      const hit = nearestCurveHit(ctx, e.screen, 72)
      if (!hit) return false
      const analysis = analyzeAt(hit.curve, hit)
      state = { ...hit, slope: analysis.slope }
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
      const pointScreen = projector.project({ x: state.x, y: state.y })
      if (!Number.isFinite(pointScreen.x) || !Number.isFinite(pointScreen.y)) return

      c.save()
      c.strokeStyle = '#0d9488'
      c.lineWidth = 1.6
      c.setLineDash([])
      c.beginPath()
      if (!Number.isFinite(state.slope)) {
        // 竖直切线
        c.moveTo(pointScreen.x, 0)
        c.lineTo(pointScreen.x, size.height)
      } else {
        const xLeft = projector.screenToMathX(0)
        const xRight = projector.screenToMathX(size.width)
        const yLeft = state.y + state.slope * (xLeft - state.x)
        const yRight = state.y + state.slope * (xRight - state.x)
        const pLeft = projector.project({ x: xLeft, y: yLeft })
        const pRight = projector.project({ x: xRight, y: yRight })
        if (!Number.isFinite(pLeft.y) || !Number.isFinite(pRight.y)) return
        c.moveTo(0, pLeft.y)
        c.lineTo(size.width, pRight.y)
      }
      c.stroke()

      c.fillStyle = '#0d9488'
      c.strokeStyle = '#ffffff'
      c.lineWidth = 2
      c.beginPath()
      c.arc(pointScreen.x, pointScreen.y, 5, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      c.restore()
      void c
    },

    getReadout() {
      if (!state) {
        return { title: '切线', rows: [], note: '在曲线上按下并拖动切点' }
      }
      const rows = [
        { label: '曲线', value: state.curve.name },
        { label: '切点', value: `(${formatNum(state.x)}, ${formatNum(state.y)})` },
        {
          label: '斜率 k',
          value: state.slope === null ? '不可用' : formatNum(state.slope),
        },
        {
          label: '切线方程',
          value: state.slope === null ? '—' : tangentEquation(state.x, state.y, state.slope),
        },
      ]
      return { title: '切线', rows, note: '方程暂为纯文本（KaTeX 排版在 v0.6）' }
    },
  }
}
