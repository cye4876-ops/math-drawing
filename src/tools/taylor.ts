/**
 * 泰勒展开工具（v0.4）：展开点可点击/拖动，逐项叠加动画（n = 1,3,5,…,15），实时显示展开式。
 * 系数来自 v0.2 符号求导：c_k = f⁽ᵏ⁾(x₀)/k!。公式为纯文本（KaTeX 排版在 v0.6）。
 */
import { createProjector } from '../core/transform'
import { formatNum, getFs, type ExplicitCurveFs } from './helpers'
import { getDerivativeFn } from './curve-access'
import type { Tool } from './tool-registry'

const MAX_ORDER = 15
const ANIMATION_STEP_MS = 450

interface CoeffSet {
  x0: number
  /** c_0..c_last（含 0）；遇到第一个不可导的阶中断 */
  coeffs: number[]
}

export function createTaylorTool(): Tool {
  let x0 = 0
  let order = 1
  let playing = false
  let lastStep = 0
  const cache = new Map<string, CoeffSet | null>()

  const coeffsFor = (fs: ExplicitCurveFs, point: number): CoeffSet | null => {
    const key = `${fs.curve.id}|${fs.curve.expr}|${point}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const coeffs: number[] = []
    let factorial = 1
    for (let k = 0; k <= MAX_ORDER; k++) {
      if (k > 0) factorial *= k
      const fn = getDerivativeFn(fs.curve.expr, 'x', k)
      if (!fn) break
      const value = fn(point)
      if (!Number.isFinite(value)) break
      coeffs.push(value / factorial)
    }
    const result: CoeffSet | null = coeffs.length >= 2 ? { x0: point, coeffs } : null
    cache.set(key, result)
    return result
  }

  const polyAt = (set: CoeffSet, n: number, x: number): number => {
    // Horner（从最高次向下）
    const last = Math.min(n, set.coeffs.length - 1)
    let acc = 0
    for (let k = last; k >= 0; k--) {
      acc = acc * (x - set.x0) + (set.coeffs[k] as number)
    }
    return acc
  }

  const formulaText = (set: CoeffSet, n: number): string => {
    const terms: string[] = []
    const limit = Math.min(n, set.coeffs.length - 1)
    for (let k = 0; k <= limit && terms.length < 7; k++) {
      const c = set.coeffs[k] as number
      if (c === 0 && k > 0) continue
      let term: string
      if (k === 0) term = formatNum(c)
      else {
        const varPart = `(x−${formatNum(set.x0)})`
        term = `${formatNum(c)}·${k === 1 ? varPart : `${varPart}^${k}`}`
      }
      terms.push(term)
    }
    const more = limit >= 7 ? ' + …' : ''
    return `T${n}(x) = ${terms.join(' + ').replaceAll('+ −', '− ')}${more}`
  }

  return {
    id: 'taylor',
    name: '泰勒',

    activate(ctx) {
      playing = false
      lastStep = 0
      ctx.notify()
    },

    deactivate() {
      playing = false
    },

    isAnimating() {
      return playing
    },

    onPointerDown(e, ctx) {
      x0 = e.math.x
      playing = false
      ctx.notify()
      ctx.requestRender()
      return true
    },

    getControls(ctx) {
      void ctx
      return [
        {
          kind: 'slider',
          id: 'order',
          label: '阶数 n',
          min: 1,
          max: MAX_ORDER,
          step: 1,
          value: order,
          valueText: String(order),
        },
        {
          kind: 'actions',
          id: 'playback',
          buttons: [
            { id: 'toggle', label: playing ? '暂停' : '播放', disabled: false },
            {
              id: 'step',
              label: '下一阶',
              disabled: order >= MAX_ORDER,
            },
            { id: 'reset', label: '重置', disabled: false },
          ],
        },
      ]
    },

    onControl(id, value, ctx) {
      if (id === 'order' && typeof value === 'number') {
        order = Math.min(MAX_ORDER, Math.max(1, Math.round(value)))
        playing = false
      } else if (id === 'toggle') {
        if (!playing) {
          if (order >= MAX_ORDER) order = 1
          playing = true
          lastStep = 0
        } else {
          playing = false
        }
      } else if (id === 'step') {
        playing = false
        order = Math.min(MAX_ORDER, order + 1)
      } else if (id === 'reset') {
        playing = false
        order = 1
      }
      ctx.notify()
      ctx.requestRender()
    },

    drawOverlay(c, ctx) {
      const fs = getFs(ctx, 1)[0]
      if (!fs) return

      // 动画推进：每 450ms 升一阶
      if (playing) {
        const now = performance.now()
        if (lastStep === 0) lastStep = now
        if (now - lastStep >= ANIMATION_STEP_MS) {
          lastStep = now
          if (order >= MAX_ORDER) {
            playing = false
          } else {
            order += 1
          }
          ctx.notify()
        }
        ctx.requestRender()
      }

      const set = coeffsFor(fs, x0)
      if (!set) return
      const n = Math.min(order, set.coeffs.length - 1)
      const view = ctx.getView()
      const size = ctx.getSize()
      const projector = createProjector(view, size)

      // 近似曲线
      const steps = 320
      const xLeft = projector.screenToMathX(0)
      const xRight = projector.screenToMathX(size.width)
      c.save()
      c.strokeStyle = '#d97706'
      c.lineWidth = 1.8
      c.setLineDash([7, 4])
      c.beginPath()
      let started = false
      for (let i = 0; i <= steps; i++) {
        const x = xLeft + ((xRight - xLeft) * i) / steps
        const y = polyAt(set, n, x)
        if (!Number.isFinite(y)) {
          started = false
          continue
        }
        const p = projector.project({ x, y })
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.y) > 1e5) {
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
      c.stroke()
      c.restore()

      // 展开点标记
      const marker = projector.project({ x: x0, y: fs.fn(x0) })
      if (Number.isFinite(marker.x) && Number.isFinite(marker.y)) {
        c.save()
        c.fillStyle = '#d97706'
        c.beginPath()
        c.arc(marker.x, marker.y, 4.5, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = '#92400e'
        c.font = '12px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
        c.fillText(`x₀ = ${formatNum(x0, 4)}`, marker.x + 8, marker.y - 8)
        c.restore()
      }
    },

    getReadout(ctx) {
      const fs = getFs(ctx, 1)[0]
      if (!fs) {
        return { title: '泰勒展开', rows: [], note: '添加一条可见的显函数曲线' }
      }
      const set = coeffsFor(fs, x0)
      if (!set) {
        return { title: '泰勒展开', rows: [], note: '该函数在此点不可导（或导数不支持）' }
      }
      const n = Math.min(order, set.coeffs.length - 1)
      const size = ctx.getSize()
      const projector = createProjector(ctx.getView(), size)
      const xLeft = projector.screenToMathX(0)
      const xRight = projector.screenToMathX(size.width)
      let maxDeviation = 0
      for (let i = 0; i <= 200; i++) {
        const x = xLeft + ((xRight - xLeft) * i) / 200
        const diff = Math.abs(polyAt(set, n, x) - fs.fn(x))
        if (Number.isFinite(diff)) maxDeviation = Math.max(maxDeviation, diff)
      }
      return {
        title: '泰勒展开',
        rows: [
          { label: '曲线', value: fs.curve.name },
          { label: '展开点', value: formatNum(x0) },
          { label: '阶数 n', value: String(n) },
          { label: '展开式', value: formulaText(set, n) },
          { label: '可视范围最大偏差', value: formatNum(maxDeviation, 3) },
        ],
        note: '点击画布移动展开点。公式为纯文本（KaTeX 排版在 v0.6）。',
      }
    },
  }
}
