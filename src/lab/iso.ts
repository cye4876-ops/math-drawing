/**
 * 图同构与颜色精化（v2.7）。
 * - refineColorsJoint：1-维 Weisfeiler–Lehman 精化；两图共用颜色编号空间（便于剪枝），
 *   可选初始颜色（超图关联二分图用 0=原顶点 / 1=超边点）；
 * - fingerprint：n、m、度序列与颜色类规模的稳定不变量串（同构快速过滤键）；
 * - areIsomorphic：VF2 风格回溯（颜色 + 度 + 邻接一致性 + 前沿计数剪枝），
 *   返回 a→b 的顶点映射或 null。
 */
import { bitsOf, degrees, edgeCount, hasEdge, type LabGraph } from './graph'

/** 联合精化：对两图使用同一颜色编号空间 */
export function refineColorsJoint(
  a: LabGraph,
  b: LabGraph,
  colorsA?: readonly number[],
  colorsB?: readonly number[],
): { colorsA: number[]; colorsB: number[] } {
  let idA = initIds(a, colorsA)
  let idB = initIds(b, colorsB)
  const maxRounds = Math.max(a.n, b.n) + 2
  for (let round = 0; round < maxRounds; round++) {
    const nextA = step(a, idA)
    const nextB = step(b, idB)
    const compressed = compress(nextA, nextB)
    if (sameIds(compressed.colorsA, idA) && sameIds(compressed.colorsB, idB)) {
      return compressed
    }
    idA = compressed.colorsA
    idB = compressed.colorsB
  }
  return { colorsA: idA, colorsB: idB }
}

function initIds(g: LabGraph, colors?: readonly number[]): number[] {
  const base = colors ? [...colors] : degrees(g)
  const keys = [...new Set(base)].sort((x, y) => x - y)
  const id = new Map(keys.map((key, i) => [key, i]))
  return base.map((key) => id.get(key)!)
}

function step(g: LabGraph, ids: readonly number[]): string[] {
  return ids.map((own, v) => {
    const neighborIds = bitsOf(g.adj[v]!)
      .map((u) => ids[u]!)
      .sort((x, y) => x - y)
    return `${own}|${neighborIds.join(',')}`
  })
}

function compress(
  sigA: readonly string[],
  sigB: readonly string[],
): { colorsA: number[]; colorsB: number[] } {
  const keys = [...new Set([...sigA, ...sigB])].sort()
  const id = new Map(keys.map((key, i) => [key, i]))
  return {
    colorsA: sigA.map((s) => id.get(s)!),
    colorsB: sigB.map((s) => id.get(s)!),
  }
}

function sameIds(x: readonly number[], y: readonly number[]): boolean {
  if (x.length !== y.length) return false
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  return true
}

/** 单图精化 */
export function refineColors(g: LabGraph, colors?: readonly number[]): number[] {
  return refineColorsJoint(g, g, colors, colors).colorsA
}

/** 稳定精化指纹（同构不变量；不同构也可能同指纹，仅作过滤键） */
export function fingerprint(g: LabGraph, colors?: readonly number[]): string {
  const refined = refineColors(g, colors)
  const counts = new Map<number, number>()
  for (const c of refined) counts.set(c, (counts.get(c) ?? 0) + 1)
  const sizes = [...counts.values()].sort((x, y) => y - x)
  const seq = degrees(g).sort((x, y) => y - x)
  return `n${g.n}|m${edgeCount(g)}|c${sizes.join(',')}|d${seq.join(',')}`
}

export interface IsoOptions {
  /** 顶点类型（超图关联图：0=原顶点，1=超边点）；同类型才能互相映射 */
  colorsA?: readonly number[]
  colorsB?: readonly number[]
}

/** 同构判定与映射搜索（映射数组下标为 a 顶点，值为对应 b 顶点） */
export function areIsomorphic(
  a: LabGraph,
  b: LabGraph,
  options: IsoOptions = {},
): { isomorphic: boolean; mapping: number[] | null } {
  if (a.n !== b.n) return { isomorphic: false, mapping: null }
  if (edgeCount(a) !== edgeCount(b)) return { isomorphic: false, mapping: null }
  const degA = degrees(a)
  const degB = degrees(b)
  const seqA = [...degA].sort((x, y) => y - x)
  const seqB = [...degB].sort((x, y) => y - x)
  for (let i = 0; i < seqA.length; i++) {
    if (seqA[i] !== seqB[i]) return { isomorphic: false, mapping: null }
  }
  const { colorsA, colorsB } = refineColorsJoint(a, b, options.colorsA, options.colorsB)
  const sizeA = [...classCounts(colorsA).values()].sort((x, y) => y - x)
  const sizeB = [...classCounts(colorsB).values()].sort((x, y) => y - x)
  if (sizeA.length !== sizeB.length || sizeA.some((v, i) => v !== sizeB[i])) {
    return { isomorphic: false, mapping: null }
  }

  // 候选表：a 顶点 → 可映射的 b 顶点（同颜色、同度）
  const candidates: number[][] = []
  for (let u = 0; u < a.n; u++) {
    const list: number[] = []
    for (let v = 0; v < b.n; v++) {
      if (colorsA[u] === colorsB[v] && degA[u] === degB[v]) list.push(v)
    }
    if (list.length === 0) return { isomorphic: false, mapping: null }
    candidates.push(list)
  }

  // 顶点顺序：度大优先（高度顶点先定，剪枝更强）
  const order = [...Array(a.n).keys()].sort((x, y) => degA[y]! - degA[x]! || x - y)
  const mapping = new Array<number>(a.n).fill(-1)
  const used = new Uint8Array(b.n)

  function consistent(u: number, v: number): boolean {
    for (let w = 0; w < a.n; w++) {
      const vw = mapping[w]!
      if (vw < 0) continue
      if (hasEdge(a, u, w) !== hasEdge(b, v, vw)) return false
    }
    // 前沿计数（按颜色）：未映射邻居数量必须一致
    const frontierA = new Map<number, number>()
    for (const w of bitsOf(a.adj[u]!)) {
      if (mapping[w]! < 0) frontierA.set(colorsA[w]!, (frontierA.get(colorsA[w]!) ?? 0) + 1)
    }
    const frontierB = new Map<number, number>()
    for (const w of bitsOf(b.adj[v]!)) {
      if (!used[w]!) frontierB.set(colorsB[w]!, (frontierB.get(colorsB[w]!) ?? 0) + 1)
    }
    if (frontierA.size !== frontierB.size) return false
    for (const [color, count] of frontierA) {
      if (frontierB.get(color) !== count) return false
    }
    return true
  }

  function backtrack(index: number): boolean {
    if (index === order.length) return true
    const u = order[index]!
    for (const v of candidates[u]!) {
      if (used[v]) continue
      if (!consistent(u, v)) continue
      mapping[u] = v
      used[v] = 1
      if (backtrack(index + 1)) return true
      mapping[u] = -1
      used[v] = 0
    }
    return false
  }

  if (!backtrack(0)) return { isomorphic: false, mapping: null }
  return { isomorphic: true, mapping }
}

function classCounts(colors: readonly number[]): Map<number, number> {
  const result = new Map<number, number>()
  for (const c of colors) result.set(c, (result.get(c) ?? 0) + 1)
  return result
}
