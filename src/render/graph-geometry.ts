/**
 * 图元素几何（v0.5）：节点/边在屏幕空间的纯函数计算，供渲染与命中检测共享。
 * 节点半径为屏幕空间常量——缩放时节点大小不变（图元素与曲线在缩放语义上相反）。
 */
import { mathToScreen } from '../core/transform'
import type { GraphEdgeData, GraphNodeData } from '../graph/model'
import type { Point2, Size, ViewTransform } from '../state/types'

export interface NodeScreen {
  cx: number
  cy: number
  radius: number
}

/** 节点圆心与半径（屏幕空间） */
export function nodeScreen(node: GraphNodeData, view: ViewTransform, size: Size): NodeScreen {
  const p = mathToScreen(view, size, node)
  return { cx: p.x, cy: p.y, radius: node.size }
}

/** 平行边分组键：有向边按方向；无向边按端点排序归一化；自环单独成组 */
export function parallelKey(edge: GraphEdgeData): string {
  if (edge.source === edge.target) return `${edge.source}~`
  if (edge.directed) return `${edge.source}>${edge.target}`
  const [a, b] = edge.source < edge.target ? [edge.source, edge.target] : [edge.target, edge.source]
  return `${a}-${b}`
}

/** 自环环半径相对节点半径的倍数 */
const SELF_LOOP_FACTOR = 1.9
/** 重边弯曲偏移（每层，像素） */
const PARALLEL_OFFSET_PX = 16

/**
 * 边路径（屏幕空间采样点）：
 * - 普通边：直线（端点收缩到节点边缘）；
 * - 平行边：按层级做垂直方向的二次贝塞尔弯曲，互不重叠；
 * - 自环：节点右上方的圆环。
 */
export function edgePath(
  edge: GraphEdgeData,
  from: NodeScreen,
  to: NodeScreen,
  parallelIndex: number,
  parallelCount: number,
): Point2[] {
  if (edge.source === edge.target) {
    const radius = to.radius * SELF_LOOP_FACTOR
    const cx = to.cx + to.radius * 0.9
    const cy = to.cy - to.radius * 0.9
    const points: Point2[] = []
    const steps = 28
    for (let i = 0; i <= steps; i++) {
      const angle = Math.PI * 0.25 + (i / steps) * Math.PI * 2
      points.push({ x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) })
    }
    return points
  }

  const dx = to.cx - from.cx
  const dy = to.cy - from.cy
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const start = { x: from.cx + ux * from.radius, y: from.cy + uy * from.radius }
  const end = { x: to.cx - ux * to.radius, y: to.cy - uy * to.radius }
  if (parallelCount <= 1) return [start, end]

  const offset = (parallelIndex - (parallelCount - 1) / 2) * PARALLEL_OFFSET_PX
  const mx = (start.x + end.x) / 2 - uy * offset
  const my = (start.y + end.y) / 2 + ux * offset
  const points: Point2[] = []
  const steps = 18
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const it = 1 - t
    points.push({
      x: it * it * start.x + 2 * it * t * mx + t * t * end.x,
      y: it * it * start.y + 2 * it * t * my + t * t * end.y,
    })
  }
  return points
}

/** 有向边箭头三角形（尖端在 tip；dir 为指向尖端的方向） */
export function arrowPoints(tip: Point2, dir: Point2, size = 9): [Point2, Point2, Point2] {
  const len = Math.hypot(dir.x, dir.y) || 1
  const ux = dir.x / len
  const uy = dir.y / len
  const backX = tip.x - ux * size
  const backY = tip.y - uy * size
  const nx = -uy
  const ny = ux
  return [
    { x: tip.x, y: tip.y },
    { x: backX + nx * size * 0.45, y: backY + ny * size * 0.45 },
    { x: backX - nx * size * 0.45, y: backY - ny * size * 0.45 },
  ]
}

/** 点到线段的距离 */
function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.min(1, Math.max(0, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** 点到折线的最短距离 */
export function distanceToPolyline(points: Point2[], p: Point2): number {
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    const d = distanceToSegment(p, points[i - 1] as Point2, points[i] as Point2)
    if (d < best) best = d
  }
  return best
}

export interface GraphHit {
  part: 'node' | 'edge'
  /** 节点 id（part='node'）或边 id（part='edge'） */
  targetId: string
  distancePx: number
}

/**
 * 命中检测：节点优先（圆内或边缘 2px 内），否则取最近的边（≤ maxDistancePx）。
 * 边命中采用与渲染完全相同的路径（含重边弯曲与自环）。
 */
export function hitTestGraph(
  graph: { nodes: GraphNodeData[]; edges: GraphEdgeData[] },
  screen: Point2,
  view: ViewTransform,
  size: Size,
  maxDistancePx: number,
): GraphHit | null {
  const screens = new Map<string, NodeScreen>()
  for (const node of graph.nodes) screens.set(node.id, nodeScreen(node, view, size))

  let bestNode: GraphHit | null = null
  for (const node of graph.nodes) {
    const s = screens.get(node.id)
    if (!s || !Number.isFinite(s.cx) || !Number.isFinite(s.cy)) continue
    const d = Math.hypot(screen.x - s.cx, screen.y - s.cy)
    if (d <= s.radius + 2 && (bestNode === null || d < bestNode.distancePx)) {
      bestNode = { part: 'node', targetId: node.id, distancePx: d }
    }
  }
  if (bestNode) return bestNode

  const groups = new Map<string, GraphEdgeData[]>()
  for (const edge of graph.edges) {
    const key = parallelKey(edge)
    const list = groups.get(key)
    if (list) list.push(edge)
    else groups.set(key, [edge])
  }

  let bestEdge: GraphHit | null = null
  for (const edge of graph.edges) {
    const from = screens.get(edge.source)
    const to = screens.get(edge.target)
    if (!from || !to) continue
    const group = groups.get(parallelKey(edge)) ?? [edge]
    const index = group.indexOf(edge)
    const path = edgePath(edge, from, to, index < 0 ? 0 : index, group.length)
    const d = distanceToPolyline(path, screen)
    if (d <= maxDistancePx && (bestEdge === null || d < bestEdge.distancePx)) {
      bestEdge = { part: 'edge', targetId: edge.id, distancePx: d }
    }
  }
  return bestEdge
}
