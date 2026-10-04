/**
 * 泰勒展开工具（v0.4；v2.8.1 精确化）：展开点可点击/拖动，逐项叠加动画（n = 1,3,5,…,15），实时显示展开式。
 * 系数来自 v0.2 符号求导：c_k = f⁽ᵏ⁾(x₀)/k!。
 * 手工输入精确展开点（如 pi/2）且函数在规则集内时，展开点与系数给精确式（1/6、−1/2…）。
 */
import { createProjector, unitRangeSamples } from '../core/transform'
import { rat } from '../math/exact/rational'
import { exactScale, formatExact, type ExactValue } from '../symbolic/exact'
import {
  COORD_CHIPS,
  evalCurveExact,
  exactValueFromText,
  formatNum,
  getFs,
  parseCoordinate,
  type ExplicitCurveFs,
} from './helpers'
import { getDerivativeFn } from './curve-access'
import type { Tool } from './tool-registry'

const MAX_ORDER = 15
/** 动画每升一阶的间隔（放慢便于观察逼近过程） */
const ANIMATION_STEP_MS = 800

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
  /** 坐标输入框内容（最近一次有效输入或点击位置） */
  let inputText = ''
  /** 输入错误提示，空串表示正常 */
  let errorText = ''
  const cache = new Map<string, CoeffSet | null>()
  /** 精确展开点（仅手工输入且可精确求值时存在；点击/拖动置空） */
  let exactX0: { value: ExactValue; text: string } | null = null
  const exactCache = new Map<string, ExactValue[] | null>()

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

  /** 精确系数：c_k = f⁽ᵏ⁾(x₀)/k!（精确值）；不足 2 项（或不可精确）返回 null */
  const exactCoeffsFor = (
    fs: ExplicitCurveFs,
    point: ExactValue,
    key: string,
  ): ExactValue[] | null => {
    const cached = exactCache.get(key)
    if (cached !== undefined) return cached
    const coeffs: ExactValue[] = []
    let factorial = 1n
    for (let k = 0; k <= MAX_ORDER; k++) {
      if (k > 0) factorial *= BigInt(k)
      const value = evalCurveExact(fs.curve.expr, 'x', point, fs.curve.params, k)
      if (!value) break
      coeffs.push(k === 0 ? value : exactScale(value, rat(1n, factorial)))
    }
    const result = coeffs.length >= 2 ? coeffs : null
    exactCache.set(key, result)
    return result
  }

  /** 精确展开式文本（系数与展开点均为精确式） */
  const exactFormulaText = (coeffs: ExactValue[], x0Text: string, n: number): string => {
    const terms: string[] = []
    const limit = Math.min(n, coeffs.length - 1)
    for (let k = 0; k <= limit && terms.length < 7; k++) {
      const c = coeffs[k] as ExactValue
      if (c.length === 0 && k > 0) continue
      const term =
        k === 0 ? formatExact(c) : `${formatExact(c)}·(x−${x0Text})${k === 1 ? '' : `^${k}`}`
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
      errorText = ''
      exactX0 = null
      ctx.notify()
    },

    deactivate() {
      playing = false
      inputText = ''
      errorText = ''
      exactX0 = null
    },

    isAnimating() {
      return playing
    },

    onPointerDown(e, ctx) {
      x0 = e.math.x
      inputText = formatNum(x0)
      errorText = ''
      playing = false
      exactX0 = null
      ctx.notify()
      ctx.requestRender()
      return true
    },

    getControls(ctx) {
      void ctx
      return [
        {
          kind: 'text' as const,
          id: 'x0',
          label: '展开点 x₀',
          value: inputText,
          placeholder: '输入 x 坐标，如 0、pi/2',
          chips: COORD_CHIPS,
        },
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
      if (id === 'x0' && typeof value === 'string') {
        inputText = value
        const parsed = parseCoordinate(value)
        if (parsed === null) {
          errorText = '坐标无法解析：支持数字与常量表达式（如 1.5、pi/2）'
        } else {
          x0 = parsed
          errorText = ''
          playing = false
          // 精确路径：输入可精确求值（如 pi/2、0）时记录精确展开点
          const fs = getFs(ctx, 1)[0]
          const point = fs ? exactValueFromText(value, fs.curve.params) : null
          exactX0 = point ? { value: point, text: formatExact(point) } : null
        }
      } else if (id === 'order' && typeof value === 'number') {
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

      // 近似曲线（对数坐标下按十倍程均匀采样，与屏幕空间一致）
      const xLeft = projector.screenToMathX(0)
      const xRight = projector.screenToMathX(size.width)
      c.save()
      c.strokeStyle = '#d97706'
      c.lineWidth = 1.8
      c.setLineDash([7, 4])
      c.beginPath()
      let started = false
      for (const x of unitRangeSamples(view, xLeft, xRight, 320)) {
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
      const exact = exactX0
        ? exactCoeffsFor(
            fs,
            exactX0.value,
            `${fs.curve.id}|${fs.curve.expr}|${exactX0.text}|${JSON.stringify(fs.curve.params ?? {})}`,
          )
        : null
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
          { label: '展开点', value: exactX0 ? exactX0.text : formatNum(x0) },
          { label: '阶数 n', value: String(n) },
          {
            label: '展开式',
            value: exact ? exactFormulaText(exact, exactX0!.text, order) : formulaText(set, n),
          },
          { label: '可视范围最大偏差', value: formatNum(maxDeviation, 3) },
        ],
        note:
          errorText ||
          (exact
            ? '展开点为精确值且函数在精确规则集内：系数为精确式（如 1/6、−1/2），逼近曲线仍为数值绘制。'
            : '点击画布或输入 x 坐标移动展开点；输入 0、pi/2 等精确展开点可给出精确系数。'),
      }
    },
  }
}
