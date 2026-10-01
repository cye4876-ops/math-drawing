/**
 * 图着色（v0.5 阶段 5）：
 * - 二分判定（BFS 二着色，奇环/自环 → false）；
 * - 贪心着色（按度数降序，取最小可用色）；
 * - DSATUR 饱和度着色（小图通常给出最优色数：Petersen → 3、K5 → 5）。
 * 着色语义：邻接忽略边方向（「有边相连」即相邻）。
 */
import type { GraphObject } from '../model'
import { graphView } from './common'
import type { BipartiteResult, ColoringResult } from './types'

/** 二分判定：对每个连通分量 BFS 二着色；发现同色相邻（含自环）即失败 */
export function isBipartite(graph: GraphObject): BipartiteResult {
  const view = graphView(graph)
  const g = view.g
  const colors: Record<string, number> = {}
  let conflict: { source: string; target: string } | null = null
  for (const node of graph.nodes) {
    if (colors[node.id] !== undefined) continue
    colors[node.id] = 0
    const queue: string[] = [node.id]
    while (queue.length > 0) {
      const u = queue.shift()!
      const currentColor = colors[u]!
      for (const v of g.neighbors(u)) {
        if (colors[v] === undefined) {
          colors[v] = 1 - currentColor
          queue.push(v)
        } else if (colors[v] === currentColor) {
          conflict = { source: u, target: v }
          return { bipartite: false, colors, conflict }
        }
      }
    }
  }
  return { bipartite: true, colors, conflict }
}

/** 贪心着色（度数降序）：依次取「相邻已用色」之外的最小色号 */
export function greedyColoring(graph: GraphObject): ColoringResult {
  const view = graphView(graph)
  const g = view.g
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const order = [...graph.nodes].sort(
    (a, b) => g.degree(b.id) - g.degree(a.id) || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0),
  )
  const colors: Record<string, number> = {}
  let count = 0
  for (const node of order) {
    const used = new Set<number>()
    for (const other of g.neighbors(node.id)) {
      const color = colors[other]
      if (color !== undefined) used.add(color)
    }
    let color = 0
    while (used.has(color)) color++
    colors[node.id] = color
    count = Math.max(count, color + 1)
  }
  return { colors, count, method: 'greedy' }
}

/**
 * DSATUR 饱和度着色：
 * 每步选「相邻已用色种类（饱和度）最多」的未着色节点（并列取度数高者，再并列取原顺序），
 * 用最小可用色着色。对小图通常给出最优色数。
 */
export function dsaturColoring(graph: GraphObject): ColoringResult {
  const view = graphView(graph)
  const g = view.g
  const colors: Record<string, number> = {}
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  let count = 0
  for (let step = 0; step < graph.nodes.length; step++) {
    let best: string | null = null
    let bestSaturation = -1
    let bestDegree = -1
    for (const node of graph.nodes) {
      if (colors[node.id] !== undefined) continue
      const used = new Set<number>()
      for (const other of g.neighbors(node.id)) {
        const color = colors[other]
        if (color !== undefined) used.add(color)
      }
      const saturation = used.size
      const degree = g.degree(node.id)
      if (
        saturation > bestSaturation ||
        (saturation === bestSaturation && degree > bestDegree) ||
        (saturation === bestSaturation &&
          degree === bestDegree &&
          best !== null &&
          (index.get(node.id) ?? 0) < (index.get(best) ?? 0))
      ) {
        best = node.id
        bestSaturation = saturation
        bestDegree = degree
      }
    }
    if (best === null) break
    const used = new Set<number>()
    for (const other of g.neighbors(best)) {
      const color = colors[other]
      if (color !== undefined) used.add(color)
    }
    let color = 0
    while (used.has(color)) color++
    colors[best] = color
    count = Math.max(count, color + 1)
  }
  return { colors, count, method: 'dsatur' }
}

/** 校验着色合法性（测试与调试用）：每条边的两端颜色不同 */
export function verifyColoring(graph: GraphObject, colors: Record<string, number>): boolean {
  for (const edge of graph.edges) {
    const a = colors[edge.source]
    const b = colors[edge.target]
    if (a === undefined || b === undefined || a === b) return false
  }
  return true
}
