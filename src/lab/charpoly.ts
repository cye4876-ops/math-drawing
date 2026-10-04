/**
 * 精确整数特征多项式（v2.7）：Faddeev–LeVerrier 递推。
 * det(λI − A) = λ^n + c1·λ^{n−1} + … + cn，A 为整数矩阵：
 *   B₀ = I；c_k = −tr(A·B_{k−1}) / k；B_k = A·B_{k−1} + c_k·I。
 * 整数矩阵下所有中间量均为整数（除以 k 精确整除）。
 * 系数一律 BigInt；同一图用整数系数判断“同谱”是精确的。
 */
import { degrees, type LabGraph } from './graph'

export type IntMatrix = bigint[][]

/** 特征多项式系数（降幂，长度 n+1，首项恒为 1） */
export function charPolyCoefficients(a: IntMatrix): bigint[] {
  const n = a.length
  if (n === 0) return [1n]
  let b = identity(n)
  const coeffs: bigint[] = [1n]
  for (let k = 1; k <= n; k++) {
    const c = multiply(a, b)
    let trace = 0n
    for (let i = 0; i < n; i++) trace += c[i]![i]!
    const ck = -trace / BigInt(k)
    if (ck * BigInt(k) !== -trace) throw new Error('Faddeev–LeVerrier 整除异常')
    coeffs.push(ck)
    b = c
    for (let i = 0; i < n; i++) b[i]![i]! += ck
  }
  return coeffs
}

export function identity(n: number): IntMatrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n)),
  )
}

export function multiply(a: IntMatrix, b: IntMatrix): IntMatrix {
  const n = a.length
  const m = b[0]?.length ?? 0
  const result: IntMatrix = Array.from({ length: n }, () => new Array<bigint>(m).fill(0n))
  for (let i = 0; i < n; i++) {
    const row = a[i]!
    const out = result[i]!
    for (let k = 0; k < row.length; k++) {
      const aik = row[k]!
      if (aik === 0n) continue
      const brow = b[k]!
      for (let j = 0; j < m; j++) out[j]! += aik * brow[j]!
    }
  }
  return result
}

/** 邻接矩阵（整数） */
export function adjacencyIntMatrix(g: LabGraph): IntMatrix {
  return Array.from({ length: g.n }, (_, u) =>
    Array.from({ length: g.n }, (_, v) => ((g.adj[u]! >> v) & 1 ? 1n : 0n)),
  )
}

/** Laplacian L = D − A */
export function laplacianIntMatrix(g: LabGraph): IntMatrix {
  const deg = degrees(g)
  return Array.from({ length: g.n }, (_, u) =>
    Array.from({ length: g.n }, (_, v) => {
      if (u === v) return BigInt(deg[u]!)
      return (g.adj[u]! >> v) & 1 ? -1n : 0n
    }),
  )
}

/** 无符号 Laplacian Q = D + A */
export function signlessLaplacianIntMatrix(g: LabGraph): IntMatrix {
  const deg = degrees(g)
  return Array.from({ length: g.n }, (_, u) =>
    Array.from({ length: g.n }, (_, v) => {
      if (u === v) return BigInt(deg[u]!)
      return (g.adj[u]! >> v) & 1 ? 1n : 0n
    }),
  )
}

/** BigInt 矩阵 → 数值矩阵（供数值特征值） */
export function toNumberMatrix(a: IntMatrix): number[][] {
  return a.map((row) => row.map((v) => Number(v)))
}

/** 两个整数系数向量是否相等（降幂） */
export function sameCoefficients(x: readonly bigint[], y: readonly bigint[]): boolean {
  if (x.length !== y.length) return false
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  return true
}
