/**
 * 禁图预设、图着色数、Turán 图与已知极值公式（v3.6）。
 */
import { parseGraph6 } from '../lab/graph6'
import {
  containsPattern,
  edgeCountOf,
  graphDegrees,
  simpleGraphFromEdges,
  type SimpleGraph,
} from './containment'

export interface PatternPreset {
  id: string
  label: string
  n: number
  edges: Array<[number, number]>
}

export const PATTERN_PRESETS: PatternPreset[] = [
  {
    id: 'K3',
    label: 'K₃（三角形）',
    n: 3,
    edges: [
      [0, 1],
      [1, 2],
      [0, 2],
    ],
  },
  {
    id: 'C4',
    label: 'C₄（4 圈）',
    n: 4,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
  },
  {
    id: 'P4',
    label: 'P₄（4 点路径）',
    n: 4,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
  {
    id: 'K4',
    label: 'K₄（4 点团）',
    n: 4,
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ],
  },
  {
    id: '2K2',
    label: '2K₂（两条独立边）',
    n: 4,
    edges: [
      [0, 1],
      [2, 3],
    ],
  },
  {
    id: 'C5',
    label: 'C₅（5 圈）',
    n: 5,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 0],
    ],
  },
  {
    id: 'K13',
    label: 'K₁,₃（爪形）',
    n: 4,
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    id: 'diamond',
    label: 'K₄ − e（菱形）',
    n: 4,
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
    ],
  },
  {
    id: 'C6',
    label: 'C₆（6 圈）',
    n: 6,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
    ],
  },
  {
    id: 'K23',
    label: 'K₂,₃（完全二部图）',
    n: 5,
    edges: [
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 2],
      [1, 3],
      [1, 4],
    ],
  },
  {
    id: 'P5',
    label: 'P₅（5 点路径）',
    n: 5,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    id: '3K2',
    label: '3K₂（三条独立边）',
    n: 6,
    edges: [
      [0, 1],
      [2, 3],
      [4, 5],
    ],
  },
  {
    id: 'K3K1',
    label: 'K₃ + K₁（非连通）',
    n: 4,
    edges: [
      [0, 1],
      [1, 2],
      [0, 2],
    ],
  },
  {
    id: 'K14',
    label: 'K₁,₄（星形）',
    n: 5,
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
  },
  {
    id: 'K33',
    label: 'K₃,₃（完全二部图）',
    n: 6,
    edges: [
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 3],
      [1, 4],
      [1, 5],
      [2, 3],
      [2, 4],
      [2, 5],
    ],
  },
  {
    id: 'C7',
    label: 'C₇（7 圈）',
    n: 7,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 0],
    ],
  },
]

export function patternPreset(id: string): PatternPreset {
  return PATTERN_PRESETS.find((item) => item.id === id) ?? PATTERN_PRESETS[0]!
}

export function patternGraph(preset: PatternPreset): SimpleGraph {
  return simpleGraphFromEdges(preset.n, preset.edges)
}

export interface ParsedPattern {
  graph: SimpleGraph
  label: string
}

export type PatternInputFormat = 'edges' | 'graph6'

/** 图的补图（同顶点集；用于“取补图”开关） */
export function complementSimpleGraph(graph: SimpleGraph): SimpleGraph {
  const edges: Array<[number, number]> = []
  for (let u = 0; u < graph.n; u++) {
    for (let v = u + 1; v < graph.n; v++) {
      if (((graph.adj[u]! >> v) & 1) === 0) edges.push([u, v])
    }
  }
  return simpleGraphFromEdges(graph.n, edges)
}

/** graph6 → 禁图（n ≤ 7；带 `>>graph6<<` 前缀也可） */
export function parseGraph6Pattern(source: string): ParsedPattern {
  const lab = parseGraph6(source, 7)
  const graph: SimpleGraph = { n: lab.n, adj: [...lab.adj] }
  return { graph, label: `graph6（${lab.n} 点 / ${edgeCountOf(graph)} 边）` }
}

/**
 * 解析自定义禁图列表：
 * - edges 格式：`0-1, 1-2`；多张图用分号或换行分隔；
 * - graph6 格式：用空白/分号分隔多个 graph6 字符串。
 */
export function parsePatternInput(text: string, format: PatternInputFormat): ParsedPattern[] {
  if (format === 'graph6') {
    const tokens = text
      .trim()
      .split(/[\s;]+/)
      .filter(Boolean)
    if (tokens.length === 0) throw new Error('请输入至少一个 graph6 字符串')
    return tokens.map((token) => parseGraph6Pattern(token))
  }
  const groups = text
    .split(/[;\n]+/)
    .map((group) => group.trim())
    .filter(Boolean)
  if (groups.length === 0) throw new Error('请输入至少一张边表禁图')
  return groups.map((group, index) => {
    const parsed = parseCustomPattern(group)
    return {
      graph: parsed.graph,
      label:
        groups.length === 1
          ? `自定义禁图（${parsed.edges.length} 条边）`
          : `自定义禁图 #${index + 1}（${parsed.edges.length} 条边）`,
    }
  })
}

/** 禁图的同构无关键，用于多选去重 */
export function patternKey(graph: SimpleGraph): string {
  return `${graph.n}:${graph.adj.join(',')}`
}

/** 集合记法：单图直接显示，多图显示为 {H₁, H₂, …} */
export function formatPatternLabel(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? '禁图') : `{${labels.join(', ')}}`
}

/** 自定义禁图：格式 `0-1, 1-2, 2-3`（也接受分号与空格分隔） */
export function parseCustomPattern(text: string): {
  graph: SimpleGraph
  edges: Array<[number, number]>
} {
  const edges: Array<[number, number]> = []
  const seen = new Set<string>()
  let maxVertex = -1
  const matches = text.matchAll(/(\d+)\s*[-–]\s*(\d+)/g)
  for (const match of matches) {
    const a = Number(match[1])
    const b = Number(match[2])
    if (a === b) throw new Error('禁图不允许自环')
    const key = a < b ? `${a},${b}` : `${b},${a}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push([Math.min(a, b), Math.max(a, b)])
    maxVertex = Math.max(maxVertex, a, b)
  }
  if (edges.length === 0 || maxVertex < 1) {
    throw new Error('请用 `0-1, 1-2` 格式输入至少一条边（顶点标签从 0 开始）')
  }
  return { graph: simpleGraphFromEdges(maxVertex + 1, edges), edges }
}

/** 色数（n ≤ 8，回溯精确） */
export function chromaticNumber(graph: SimpleGraph): number {
  if (graph.n === 0) return 0
  if (edgeCountOf(graph) === 0) return 1
  const degrees = graphDegrees(graph)
  const order = Array.from({ length: graph.n }, (_, index) => index).sort(
    (a, b) => degrees[b]! - degrees[a]! || a - b,
  )
  const colors = new Array<number>(graph.n).fill(-1)
  for (let limit = 1; limit <= graph.n; limit++) {
    const search = (position: number): boolean => {
      if (position === order.length) return true
      const vertex = order[position]!
      for (let color = 0; color < limit; color++) {
        let ok = true
        for (let other = 0; other < graph.n; other++) {
          if (colors[other] === color && ((graph.adj[vertex]! >> other) & 1) === 1) {
            ok = false
            break
          }
        }
        if (!ok) continue
        colors[vertex] = color
        if (search(position + 1)) return true
        colors[vertex] = -1
      }
      return false
    }
    if (search(0)) return limit
  }
  return graph.n
}

export function isCompleteGraph(graph: SimpleGraph): boolean {
  return edgeCountOf(graph) === (graph.n * (graph.n - 1)) / 2
}

export function turanEdges(n: number, parts: number): number {
  const size = Math.max(1, Math.round(n))
  const r = Math.max(1, Math.round(parts))
  if (r >= size) return (size * (size - 1)) / 2
  const base = Math.floor(size / r)
  const extra = size % r
  const squareSum = (r - extra) * base * base + extra * (base + 1) * (base + 1)
  return (size * size - squareSum) / 2
}

export interface TuranGraph {
  graph: SimpleGraph
  parts: number[][]
  edges: Array<[number, number]>
}

/** 平衡完全 r 部图 T_r(n)：部间全连、部内无边 */
export function turanGraph(n: number, parts: number): TuranGraph {
  const size = Math.max(1, Math.round(n))
  const r = Math.max(1, Math.min(size, Math.round(parts)))
  const base = Math.floor(size / r)
  const extra = size % r
  const groups: number[][] = []
  let next = 0
  for (let part = 0; part < r; part++) {
    const count = base + (part < extra ? 1 : 0)
    groups.push(Array.from({ length: count }, (_, index) => next + index))
    next += count
  }
  const side = new Array<number>(size).fill(0)
  groups.forEach((group, index) => group.forEach((vertex) => (side[vertex] = index)))
  const edges: Array<[number, number]> = []
  for (let u = 0; u < size; u++) {
    for (let v = u + 1; v < size; v++) {
      if (side[u] !== side[v]) edges.push([u, v])
    }
  }
  return { graph: simpleGraphFromEdges(size, edges), parts: groups, edges }
}

export interface KnownExtremal {
  value: number
  parts: number
  kind: 'mantel' | 'turan'
  formula: string
}

/** 完全禁图的 Turán 定理：ex(n,K_k) = t_{k−1}(n)；非完全图返回 null */
export function knownExtremalValue(pattern: SimpleGraph, n: number): KnownExtremal | null {
  if (!isCompleteGraph(pattern) || pattern.n < 2) return null
  const parts = pattern.n - 1
  return {
    value: turanEdges(n, parts),
    parts,
    kind: pattern.n === 3 ? 'mantel' : 'turan',
    formula:
      pattern.n === 3
        ? `Mantel：ex(n,K₃) = ⌊n²/4⌋ = ${turanEdges(n, 2)}`
        : `Turán：ex(n,K${subscript(pattern.n)}) = t${subscript(parts)}(n) = ${turanEdges(n, parts)}`,
  }
}

/** 一般禁图的 Turán 下界：ex(n,H) ≥ t_{χ(H)−1}(n)（χ ≤ 2 时无信息） */
export function turanLowerBound(
  pattern: SimpleGraph,
  n: number,
): { parts: number; edges: number; chromatic: number } | null {
  const chromatic = chromaticNumber(pattern)
  const parts = chromatic - 1
  if (chromatic < 3) return null
  return { parts, edges: turanEdges(n, parts), chromatic }
}

/** 多禁图集合的有效 Turán 构造下界：取最大的、同时不含所有禁图的 T_r(n) */
export function turanLowerBoundForPatterns(
  patterns: SimpleGraph[],
  n: number,
): { parts: number; edges: number; chromatic: number } | null {
  for (let parts = n; parts >= 2; parts--) {
    const turan = turanGraph(n, parts)
    if (patterns.some((pattern) => containsPattern(turan.graph, pattern))) continue
    return { parts, edges: turan.edges.length, chromatic: parts + 1 }
  }
  return null
}

export function subscript(value: number): string {
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
