/**
 * 色数 χ(G)（v0.5b）：使相邻顶点颜色各异的最少颜色数。
 * - 含自环：不存在正常着色（value=null、hasLoop=true）；
 * - 顶点数 ≤ 24：精确——从贪心下界（团）起向上做 DSATUR 回溯 k-着色判定；
 * - 更大：精确不可行，给出贪心下界（极大团近似）与上界（DSATUR 着色数），exact=false；
 * - 无边非空图 χ=1（全部同色）；空图 χ=0。
 */
import type { GraphObject } from './model'

export interface ChromaticResult {
  /** 精确色数；近似时为 null */
  value: number | null
  /** 下界（贪心极大团）/ 上界（DSATUR 着色） */
  lower: number
  upper: number
  exact: boolean
  hasLoop: boolean
}

/** DSATUR 贪心着色：返回用色数（上界） */
function dsaturColors(n: number, adj: number[][]): number {
  if (n === 0) return 0
  const color = new Array<number>(n).fill(-1)
  const sat = Array.from({ length: n }, () => new Set<number>())
  for (let step = 0; step < n; step++) {
    let pick = -1
    let bestSat = -1
    let bestDeg = -1
    for (let v = 0; v < n; v++) {
      if (color[v] !== -1) continue
      const satSize = sat[v]!.size
      const deg = adj[v]!.length
      if (satSize > bestSat || (satSize === bestSat && deg > bestDeg)) {
        pick = v
        bestSat = satSize
        bestDeg = deg
      }
    }
    let c = 0
    while (sat[pick]!.has(c)) c++
    color[pick] = c
    for (const w of adj[pick]!) sat[w]!.add(c)
  }
  return Math.max(...color) + 1
}

/** 贪心极大团（近似下界）：每个顶点作种子贪心扩张，取最大 */
function greedyCliqueLower(n: number, adj: number[][]): number {
  let best = n > 0 ? 1 : 0
  for (let start = 0; start < n; start++) {
    const clique = [start]
    let candidates = [...adj[start]!]
    while (candidates.length > 0) {
      let pick = -1
      let pickDeg = -1
      for (const v of candidates) {
        if (clique.every((u) => adj[u]!.includes(v))) {
          const deg = adj[v]!.length
          if (deg > pickDeg) {
            pick = v
            pickDeg = deg
          }
        }
      }
      if (pick === -1) break
      clique.push(pick)
      candidates = candidates.filter((v) => v !== pick)
    }
    if (clique.length > best) best = clique.length
  }
  return best
}

/** DSATUR 序回溯：判定 k-着色是否可行（对称破缺：新色只能依次启用） */
function isColorable(n: number, adj: number[][], k: number): boolean {
  const color = new Array<number>(n).fill(-1)
  const sat = Array.from({ length: n }, () => new Set<number>())

  function dfs(colored: number, usedColors: number): boolean {
    if (colored === n) return true
    let pick = -1
    let bestSat = -1
    let bestDeg = -1
    for (let v = 0; v < n; v++) {
      if (color[v] !== -1) continue
      const satSize = sat[v]!.size
      const deg = adj[v]!.length
      if (satSize > bestSat || (satSize === bestSat && deg > bestDeg)) {
        pick = v
        bestSat = satSize
        bestDeg = deg
      }
    }
    const maxColor = Math.min(k - 1, usedColors)
    for (let c = 0; c <= maxColor; c++) {
      if (sat[pick]!.has(c)) continue
      color[pick] = c
      const added: number[] = []
      for (const w of adj[pick]!) {
        if (!sat[w]!.has(c)) {
          sat[w]!.add(c)
          added.push(w)
        }
      }
      if (dfs(colored + 1, Math.max(usedColors, c + 1))) return true
      for (const w of added) sat[w]!.delete(c)
      color[pick] = -1
    }
    return false
  }

  return dfs(0, 0)
}

/** 去自环、去重的邻接表 */
function buildAdjacency(graph: GraphObject): number[][] {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const n = graph.nodes.length
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set<number>())
  for (const edge of graph.edges) {
    const u = index.get(edge.source)
    const v = index.get(edge.target)
    if (u === undefined || v === undefined || u === v) continue
    sets[u]!.add(v)
    sets[v]!.add(u)
  }
  return sets.map((set) => [...set])
}

export function chromaticNumber(graph: GraphObject): ChromaticResult {
  const n = graph.nodes.length
  if (graph.edges.some((edge) => edge.source === edge.target)) {
    return { value: null, lower: 1, upper: Math.max(1, n), exact: false, hasLoop: true }
  }
  if (n === 0) return { value: 0, lower: 0, upper: 0, exact: true, hasLoop: false }

  const adj = buildAdjacency(graph)
  const lower = Math.max(1, greedyCliqueLower(n, adj))
  const upper = dsaturColors(n, adj)

  if (n <= 24) {
    for (let k = lower; k <= upper; k++) {
      if (isColorable(n, adj, k)) {
        return { value: k, lower, upper, exact: true, hasLoop: false }
      }
    }
    return { value: upper, lower, upper, exact: true, hasLoop: false }
  }
  return { value: null, lower, upper, exact: false, hasLoop: false }
}
