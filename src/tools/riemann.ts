/**
 * 黎曼和动画工具（v0.4）：左/右/中点/梯形四模式，n 从 1 动画到 100。
 * 逐帧重算 vs 增量更新：n ≤ 100 时一次求和仅 ~100 次编译闭包求值（数值见 riemann 测试），
 * 每帧重算远低于一帧预算，因此不做增量机制（理由记录于 docs/tools.md）。
 */
import { createProjector } from '../core/transform'
import { adaptiveSimpson } from '../math/numeric/integrate'
import { riemannSum, type RiemannMode } from '../math/numeric/riemann'
import { formatNum, getFs } from './helpers'
import type { Tool, ToolContext } from './tool-registry'

const MODE_LABELS: Record<RiemannMode, string> = {
  left: '左端点',
  right: '右端点',
  mid: '中点',
  trapezoid: '梯形',
}

/** 动画速度：约 2 秒完成 1 → 100 */
const N_PER_MS = 0.05

export function createRiemannTool(): Tool {
  let mode: RiemannMode = 'mid'
  let n = 4
  let playing = false
  let progress = 4
  let lastTime = 0
  let a = Number.NaN
  let b = Number.NaN
  const referenceCache = new Map<string, number>()

  const defaults = (ctx: ToolContext): void => {
    const size = ctx.getSize()
    const projector = createProjector(ctx.getView(), size)
    const minX = projector.screenToMathX(0)
    const maxX = projector.screenToMathX(size.width)
    const width = maxX - minX
    a = minX + width * 0.25
    b = minX + width * 0.75
  }

  const reference = (ctx: ToolContext, fn: (x: number) => number, curveId: string): number => {
    const key = `${curveId}|${a}|${b}`
    const cached = referenceCache.get(key)
    if (cached !== undefined) return cached
    const value = adaptiveSimpson(fn, a, b, { tolerance: 1e-10 }).value
    referenceCache.set(key, value)
    return value
  }

  return {
    id: 'riemann',
    name: '黎曼和',

    activate(ctx) {
      defaults(ctx)
      playing = false
      progress = n
      lastTime = 0
      referenceCache.clear()
      ctx.notify()
    },

    deactivate() {
      playing = false
      lastTime = 0
    },

    isAnimating() {
      return playing
    },

    onKeyDown(e) {
      if (e.key === ' ') {
        playing = !playing
        lastTime = 0
        return true
      }
      return false
    },

    getControls(ctx) {
      void ctx
      return [
        {
          kind: 'buttons',
          id: 'mode',
          label: '模式',
          options: (Object.keys(MODE_LABELS) as RiemannMode[]).map((value) => ({
            value,
            label: MODE_LABELS[value],
          })),
          value: mode,
        },
        {
          kind: 'slider',
          id: 'n',
          label: 'n',
          min: 1,
          max: 100,
          step: 1,
          value: n,
          valueText: String(n),
        },
        {
          kind: 'actions',
          id: 'playback',
          buttons: [
            { id: 'toggle', label: playing ? '暂停' : '播放', disabled: false },
            { id: 'step', label: '单步', disabled: n >= 100 },
            { id: 'reset', label: '重置', disabled: false },
          ],
        },
      ]
    },

    onControl(id, value, ctx) {
      if (id === 'mode' && typeof value === 'string') {
        mode = value as RiemannMode
        playing = false
      } else if (id === 'n' && typeof value === 'number') {
        n = Math.min(100, Math.max(1, Math.round(value)))
        progress = n
        playing = false
      } else if (id === 'toggle') {
        if (!playing) {
          if (n >= 100) {
            n = 1
            progress = 1
          }
          playing = true
          lastTime = 0
        } else {
          playing = false
        }
      } else if (id === 'step') {
        playing = false
        n = Math.min(100, n + 1)
        progress = n
      } else if (id === 'reset') {
        playing = false
        n = 1
        progress = 1
      }
      ctx.notify()
      ctx.requestRender()
    },

    drawOverlay(c, ctx) {
      // 动画推进（帧率无关：按真实时间累积进度）
      if (playing) {
        const now = performance.now()
        if (lastTime === 0) lastTime = now
        const dt = Math.min(100, now - lastTime)
        lastTime = now
        progress += dt * N_PER_MS
        const next = Math.min(100, Math.floor(progress))
        if (next !== n) {
          n = next
          ctx.notify()
        }
        if (progress >= 100) {
          n = 100
          playing = false
          progress = 100
          ctx.notify()
        }
        ctx.requestRender()
      }

      const fs = getFs(ctx, 1)[0]
      if (!fs || !Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) return
      const view = ctx.getView()
      const size = ctx.getSize()
      const projector = createProjector(view, size)
      const clamp = (v: number): number => (v > 1e5 ? 1e5 : v < -1e5 ? -1e5 : v)
      const h = (b - a) / n

      c.save()
      c.fillStyle = 'rgba(37, 99, 235, 0.14)'
      c.strokeStyle = 'rgba(37, 99, 235, 0.75)'
      c.lineWidth = 1
      c.beginPath()
      for (let i = 0; i < n; i++) {
        const x0 = a + i * h
        const x1 = x0 + h
        if (mode === 'trapezoid') {
          const y0 = fs.fn(x0)
          const y1 = fs.fn(x1)
          if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue
          const p0 = projector.project({ x: x0, y: 0 })
          const p1 = projector.project({ x: x0, y: y0 })
          const p2 = projector.project({ x: x1, y: y1 })
          const p3 = projector.project({ x: x1, y: 0 })
          c.moveTo(clamp(p0.x), clamp(p0.y))
          c.lineTo(clamp(p1.x), clamp(p1.y))
          c.lineTo(clamp(p2.x), clamp(p2.y))
          c.lineTo(clamp(p3.x), clamp(p3.y))
          c.closePath()
        } else {
          const sampleX = mode === 'left' ? x0 : mode === 'right' ? x1 : (x0 + x1) / 2
          const y = fs.fn(sampleX)
          if (!Number.isFinite(y)) continue
          const p0 = projector.project({ x: x0, y: 0 })
          const p1 = projector.project({ x: x0, y })
          const p2 = projector.project({ x: x1, y })
          const p3 = projector.project({ x: x1, y: 0 })
          c.moveTo(clamp(p0.x), clamp(p0.y))
          c.lineTo(clamp(p1.x), clamp(p1.y))
          c.lineTo(clamp(p2.x), clamp(p2.y))
          c.lineTo(clamp(p3.x), clamp(p3.y))
          c.closePath()
        }
      }
      c.fill()
      c.stroke()
      c.restore()
    },

    getReadout(ctx) {
      const fs = getFs(ctx, 1)[0]
      if (!fs) {
        return { title: '黎曼和', rows: [], note: '添加一条可见的显函数曲线' }
      }
      const result = riemannSum(fs.fn, a, b, n, mode)
      const ref = reference(ctx, fs.fn, fs.curve.id)
      const diff = Math.abs(result.value - ref)
      return {
        title: '黎曼和',
        rows: [
          { label: '曲线', value: fs.curve.name },
          { label: '区间', value: `[${formatNum(a)}, ${formatNum(b)}]` },
          { label: '模式', value: MODE_LABELS[mode] },
          { label: 'n', value: String(n) },
          { label: '近似值', value: formatNum(result.value, 9) },
          { label: '参考值（Simpson）', value: formatNum(ref, 9) },
          { label: '误差', value: formatNum(diff, 3) },
        ],
        note: '空格键播放/暂停。参考值为自适应 Simpson 数值解；播放时每帧重算（n≤100 开销可忽略）。',
      }
    },
  }
}
