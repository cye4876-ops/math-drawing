/**
 * 生成树计数（Kirchhoff 矩阵树定理，v0.6）：
 * τ(G) = (1/n)·∏_{i≥2} λ_i，λ 为拉普拉斯矩阵的非零特征值。
 * - 语义：有向边按「无向化」计入（与连通性/欧拉判据一致）；自环忽略；平行边权重累加；
 * - 顶点数 > 64 时跳过（全谱 O(n³) 与浮点乘积精度考虑）；不连通图 τ=0；单点图约定 τ=1；
 * - count ≤ 2^53 且取整校验通过 → 精确整数；更大计数给出 approx（UI 以科学计数展示）。
 */
import { jacobiEigenSymmetric } from './spectral'
import type { GraphObject } from './model'

export interface SpanningTreeResult {
  /** 精确整数计数（大计数或数值异常时为 null） */
  count: number | null
  /** 数值近似（count 为 null 时可用） */
  approx: number | null
  /** 规模超限未计算 */
  skipped: boolean
}

export function countSpanningTrees(graph: GraphObject, maxNodes = 64): SpanningTreeResult {
  const n = graph.nodes.length
  if (n === 0) return { count: 0, approx: 0, skipped: false }
  if (n === 1) return { count: 1, approx: 1, skipped: false }
  if (n > maxNodes) return { count: null, approx: null, skipped: true }

  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const weight: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (const edge of graph.edges) {
    const u = index.get(edge.source)
    const v = index.get(edge.target)
    if (u === undefined || v === undefined || u === v) continue
    const w = edge.weight ?? 1
    weight[u]![v]! += w
    weight[v]![u]! += w
  }

  // 连通性（权重 > 0 视为相邻）
  const seen = new Array<boolean>(n).fill(false)
  seen[0] = true
  const queue = [0]
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!
    for (let v = 0; v < n; v++) {
      if (!seen[v] && (weight[u]![v] ?? 0) > 0) {
        seen[v] = true
        queue.push(v)
      }
    }
  }
  if (!seen.every(Boolean)) return { count: 0, approx: 0, skipped: false }

  // L = D − W（对称；行和即加权度）
  const laplacian = weight.map((row, i) => {
    let degree = 0
    for (const value of row) degree += value
    return row.map((value, j) => (i === j ? degree : -value))
  })
  const values = jacobiEigenSymmetric(laplacian).values

  let product = 1
  let nonzero = 0
  for (const value of values) {
    if (Math.abs(value) < 1e-9) continue
    product *= value
    nonzero++
  }
  const tau = product / n
  if (!(tau > 0) || nonzero !== n - 1) {
    return { count: null, approx: Number.isFinite(tau) ? tau : null, skipped: false }
  }
  if (tau < Number.MAX_SAFE_INTEGER) {
    const rounded = Math.round(tau)
    if (Math.abs(tau - rounded) / Math.max(1, rounded) < 1e-6) {
      return { count: rounded, approx: tau, skipped: false }
    }
  }
  return { count: null, approx: tau, skipped: false }
}
