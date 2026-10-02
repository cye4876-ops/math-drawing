/**
 * 矩阵分解与线性代数内核（v2.3 矩阵模块）。
 *
 * - 基础：乘法/转置/行列式/逆/秩（全部数值稳定实现，教学规模 n ≤ 4）；
 * - LU 分解（部分主元，P·A = L·U）；
 * - QR 分解（Householder 反射，A = Q·R）；
 * - 特征多项式（Faddeev–LeVerrier）+ 复根求解（Durand–Kerner）；
 * - 相似对角化（A = P·D·P⁻¹，实特征值；报告复特征值与不可对角化情形）。
 */

export type Matrix = number[][]

export interface Complex {
  re: number
  im: number
}

const cAbs = (z: Complex): number => Math.hypot(z.re, z.im)
const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
})
const cDiv = (a: Complex, b: Complex): Complex => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}

/** 抹掉数值噪声（显示与判零用） */
export function cleanNumber(value: number, eps = 1e-10): number {
  return Math.abs(value) < eps ? 0 : value
}

export function identity(n: number): Matrix {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
}

export function cloneMatrix(a: Matrix): Matrix {
  return a.map((row) => [...row])
}

export function matmul(a: Matrix, b: Matrix): Matrix {
  const n = a.length
  const m = b[0]?.length ?? 0
  const k = b.length
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      let sum = 0
      for (let t = 0; t < k; t++) sum += (a[i]?.[t] ?? 0) * (b[t]?.[j] ?? 0)
      return sum
    }),
  )
}

export function transpose(a: Matrix): Matrix {
  const n = a.length
  const m = a[0]?.length ?? 0
  return Array.from({ length: m }, (_, j) => Array.from({ length: n }, (_, i) => a[i]?.[j] ?? 0))
}

export function matVec(a: Matrix, v: number[]): number[] {
  return a.map((row) => row.reduce((sum, value, j) => sum + value * (v[j] ?? 0), 0))
}

export function maxAbsDiff(a: Matrix, b: Matrix): number {
  let max = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < (a[i]?.length ?? 0); j++) {
      max = Math.max(max, Math.abs((a[i]?.[j] ?? 0) - (b[i]?.[j] ?? 0)))
    }
  }
  return max
}

function scaleOf(a: Matrix): number {
  let max = 0
  for (const row of a) for (const value of row) max = Math.max(max, Math.abs(value))
  return max
}

// ---------- LU（部分主元） ----------

export interface LuDecomposition {
  /** 置换矩阵（P·A = L·U） */
  p: Matrix
  /** 单位下三角 */
  l: Matrix
  /** 上三角 */
  u: Matrix
  /** 置换符号（det(P) = ±1） */
  sign: number
  singular: boolean
}

export function luDecompose(input: Matrix, tol = 1e-12): LuDecomposition {
  const n = input.length
  const u = cloneMatrix(input)
  const l = identity(n)
  const p = identity(n)
  let sign = 1
  let singular = false
  const eps = tol * Math.max(1, scaleOf(input))

  for (let k = 0; k < n; k++) {
    // 部分主元：选列内绝对值最大行
    let pivotRow = k
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(u[i]?.[k] ?? 0) > Math.abs(u[pivotRow]?.[k] ?? 0)) pivotRow = i
    }
    if (pivotRow !== k) {
      ;[u[k], u[pivotRow]] = [u[pivotRow] ?? [], u[k] ?? []]
      ;[p[k], p[pivotRow]] = [p[pivotRow] ?? [], p[k] ?? []]
      for (let j = 0; j < k; j++) {
        const temp = l[k]?.[j] ?? 0
        if (l[k]) l[k]![j] = l[pivotRow]?.[j] ?? 0
        if (l[pivotRow]) l[pivotRow]![j] = temp
      }
      sign = -sign
    }
    const pivot = u[k]?.[k] ?? 0
    if (Math.abs(pivot) <= eps) {
      singular = true
      continue
    }
    for (let i = k + 1; i < n; i++) {
      const factor = (u[i]?.[k] ?? 0) / pivot
      if (l[i]) l[i]![k] = factor
      for (let j = k; j < n; j++) {
        if (u[i]) u[i]![j] = (u[i]?.[j] ?? 0) - factor * (u[k]?.[j] ?? 0)
      }
    }
  }
  return { p, l, u, sign, singular }
}

export function determinant(a: Matrix): number {
  const { u, sign } = luDecompose(a)
  let det = sign
  for (let i = 0; i < u.length; i++) det *= u[i]?.[i] ?? 0
  return cleanNumber(det, 1e-10)
}

export function inverse(a: Matrix): Matrix | null {
  const n = a.length
  const { p, l, u, singular } = luDecompose(a)
  if (singular) return null
  // 解 A·X = I：先 L·Y = P·I，再 U·X = Y
  const pi = p // P·A = L·U ⇒ A = P⁻¹·L·U；对 P·I 右端解
  const y: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let col = 0; col < n; col++) {
    for (let i = 0; i < n; i++) {
      let sum = pi[i]?.[col] ?? 0
      for (let j = 0; j < i; j++) sum -= (l[i]?.[j] ?? 0) * (y[j]?.[col] ?? 0)
      y[i]![col] = sum
    }
    for (let i = n - 1; i >= 0; i--) {
      let sum = y[i]?.[col] ?? 0
      for (let j = i + 1; j < n; j++) sum -= (u[i]?.[j] ?? 0) * (y[j]?.[col] ?? 0)
      const diag = u[i]?.[i] ?? 0
      if (Math.abs(diag) < 1e-14) return null
      y[i]![col] = sum / diag
    }
  }
  return y
}

export function rank(a: Matrix, tol = 1e-9): number {
  const m = cloneMatrix(a)
  const rows = m.length
  const cols = m[0]?.length ?? 0
  const eps = tol * Math.max(1, scaleOf(a))
  let rankCount = 0
  for (let col = 0, row = 0; col < cols && row < rows; col++) {
    let pivotRow = row
    for (let i = row + 1; i < rows; i++) {
      if (Math.abs(m[i]?.[col] ?? 0) > Math.abs(m[pivotRow]?.[col] ?? 0)) pivotRow = i
    }
    if (Math.abs(m[pivotRow]?.[col] ?? 0) <= eps) continue
    ;[m[row], m[pivotRow]] = [m[pivotRow] ?? [], m[row] ?? []]
    for (let i = row + 1; i < rows; i++) {
      const factor = (m[i]?.[col] ?? 0) / (m[row]?.[col] ?? 1)
      for (let j = col; j < cols; j++) {
        if (m[i]) m[i]![j] = (m[i]?.[j] ?? 0) - factor * (m[row]?.[j] ?? 0)
      }
    }
    row++
    rankCount++
  }
  return rankCount
}

// ---------- QR（Householder） ----------

export interface QrDecomposition {
  q: Matrix
  r: Matrix
}

export function qrDecompose(input: Matrix, tol = 1e-12): QrDecomposition {
  const m = input.length
  const n = input[0]?.length ?? 0
  const r = cloneMatrix(input)
  const q = identity(m)
  const steps = Math.min(m - 1, n)
  for (let k = 0; k < steps; k++) {
    // 构造 Householder 向量 v（作用在列 k 的对角线以下）
    const x = Array.from({ length: m - k }, (_, i) => r[k + i]?.[k] ?? 0)
    const norm = Math.hypot(...x)
    if (norm <= tol) continue
    const alpha = x[0]! >= 0 ? -norm : norm
    const v = [...x]
    v[0] = (v[0] ?? 0) - alpha
    const vNorm = Math.hypot(...v)
    if (vNorm <= tol) continue
    for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / vNorm
    // R ← H·R（只作用于行 k..m-1）
    for (let j = 0; j < n; j++) {
      let dot = 0
      for (let i = 0; i < v.length; i++) dot += (v[i] ?? 0) * (r[k + i]?.[j] ?? 0)
      for (let i = 0; i < v.length; i++) {
        if (r[k + i]) r[k + i]![j] = (r[k + i]?.[j] ?? 0) - 2 * (v[i] ?? 0) * dot
      }
    }
    // Q ← Q·H（累积到右侧）
    for (let i = 0; i < m; i++) {
      let dot = 0
      for (let t = 0; t < v.length; t++) dot += (q[i]?.[k + t] ?? 0) * (v[t] ?? 0)
      for (let t = 0; t < v.length; t++) {
        if (q[i]) q[i]![k + t] = (q[i]?.[k + t] ?? 0) - 2 * dot * (v[t] ?? 0)
      }
    }
  }
  // 对角符号归一：R 对角取正（相应翻转 Q 的列，保持 Q·R = A）
  const diagCount = Math.min(m, n)
  for (let k = 0; k < diagCount; k++) {
    if ((r[k]?.[k] ?? 0) < 0) {
      for (let i = 0; i < m; i++) {
        if (q[i]) q[i]![k] = -(q[i]?.[k] ?? 0)
      }
      for (let j = 0; j < n; j++) {
        if (r[k]) r[k]![j] = -(r[k]?.[j] ?? 0)
      }
    }
  }
  // 清理下三角数值噪声
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < Math.min(i, n); j++) {
      if (r[i]) r[i]![j] = cleanNumber(r[i]?.[j] ?? 0, 1e-12)
    }
  }
  return { q, r }
}

// ---------- 特征多项式（Faddeev–LeVerrier） ----------

/** 返回降幂系数 [1, c₁, …, cₙ]：p(λ) = λⁿ − c₁λⁿ⁻¹ − ⋯ − cₙ */
export function characteristicPolynomial(a: Matrix): number[] {
  const n = a.length
  let m = identity(n)
  const c: number[] = []
  for (let k = 1; k <= n; k++) {
    const am = matmul(a, m)
    let tr = 0
    for (let i = 0; i < n; i++) tr += am[i]?.[i] ?? 0
    c.push(tr / k)
    // M_k = A·M_{k-1} − c_k·I
    m = am.map((row, i) => row.map((value, j) => value - (i === j ? tr / k : 0)))
  }
  // p(λ) = λⁿ − c₁λⁿ⁻¹ − ⋯ − cₙ
  return [1, ...c.map((value) => -value)]
}

// ---------- 复根（Durand–Kerner） ----------

export function polyRoots(coeffs: number[], maxIter = 800, tol = 1e-12): Complex[] {
  // 去掉前导接近零的系数
  const lead = coeffs.findIndex((value) => Math.abs(value) > 1e-14)
  const trimmed = lead === -1 ? [0] : coeffs.slice(lead)
  const n = trimmed.length - 1
  if (n <= 0) return []
  const c = trimmed.map((value) => value / (trimmed[0] ?? 1))
  // 初值：0.4 + 0.9i 的幂次（经典选择）
  const roots: Complex[] = []
  let base: Complex = { re: 1, im: 0 }
  const step: Complex = { re: 0.4, im: 0.9 }
  for (let k = 0; k < n; k++) {
    roots.push({ ...base })
    base = cMul(base, step)
  }
  const evalPoly = (z: Complex): Complex => {
    let acc: Complex = { re: c[0] ?? 1, im: 0 }
    for (let k = 1; k <= n; k++) {
      acc = cMul(acc, z)
      acc = { re: acc.re + (c[k] ?? 0), im: acc.im }
    }
    return acc
  }
  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0
    for (let k = 0; k < n; k++) {
      const zk = roots[k]!
      let denom: Complex = { re: 1, im: 0 }
      for (let j = 0; j < n; j++) {
        if (j === k) continue
        denom = cMul(denom, cSub(zk, roots[j]!))
      }
      if (cAbs(denom) < 1e-300) denom = { re: 1e-300, im: 0 }
      const delta = cDiv(evalPoly(zk), denom)
      roots[k] = cSub(zk, delta)
      maxDelta = Math.max(maxDelta, cAbs(delta))
    }
    if (maxDelta < tol) break
  }
  // 抹掉微小虚部
  return roots.map((z) => {
    const scale = Math.max(1, cAbs(z))
    return Math.abs(z.im) < 1e-8 * scale ? { re: z.re, im: 0 } : z
  })
}

// ---------- 零空间（RREF） ----------

/** 求 A·x = 0 的基础解系（列向量数组） */
export function nullspace(input: Matrix, tol = 1e-8): number[][] {
  const rows = input.length
  const cols = input[0]?.length ?? 0
  if (rows === 0 || cols === 0) return []
  const eps = tol * Math.max(1, scaleOf(input))
  const m = cloneMatrix(input)
  const pivotCols: number[] = []
  let row = 0
  for (let col = 0; col < cols && row < rows; col++) {
    let pivotRow = row
    for (let i = row + 1; i < rows; i++) {
      if (Math.abs(m[i]?.[col] ?? 0) > Math.abs(m[pivotRow]?.[col] ?? 0)) pivotRow = i
    }
    if (Math.abs(m[pivotRow]?.[col] ?? 0) <= eps) continue
    ;[m[row], m[pivotRow]] = [m[pivotRow] ?? [], m[row] ?? []]
    const pivot = m[row]?.[col] ?? 1
    for (let j = col; j < cols; j++) {
      if (m[row]) m[row]![j] = (m[row]?.[j] ?? 0) / pivot
    }
    for (let i = 0; i < rows; i++) {
      if (i === row) continue
      const factor = m[i]?.[col] ?? 0
      if (Math.abs(factor) <= eps) continue
      for (let j = col; j < cols; j++) {
        if (m[i]) m[i]![j] = (m[i]?.[j] ?? 0) - factor * (m[row]?.[j] ?? 0)
      }
    }
    pivotCols.push(col)
    row++
  }
  // 自由列 → 基础解系
  const freeCols: number[] = []
  for (let col = 0; col < cols; col++) {
    if (!pivotCols.includes(col)) freeCols.push(col)
  }
  const basis: number[][] = []
  for (const free of freeCols) {
    const vector = new Array<number>(cols).fill(0)
    vector[free] = 1
    for (let i = 0; i < pivotCols.length; i++) {
      const pcol = pivotCols[i]!
      vector[pcol] = -(m[i]?.[free] ?? 0)
    }
    basis.push(vector.map((value) => cleanNumber(value, 1e-10)))
  }
  return basis
}

// ---------- 相似对角化（A = P·D·P⁻¹） ----------

export interface EigenDecomposition {
  /** 全部特征值（含复） */
  eigenvalues: Complex[]
  hasComplex: boolean
  /** 是否存在实特征向量基（P 可逆） */
  diagonalizable: boolean
  /** 特征向量按列（与 d 对角元顺序一致） */
  p: Matrix | null
  d: Matrix | null
  /** 特征值（去重后，实部）与代数重数 */
  distinctRealValues: number[]
  algebraicMultiplicities: number[]
  geometricMultiplicities: number[]
  /** ‖A − P·D·P⁻¹‖∞ 残差（diagonalizable 时） */
  residual: number
  /** 复特征值（若存在） */
  complexPairs: Complex[]
}

export function eigenDecompose(input: Matrix, tol = 1e-7): EigenDecomposition {
  const n = input.length
  const coeffs = characteristicPolynomial(input)
  const roots = polyRoots(coeffs)
  const hasComplex = roots.some((z) => z.im !== 0)
  const scale = Math.max(1, scaleOf(input))
  const eps = tol * scale

  // 去重（按实部聚类，容差内合并）
  const distinct: { value: number; count: number }[] = []
  for (const root of roots) {
    if (root.im !== 0) continue
    const found = distinct.find((item) => Math.abs(item.value - root.re) <= 1e-5 * scale)
    if (found) found.count++
    else distinct.push({ value: root.re, count: 1 })
  }

  const eigenvectors: number[][] = []
  const valuesOrder: number[] = []
  const geo: number[] = []
  for (const item of distinct) {
    const shifted = input.map((row, i) => row.map((value, j) => value - (i === j ? item.value : 0)))
    const basis = nullspace(shifted, Math.max(tol, 1e-8))
    // 仅在同一特征空间内正交化（跨特征值的投影会破坏特征向量性质）
    const orthonormal: number[][] = []
    for (const v of basis) {
      let w = [...v]
      for (const u of orthonormal) {
        const dot = w.reduce((sum, value, i) => sum + value * (u[i] ?? 0), 0)
        w = w.map((value, i) => value - dot * (u[i] ?? 0))
      }
      const len = Math.hypot(...w)
      if (len > Math.max(eps, 1e-9)) {
        orthonormal.push(w.map((value) => value / len))
      }
    }
    geo.push(orthonormal.length)
    for (const v of orthonormal) {
      eigenvectors.push(v)
      valuesOrder.push(item.value)
    }
  }

  const diagonalizableCandidate = !hasComplex && eigenvectors.length === n
  let diagonalizable = diagonalizableCandidate
  let p: Matrix | null = null
  let d: Matrix | null = null
  let residual = Number.POSITIVE_INFINITY
  if (diagonalizableCandidate) {
    const pCandidate = transpose(eigenvectors) // 列为特征向量
    const dCandidate = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? (valuesOrder[i] ?? 0) : 0)),
    )
    const pinv = inverse(pCandidate)
    if (pinv) {
      p = pCandidate
      d = dCandidate
      residual = maxAbsDiff(input, matmul(matmul(pCandidate, dCandidate), pinv))
    } else {
      diagonalizable = false
    }
  }

  return {
    eigenvalues: roots,
    hasComplex,
    diagonalizable,
    p,
    d,
    distinctRealValues: distinct.map((item) => item.value),
    algebraicMultiplicities: distinct.map((item) => item.count),
    geometricMultiplicities: geo,
    residual,
    complexPairs: roots.filter((z) => z.im !== 0),
  }
}
