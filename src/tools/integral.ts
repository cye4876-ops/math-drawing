/**
 * 定积分工具（v0.4）：拖动左右端点选择区间，阴影显示，自适应 Simpson 求值 + 误差估计。
 * 已知限制（docs/tools.md）：不做符号积分（解析解未实现）；不支持奇异积分（区间内出现非有限值 → NaN）。
 */
import { createProjector, mathToScreen } from '../core/transform'
import { adaptiveSimpson } from '../math/numeric/integrate'
import type { Point2 } from '../state/types'
import { COORD_CHIPS, formatNum, getFs, parseCoordinate } from './helpers'
import type { Tool, ToolContext } from './tool-registry'

const HANDLE_HIT_PX = 12

function drawableScreen(v: Point2): Point2 {
  const clamp = (x: number): number => (x > 1e5 ? 1e5 : x < -1e5 ? -1e5 : x)
  return { x: clamp(v.x), y: clamp(v.y) }
}

export function createIntegralTool(): Tool {
  let a = Number.NaN
  let b = Number.NaN
  let dragging: 'a' | 'b' | null = null
  /** 区间输入框原文（空串 = 回落到当前区间值显示） */
  let aText = ''
  let bText = ''
  /** 输入错误提示，空串表示正常 */
  let inputError = ''

  const defaults = (ctx: ToolContext): void => {
    const size = ctx.getSize()
    const projector = createProjector(ctx.getView(), size)
    const minX = projector.screenToMathX(0)
    const maxX = projector.screenToMathX(size.width)
    const width = maxX - minX
    a = minX + width * 0.25
    b = minX + width * 0.75
  }

  const ordered = (): [number, number] => (a <= b ? [a, b] : [b, a])

  const baselineY = (ctx: ToolContext): number => {
    const size = ctx.getSize()
    const y = mathToScreen(ctx.getView(), size, { x: 0, y: 0 }).y
    if (!Number.isFinite(y)) return size.height - 40
    return Math.min(size.height - 12, Math.max(12, y))
  }

  const handleHit = (ctx: ToolContext, screen: Point2): 'a' | 'b' | null => {
    const size = ctx.getSize()
    const projector = createProjector(ctx.getView(), size)
    const y = baselineY(ctx)
    if (Math.abs(screen.y - y) > 20) return null
    const sa = projector.screenX(a)
    const sb = projector.screenX(b)
    if (Math.abs(screen.x - sa) <= HANDLE_HIT_PX) return 'a'
    if (Math.abs(screen.x - sb) <= HANDLE_HIT_PX) return 'b'
    return null
  }

  return {
    id: 'integral',
    name: '定积分',

    activate(ctx) {
      if (!Number.isFinite(a) || !Number.isFinite(b)) defaults(ctx)
      aText = ''
      bText = ''
      inputError = ''
      ctx.notify()
    },

    deactivate() {
      dragging = null
      aText = ''
      bText = ''
      inputError = ''
    },

    onPointerDown(e, ctx) {
      const hit = handleHit(ctx, e.screen)
      if (!hit) return false
      dragging = hit
      ctx.requestRender()
      return true
    },

    onPointerMove(e, ctx) {
      if (!dragging) {
        const hit = handleHit(ctx, e.screen)
        if (hit) ctx.requestRender()
        return false
      }
      if (dragging === 'a') {
        a = e.math.x
        aText = ''
      } else {
        b = e.math.x
        bText = ''
      }
      inputError = ''
      ctx.notify()
      ctx.requestRender()
      return true
    },

    onPointerUp() {
      dragging = null
      return true
    },

    drawOverlay(c, ctx) {
      const fs = getFs(ctx, 1)[0]
      if (!fs) return
      const view = ctx.getView()
      const size = ctx.getSize()
      const projector = createProjector(view, size)
      const [lo, hi] = ordered()
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return

      // 阴影区域：曲线与 y=0 之间
      const steps = 240
      const h = (hi - lo) / steps
      c.save()
      c.beginPath()
      let started = false
      for (let i = 0; i <= steps; i++) {
        const x = lo + i * h
        const y = fs.fn(x)
        if (!Number.isFinite(y)) continue
        const p = drawableScreen(projector.project({ x, y }))
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
        if (!started) {
          c.moveTo(p.x, p.y)
          started = true
        } else {
          c.lineTo(p.x, p.y)
        }
      }
      if (started) {
        const pEnd = drawableScreen(projector.project({ x: hi, y: 0 }))
        const pStart = drawableScreen(projector.project({ x: lo, y: 0 }))
        c.lineTo(pEnd.x, pEnd.y)
        c.lineTo(pStart.x, pStart.y)
        c.closePath()
        c.fillStyle = 'rgba(37, 99, 235, 0.15)'
        c.fill()
      }
      c.restore()

      // 端点竖线与手柄
      const y = baselineY(ctx)
      c.save()
      c.strokeStyle = '#2563eb'
      c.lineWidth = 1.4
      c.setLineDash([5, 4])
      const sa = drawableScreen(projector.project({ x: lo, y: 0 }))
      const sb = drawableScreen(projector.project({ x: hi, y: 0 }))
      c.beginPath()
      c.moveTo(sa.x, 0)
      c.lineTo(sa.x, size.height)
      c.moveTo(sb.x, 0)
      c.lineTo(sb.x, size.height)
      c.stroke()
      c.setLineDash([])
      c.fillStyle = '#2563eb'
      for (const sx of [sa.x, sb.x]) {
        c.fillRect(sx - 4, y - 4, 8, 8)
      }
      c.restore()
    },

    getControls() {
      return [
        {
          kind: 'text' as const,
          id: 'a',
          label: '下限 a',
          value: aText || (Number.isFinite(a) ? formatNum(a) : ''),
          placeholder: '输入下限，如 0、-pi',
          chips: COORD_CHIPS,
        },
        {
          kind: 'text' as const,
          id: 'b',
          label: '上限 b',
          value: bText || (Number.isFinite(b) ? formatNum(b) : ''),
          placeholder: '输入上限，如 pi、2*pi',
          chips: COORD_CHIPS,
        },
      ]
    },

    onControl(id, value, ctx) {
      if ((id === 'a' || id === 'b') && typeof value === 'string') {
        const parsed = parseCoordinate(value)
        if (id === 'a') aText = value
        else bText = value
        if (parsed === null) {
          inputError = '区间无法解析：支持数字与常量表达式（如 pi、2*pi、pi/2）'
        } else {
          inputError = ''
          if (id === 'a') a = parsed
          else b = parsed
        }
        ctx.notify()
        ctx.requestRender()
      }
    },

    getReadout(ctx) {
      const fs = getFs(ctx, 1)[0]
      if (!fs) {
        return { title: '定积分', rows: [], note: '添加一条可见的显函数曲线' }
      }
      const [lo, hi] = ordered()
      const result = adaptiveSimpson(fs.fn, lo, hi, { tolerance: 1e-10 })
      return {
        title: '定积分',
        rows: [
          { label: '曲线', value: fs.curve.name },
          { label: '区间', value: `[${formatNum(lo)}, ${formatNum(hi)}]` },
          { label: '∫ f(x) dx', value: formatNum(result.value, 9) },
          {
            label: '误差估计',
            value: result.truncated
              ? `${formatNum(result.error, 3)}（截断）`
              : formatNum(result.error, 3),
          },
          { label: '求值次数', value: String(result.evaluations) },
        ],
        note:
          inputError ||
          '拖动端点或输入区间端点调整范围；自适应 Simpson；不支持奇异积分；解析解未实现（v0.4 无符号积分）。',
      }
    },
  }
}
