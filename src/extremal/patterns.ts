/**
 * 禁图预设、图着色数、Turán 图与已知极值公式（v3.6）。
 */
import { edgeCountOf, graphDegrees, simpleGraphFromEdges, type SimpleGraph } from './containment'

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
]

export function patternPreset(id: string): PatternPreset {
  return PATTERN_PRESETS.find((item) => item.id === id) ?? PATTERN_PRESETS[0]!
}

export function patternGraph(preset: PatternPreset): SimpleGraph {
  return simpleGraphFromEdges(preset.n, preset.edges)
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
