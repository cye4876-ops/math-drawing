/**
 * 实验室图不变量与谱（v2.7）。
 * - 结构不变量：度数极值、团数（位掩码分支限界）、独立数、匹配数（记忆化 DP）、
 *   三角形数、二部/连通/正则；
 * - 谱：A / L / Q 的精确整数特征多项式（BigInt Faddeev–LeVerrier）与
 *   数值全谱（Jacobi 旋转，来自应用通用谱模块），供谱半径 ρ、无符号 Laplacian
 *   谱半径 q 与代数连通度 λ₂ 使用；
 * - spectralCannotTie：谱搜索的有理数上界剪枝（只跳过严格小于当前最好值者）。
 *
 * 说明：数值特征值用于显示与排序（误差 ~1e-12）；“同谱”判定用精确整数系数。
 */
import { jacobiEigenSymmetric } from '../graph/spectral'
import {
  adjacencyIntMatrix,
  charPolyCoefficients,
  laplacianIntMatrix,
  signlessLaplacianIntMatrix,
  toNumberMatrix,
  type IntMatrix,
} from './charpoly'
import { bitsOf, degrees, edgeCount, popcount, type LabGraph } from './graph'

/** 最大团（位掩码分支限界 + 贪心染色上界） */
export function maxClique(g: LabGraph): number {
  const adj = g.adj
  let best = 0

  function colorSort(cand: number): { order: number[]; colors: number[] } {
    const order: number[] = []
    const colors: number[] = []
    let uncolored = cand
    let color = 0
    while (uncolored !== 0) {
      color++
      let avail = uncolored
      while (avail !== 0) {
        const low = avail & -avail
        const v = 31 - Math.clz32(low)
        avail &= ~adj[v]!
        avail &= ~low
        uncolored &= ~low
        order.push(v)
        colors.push(color)
      }
    }
    return { order, colors }
  }

  function expand(cand: number, size: number): void {
    if (cand === 0) {
      if (size > best) best = size
      return
    }
    if (size + popcount(cand) <= best) return
    const { order, colors } = colorSort(cand)
    let current = cand
    for (let i = order.length - 1; i >= 0; i--) {
      if (size + colors[i]! <= best) return
      const v = order[i]!
      const next = current & adj[v]!
      if (next === 0) {
        if (size + 1 > best) best = size + 1
      } else {
        expand(next, size + 1)
      }
      current &= ~(1 << v)
    }
  }

  expand((1 << g.n) - 1, 0)
  return best
}

/** 最大匹配（记忆化：取最低位顶点，跳过或与其邻居配对） */
export function maxMatching(g: LabGraph): number {
  const memo = new Map<number, number>()
  function match(mask: number): number {
    if (mask === 0) return 0
    const cached = memo.get(mask)
    if (cached !== undefined) return cached
    const low = mask & -mask
    const v = 31 - Math.clz32(low)
    const rest = mask & ~low
    let best = match(rest)
    if (best < Math.floor(popcount(mask) / 2)) {
      let neighbors = g.adj[v]! & rest
      while (neighbors !== 0) {
        const lowU = neighbors & -neighbors
        const candidate = 1 + match(rest & ~lowU)
        if (candidate > best) best = candidate
        neighbors &= ~lowU
      }
    }
    memo.set(mask, best)
    return best
  }
  return match((1 << g.n) - 1)
}

/** 谱结果：精确系数 + 数值全谱（降序） */
export interface LabSpectrum {
  /** 数值矩阵（显示用） */
  matrix: number[][]
  /** 整数特征多项式系数（降幂，字符串形式） */
  coefficients: string[]
  /** 整数系数原始值（同谱精确判定） */
  coefficientsBig: bigint[]
  /** 数值特征值（降序） */
  eigenvalues: number[]
  /** 特征向量（vectors[k] 对应 eigenvalues[k]） */
  vectors: number[][]
}

export type SpectralName = 'A' | 'L' | 'Q'

export class GraphInvariants {
  readonly g: LabGraph
  private cache = new Map<string, number | boolean>()
  private spectra = new Map<SpectralName, LabSpectrum>()
  private matrixCache = new Map<SpectralName, IntMatrix>()

  constructor(g: LabGraph) {
    this.g = g
  }

  /** 整数矩阵（A / L / Q） */
  intMatrix(name: SpectralName): IntMatrix {
    const cached = this.matrixCache.get(name)
    if (cached) return cached
    const matrix =
      name === 'A'
        ? adjacencyIntMatrix(this.g)
        : name === 'L'
          ? laplacianIntMatrix(this.g)
          : signlessLaplacianIntMatrix(this.g)
    this.matrixCache.set(name, matrix)
    return matrix
  }

  spectrum(name: SpectralName): LabSpectrum {
    const cached = this.spectra.get(name)
    if (cached) return cached
    const intMatrix = this.intMatrix(name)
    const coefficientsBig = charPolyCoefficients(intMatrix)
    const numeric = toNumberMatrix(intMatrix)
    const { values, vectors } = jacobiEigenSymmetric(numeric)
    const result: LabSpectrum = {
      matrix: numeric,
      coefficients: coefficientsBig.map((v) => v.toString()),
      coefficientsBig,
      eigenvalues: values,
      vectors,
    }
    this.spectra.set(name, result)
    return result
  }

  /** 结构不变量（number/bool；谱量单独取） */
  get(key: string): number | boolean {
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached
    const g = this.g
    let value: number | boolean
    switch (key) {
      case 'n':
        value = g.n
        break
      case 'm':
        value = edgeCount(g)
        break
      case 'delta':
        value = g.n === 0 ? 0 : Math.min(...degrees(g))
        break
      case 'Delta':
        value = g.n === 0 ? 0 : Math.max(...degrees(g))
        break
      case 'omega':
        value = maxClique(g)
        break
      case 'alpha':
        value = maxClique(complementOf(g))
        break
      case 'nu':
        value = maxMatching(g)
        break
      case 'triangles':
        value = triangleCountLocal(g)
        break
      case 'bipartite':
        value = bipartiteCheck(g)
        break
      case 'connected':
        value = connectedCheck(g)
        break
      case 'regular':
        value = regularCheck(g)
        break
      default:
        throw new Error(`未知变量：${key}`)
    }
    this.cache.set(key, value)
    return value
  }

  /** 谱半径 ρ(A)：最大特征值（数值） */
  rho(): number {
    return this.spectrum('A').eigenvalues[0] ?? 0
  }

  /** 无符号 Laplacian 谱半径 q(Q)：最大特征值（数值） */
  q(): number {
    return this.spectrum('Q').eigenvalues[0] ?? 0
  }

  /** 代数连通度 λ₂：L 的第二小特征值（不连通时为 0） */
  lambda2(): number {
    const values = this.spectrum('L').eigenvalues
    if (values.length < 2) return 0
    return values[values.length - 2] ?? 0
  }
}

function complementOf(g: LabGraph): LabGraph {
  const result: LabGraph = { n: g.n, adj: [] as number[] }
  const full = (1 << g.n) - 1
  for (let v = 0; v < g.n; v++) result.adj.push(full & ~g.adj[v]! & ~(1 << v))
  return result
}

function triangleCountLocal(g: LabGraph): number {
  let total = 0
  for (let u = 0; u < g.n; u++) {
    for (const v of bitsOf(g.adj[u]!)) {
      if (v <= u) continue
      total += popcount(g.adj[u]! & g.adj[v]!)
    }
  }
  return total / 3
}

function bipartiteCheck(g: LabGraph): boolean {
  const color = new Int8Array(g.n).fill(-1)
  for (let start = 0; start < g.n; start++) {
    if (color[start] !== -1) continue
    color[start] = 0
    const queue = [start]
    while (queue.length > 0) {
      const u = queue.shift()!
      for (const v of bitsOf(g.adj[u]!)) {
        if (color[v] === -1) {
          color[v] = (1 - color[u]!) as 0 | 1
          queue.push(v)
        } else if (color[v] === color[u]) {
          return false
        }
      }
    }
  }
  return true
}

function connectedCheck(g: LabGraph): boolean {
  if (g.n <= 1) return true
  const seen = new Uint8Array(g.n)
  const stack = [0]
  seen[0] = 1
  let count = 1
  while (stack.length > 0) {
    const u = stack.pop()!
    for (const v of bitsOf(g.adj[u]!)) {
      if (!seen[v]) {
        seen[v] = 1
        count++
        stack.push(v)
      }
    }
  }
  return count === g.n
}

function regularCheck(g: LabGraph): boolean {
  const seq = degrees(g)
  return seq.every((d) => d === seq[0])
}

/**
 * 谱搜索的上界剪枝（“不可能达到当前最好值”），移植自原实验台：
 * ρ² ≤ ‖A²‖∞，且对任意正向量 x 有 ρ ≤ max_i (Ax)_i / x_i；
 * 用 A+I 的整数幂保持 x 为正（对不连通图与孤立点同样有效）。
 * 仅在严格小于时返回 true；等号保留（需精确复核）。
 */
export function spectralCannotTie(g: LabGraph, best: number): boolean {
  const adjList = Array.from({ length: g.n }, (_, v) => bitsOf(g.adj[v]!))
  const deg = adjList.map((row) => row.length)
  let squareBound = 0
  for (const row of adjList) {
    let sum = 0
    for (const u of row) sum += deg[u]!
    squareBound = Math.max(squareBound, sum)
  }
  if (squareBound < best * best) return true
  let vector = deg.map((d) => d + 1)
  for (let round = 0; round < 3; round++) {
    const product = adjList.map((row) => row.reduce((acc, u) => acc + vector[u]!, 0))
    let upper = -Infinity
    for (let i = 0; i < g.n; i++) upper = Math.max(upper, product[i]! / vector[i]!)
    if (upper < best) return true
    vector = product.map((value, i) => value + vector[i]!)
  }
  return false
}
