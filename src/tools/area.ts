/**
 * 围成面积工具（v2.8）：选择两条可见显函数曲线，在 [a, b] 上自动分段计算 |f − g| 围成的面积。
 * - 交点在区间内数值求解并吸附简单值（1/2、π/4…）后逐段精确积分（可给出 1/6、2√2−2 这类精确式）；
 * - 端点可拖动，也可在输入框输入精确写法（0、pi、sqrt(2)…）；
 * - 精确不可得时回退数值结果（段行与总面积均标注 ≈）。
 */
import { createProjector, mathToScreen } from '../core/transform'
import { areasBetween, type AreaResult } from '../symbolic/areas'
import type { Curve, Point2 } from '../state/types'
import { COORD_CHIPS, formatNum, getFs, parseCoordinate } from './helpers'
import type { Tool, ToolContext } from './tool-registry'

const HANDLE_HIT_PX = 12

function drawableScreen(v: Point2): Point2 {
  const clamp = (x: number): number => (x > 1e5 ? 1e5 : x < -1e5 ? -1e5 : x)
  return { x: clamp(v.x), y: clamp(v.y) }
}

export function createAreaTool(): Tool {
  let a = Number.NaN
  let b = Number.NaN
  let dragging: 'a' | 'b' | null = null
  /** 区间输入框原文（空串 = 使用拖动手柄的数值端点） */
  let aText = ''
  let bText = ''
  let inputError = ''
  /** 选中的两条曲线 id（空串 = 自动取前两条可见显函数） */
  let selA = ''
  let selB = ''
  /** 最近一次读数时的交点（供画布标记复用，避免每帧重算） */
  let lastCrossings: number[] = []

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

  /** 解析选中的曲线对（无效选择回落到前两条可见显函数） */
  const pickPair = (
    ctx: ToolContext,
  ): { list: Curve[]; first: Curve | null; second: Curve | null } => {
    const list = getFs(ctx, 8).map((item) => item.curve)
    const first = list.find((curve) => curve.id === selA) ?? list[0] ?? null
    const second =
      list.find((curve) => curve.id === selB && curve.id !== first?.id) ??
      list.find((curve) => curve.id !== first?.id) ??
      null
    return { list, first, second }
  }

  const fnOf = (ctx: ToolContext, curve: Curve): ((x: number) => number) | null => {
    return getFs(ctx, 8).find((item) => item.curve.id === curve.id)?.fn ?? null
  }

  return {
    id: 'area',
    name: '围成面积',

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
      lastCrossings = []
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
      if (dragging === 'a') a = e.math.x
      else b = e.math.x
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
      const { first, second } = pickPair(ctx)
      if (!first || !second) return
      const f = fnOf(ctx, first)
      const g = fnOf(ctx, second)
      if (!f || !g) return
      const view = ctx.getView()
      const size = ctx.getSize()
      const projector = createProjector(view, size)
      const [lo, hi] = ordered()
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return

      // 阴影：区域 f 与 g 之间（按各自有限段绘制）
      const steps = 240
      const h = (hi - lo) / steps
      const top: Point2[] = []
      const bottom: Point2[] = []
      for (let i = 0; i <= steps; i++) {
        const x = lo + i * h
        const yf = f(x)
        const yg = g(x)
        if (!Number.isFinite(yf) || !Number.isFinite(yg)) continue
        top.push(drawableScreen(projector.project({ x, y: yf })))
        bottom.push(drawableScreen(projector.project({ x, y: yg })))
      }
      c.save()
      if (top.length > 1) {
        c.beginPath()
        c.moveTo(top[0]!.x, top[0]!.y)
        for (const point of top) c.lineTo(point.x, point.y)
        for (let i = bottom.length - 1; i >= 0; i--) c.lineTo(bottom[i]!.x, bottom[i]!.y)
        c.closePath()
        c.fillStyle = 'rgba(37, 99, 235, 0.15)'
        c.fill()
      }

      // 交点标记
      if (lastCrossings.length > 0) {
        c.fillStyle = '#2563eb'
        for (const crossing of lastCrossings) {
          if (crossing <= lo || crossing >= hi) continue
          const y = f(crossing)
          if (!Number.isFinite(y)) continue
          const p = drawableScreen(projector.project({ x: crossing, y }))
          c.beginPath()
          c.arc(p.x, p.y, 3.4, 0, Math.PI * 2)
          c.fill()
        }
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

    getControls(ctx) {
      const { list, first, second } = pickPair(ctx)
      const controls: ReturnType<NonNullable<Tool['getControls']>> = []
      if (list.length >= 2 && first && second) {
        controls.push({
          kind: 'buttons',
          id: 'curve-a',
          label: '曲线 A',
          options: list.map((curve) => ({ value: curve.id, label: curve.name })),
          value: first.id,
        })
        controls.push({
          kind: 'buttons',
          id: 'curve-b',
          label: '曲线 B',
          options: list.map((curve) => ({ value: curve.id, label: curve.name })),
          value: second.id,
        })
      }
      controls.push({
        kind: 'text',
        id: 'a',
        label: '左端点 a',
        value: aText || (Number.isFinite(a) ? formatNum(a) : ''),
        placeholder: '输入左端点，如 -1、0',
        chips: COORD_CHIPS,
      })
      controls.push({
        kind: 'text',
        id: 'b',
        label: '右端点 b',
        value: bText || (Number.isFinite(b) ? formatNum(b) : ''),
        placeholder: '输入右端点，如 1、pi',
        chips: COORD_CHIPS,
      })
      return controls
    },

    onControl(id, value, ctx) {
      if (typeof value !== 'string') return
      if (id === 'curve-a') {
        selA = value
      } else if (id === 'curve-b') {
        selB = value
      } else if (id === 'a' || id === 'b') {
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
      } else {
        return
      }
      ctx.notify()
      ctx.requestRender()
    },

    getReadout(ctx) {
      const { list, first, second } = pickPair(ctx)
      if (!first || !second || list.length < 2) {
        lastCrossings = []
        return {
          title: '围成面积',
          rows: [],
          note: '需要至少两条可见的显函数曲线；用上方「曲线 A / 曲线 B」选择包围区域的两条边界。',
        }
      }
      const [lo, hi] = ordered()
      const rows: { label: string; value: string }[] = [
        { label: '曲线 A', value: first.name },
        { label: '曲线 B', value: second.name },
      ]
      if (inputError) {
        lastCrossings = []
        return { title: '围成面积', rows, note: inputError }
      }
      const useText = Boolean(aText && bText)
      const loText = useText ? aText : String(lo)
      const hiText = useText ? bText : String(hi)
      const params = { ...(second.params ?? {}), ...(first.params ?? {}) }
      const outcome = areasBetween(first.expr, second.expr, loText, hiText, params, {
        exactEndpoints: useText,
      })
      const result: AreaResult | null = outcome.result
      if (!result) {
        lastCrossings = []
        return {
          title: '围成面积',
          rows,
          note: outcome.reason || '无法计算围成面积',
        }
      }
      lastCrossings = result.crossings
      rows.push({
        label: '区间',
        value: `[${result.segments[0]?.loText ?? formatNum(lo)}, ${result.segments[result.segments.length - 1]?.hiText ?? formatNum(hi)}]`,
      })
      rows.push({
        label: '区间内交点',
        value:
          result.crossings.length === 0
            ? '无（两曲线在区间内不相交）'
            : result.crossings
                .map((value) => formatNum(value, 5))
                .slice(0, 6)
                .join('，') + (result.crossings.length > 6 ? ' …' : ''),
      })
      result.segments.forEach((segment, index) => {
        rows.push({
          label: `第 ${index + 1} 段 [${segment.loText}, ${segment.hiText}]`,
          value: segment.display,
        })
      })
      rows.push({
        label: result.total.exact ? '总面积（精确）' : '总面积（近似）',
        value: result.total.display,
      })
      const allExact = result.total.exact
      return {
        title: '围成面积',
        rows,
        note: `${allExact ? '精确结果：交点/端点吸附简单值或 π 的倍数后逐段符号积分，并由数值积分独立校验。' : '部分段落回退数值（交点无法精确表示或超出符号积分规则集）。'}可在输入框写精确端点（0、1、pi、sqrt(2)…）；拖动端点会改用数值结果。${outcome.reason ? ` ${outcome.reason}` : ''}`,
      }
    },
  }
}
