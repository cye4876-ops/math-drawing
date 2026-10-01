/**
 * 图的谱分析（v0.5）：
 * - 加权邻接矩阵（无向边对称、有向边按 i→j、平行边累加、自环计对角一次）；
 * - 对称邻接阵全谱：Jacobi 旋转（特征值降序 + 正交特征向量，符号规范化）；
 * - 谱半径与 Perron 向量：幂迭代（Powers 于 A+I 上迭代，避免周期图的振荡；
 *   Perron–Frobenius：非负矩阵的谱半径必为特征值，且存在非负特征向量）。
 *
 * 复杂度：矩阵 O(n²)；Jacobi 约 O(n³)（UI 仅在 n ≤ maxFullSpectrumSize 时求全谱）；
 * Perron 幂迭代每步 O(E)（稀疏，按边列表施加矩阵，大图亦可）。
 */
import type { GraphObject } from './model'

/** 加权邻接矩阵与行列标签 */
export interface AdjacencyMatrix {
  labels: { id: string; label: string }[]
  /** matrix[i][j] = 顶点 i → 顶点 j 的边权重和（无向边两端累加；自环计对角一次） */
  matrix: number[][]
  symmetric: boolean
}

/** 构建加权邻接矩阵（含对称性判定，容差 1e-12） */
export function buildAdjacencyMatrix(graph: GraphObject): AdjacencyMatrix {
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (const edge of graph.edges) {
    const i = index.get(edge.source)
    const j = index.get(edge.target)
    if (i === undefined || j === undefined) continue
    const weight = edge.weight ?? 1
    matrix[i]![j]! += weight
    if (!edge.directed && i !== j) matrix[j]![i]! += weight
  }
  let symmetric = true
  for (let i = 0; i < n && symmetric; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[i]![j]! - matrix[j]![i]!) > 1e-12) {
        symmetric = false
        break
      }
    }
  }
  return {
    labels: graph.nodes.map((node) => ({ id: node.id, label: node.label })),
    matrix,
    symmetric,
  }
}

export interface SymmetricEigen {
  /** 特征值（降序） */
  values: number[]
  /** 特征向量（vectors[k] 对应 values[k]；单位向量，最大绝对值分量为正） */
  vectors: number[][]
}

/**
 * Jacobi 旋转求对称矩阵全部特征值与特征向量。
 * 迭代至非对角平方和 < 1e-18 × 矩阵范数²（或 100 轮保护）。
 */
export function jacobiEigenSymmetric(input: number[][]): SymmetricEigen {
  const n = input.length
  if (n === 0) return { values: [], vectors: [] }
  const a = input.map((row) => [...row])
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  )
  let norm2 = 0
  for (const row of a) for (const value of row) norm2 += value * value
  const tolerance = norm2 > 0 ? 1e-18 * norm2 : 0

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) off += a[p]![q]! * a[p]![q]!
    }
    if (off <= tolerance) break
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!
        if (apq === 0) continue
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq)
        const t =
          theta >= 0
            ? 1 / (theta + Math.sqrt(theta * theta + 1))
            : -1 / (-theta + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        const tau = s / (1 + c)
        const app = a[p]![p]!
        const aqq = a[q]![q]!
        a[p]![p] = app - t * apq
        a[q]![q] = aqq + t * apq
        a[p]![q] = 0
        a[q]![p] = 0
        for (let k = 0; k < n; k++) {
          if (k !== p && k !== q) {
            const akp = a[k]![p]!
            const akq = a[k]![q]!
            a[k]![p] = akp - s * (akq + tau * akp)
            a[p]![k] = a[k]![p]!
            a[k]![q] = akq + s * (akp - tau * akq)
            a[q]![k] = a[k]![q]!
          }
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!
          const vkq = v[k]![q]!
          v[k]![p] = vkp - s * (vkq + tau * vkp)
          v[k]![q] = vkq + s * (vkp - tau * vkq)
        }
      }
    }
  }

  const pairs = Array.from({ length: n }, (_, i) => ({
    value: a[i]![i]!,
    vector: v.map((row) => row[i]!),
  }))
  pairs.sort((x, y) => y.value - x.value)
  for (const pair of pairs) {
    let maxIndex = 0
    for (let i = 1; i < n; i++) {
      if (Math.abs(pair.vector[i]!) > Math.abs(pair.vector[maxIndex]!)) maxIndex = i
    }
    if (pair.vector[maxIndex]! < 0) {
      pair.vector = pair.vector.map((value) => -value)
    }
  }
  return { values: pairs.map((pair) => pair.value), vectors: pairs.map((pair) => pair.vector) }
}

export interface PerronResult {
  /** 谱半径（Perron 根）估计 */
  eigenvalue: number
  /** Perron 向量（L∞ 归一化：最大分量 = 1；非负） */
  vector: number[]
  /** 是否在容差内收敛（Jordan 型矩阵可能慢收敛，结果为近似） */
  converged: boolean
}

/**
 * 幂迭代求谱半径与 Perron 向量（在 A+I 上迭代以避免周期图振荡）。
 * 起点为全 1 向量；每步 L∞ 归一化；迭代上限保护。
 */
export function perronVector(
  graph: GraphObject,
  options: { maxIterations?: number; tolerance?: number } = {},
): PerronResult {
  const n = graph.nodes.length
  if (n === 0) return { eigenvalue: 0, vector: [], converged: true }
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const maxIterations = options.maxIterations ?? 2000
  const tolerance = options.tolerance ?? 1e-12
  let x: number[] = new Array<number>(n).fill(1)
  let eigenvalue = 0
  let converged = false

  for (let step = 0; step < maxIterations; step++) {
    const y = x.slice()
    for (const edge of graph.edges) {
      const i = index.get(edge.source)
      const j = index.get(edge.target)
      if (i === undefined || j === undefined) continue
      const weight = edge.weight ?? 1
      y[i]! += weight * x[j]!
      if (!edge.directed && i !== j) y[j]! += weight * x[i]!
    }
    let maxY = 0
    for (const value of y) maxY = Math.max(maxY, Math.abs(value))
    if (maxY === 0) {
      eigenvalue = 0
      converged = true
      break
    }
    let delta = 0
    for (let i = 0; i < n; i++) {
      const next = y[i]! / maxY
      delta = Math.max(delta, Math.abs(next - x[i]!))
      x[i] = next
    }
    eigenvalue = maxY - 1
    if (delta < tolerance) {
      converged = true
      break
    }
  }
  // 数值噪声清理：微小负值归零（Perron 向量非负）
  x = x.map((value) => (value < 0 && value > -1e-9 ? 0 : value))
  const maxComponent = Math.max(...x, 0)
  if (maxComponent > 0) x = x.map((value) => value / maxComponent)
  return { eigenvalue, vector: x, converged }
}

/** 高层谱结果（UI 与计算统一入口） */
export interface GraphSpectrum {
  adjacency: AdjacencyMatrix
  symmetric: boolean
  /** 全特征值（降序）；非对称邻接阵或超出规模上限时为 null */
  eigenvalues: number[] | null
  /** 谱半径（Perron 根） */
  spectralRadius: number
  /** Perron 向量（最大分量 = 1，非负） */
  perron: number[]
  perronConverged: boolean
}

/** 计算图的谱（矩阵 + 全谱（如适用）+ 谱半径与 Perron 向量） */
export function computeSpectrum(
  graph: GraphObject,
  options: { maxFullSpectrumSize?: number } = {},
): GraphSpectrum {
  const adjacency = buildAdjacencyMatrix(graph)
  const n = adjacency.matrix.length
  const maxFull = options.maxFullSpectrumSize ?? 64
  let eigenvalues: number[] | null = null
  if (adjacency.symmetric && n > 0 && n <= maxFull) {
    eigenvalues = jacobiEigenSymmetric(adjacency.matrix).values
  }
  const perron = perronVector(graph)
  return {
    adjacency,
    symmetric: adjacency.symmetric,
    eigenvalues,
    spectralRadius: perron.eigenvalue,
    perron: perron.vector,
    perronConverged: perron.converged,
  }
}
