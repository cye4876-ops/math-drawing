/**
 * 图同构与自同构（v3.2）：颜色细化（1-WL）+ 回溯。
 * - 同构判定：阶/边数/度序列快速筛除，再按颜色类回溯匹配（预算保护）；
 * - 自同构计数：同一回溯在单图上计数（对齐 NetworkX/nauty 的基础能力）。
 * 约定：按无向简单图处理（方向、权重、重边在计算时忽略）。
 */
import type { GraphObject } from './model'

interface SimpleGraph {
  n: number
  adj: Set<number>[]
}

function buildSimple(graph: GraphObject): SimpleGraph {
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const adj = Array.from({ length: n }, () => new Set<number>())
  for (const edge of graph.edges) {
    const u = index.get(edge.source)
    const v = index.get(edge.target)
    if (u === undefined || v === undefined || u === v) continue
    adj[u]!.add(v)
    adj[v]!.add(u)
  }
  return { n, adj }
}

/** 1-WL 颜色细化（颜色从 0 起编号，稳定后返回） */
export function refineColors(graph: GraphObject): number[] {
  const { n, adj } = buildSimple(graph)
  let colors = adj.map((set) => set.size)
  let classes = new Set(colors).size
  for (let round = 0; round < n; round++) {
    const keyToColor = new Map<string, number>()
    const next: number[] = []
    for (let v = 0; v < n; v++) {
      const neighborColors = [...adj[v]!].map((u) => colors[u] ?? 0).sort((a, b) => a - b)
      const key = `${colors[v]}|${neighborColors.join(',')}`
      let color = keyToColor.get(key)
      if (color === undefined) {
        color = keyToColor.size
        keyToColor.set(key, color)
      }
      next.push(color)
    }
    const nextClasses = keyToColor.size
    colors = next
    if (nextClasses === classes) break
    classes = nextClasses
  }
  return colors
}

function histogram(colors: number[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const color of colors) map.set(color, (map.get(color) ?? 0) + 1)
  return map
}

function sameHistogram(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false
  }
  return true
}

export interface IsomorphismResult {
  isomorphic: boolean
  /** 搜索预算是否耗尽（耗尽时结论可能为假阴性） */
  budgetExceeded: boolean
  colorClasses: number
  note: string
}

export function areIsomorphic(
  first: GraphObject,
  second: GraphObject,
  budget = 200_000,
): IsomorphismResult {
  const a = buildSimple(first)
  const b = buildSimple(second)
  const edgeCount = (g: SimpleGraph): number => {
    let sum = 0
    for (const set of g.adj) sum += set.size
    return sum / 2
  }
  const base = {
    isomorphic: false,
    budgetExceeded: false,
    colorClasses: 0,
    note: '',
  }
  if (a.n !== b.n || edgeCount(a) !== edgeCount(b)) {
    return { ...base, note: '阶或边数不同，必然不同构。' }
  }
  const colorsA = refineColors(first)
  const colorsB = refineColors(second)
  const classes = new Set(colorsA).size
  if (!sameHistogram(histogram(colorsA), histogram(colorsB))) {
    return { ...base, colorClasses: classes, note: '颜色细化（1-WL）分布不同，必然不同构。' }
  }
  // 回溯：按颜色类大小升序优先、度降序排列 A 的顶点
  const order = Array.from({ length: a.n }, (_, i) => i).sort((x, y) => {
    const sx = a.adj[x]!.size
    const sy = a.adj[y]!.size
    return sy - sx || x - y
  })
  const mapping = new Array<number>(a.n).fill(-1)
  const used = new Array<boolean>(b.n).fill(false)
  let budgetUsed = 0
  let found = false

  const consistent = (u: number, v: number): boolean => {
    for (let x = 0; x < a.n; x++) {
      const image = mapping[x]!
      if (image === -1) continue
      if (a.adj[u]!.has(x) !== b.adj[v]!.has(image)) return false
    }
    return true
  }

  const backtrack = (index: number): void => {
    if (found) return
    if (budgetUsed > budget) return
    if (index === order.length) {
      found = true
      return
    }
    const u = order[index]!
    for (let v = 0; v < b.n; v++) {
      budgetUsed++
      if (used[v] || colorsA[u] !== colorsB[v] || a.adj[u]!.size !== b.adj[v]!.size) continue
      if (!consistent(u, v)) continue
      mapping[u] = v
      used[v] = true
      backtrack(index + 1)
      mapping[u] = -1
      used[v] = false
      if (found) return
    }
  }
  backtrack(0)
  return {
    isomorphic: found,
    budgetExceeded: !found && budgetUsed > budget,
    colorClasses: classes,
    note: found
      ? `同构（颜色类 ${classes} 个；搜索节点 ${budgetUsed}）。`
      : budgetUsed > budget
        ? '搜索预算耗尽，未能判定（可能同构）。'
        : '回溯搜索完成：不同构。',
  }
}

export interface AutomorphismResult {
  count: number
  complete: boolean
  colorClasses: number
  note: string
}

/** 自同构计数（回溯 + 颜色/度剪枝；预算保护） */
export function countAutomorphisms(graph: GraphObject, budget = 500_000): AutomorphismResult {
  const { n, adj } = buildSimple(graph)
  const colors = refineColors(graph)
  const classes = new Set(colors).size
  if (n === 0) return { count: 1, complete: true, colorClasses: 0, note: '空图：|Aut| = 1。' }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => {
    return adj[y]!.size - adj[x]!.size || x - y
  })
  const mapping = new Array<number>(n).fill(-1)
  const used = new Array<boolean>(n).fill(false)
  let count = 0
  let budgetUsed = 0

  const consistent = (u: number, v: number): boolean => {
    for (let x = 0; x < n; x++) {
      const image = mapping[x]!
      if (image === -1) continue
      if (adj[u]!.has(x) !== adj[v]!.has(image)) return false
    }
    return true
  }

  const backtrack = (index: number): void => {
    if (budgetUsed > budget) return
    if (index === order.length) {
      count++
      return
    }
    const u = order[index]!
    for (let v = 0; v < n; v++) {
      budgetUsed++
      if (used[v] || colors[u] !== colors[v] || adj[u]!.size !== adj[v]!.size) continue
      if (!consistent(u, v)) continue
      mapping[u] = v
      used[v] = true
      backtrack(index + 1)
      mapping[u] = -1
      used[v] = false
      if (budgetUsed > budget) return
    }
  }
  backtrack(0)
  const complete = budgetUsed <= budget
  return {
    count,
    complete,
    colorClasses: classes,
    note: complete
      ? `自同构群阶 |Aut(G)| = ${count}（颜色类 ${classes} 个；回溯节点 ${budgetUsed}）。`
      : `搜索预算耗尽，|Aut(G)| ≥ ${count}（未完成）。`,
  }
}

/** 颜色类数量（1-WL 稳定后）——用于面板展示“结构对称性”粗指标 */
export function colorClassCount(graph: GraphObject): number {
  return new Set(refineColors(graph)).size
}
