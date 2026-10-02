/**
 * 图元素渲染器（v0.5 元素注册制）：节点（屏幕恒定尺寸、三种形状）、边（直线/平行边弯曲/自环、
 * 有向箭头、权重标签）与节点标签。命中检测委托 graph-geometry（与渲染同路径）。
 */
import type { GraphEdgeData, GraphNodeData, GraphObject, NodeShape } from '../graph/model'
import type { Point2 } from '../state/types'
import type { ElementRenderer, SceneHighlight } from './element-registry'
import {
  arrowPoints,
  edgePath,
  hitTestGraph,
  nodeScreen,
  parallelKey,
  type NodeScreen,
} from './graph-geometry'

const LABEL_FONT = '12px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
const WEIGHT_FONT = '11px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
/** 矩阵↔图联动等高亮色（琥珀：当前步骤/选中） */
const HIGHLIGHT_COLOR = '#f59e0b'
/** 累积轨迹色（玫红：已访问节点/已走过边；与节点调色板不撞色） */
const TRAIL_COLOR = '#db2777'

/** 边是否命中高亮集合（无向边方向不敏感） */
function edgeHighlighted(edge: GraphEdgeData, highlight: SceneHighlight | undefined): boolean {
  if (!highlight?.edges) return false
  return highlight.edges.some(
    (item) =>
      (item.source === edge.source && item.target === edge.target) ||
      (!edge.directed && item.source === edge.target && item.target === edge.source),
  )
}

/** 边是否命中累积轨迹（无向边方向不敏感） */
function edgeInTrail(edge: GraphEdgeData, highlight: SceneHighlight | undefined): boolean {
  if (!highlight?.trailEdges) return false
  return highlight.trailEdges.some(
    (item) =>
      (item.source === edge.source && item.target === edge.target) ||
      (!edge.directed && item.source === edge.target && item.target === edge.source),
  )
}

/** 节点是否命中高亮集合 */
function nodeHighlighted(id: string, highlight: SceneHighlight | undefined): boolean {
  return highlight?.nodes?.includes(id) ?? false
}

/** 节点是否命中累积轨迹 */
function nodeInTrail(id: string, highlight: SceneHighlight | undefined): boolean {
  return highlight?.trailNodes?.includes(id) ?? false
}

/** 权重显示：4 位有效数字 */
function formatWeight(value: number): string {
  return String(Number(value.toPrecision(4)))
}

function tracePath(ctx: CanvasRenderingContext2D, points: Point2[]): void {
  const first = points[0]
  if (!first) return
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < points.length; i++) {
    const p = points[i] as Point2
    ctx.lineTo(p.x, p.y)
  }
}

function drawNodeShape(ctx: CanvasRenderingContext2D, s: NodeScreen, shape: NodeShape): void {
  ctx.beginPath()
  if (shape === 'square') {
    ctx.rect(s.cx - s.radius, s.cy - s.radius, s.radius * 2, s.radius * 2)
  } else if (shape === 'diamond') {
    const r = s.radius * 1.15
    ctx.moveTo(s.cx, s.cy - r)
    ctx.lineTo(s.cx + r, s.cy)
    ctx.lineTo(s.cx, s.cy + r)
    ctx.lineTo(s.cx - r, s.cy)
    ctx.closePath()
  } else {
    ctx.arc(s.cx, s.cy, s.radius, 0, Math.PI * 2)
  }
}

/** 平行边分组（顺序与文档一致，供渲染与命中共用的层级） */
function groupEdges(edges: GraphEdgeData[]): Map<string, GraphEdgeData[]> {
  const groups = new Map<string, GraphEdgeData[]>()
  for (const edge of edges) {
    const key = parallelKey(edge)
    const list = groups.get(key)
    if (list) list.push(edge)
    else groups.set(key, [edge])
  }
  return groups
}

function drawNodeLabel(ctx: CanvasRenderingContext2D, node: GraphNodeData, s: NodeScreen): void {
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#cbd5e1'
  ctx.fillText(node.label, s.cx, s.cy + s.radius + 4)
}

export const graphElementRenderer: ElementRenderer<GraphObject> = {
  type: 'graph',
  draw(ctx, graph, { view, size }, highlight) {
    if (!graph.visible) return

    const screens = new Map<string, NodeScreen>()
    for (const node of graph.nodes) {
      const s = nodeScreen(node, view, size)
      if (Number.isFinite(s.cx) && Number.isFinite(s.cy)) screens.set(node.id, s)
    }
    const groups = groupEdges(graph.edges)

    ctx.save()

    // ---- 边（先画，节点覆盖其上） ----
    for (const edge of graph.edges) {
      const from = screens.get(edge.source)
      const to = screens.get(edge.target)
      if (!from || !to) continue
      const group = groups.get(parallelKey(edge)) ?? [edge]
      const index = group.indexOf(edge)
      const path = edgePath(edge, from, to, index < 0 ? 0 : index, group.length)

      const highlighted = edgeHighlighted(edge, highlight)
      const inTrail = !highlighted && edgeInTrail(edge, highlight)
      const strokeColor = highlighted ? HIGHLIGHT_COLOR : inTrail ? TRAIL_COLOR : edge.color
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = highlighted ? 3.2 : inTrail ? 2.4 : 1.6
      ctx.lineJoin = 'round'
      ctx.setLineDash(edge.style === 'dashed' ? [6, 4] : [])
      tracePath(ctx, path)
      ctx.stroke()

      if (edge.directed) {
        const tip = path[path.length - 1]
        const prev = path[path.length - 2]
        if (tip && prev) {
          const triangle = arrowPoints(tip, { x: tip.x - prev.x, y: tip.y - prev.y })
          ctx.setLineDash([])
          ctx.fillStyle = strokeColor
          ctx.beginPath()
          ctx.moveTo(triangle[0].x, triangle[0].y)
          ctx.lineTo(triangle[1].x, triangle[1].y)
          ctx.lineTo(triangle[2].x, triangle[2].y)
          ctx.closePath()
          ctx.fill()
        }
      }

      if (edge.weight !== null) {
        const mid = path[Math.floor(path.length / 2)]
        if (mid) {
          const text = formatWeight(edge.weight)
          ctx.setLineDash([])
          ctx.font = WEIGHT_FONT
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const width = ctx.measureText(text).width
          ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
          ctx.fillRect(mid.x - width / 2 - 3, mid.y - 8, width + 6, 16)
          ctx.fillStyle = '#374151'
          ctx.fillText(text, mid.x, mid.y)
        }
      }
    }

    // ---- 节点 ----
    for (const node of graph.nodes) {
      const s = screens.get(node.id)
      if (!s) continue
      const highlighted = nodeHighlighted(node.id, highlight)
      const inTrail = !highlighted && nodeInTrail(node.id, highlight)
      drawNodeShape(ctx, s, node.shape)
      ctx.fillStyle = highlight?.fills?.[node.id] ?? node.color
      ctx.fill()
      ctx.strokeStyle = highlighted ? HIGHLIGHT_COLOR : inTrail ? TRAIL_COLOR : '#ffffff'
      ctx.lineWidth = highlighted ? 3.5 : inTrail ? 2.8 : 2
      ctx.stroke()
      drawNodeLabel(ctx, node, s)
    }

    ctx.restore()
  },

  hitTest(graph, screen, { view, size }, maxDistancePx) {
    if (!graph.visible) return null
    const hit = hitTestGraph(graph, screen, view, size, maxDistancePx)
    if (!hit) return null
    return {
      elementId: graph.id,
      part: hit.part,
      targetId: hit.targetId,
      distancePx: hit.distancePx,
    }
  },
}
