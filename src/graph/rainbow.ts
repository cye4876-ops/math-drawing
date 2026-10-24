/**
 * 彩虹图 / 反拉姆齐工作台（v3.5）：
 * - 边着色图的彩虹子图搜索（路径 / 圈 / 匹配 / 团），返回边集见证；
 * - Gallai 着色检测（是否存在彩虹三角形）；
 * - 反拉姆齐数 ar(n,H) 的小 n 穷举：最大颜色数 + 无彩虹 H 的见证着色；
 * - 完全图 Kₙ 的着色构造（全不同色 / Gallai / 3 色散列），供画布与教学使用。
 */
import type { GraphObject } from './model'

export const RAINBOW_PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f59e0b',
  '#84cc16',
  '#6366f1',
] as const

export function rainbowColor(index: number): string {
  return RAINBOW_PALETTE[
    ((index % RAINBOW_PALETTE.length) + RAINBOW_PALETTE.length) % RAINBOW_PALETTE.length
  ]!
}

export interface ColoredEdge {
  id: string
  u: number
  v: number
  color: string
}

export interface ColoredGraph {
  n: number
  labels: string[]
  edges: ColoredEdge[]
}

export type RainbowPatternKind = 'path' | 'cycle' | 'matching' | 'clique'

export interface RainbowPattern {
  kind: RainbowPatternKind
  /** path/cycle/clique = 顶点数；matching = 边数 */
  size: number
}

export interface RainbowCopy {
  /** 顶点索引（路径/圈按遍历顺序；匹配/团为升序集合） */
  vertices: number[]
  /** ColoredGraph.edges 的下标（升序） */
  edges: number[]
}

export interface RainbowSearchResult {
  copies: RainbowCopy[]
  /** false = 达到展示上限，未穷尽 */
  complete: boolean
  visited: number
  note: string
}

export const RAINBOW_PATTERNS: Array<{ id: string; label: string; pattern: RainbowPattern }> = [
  { id: 'path3', label: 'P₃（3 点路径）', pattern: { kind: 'path', size: 3 } },
  { id: 'path4', label: 'P₄（4 点路径）', pattern: { kind: 'path', size: 4 } },
  { id: 'path5', label: 'P₅（5 点路径）', pattern: { kind: 'path', size: 5 } },
  { id: 'cycle3', label: 'C₃（三角形）', pattern: { kind: 'cycle', size: 3 } },
  { id: 'cycle4', label: 'C₄（4 圈）', pattern: { kind: 'cycle', size: 4 } },
  { id: 'cycle5', label: 'C₅（5 圈）', pattern: { kind: 'cycle', size: 5 } },
  { id: 'matching2', label: '2K₂（2 条不交边）', pattern: { kind: 'matching', size: 2 } },
  { id: 'matching3', label: '3K₂（3 条不交边）', pattern: { kind: 'matching', size: 3 } },
  { id: 'clique3', label: 'K₃（三角形）', pattern: { kind: 'clique', size: 3 } },
  { id: 'clique4', label: 'K₄（4 点团）', pattern: { kind: 'clique', size: 4 } },
]

export function rainbowPatternById(id: string): RainbowPattern {
  return RAINBOW_PATTERNS.find((item) => item.id === id)?.pattern ?? { kind: 'cycle', size: 3 }
}

export function rainbowPatternLabel(pattern: RainbowPattern): string {
  const symbol =
    pattern.kind === 'path'
      ? 'P'
      : pattern.kind === 'cycle' || pattern.kind === 'clique'
        ? pattern.kind === 'cycle'
          ? 'C'
          : 'K'
        : '匹配'
  if (pattern.kind === 'matching') return `${pattern.size}K₂`
  return `${symbol}${subscript(pattern.size)}`
}

function subscript(value: number): string {
  const map: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
  }
  return String(value)
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
}

export function coloredGraphFromGraph(graph: GraphObject): ColoredGraph {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const edges: ColoredEdge[] = []
  for (const edge of graph.edges) {
    const u = index.get(edge.source)
    const v = index.get(edge.target)
    if (u === undefined || v === undefined || u === v) continue
    edges.push({
      id: edge.id,
      u: Math.min(u, v),
      v: Math.max(u, v),
      color: edge.color || '#9ca3af',
    })
  }
  return {
    n: graph.nodes.length,
    labels: graph.nodes.map((node) => node.label),
    edges,
  }
}

/** Kₙ 的边表顺序（i<j），与反拉姆齐搜索的着色数组下标一致 */
export function completeEdgePairs(n: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push([i, j])
  }
  return pairs
}

export function completeGraphWithColoring(n: number, colors: number[]): ColoredGraph {
  const pairs = completeEdgePairs(n)
  const edges: ColoredEdge[] = pairs.map(([u, v], index) => ({
    id: `k-${u}-${v}`,
    u,
    v,
    color: rainbowColor(colors[index] ?? 0),
  }))
  return {
    n,
    labels: Array.from({ length: n }, (_, index) => String(index)),
    edges,
  }
}

export function gallaiColoring(n: number): number[] {
  const pairs = completeEdgePairs(n)
  return pairs.map(([u, v]) => Math.min(u, v))
}

/** 全不同色：每条边给独立颜色（用于“彩虹结构肯定存在”的教学演示） */
export function rainbowColoring(n: number): number[] {
  return completeEdgePairs(n).map((_, index) => index)
}

/** 确定性 3 色散列（同一 n 结果稳定，便于 e2e） */
export function randomThreeColoring(n: number): number[] {
  return completeEdgePairs(n).map(([u, v], index) => {
    let hash = (u * 73856093) ^ (v * 19349663) ^ ((index + 1) * 83492791)
    hash = (hash ^ (hash >>> 13)) >>> 0
    return hash % 3
  })
}

export function buildColoredComplete(
  n: number,
  preset: 'rainbow' | 'gallai' | 'random3',
): ColoredGraph {
  const colors =
    preset === 'gallai'
      ? gallaiColoring(n)
      : preset === 'random3'
        ? randomThreeColoring(n)
        : rainbowColoring(n)
  return completeGraphWithColoring(n, colors)
}

function adjacencyOf(
  graph: ColoredGraph,
): Array<Array<{ to: number; edge: number; color: string }>> {
  const adjacency: Array<Array<{ to: number; edge: number; color: string }>> = Array.from(
    { length: graph.n },
    () => [],
  )
  graph.edges.forEach((edge, index) => {
    adjacency[edge.u]!.push({ to: edge.v, edge: index, color: edge.color })
    adjacency[edge.v]!.push({ to: edge.u, edge: index, color: edge.color })
  })
  return adjacency
}

function edgeSetKey(edges: number[]): string {
  return [...edges].sort((a, b) => a - b).join(',')
}

function pathCopies(
  graph: ColoredGraph,
  adjacency: ReturnType<typeof adjacencyOf>,
  size: number,
  limit: number,
): { copies: RainbowCopy[]; complete: boolean; visited: number } {
  const copies: RainbowCopy[] = []
  const seen = new Set<string>()
  const visited = new Uint8Array(graph.n)
  const usedColors = new Set<string>()
  const vertexSeq: number[] = []
  const edgeSeq: number[] = []
  let counter = 0
  let complete = true
  const dfs = (current: number): void => {
    if (copies.length >= limit) {
      complete = false
      return
    }
    counter++
    if (vertexSeq.length === size) {
      if (vertexSeq[0]! < vertexSeq[size - 1]!) {
        const key = edgeSetKey(edgeSeq)
        if (!seen.has(key)) {
          seen.add(key)
          copies.push({ vertices: [...vertexSeq], edges: [...edgeSeq].sort((a, b) => a - b) })
        }
      }
      return
    }
    for (const step of adjacency[current]!) {
      if (visited[step.to] || usedColors.has(step.color)) continue
      visited[step.to] = 1
      usedColors.add(step.color)
      vertexSeq.push(step.to)
      edgeSeq.push(step.edge)
      dfs(step.to)
      edgeSeq.pop()
      vertexSeq.pop()
      usedColors.delete(step.color)
      visited[step.to] = 0
    }
  }
  for (let start = 0; start < graph.n; start++) {
    visited[start] = 1
    vertexSeq.push(start)
    dfs(start)
    vertexSeq.pop()
    visited[start] = 0
    if (!complete) break
  }
  return { copies, complete, visited: counter }
}

function cycleCopies(
  graph: ColoredGraph,
  adjacency: ReturnType<typeof adjacencyOf>,
  size: number,
  limit: number,
): { copies: RainbowCopy[]; complete: boolean; visited: number } {
  const copies: RainbowCopy[] = []
  const seen = new Set<string>()
  const visited = new Uint8Array(graph.n)
  const usedColors = new Set<string>()
  const vertexSeq: number[] = []
  const edgeSeq: number[] = []
  let counter = 0
  let complete = true
  const dfs = (current: number): void => {
    if (copies.length >= limit) {
      complete = false
      return
    }
    counter++
    for (const step of adjacency[current]!) {
      if (step.to === vertexSeq[0] && vertexSeq.length === size) {
        if (usedColors.has(step.color) || edgeSeq.includes(step.edge)) continue
        if (vertexSeq[1]! >= vertexSeq[size - 1]!) continue
        const edges = [...edgeSeq, step.edge]
        const key = edgeSetKey(edges)
        if (!seen.has(key)) {
          seen.add(key)
          copies.push({
            vertices: [...vertexSeq],
            edges: edges.sort((a, b) => a - b),
          })
        }
        continue
      }
      if (vertexSeq.length >= size) continue
      // 固定最小顶点为起点，消除旋转重复
      if (step.to <= vertexSeq[0]! || visited[step.to]) continue
      if (usedColors.has(step.color)) continue
      visited[step.to] = 1
      usedColors.add(step.color)
      vertexSeq.push(step.to)
      edgeSeq.push(step.edge)
      dfs(step.to)
      edgeSeq.pop()
      vertexSeq.pop()
      usedColors.delete(step.color)
      visited[step.to] = 0
    }
  }
  for (let start = 0; start < graph.n; start++) {
    visited[start] = 1
    vertexSeq.push(start)
    dfs(start)
    vertexSeq.pop()
    visited[start] = 0
    if (!complete) break
  }
  return { copies, complete, visited: counter }
}

function cliqueCopies(
  graph: ColoredGraph,
  size: number,
  limit: number,
): { copies: RainbowCopy[]; complete: boolean; visited: number } {
  const pairEdge = new Map<string, number>()
  graph.edges.forEach((edge, index) => {
    const key = `${edge.u},${edge.v}`
    if (!pairEdge.has(key)) pairEdge.set(key, index)
  })
  const copies: RainbowCopy[] = []
  const chosen: number[] = []
  let counter = 0
  let complete = true
  const walk = (start: number): void => {
    if (copies.length >= limit) {
      complete = false
      return
    }
    counter++
    if (chosen.length === size) {
      const edges: number[] = []
      const colors = new Set<string>()
      for (let i = 0; i < chosen.length; i++) {
        for (let j = i + 1; j < chosen.length; j++) {
          const edgeIndex = pairEdge.get(`${chosen[i]},${chosen[j]}`)
          if (edgeIndex === undefined) return
          const color = graph.edges[edgeIndex]!.color
          if (colors.has(color)) return
          colors.add(color)
          edges.push(edgeIndex)
        }
      }
      copies.push({ vertices: [...chosen], edges: edges.sort((a, b) => a - b) })
      return
    }
    for (let vertex = start; vertex < graph.n; vertex++) {
      chosen.push(vertex)
      walk(vertex + 1)
      chosen.pop()
      if (!complete) return
    }
  }
  walk(0)
  return { copies, complete, visited: counter }
}

function matchingCopies(
  graph: ColoredGraph,
  size: number,
  limit: number,
): { copies: RainbowCopy[]; complete: boolean; visited: number } {
  const copies: RainbowCopy[] = []
  const seen = new Set<string>()
  const chosen: number[] = []
  const usedVertices = new Set<number>()
  const usedColors = new Set<string>()
  let counter = 0
  let complete = true
  const walk = (start: number): void => {
    if (copies.length >= limit) {
      complete = false
      return
    }
    counter++
    if (chosen.length === size) {
      const key = edgeSetKey(chosen)
      if (!seen.has(key)) {
        seen.add(key)
        const vertices = [
          ...new Set(chosen.flatMap((index) => [graph.edges[index]!.u, graph.edges[index]!.v])),
        ]
        copies.push({
          vertices: vertices.sort((a, b) => a - b),
          edges: [...chosen].sort((a, b) => a - b),
        })
      }
      return
    }
    for (let edgeIndex = start; edgeIndex < graph.edges.length; edgeIndex++) {
      const edge = graph.edges[edgeIndex]!
      if (usedVertices.has(edge.u) || usedVertices.has(edge.v) || usedColors.has(edge.color))
        continue
      chosen.push(edgeIndex)
      usedVertices.add(edge.u)
      usedVertices.add(edge.v)
      usedColors.add(edge.color)
      walk(edgeIndex + 1)
      usedColors.delete(edge.color)
      usedVertices.delete(edge.v)
      usedVertices.delete(edge.u)
      chosen.pop()
      if (!complete) return
    }
  }
  walk(0)
  return { copies, complete, visited: counter }
}

export function findRainbowCopies(
  graph: ColoredGraph,
  pattern: RainbowPattern,
  limit = 100,
): RainbowSearchResult {
  const safeLimit = Math.max(1, Math.min(1000, Math.round(limit)))
  if (pattern.kind === 'path' || pattern.kind === 'cycle') {
    if (pattern.size < 2 || pattern.size > graph.n) {
      return { copies: [], complete: true, visited: 0, note: '该规模在图上不存在' }
    }
  }
  if (pattern.kind === 'clique' && pattern.size > graph.n) {
    return { copies: [], complete: true, visited: 0, note: '该规模在图上不存在' }
  }
  if (pattern.kind === 'cycle' && pattern.size < 3) {
    return { copies: [], complete: true, visited: 0, note: '圈长至少为 3' }
  }
  if (pattern.kind === 'matching' && pattern.size * 2 > graph.n) {
    return { copies: [], complete: true, visited: 0, note: '匹配规模超过顶点数一半' }
  }
  const adjacency = adjacencyOf(graph)
  const result =
    pattern.kind === 'path'
      ? pathCopies(graph, adjacency, pattern.size, safeLimit)
      : pattern.kind === 'cycle'
        ? cycleCopies(graph, adjacency, pattern.size, safeLimit)
        : pattern.kind === 'clique'
          ? cliqueCopies(graph, pattern.size, safeLimit)
          : matchingCopies(graph, pattern.size, safeLimit)
  return {
    ...result,
    note: result.complete
      ? `穷举完成：共 ${result.copies.length} 个彩虹 ${rainbowPatternLabel(pattern)}`
      : `达到展示上限 ${safeLimit}，结果未穷尽`,
  }
}

// ---------------- 反拉姆齐（小 n） ----------------

export interface AntiRamseyOptions {
  maxNodes?: number
  maxMs?: number
}

export interface AntiRamseyResult {
  n: number
  pattern: RainbowPattern
  /** 最大颜色数（complete=false 时为已找到的下界） */
  value: number
  /** 每条 Kₙ 边（i<j 顺序）的颜色编号 */
  colors: number[]
  complete: boolean
  nodes: number
  note: string
}

function buildPatternInstances(n: number, pattern: RainbowPattern): number[][] {
  const pairs = completeEdgePairs(n)
  const edgeIndex = new Map<string, number>()
  pairs.forEach(([u, v], index) => edgeIndex.set(`${u},${v}`, index))
  const seen = new Set<string>()
  const instances: number[][] = []
  const pushInstance = (edgeIndices: number[]): void => {
    const key = edgeSetKey(edgeIndices)
    if (seen.has(key)) return
    seen.add(key)
    instances.push([...edgeIndices].sort((a, b) => a - b))
  }
  const pairIndex = (a: number, b: number): number =>
    edgeIndex.get(a < b ? `${a},${b}` : `${b},${a}`)!

  if (pattern.kind === 'clique') {
    const size = pattern.size
    if (size > n) return []
    const chosen: number[] = []
    const walk = (start: number): void => {
      if (chosen.length === size) {
        const edges: number[] = []
        for (let i = 0; i < chosen.length; i++) {
          for (let j = i + 1; j < chosen.length; j++) {
            edges.push(pairIndex(chosen[i]!, chosen[j]!))
          }
        }
        pushInstance(edges)
        return
      }
      for (let vertex = start; vertex < n; vertex++) {
        chosen.push(vertex)
        walk(vertex + 1)
        chosen.pop()
      }
    }
    walk(0)
    return instances
  }

  if (pattern.kind === 'matching') {
    const size = pattern.size
    const chosen: number[] = []
    const used = new Set<number>()
    const walk = (start: number): void => {
      if (chosen.length === size) {
        pushInstance(chosen)
        return
      }
      for (let edge = start; edge < pairs.length; edge++) {
        const [u, v] = pairs[edge]!
        if (used.has(u) || used.has(v)) continue
        chosen.push(edge)
        used.add(u)
        used.add(v)
        walk(edge + 1)
        used.delete(v)
        used.delete(u)
        chosen.pop()
      }
    }
    walk(0)
    return instances
  }

  const size = pattern.size
  if (size > n || size < 2) return []
  if (pattern.kind === 'path') {
    const visited = new Uint8Array(n)
    const sequence: number[] = []
    const walk = (): void => {
      if (sequence.length === size) {
        if (sequence[0]! >= sequence[size - 1]!) return
        const edges: number[] = []
        for (let i = 0; i + 1 < sequence.length; i++) {
          edges.push(pairIndex(sequence[i]!, sequence[i + 1]!))
        }
        pushInstance(edges)
        return
      }
      for (let vertex = 0; vertex < n; vertex++) {
        if (visited[vertex]) continue
        visited[vertex] = 1
        sequence.push(vertex)
        walk()
        sequence.pop()
        visited[vertex] = 0
      }
    }
    walk()
    return instances
  }

  // cycle：固定最小顶点为起点；固定第二个 < 最后，消除反射
  const chosen: number[] = []
  const used = new Uint8Array(n)
  const collect = (): void => {
    const sorted = [...chosen].sort((a, b) => a - b)
    const min = sorted[0]!
    const rest = sorted.slice(1)
    const permute = (current: number[], remaining: number[]): void => {
      if (remaining.length === 0) {
        if (current[0]! >= current[current.length - 1]!) return
        const sequence = [min, ...current]
        const edges: number[] = []
        for (let i = 0; i + 1 < sequence.length; i++) {
          edges.push(pairIndex(sequence[i]!, sequence[i + 1]!))
        }
        edges.push(pairIndex(sequence[sequence.length - 1]!, sequence[0]!))
        pushInstance(edges)
        return
      }
      for (let index = 0; index < remaining.length; index++) {
        permute(
          [...current, remaining[index]!],
          [...remaining.slice(0, index), ...remaining.slice(index + 1)],
        )
      }
    }
    permute([], rest)
  }
  const walk = (start: number): void => {
    if (chosen.length === size) {
      collect()
      return
    }
    for (let vertex = start; vertex < n; vertex++) {
      if (used[vertex]) continue
      used[vertex] = 1
      chosen.push(vertex)
      walk(vertex + 1)
      chosen.pop()
      used[vertex] = 0
    }
  }
  walk(0)
  return instances
}

function instanceViolated(colors: number[], instance: number[]): boolean {
  let mask = 0
  for (const edge of instance) {
    const color = colors[edge]!
    if (color < 0) return false
    const bit = 1 << color
    if ((mask & bit) !== 0) return false
    mask |= bit
  }
  return true
}

export function antiRamsey(
  n: number,
  pattern: RainbowPattern,
  options: AntiRamseyOptions = {},
): AntiRamseyResult {
  const safeN = Math.max(3, Math.min(6, Math.round(n)))
  const pairs = completeEdgePairs(safeN)
  const m = pairs.length
  // Gallai 定理：无彩虹三角形着色的最大颜色数 = n−1
  if (pattern.kind === 'clique' && pattern.size === 3) {
    return {
      n: safeN,
      pattern,
      value: safeN - 1,
      colors: gallaiColoring(safeN),
      complete: true,
      nodes: 0,
      note: 'Gallai 定理：ar(n,K₃) = n−1；见证着色按 min(i,j) 上色（无彩虹三角形）。',
    }
  }
  const instances = buildPatternInstances(safeN, pattern)
  if (instances.length === 0) {
    return {
      n: safeN,
      pattern,
      value: m,
      colors: rainbowColoring(safeN),
      complete: true,
      nodes: 0,
      note: '该模式在 Kₙ 中不存在，所有边可着不同色。',
    }
  }
  const byEdge: number[][][] = Array.from({ length: m }, () => [])
  for (const instance of instances) {
    for (const edge of instance) byEdge[edge]!.push(instance)
  }
  const colors = new Array<number>(m).fill(-1)
  // 初始下界：全部同色（必无彩虹子图）
  let best = 1
  let bestColors = new Array<number>(m).fill(0)
  let nodes = 0
  let complete = true
  const maxNodes = options.maxNodes ?? 300000
  const maxMs = options.maxMs ?? 800
  const started = performance.now()
  const violated = (edge: number): boolean => {
    for (const instance of byEdge[edge]!) {
      if (instanceViolated(colors, instance)) return true
    }
    return false
  }
  const order = Array.from({ length: m }, (_, index) => index).sort(
    (a, b) => byEdge[b]!.length - byEdge[a]!.length || a - b,
  )
  const search = (position: number, used: number): void => {
    if (!complete) return
    nodes++
    if (nodes > maxNodes || performance.now() - started > maxMs) {
      complete = false
      return
    }
    if (used + (m - position) <= best) return
    if (position === m) {
      if (used > best) {
        best = used
        bestColors = colors.slice()
      }
      return
    }
    const edge = order[position]!
    const existing = Array.from({ length: used }, (_, index) => index)
    for (const color of [...existing, used]) {
      colors[edge] = color
      if (!violated(edge)) search(position + 1, color === used ? used + 1 : used)
      colors[edge] = -1
      if (!complete) return
    }
  }
  search(0, 0)
  return {
    n: safeN,
    pattern,
    value: best,
    colors: bestColors,
    complete,
    nodes,
    note: complete
      ? `穷举完成（${nodes} 节点）：ar(${safeN},${rainbowPatternLabel(pattern)}) = ${best}。`
      : `预算耗尽（${nodes} 节点）：${best} 为下界，尚未证明最优。可减小 n 或放宽预算。`,
  }
}

export interface GallaiProbe {
  gallai: boolean
  triangles: RainbowCopy[]
  complete: boolean
}

export function gallaiProbe(graph: ColoredGraph, limit = 200): GallaiProbe {
  const result = findRainbowCopies(graph, { kind: 'clique', size: 3 }, limit)
  return {
    gallai: result.copies.length === 0 && result.complete,
    triangles: result.copies,
    complete: result.complete,
  }
}
