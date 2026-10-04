/**
 * 曲线求交工具（v0.4）：可见范围内两两显函数曲线的全部交点。
 * 已知限制（docs/tools.md）：仅支持"显函数 × 显函数"；隐函数/参数方程的完整求交不在 v0.4 范围。
 */
import { createProjector } from '../core/transform'
import { findIntersections, type Intersection } from '../math/numeric/roots'
import { formatValueSmart, getFs } from './helpers'
import type { Tool } from './tool-registry'
import type { DocState } from '../state/types'

interface PairResult {
  nameA: string
  nameB: string
  colorA: string
  points: Intersection[]
}

const MAX_CURVES = 4
const MAX_DISPLAY = 8

export function createIntersectionTool(): Tool {
  let pairs: PairResult[] = []
  let lastDoc: DocState | null = null
  let unsubscribe: (() => void) | null = null

  const recompute = (ctx: Parameters<NonNullable<Tool['activate']>>[0]): void => {
    const view = ctx.getView()
    const size = ctx.getSize()
    const projector = createProjector(view, size)
    const xMin = projector.screenToMathX(0)
    const xMax = projector.screenToMathX(size.width)
    const scanSamples = Math.min(8192, Math.max(1024, Math.round(size.width)))

    const curves = getFs(ctx, MAX_CURVES)
    pairs = []
    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        const a = curves[i]
        const b = curves[j]
        if (!a || !b) continue
        const points = findIntersections(a.fn, b.fn, xMin, xMax, {
          scanSamples,
          derivative: a.derivative ?? undefined,
          derivative2: b.derivative ?? undefined,
        })
        pairs.push({
          nameA: a.curve.name,
          nameB: b.curve.name,
          colorA: a.curve.color,
          points: points.slice(0, 400),
        })
      }
    }
    lastDoc = ctx.store.getState().doc
    ctx.notify()
    ctx.requestRender()
  }

  return {
    id: 'intersection',
    name: '交点',

    activate(ctx) {
      recompute(ctx)
      unsubscribe = ctx.store.subscribe(() => {
        if (ctx.store.getState().doc !== lastDoc) recompute(ctx)
      })
    },

    deactivate() {
      unsubscribe?.()
      unsubscribe = null
      pairs = []
      lastDoc = null
    },

    drawOverlay(c, ctx) {
      const projector = createProjector(ctx.getView(), ctx.getSize())
      const size = ctx.getSize()
      c.save()
      for (const pair of pairs) {
        for (const point of pair.points.slice(0, 100)) {
          const p = projector.project(point)
          if (!Number.isFinite(p.x) || p.x < -8 || p.x > size.width + 8) continue
          c.fillStyle = pair.colorA
          c.strokeStyle = '#ffffff'
          c.lineWidth = 1.6
          c.beginPath()
          c.arc(p.x, p.y, 4.5, 0, Math.PI * 2)
          c.fill()
          c.stroke()
        }
      }
      c.restore()
    },

    getReadout(ctx) {
      const rows: { label: string; value: string }[] = []
      let total = 0
      for (const pair of pairs) {
        total += pair.points.length
        const label = `${pair.nameA} ∩ ${pair.nameB}`
        if (pair.points.length === 0) {
          rows.push({ label, value: '无交点' })
          continue
        }
        const shown = pair.points.slice(0, MAX_DISPLAY)
        const text = shown
          .map((p) => `(${formatValueSmart(p.x, 5)}, ${formatValueSmart(p.y, 5)})`)
          .join('，')
        rows.push({
          label,
          value: pair.points.length > MAX_DISPLAY ? `${text} … 共 ${pair.points.length} 个` : text,
        })
      }
      void ctx
      if (rows.length === 0) {
        return { title: '交点', rows: [], note: '需要至少两条可见的显函数曲线' }
      }
      return {
        title: `交点（共 ${total} 个）`,
        rows,
        note: '仅支持显函数两两求交（隐函数/参数方程的完整求交不在本版范围）。',
      }
    },
  }
}
