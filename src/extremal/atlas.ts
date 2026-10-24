/**
 * 小型图图集（v3.6 极值计算台）：
 * 内嵌 n ≤ 7 的全部非同构简单图（graph6，来自 networkx graph_atlas_g；与 nauty geng 计数一致：
 * n=1..7 → 1,2,4,11,34,156,1044）。
 * 仅作为“小 n 精确 ex(n,H)”的枚举底座；n 更大时只提供 Turán 构造与公式对照。
 */
import raw from './atlas-data.json'
import { parseGraph6 } from '../lab/graph6'

export interface AtlasGraph {
  n: number
  m: number
  /** 位掩码邻接：adj[v] 的第 u 位为 1 表示边 vu */
  adj: number[]
  degrees: number[]
  graph6: string
}

const DATA = raw as Record<string, string[]>
const cache = new Map<number, AtlasGraph[]>()
let loading8: Promise<void> | null = null

function popcount(value: number): number {
  let x = value
  let count = 0
  while (x !== 0) {
    x &= x - 1
    count++
  }
  return count
}

export function atlasGraphs(n: number): AtlasGraph[] {
  const key = Math.round(n)
  const cached = cache.get(key)
  if (cached) return cached
  if (key === 8) {
    throw new Error('n=8 图集尚未加载；请先 await loadAtlas8()')
  }
  const list = DATA[String(key)] ?? []
  const graphs = parseAtlasList(list)
  cache.set(key, graphs)
  return graphs
}

function parseAtlasList(list: string[]): AtlasGraph[] {
  return list.map((graph6) => {
    const lab = parseGraph6(graph6, 31)
    const degrees = lab.adj.map((mask) => popcount(mask))
    const m = degrees.reduce((sum, value) => sum + value, 0) / 2
    return { n: lab.n, m, adj: [...lab.adj], degrees, graph6 }
  })
}

/** 按需加载 n=8 的 12,346 个非同构图（约 120 KB graph6；Vite 单独分包） */
export async function loadAtlas8(): Promise<void> {
  if (cache.has(8)) return
  if (!loading8) {
    loading8 = import('./atlas-data-8.json').then((module) => {
      const imported = module as unknown as string[] | { default: string[] }
      const list = Array.isArray(imported) ? imported : imported.default
      cache.set(8, parseAtlasList(list))
    })
  }
  await loading8
}

export const ATLAS_COUNTS: Readonly<Record<number, number>> = Object.freeze({
  1: (DATA['1'] ?? []).length,
  2: (DATA['2'] ?? []).length,
  3: (DATA['3'] ?? []).length,
  4: (DATA['4'] ?? []).length,
  5: (DATA['5'] ?? []).length,
  6: (DATA['6'] ?? []).length,
  7: (DATA['7'] ?? []).length,
})

export const ATLAS_MAX_N = 7
/** 支持的全部精确阶数（n=8 为按需加载） */
export const EXTREMAL_MAX_N = 8
export const ATLAS_COUNT_8 = 12346

export function atlasEdgeList(graph: AtlasGraph): Array<[number, number]> {
  const edges: Array<[number, number]> = []
  for (let v = 0; v < graph.n; v++) {
    for (let u = v + 1; u < graph.n; u++) {
      if ((graph.adj[v]! >> u) & 1) edges.push([v, u])
    }
  }
  return edges
}
