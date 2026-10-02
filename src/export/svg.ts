/**
 * SVG 矢量导出（v0.6）：
 * - 曲线不复用屏幕采样点：按导出尺寸独立高精度重采样（容差 ≤0.2px、种子加密 1.5×）→ <path>；
 * - 网格/坐标轴/刻度标签为 <line>/<text> 元素（直角坐标；log 与极坐标仅导出曲线）；
 * - 图元素按渲染器同款几何（节点形状/平行边/自环/箭头/权重标签）矢量输出；
 * - 标记点：圆 + 坐标文本；文本可选中、可编辑。
 */
import { createProjector, mathToScreen, viewBounds } from '../core/transform'
import { formatTick, niceStep, ticksForRange } from '../core/ticks'
import { qualityToTuning } from '../render/samplers/types'
import { sampleExplicit } from '../render/samplers/adaptive'
import { sampleImplicit } from '../render/samplers/implicit'
import { sampleParametric, samplePolar } from '../render/samplers/parametric'
import { compileCurveExpr, dashForStyle, DEFAULT_T_RANGE } from '../render/curve-renderer'
import { arrowPoints, edgePath, nodeScreen, parallelKey } from '../render/graph-geometry'
import { objectsOfMode, resolveView, type ExportRange } from './frame'
import type { Curve, DocState, GraphObject, Point2, Size, ViewTransform } from '../state/types'

export interface SvgExportOptions {
  width: number
  height: number
  range: ExportRange
  /** null = 透明背景（默认白） */
  background?: string | null
}

const FONT = "system-ui, 'Segoe UI', 'Microsoft YaHei', sans-serif"

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(Number(value.toFixed(2)))
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 折线段（数学坐标）→ SVG path 数据（投影后输出） */
function segmentsToPath(segments: Point2[][], project: (p: Point2) => Point2): string {
  const parts: string[] = []
  for (const segment of segments) {
    let open = false
    for (const point of segment) {
      const s = project(point)
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) {
        open = false
        continue
      }
      parts.push(`${open ? 'L' : 'M'}${fmt(s.x)} ${fmt(s.y)}`)
      open = true
    }
  }
  return parts.join(' ')
}

/** 高精度采样单条曲线（与屏幕渲染同款采样器，容差收紧、种子加密） */
function sampleCurveForSvg(curve: Curve, view: ViewTransform, size: Size) {
  const tuning = qualityToTuning(curve.quality)
  const tight = {
    tolerancePx: Math.min(0.2, tuning.tolerancePx),
    maxDepth: Math.max(16, tuning.maxDepth),
  }
  const bounds = viewBounds(view, size)
  const projector = createProjector(view, size)
  switch (curve.kind) {
    case 'explicit': {
      const fn = compileCurveExpr(curve.expr)
      if (!fn) return null
      const scope: Record<string, number> = { ...curve.params, x: 0 }
      const f = (x: number): number => {
        scope['x'] = x
        return fn(scope)
      }
      return sampleExplicit(f, {
        ...tight,
        xMin: bounds.minX,
        xMax: bounds.maxX,
        widthPx: Math.round(size.width * 1.5),
        heightPx: size.height,
        screenX: projector.screenX,
        screenY: projector.screenY,
        screenToMathX: projector.screenToMathX,
      })
    }
    case 'implicit': {
      const fn = compileCurveExpr(curve.expr)
      if (!fn) return null
      const scope: Record<string, number> = { ...curve.params, x: 0, y: 0 }
      const F = (x: number, y: number): number => {
        scope['x'] = x
        scope['y'] = y
        return fn(scope)
      }
      return sampleImplicit(F, {
        xMin: bounds.minX,
        xMax: bounds.maxX,
        yMin: bounds.minY,
        yMax: bounds.maxY,
        widthPx: size.width,
        heightPx: size.height,
        quality: 5,
      })
    }
    case 'parametric': {
      if (curve.expr2 === undefined) return null
      const fnX = compileCurveExpr(curve.expr)
      const fnY = compileCurveExpr(curve.expr2)
      if (!fnX || !fnY) return null
      const scope: Record<string, number> = { ...curve.params, t: 0 }
      return sampleParametric(
        (t) => {
          scope['t'] = t
          return fnX(scope)
        },
        (t) => {
          scope['t'] = t
          return fnY(scope)
        },
        {
          ...tight,
          tMin: DEFAULT_T_RANGE[0],
          tMax: DEFAULT_T_RANGE[1],
          project: projector.project,
        },
      )
    }
    case 'polar': {
      const fn = compileCurveExpr(curve.expr)
      if (!fn) return null
      const scope: Record<string, number> = { ...curve.params, theta: 0 }
      const r = (theta: number): number => {
        scope['theta'] = theta
        return fn(scope)
      }
      return samplePolar(r, {
        ...tight,
        tMin: DEFAULT_T_RANGE[0],
        tMax: DEFAULT_T_RANGE[1],
        project: projector.project,
      })
    }
    default:
      return null
  }
}

/** 曲线 → SVG（path + 渐近线虚线） */
function curveSvg(curve: Curve, view: ViewTransform, size: Size): string {
  if (!curve.visible) return ''
  const sampled = sampleCurveForSvg(curve, view, size)
  if (!sampled) return ''
  const projector = createProjector(view, size)
  const d = segmentsToPath(sampled.segments, projector.project)
  if (d === '') return ''
  const dash = dashForStyle(curve.lineStyle)
  const dashAttr = dash.length > 0 ? ` stroke-dasharray="${dash.join(',')}"` : ''
  let out = `<path d="${d}" fill="none" stroke="${curve.color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${dashAttr}/>`

  for (const x of sampled.asymptoteXs) {
    const s = mathToScreen(view, size, { x, y: 0 })
    if (!Number.isFinite(s.x)) continue
    out += `\n<line x1="${fmt(s.x)}" y1="0" x2="${fmt(s.x)}" y2="${fmt(size.height)}" stroke="${curve.color}" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>`
  }
  return out
}

/** 网格 + 坐标轴 + 刻度标签（仅直角坐标；log/polar 不绘制） */
function gridSvg(view: ViewTransform, size: Size): string {
  if (view.coordType !== 'rect') return ''
  const bounds = viewBounds(view, size)
  const stepX = niceStep(view.scaleX)
  const stepY = niceStep(view.scaleY)
  const xs = ticksForRange(bounds.minX, bounds.maxX, stepX)
  const ys = ticksForRange(bounds.minY, bounds.maxY, stepY)
  const lines: string[] = []
  for (const x of xs) {
    const s = mathToScreen(view, size, { x, y: bounds.minY })
    lines.push(
      `<line x1="${fmt(s.x)}" y1="0" x2="${fmt(s.x)}" y2="${fmt(size.height)}" stroke="#e5e7eb" stroke-width="1"/>`,
    )
  }
  for (const y of ys) {
    const s = mathToScreen(view, size, { x: bounds.minX, y })
    lines.push(
      `<line x1="0" y1="${fmt(s.y)}" x2="${fmt(size.width)}" y2="${fmt(s.y)}" stroke="#e5e7eb" stroke-width="1"/>`,
    )
  }

  // 坐标轴（可移动的位置；仅在视域内绘制）
  const vertX = mathToScreen(view, size, { x: view.axisY, y: bounds.minY }).x
  const horizY = mathToScreen(view, size, { x: bounds.minX, y: view.axisX }).y
  let axes = ''
  if (vertX >= 0 && vertX <= size.width) {
    axes += `\n<line x1="${fmt(vertX)}" y1="0" x2="${fmt(vertX)}" y2="${fmt(size.height)}" stroke="#9ca3af" stroke-width="1.4"/>`
  }
  if (horizY >= 0 && horizY <= size.height) {
    axes += `\n<line x1="0" y1="${fmt(horizY)}" x2="${fmt(size.width)}" y2="${fmt(horizY)}" stroke="#9ca3af" stroke-width="1.4"/>`
  }

  // 刻度标签（文本元素，可选中）
  let labels = ''
  const labelY = Math.min(size.height - 4, Math.max(14, horizY + 14))
  for (const x of xs) {
    const s = mathToScreen(view, size, { x, y: 0 })
    if (s.x < 14 || s.x > size.width - 8) continue
    labels += `\n<text x="${fmt(s.x)}" y="${fmt(labelY)}" font-family="${FONT}" font-size="12" fill="#6b7280" text-anchor="middle">${escapeXml(formatTick(x, stepX))}</text>`
  }
  const labelX = Math.min(size.width - 30, Math.max(4, vertX + 6))
  for (const y of ys) {
    const s = mathToScreen(view, size, { x: 0, y })
    if (s.y < 14 || s.y > size.height - 4) continue
    labels += `\n<text x="${fmt(labelX)}" y="${fmt(s.y + 4)}" font-family="${FONT}" font-size="12" fill="#6b7280">${escapeXml(formatTick(y, stepY))}</text>`
  }
  return [...lines, axes, labels].join('\n')
}

/** 权重文本（白底 + 数字，4 位有效数字） */
function weightSvg(mid: Point2, weight: number): string {
  const text = String(Number(weight.toPrecision(4)))
  const width = text.length * 6.6 + 6
  return (
    `<rect x="${fmt(mid.x - width / 2)}" y="${fmt(mid.y - 8)}" width="${fmt(width)}" height="16" fill="rgba(255,255,255,0.88)"/>` +
    `<text x="${fmt(mid.x)}" y="${fmt(mid.y + 4)}" font-family="${FONT}" font-size="11" fill="#374151" text-anchor="middle">${escapeXml(text)}</text>`
  )
}

/** 图 → SVG（节点形状/平行边/自环/箭头/权重/标签） */
export function graphSvg(graph: GraphObject, view: ViewTransform, size: Size): string {
  if (!graph.visible) return ''
  const screens = new Map<string, ReturnType<typeof nodeScreen>>()
  for (const node of graph.nodes) {
    const s = nodeScreen(node, view, size)
    if (Number.isFinite(s.cx) && Number.isFinite(s.cy)) screens.set(node.id, s)
  }
  const groups = new Map<string, typeof graph.edges>()
  for (const edge of graph.edges) {
    const key = parallelKey(edge)
    const list = groups.get(key)
    if (list) list.push(edge)
    else groups.set(key, [edge])
  }

  const parts: string[] = []
  for (const edge of graph.edges) {
    const from = screens.get(edge.source)
    const to = screens.get(edge.target)
    if (!from || !to) continue
    const group = groups.get(parallelKey(edge)) ?? [edge]
    const index = group.indexOf(edge)
    const path = edgePath(edge, from, to, index < 0 ? 0 : index, group.length)
    const points = path.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ')
    const dash = edge.style === 'dashed' ? ` stroke-dasharray="6,4"` : ''
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${edge.color}" stroke-width="1.6" stroke-linejoin="round"${dash}/>`,
    )
    if (edge.directed) {
      const tip = path[path.length - 1]
      const prev = path[path.length - 2]
      if (tip && prev) {
        const triangle = arrowPoints(tip, { x: tip.x - prev.x, y: tip.y - prev.y })
        parts.push(
          `<polygon points="${triangle.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ')}" fill="${edge.color}"/>`,
        )
      }
    }
    if (edge.weight !== null) {
      const mid = path[Math.floor(path.length / 2)]
      if (mid) parts.push(weightSvg(mid, edge.weight))
    }
  }

  for (const node of graph.nodes) {
    const s = screens.get(node.id)
    if (!s) continue
    if (node.shape === 'square') {
      parts.push(
        `<rect x="${fmt(s.cx - s.radius)}" y="${fmt(s.cy - s.radius)}" width="${fmt(s.radius * 2)}" height="${fmt(s.radius * 2)}" fill="${node.color}" stroke="#ffffff" stroke-width="2"/>`,
      )
    } else if (node.shape === 'diamond') {
      const r = s.radius * 1.15
      parts.push(
        `<polygon points="${fmt(s.cx)},${fmt(s.cy - r)} ${fmt(s.cx + r)},${fmt(s.cy)} ${fmt(s.cx)},${fmt(s.cy + r)} ${fmt(s.cx - r)},${fmt(s.cy)}" fill="${node.color}" stroke="#ffffff" stroke-width="2"/>`,
      )
    } else {
      parts.push(
        `<circle cx="${fmt(s.cx)}" cy="${fmt(s.cy)}" r="${fmt(s.radius)}" fill="${node.color}" stroke="#ffffff" stroke-width="2"/>`,
      )
    }
    parts.push(
      `<text x="${fmt(s.cx)}" y="${fmt(s.cy + s.radius + 15)}" font-family="${FONT}" font-size="12" fill="#1f2937" text-anchor="middle">${escapeXml(node.label)}</text>`,
    )
  }
  return parts.join('\n')
}

/** 构建完整 SVG 文档 */
export function buildSvg(
  doc: DocState,
  mode: 'plot' | 'graph',
  baseView: ViewTransform,
  options: SvgExportOptions,
): string {
  const size: Size = { width: options.width, height: options.height }
  const objects = objectsOfMode(doc, mode)
  const view = resolveView(options.range, baseView, size, objects)

  const layers: string[] = []
  if (options.background !== null) {
    layers.push(
      `<rect x="0" y="0" width="${size.width}" height="${size.height}" fill="${options.background ?? '#ffffff'}"/>`,
    )
  }
  if (mode === 'plot' && options.background !== null) {
    layers.push(gridSvg(view, size))
  }
  for (const object of objects) {
    if (object.type === 'curve') layers.push(curveSvg(object, view, size))
    else if (object.type === 'graph') layers.push(graphSvg(object, view, size))
    else if (object.type === 'marker') {
      const p = mathToScreen(view, size, object)
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        layers.push(
          `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="5" fill="rgba(220,38,38,0.15)" stroke="#dc2626" stroke-width="2"/>` +
            `<text x="${fmt(p.x + 8)}" y="${fmt(p.y + 4)}" font-family="${FONT}" font-size="12" fill="#b91c1c">${escapeXml(
              `(${object.x}, ${object.y})`,
            )}</text>`,
        )
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`,
    ...layers.filter((layer) => layer !== ''),
    '</svg>',
  ].join('\n')
}
