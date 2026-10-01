/**
 * 数据集渲染器（v0.7 元素注册制）：散点/回归/残差、直方图/KDE、分布曲线/概率区域、模拟动画。
 * - 数据为独立图层；配色与界面一致（数据蓝、回归红、KDE 紫、探针琥珀）；
 * - 残差模式：主图上方 64% 裁切显示，下方 36% 为残差栏（x 与主图对齐，联动点选高亮）；
 * - 模拟帧由 stats-state 的运行时驱动（面板 rAF 推进，frameVersion 触发重绘）。
 */
import { mathToScreen } from '../core/transform'
import type { ElementRenderer } from '../render/element-registry'
import type { Point2, Size, ViewTransform } from '../state/types'
import type { Dataset } from './model'
import { pairedValues } from './model'
import { getDistribution } from './distributions'
import { histogram } from './histogram'
import { kdeEvaluate, kdeGrid } from './kde'
import { fitRegression, type RegressionResult } from './regression'
import { getPointSelection, getSimFrameVersion, getSimRuntime } from './stats-state.svelte'

const DATA_COLOR = '#2563eb'
const REG_COLOR = '#dc2626'
const KDE_COLOR = '#7c3aed'
const PROBE_COLOR = '#f59e0b'
const FONT = '12px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'

/** 散点数据与屏幕坐标（探针工具共用；返回配对后的数组） */
export interface ScatterLayout {
  points: { math: Point2; screen: Point2; index: number }[]
  fitted: RegressionResult | null
  error: string | null
}

const layoutCache = new WeakMap<Dataset, { key: string; layout: ScatterLayout }>()

/** 计算散点布局（含回归），缓存按数据集+尺寸+回归配置 */
export function scatterLayout(dataset: Dataset, view: ViewTransform, size: Size): ScatterLayout {
  const chart = dataset.chart
  if (chart.kind !== 'scatter') return { points: [], fitted: null, error: null }
  const key = `${view.centerX}|${view.centerY}|${view.scaleX}|${view.scaleY}|${size.width}x${size.height}|${chart.xColumn}|${chart.yColumn}|${chart.regression}|${chart.degree}|${chart.modelExpr}|${dataset.rows.length}`
  const cached = layoutCache.get(dataset)
  if (cached && cached.key === key) return cached.layout
  const { x, y } = pairedValues(dataset, chart.xColumn, chart.yColumn)
  const points = x.map((xi, i) => ({
    math: { x: xi, y: y[i]! },
    screen: mathToScreen(view, size, { x: xi, y: y[i]! }),
    index: i,
  }))
  const result = fitRegression(chart.regression, x, y, {
    degree: chart.degree,
    modelExpr: chart.modelExpr,
  })
  const layout: ScatterLayout =
    'error' in result
      ? { points, fitted: null, error: result.error }
      : { points, fitted: result, error: null }
  layoutCache.set(dataset, { key, layout })
  return layout
}

function drawScatter(
  ctx: CanvasRenderingContext2D,
  dataset: Dataset,
  view: ViewTransform,
  size: Size,
): void {
  const layout = scatterLayout(dataset, view, size)
  const chart = dataset.chart
  if (chart.kind !== 'scatter') return
  const residuals = chart.showResiduals
  const mainHeight = residuals ? size.height * 0.64 : size.height
  const selection = getPointSelection()

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, size.width, mainHeight)
  ctx.clip()
  // 数据点
  ctx.fillStyle = DATA_COLOR
  for (const point of layout.points) {
    if (!Number.isFinite(point.screen.x) || !Number.isFinite(point.screen.y)) continue
    ctx.fillRect(point.screen.x - 1.5, point.screen.y - 1.5, 3, 3)
  }
  // 回归曲线（x 范围内均匀 200 点）
  if (layout.fitted) {
    const xs = layout.points.map((p) => p.math.x)
    if (xs.length > 0) {
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      ctx.strokeStyle = REG_COLOR
      ctx.lineWidth = 2
      ctx.beginPath()
      let open = false
      for (let i = 0; i <= 200; i++) {
        const xv = minX + ((maxX - minX) * i) / 200
        const yv = layout.fitted.predict(xv)
        if (!Number.isFinite(yv)) {
          open = false
          continue
        }
        const p = mathToScreen(view, size, { x: xv, y: yv })
        if (open) ctx.lineTo(p.x, p.y)
        else {
          ctx.moveTo(p.x, p.y)
          open = true
        }
      }
      ctx.stroke()
    }
  }
  // 选中点（散点高亮）
  if (selection !== null) {
    const point = layout.points[selection]
    if (point) {
      ctx.beginPath()
      ctx.arc(point.screen.x, point.screen.y, 6, 0, Math.PI * 2)
      ctx.strokeStyle = PROBE_COLOR
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }
  // 回归失败提示
  if (layout.error) {
    ctx.fillStyle = '#b91c1c'
    ctx.font = FONT
    ctx.fillText(`回归不可用：${layout.error}`, 10, 18)
  }
  ctx.restore()

  // ---- 残差栏 ----
  if (residuals && layout.fitted) {
    const barrier = mainHeight
    ctx.save()
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(0, barrier, size.width, size.height - barrier)
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, barrier)
    ctx.lineTo(size.width, barrier)
    ctx.stroke()

    const pad = 16
    const top = barrier + pad
    const bottom = size.height - pad
    const residualValues = layout.fitted.residuals
    let maxAbs = 0
    for (const r of residualValues) maxAbs = Math.max(maxAbs, Math.abs(r))
    maxAbs = maxAbs > 0 ? maxAbs * 1.15 : 1
    const yFor = (r: number): number => (top + bottom) / 2 - (r / maxAbs) * ((bottom - top) / 2)
    // 零线
    ctx.strokeStyle = '#9ca3af'
    ctx.beginPath()
    ctx.moveTo(0, (top + bottom) / 2)
    ctx.lineTo(size.width, (top + bottom) / 2)
    ctx.stroke()
    ctx.fillStyle = '#6b7280'
    ctx.font = '11px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText('残差', 8, barrier + 14)
    // 残差点（与主图 x 对齐）
    ctx.fillStyle = '#0891b2'
    for (const point of layout.points) {
      const r = residualValues[point.index]
      if (r === undefined || !Number.isFinite(r)) continue
      const sx = point.screen.x
      const sy = yFor(r)
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3)
    }
    if (selection !== null) {
      const point = layout.points[selection]
      const r = point ? residualValues[point.index] : undefined
      if (point && r !== undefined) {
        ctx.beginPath()
        ctx.arc(point.screen.x, yFor(r), 6, 0, Math.PI * 2)
        ctx.strokeStyle = PROBE_COLOR
        ctx.lineWidth = 3
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

function drawHistogram(
  ctx: CanvasRenderingContext2D,
  dataset: Dataset,
  view: ViewTransform,
  size: Size,
): void {
  const chart = dataset.chart
  if (chart.kind !== 'histogram') return
  const values = dataset.rows
    .map((row) => row[chart.column])
    .filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return
  const result = histogram(values, chart.bins)
  ctx.save()
  // 柱体（0 → count）
  ctx.fillStyle = 'rgba(37, 99, 235, 0.35)'
  for (let i = 0; i < result.counts.length; i++) {
    const count = result.counts[i]!
    if (count === 0) continue
    const p0 = mathToScreen(view, size, { x: result.edges[i]!, y: 0 })
    const p1 = mathToScreen(view, size, { x: result.edges[i + 1]!, y: count })
    const left = Math.min(p0.x, p1.x)
    const width = Math.abs(p1.x - p0.x)
    ctx.fillRect(left, p1.y, width, p0.y - p1.y)
  }
  // KDE（换算到 count 尺度：× n × binWidth）
  if (chart.kde) {
    const grid = kdeGrid(values, 200)
    const density = kdeEvaluate(values, grid, chart.kernel)
    const n = result.n
    const width = result.binWidth
    ctx.strokeStyle = KDE_COLOR
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < grid.length; i++) {
      const p = mathToScreen(view, size, { x: grid[i]!, y: density[i]! * n * width })
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }
  ctx.fillStyle = '#6b7280'
  ctx.font = FONT
  ctx.fillText(
    `n = ${result.n} · 分箱 ${result.counts.length}${chart.bins === 'auto' ? '（自动）' : ''}`,
    10,
    18,
  )
  ctx.restore()
}

function drawDistribution(
  ctx: CanvasRenderingContext2D,
  dataset: Dataset,
  view: ViewTransform,
  size: Size,
): void {
  const chart = dataset.chart
  if (chart.kind !== 'distribution') return
  const def = getDistribution(chart.dist)
  const samples = 400
  const [x0, x1] = [
    mathToScreen(view, size, { x: 0, y: 0 }).x,
    mathToScreen(view, size, { x: 1, y: 0 }).x,
  ]
  const pxPerUnit = x1 - x0
  const screenToMathX = (sx: number): number => (sx - x0) / pxPerUnit
  const start = screenToMathX(0)
  const end = screenToMathX(size.width)

  const curve = (fn: (x: number) => number, color: string, dash: number[]): void => {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.setLineDash(dash)
    ctx.beginPath()
    let open = false
    for (let i = 0; i <= samples; i++) {
      const x = start + ((end - start) * i) / samples
      const y = fn(x)
      if (!Number.isFinite(y) || y < 0) {
        open = false
        continue
      }
      const p = mathToScreen(view, size, { x, y })
      if (open) ctx.lineTo(p.x, p.y)
      else {
        ctx.moveTo(p.x, p.y)
        open = true
      }
    }
    ctx.stroke()
    ctx.restore()
  }

  // 概率区域（x ≤ probeX 的 pdf 下方面积）
  const probe = chart.probeX
  ctx.save()
  ctx.beginPath()
  const zero = mathToScreen(view, size, { x: 0, y: 0 })
  ctx.moveTo(mathToScreen(view, size, { x: start, y: 0 }).x, zero.y)
  for (let i = 0; i <= samples; i++) {
    const x = start + ((probe - start) * i) / samples
    if (x > probe) break
    const y = def.pdf(x, chart.params)
    if (!Number.isFinite(y)) continue
    const p = mathToScreen(view, size, { x, y })
    ctx.lineTo(p.x, p.y)
  }
  const probeScreen = mathToScreen(view, size, { x: probe, y: 0 })
  ctx.lineTo(probeScreen.x, zero.y)
  ctx.closePath()
  ctx.fillStyle = 'rgba(245, 158, 11, 0.25)'
  ctx.fill()
  ctx.restore()

  curve((x) => def.pdf(x, chart.params), DATA_COLOR, [])
  const compare = chart.compare
  if (compare) {
    const cdef = getDistribution(compare.dist)
    curve((x) => cdef.pdf(x, compare.params), '#16a34a', [6, 4])
  }

  // 探针竖线 + CDF 数值
  ctx.save()
  ctx.strokeStyle = PROBE_COLOR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(probeScreen.x, 0)
  ctx.lineTo(probeScreen.x, size.height)
  ctx.stroke()
  const cdf = def.cdf(probe, chart.params)
  const mean = def.mean(chart.params)
  const variance = def.variance(chart.params)
  ctx.fillStyle = '#374151'
  ctx.font = FONT
  ctx.fillText(`${def.name} · P(X ≤ ${probe.toPrecision(4)}) = ${cdf.toPrecision(6)}`, 10, 18)
  if (Number.isFinite(mean) && Number.isFinite(variance)) {
    ctx.fillText(`均值 ${mean.toPrecision(4)} · 方差 ${variance.toPrecision(4)}`, 10, 34)
  }
  ctx.restore()
}

function drawSimulation(
  ctx: CanvasRenderingContext2D,
  dataset: Dataset,
  view: ViewTransform,
  size: Size,
): void {
  const chart = dataset.chart
  if (chart.kind !== 'simulation') return
  const runtime = getSimRuntime()
  ctx.save()
  ctx.font = FONT
  if (!runtime) {
    ctx.fillStyle = '#6b7280'
    ctx.fillText('点击「播放」开始模拟', 10, 18)
    ctx.restore()
    return
  }
  switch (runtime.kind) {
    case 'lln': {
      // 频率折线 + 0.5 参考线
      const ref = mathToScreen(view, size, { x: 0, y: 0.5 })
      ctx.strokeStyle = '#9ca3af'
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(0, ref.y)
      ctx.lineTo(size.width, ref.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = DATA_COLOR
      ctx.lineWidth = 2
      ctx.beginPath()
      runtime.history.forEach((item, i) => {
        const p = mathToScreen(view, size, { x: item.trials, y: item.fraction })
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()
      const fraction = runtime.trials === 0 ? 0 : runtime.heads / runtime.trials
      ctx.fillStyle = '#374151'
      ctx.fillText(
        `n = ${runtime.trials} · 正面频率 = ${fraction.toFixed(5)} · 偏差 ${Math.abs(fraction - 0.5).toFixed(5)}`,
        10,
        18,
      )
      break
    }
    case 'clt':
    case 'bootstrap': {
      const means = runtime.means
      if (means.length > 20) {
        const result = histogram(
          means,
          Math.min(40, Math.max(10, Math.ceil(Math.sqrt(means.length)))),
          undefined,
        )
        // y 用密度尺度直方图（面积=1）+ 正态参考
        ctx.fillStyle = 'rgba(37, 99, 235, 0.3)'
        for (let i = 0; i < result.counts.length; i++) {
          const d = result.density[i]!
          if (d === 0) continue
          const p0 = mathToScreen(view, size, { x: result.edges[i]!, y: 0 })
          const p1 = mathToScreen(view, size, { x: result.edges[i + 1]!, y: d })
          ctx.fillRect(Math.min(p0.x, p1.x), p1.y, Math.abs(p1.x - p0.x), p0.y - p1.y)
        }
        // 正态参考曲线（样本均值与方差）
        const mean = means.reduce((a, b) => a + b, 0) / means.length
        let variance = 0
        for (const value of means) variance += (value - mean) * (value - mean)
        variance /= means.length - 1
        if (variance > 0) {
          const sd = Math.sqrt(variance)
          ctx.strokeStyle = REG_COLOR
          ctx.lineWidth = 2
          ctx.beginPath()
          for (let i = 0; i <= 200; i++) {
            const sx = (size.width * i) / 200
            const x = (sx - size.width / 2) / view.scaleX + view.centerX
            const z = (x - mean) / sd
            const y = Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI))
            const p = mathToScreen(view, size, { x, y })
            if (i === 0) ctx.moveTo(p.x, p.y)
            else ctx.lineTo(p.x, p.y)
          }
          ctx.stroke()
        }
      }
      ctx.fillStyle = '#374151'
      ctx.fillText(
        `${runtime.kind === 'clt' ? '样本均值' : '自助均值'} 次数 = ${means.length}`,
        10,
        18,
      )
      break
    }
    case 'montecarlo-pi': {
      // 单位正方形 + 内切圆 + 最近点
      const corner0 = mathToScreen(view, size, { x: 0, y: 0 })
      const corner1 = mathToScreen(view, size, { x: 1, y: 1 })
      ctx.strokeStyle = '#9ca3af'
      ctx.strokeRect(
        Math.min(corner0.x, corner1.x),
        Math.min(corner0.y, corner1.y),
        Math.abs(corner1.x - corner0.x),
        Math.abs(corner1.y - corner0.y),
      )
      const center = mathToScreen(view, size, { x: 0.5, y: 0.5 })
      const rim = mathToScreen(view, size, { x: 1, y: 0.5 })
      ctx.beginPath()
      ctx.arc(center.x, center.y, Math.abs(rim.x - center.x), 0, Math.PI * 2)
      ctx.strokeStyle = DATA_COLOR
      ctx.stroke()
      ctx.fillStyle = 'rgba(37, 99, 235, 0.55)'
      for (const point of runtime.points) {
        const p = mathToScreen(view, size, point)
        // 点大小按视口自适应（视口小则更小）
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2)
      }
      const estimate = runtime.total === 0 ? 0 : (4 * runtime.inside) / runtime.total
      ctx.fillStyle = '#374151'
      ctx.font = '14px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
      ctx.fillText(
        `撒点 ${runtime.total} · π ≈ ${estimate.toFixed(5)}（误差 ${Math.abs(estimate - Math.PI).toFixed(5)}）`,
        10,
        20,
      )
      break
    }
    default: {
      // random-walk：多条轨迹
      const colors = [DATA_COLOR, REG_COLOR, KDE_COLOR]
      runtime.walks.forEach((walk, i) => {
        ctx.strokeStyle = colors[i % colors.length]!
        ctx.lineWidth = 1.5
        ctx.beginPath()
        walk.forEach((point, j) => {
          const p = mathToScreen(view, size, point)
          if (j === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        })
        ctx.stroke()
      })
      const steps = runtime.walks[0]?.length ?? 0
      ctx.fillStyle = '#374151'
      ctx.fillText(`随机游走 · 步数 = ${Math.max(0, steps - 1)}`, 10, 18)
      break
    }
  }
  ctx.restore()
}

export const datasetElementRenderer: ElementRenderer<Dataset> = {
  type: 'dataset',
  draw(ctx, dataset, { view, size }) {
    if (!dataset.visible) return
    // 订阅帧版本（模拟动画推进时重绘）
    void getSimFrameVersion()
    switch (dataset.chart.kind) {
      case 'scatter':
        drawScatter(ctx, dataset, view, size)
        break
      case 'histogram':
        drawHistogram(ctx, dataset, view, size)
        break
      case 'distribution':
        drawDistribution(ctx, dataset, view, size)
        break
      default:
        drawSimulation(ctx, dataset, view, size)
        break
    }
  },
}
