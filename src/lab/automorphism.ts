/**
 * 图的自同构群（v3.1）：回溯枚举保持邻接的顶点置换，输出
 * |Aut(G)|、顶点轨道与稳定子大小（|Stab(v)| = |Aut| / |orbit(v)|）。
 *
 * 用途：实验台候选详情（连接图论实验与群论；教学样例 C₅ → 10、Petersen → 120）。
 * 规模与预算：小图（|V| ≤ 10 常规）精确；预算耗尽或 n! 溢出时返回 null
 * （界面提示“超出自同构枚举预算”）。完全图/空图直接给出 n! 阶结果。
 */
import { bitsOf, edgeCount, type LabGraph } from './graph'

export interface AutomorphismSummary {
  /** |Aut(G)| */
  order: number
  /** 顶点轨道（划分；每个轨道为升序数组） */
  orbits: number[][]
  /** 与顶点索引对齐的稳定子大小 */
  stabilizerSizes: number[]
  /** 生成元样本（最多 4 个非恒等置换，供展示） */
  sampleGenerators: number[][]
  /** 枚举是否完整（false 时 order 仍精确：完全图/空图捷径直出） */
  complete: boolean
}

function factorial(n: number): number | null {
  let result = 1
  for (let i = 2; i <= n; i++) {
    result *= i
    if (!Number.isFinite(result) || result > Number.MAX_SAFE_INTEGER) return null
  }
  return result
}

/**
 * 计算自同构群摘要；预算内无法完成时返回 null。
 * budget 统计回溯过程中“候选影像一致性检查”的次数。
 */
export function automorphismGroup(g: LabGraph, budget = 2_000_000): AutomorphismSummary | null {
  const n = g.n
  if (n <= 1) {
    return {
      order: 1,
      orbits: n === 1 ? [[0]] : [],
      stabilizerSizes: n === 1 ? [1] : [],
      sampleGenerators: [],
      complete: true,
    }
  }
  const m = edgeCount(g)

  // 完全图 / 空图：|Aut| = n!（对称群），轨道为单点
  if (m === 0 || m === (n * (n - 1)) / 2) {
    const order = factorial(n)
    if (order === null) return null
    const orbits = Array.from({ length: n }, (_, v) => [v])
    const stabilizerSizes = new Array<number>(n).fill(Math.round(order / n))
    const sampleGenerators: number[][] = []
    if (n >= 2) {
      const swap: number[] = Array.from({ length: n }, (_, i) => i)
      swap[0] = 1
      swap[1] = 0
      sampleGenerators.push(swap)
    }
    return { order, orbits, stabilizerSizes, sampleGenerators, complete: true }
  }

  // 影像候选域：同度 + 邻居度序列相同（自同构不变量）
  const degrees = Array.from({ length: n }, (_, v) => bitsOf(g.adj[v]!).length)
  const signature = (v: number): string =>
    `${degrees[v]}|${bitsOf(g.adj[v]!)
      .map((u) => degrees[u])
      .sort((a, b) => a - b)
      .join(',')}`
  const signatures = Array.from({ length: n }, (_, v) => signature(v))
  const domains: number[][] = Array.from({ length: n }, (_, v) =>
    Array.from({ length: n }, (_, w) => w).filter((w) => signatures[w] === signatures[v]),
  )
  for (const domain of domains) {
    if (domain.length === 0) {
      return {
        order: 1,
        orbits: Array.from({ length: n }, (_, v) => [v]),
        stabilizerSizes: new Array<number>(n).fill(1),
        sampleGenerators: [],
        complete: true,
      }
    }
  }

  // 映射顺序：候选域小者优先
  const order = Array.from({ length: n }, (_, v) => v).sort(
    (a, b) => domains[a]!.length - domains[b]!.length || degrees[b]! - degrees[a]!,
  )

  const mapping = new Array<number>(n).fill(-1)
  const used = new Array<boolean>(n).fill(false)
  const orbitSets = Array.from({ length: n }, () => new Set<number>())
  const sampleGenerators: number[][] = []
  let count = 0
  let checks = 0
  let exceeded = false

  function backtrack(depth: number): void {
    if (exceeded) return
    if (checks > budget) {
      exceeded = true
      return
    }
    if (depth === n) {
      count++
      const permutation = Array.from({ length: n }, (_, v) => mapping[v]!)
      for (let v = 0; v < n; v++) orbitSets[v]!.add(permutation[v]!)
      if (sampleGenerators.length < 4 && !permutation.every((value, index) => value === index)) {
        sampleGenerators.push([...permutation])
      }
      return
    }
    const v = order[depth]!
    for (const w of domains[v]!) {
      if (used[w]) continue
      // 与已映射顶点的邻接一致性
      let ok = true
      checks++
      for (let i = 0; i < depth; i++) {
        const u = order[i]!
        const uImage = mapping[u]!
        const adjacent = (g.adj[v]! & (1 << u)) !== 0
        const imageAdjacent = (g.adj[w]! & (1 << uImage)) !== 0
        if (adjacent !== imageAdjacent) {
          ok = false
          break
        }
      }
      if (!ok) continue
      mapping[v] = w
      used[w] = true
      backtrack(depth + 1)
      used[w] = false
      mapping[v] = -1
      if (exceeded) return
    }
  }

  backtrack(0)
  if (exceeded) return null

  const orbits: number[][] = []
  const stabilizerSizes = new Array<number>(n).fill(1)
  const seen = new Array<boolean>(n).fill(false)
  for (let v = 0; v < n; v++) {
    const orbit = [...orbitSets[v]!].sort((a, b) => a - b)
    stabilizerSizes[v] = orbit.length > 0 ? Math.round(count / orbit.length) : count
    if (!seen[v]) {
      for (const member of orbit) seen[member] = true
      orbits.push(orbit)
    }
  }
  return { order: count, orbits, stabilizerSizes, sampleGenerators, complete: true }
}
