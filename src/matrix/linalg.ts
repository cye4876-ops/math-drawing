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
  // v2.9：容差随矩阵尺度缩放（不再用 max(1, scale) 的绝对下限，避免小尺度矩阵被误判奇异）
  const eps = tol * scaleOf(input)

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
  // v2.9：仅按“相对尺度”归零（小尺度可逆矩阵的行列式必须保留：diag(1e-6, 1e-6) → 1e-12）
  const scale = scaleOf(a)
  const relative = Math.pow(Math.max(scale, Number.MIN_VALUE), a.length)
  return Math.abs(det) < 1e-12 * relative ? 0 : det
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
      const eps = 1e-12 * scaleOf(a)
      if (Math.abs(diag) <= eps) return null
      y[i]![col] = sum / diag
    }
  }
  return y
}

export function rank(a: Matrix, tol = 1e-9): number {
  const m = cloneMatrix(a)
  const rows = m.length
  const cols = m[0]?.length ?? 0
  // v2.9：相对尺度容差（与 max|aᵢⱼ| 成比例），零矩阵 rank = 0
  const eps = tol * scaleOf(a)
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

// ---------- 复根（Durand–Kerner + 重根抛光） ----------

/** 复系数多项式求值（Horner，系数为降幂实数） */
function evalPolyComplex(coeffs: number[], z: Complex): Complex {
  let acc: Complex = { re: 0, im: 0 }
  for (let i = 0; i < coeffs.length; i++) {
    acc = cMul(acc, z)
    acc = { re: acc.re + (coeffs[i] ?? 0), im: acc.im }
  }
  return acc
}

/** 复系数多项式导数求值 */
function evalPolyDerivative(coeffs: number[], z: Complex): Complex {
  const n = coeffs.length - 1
  let acc: Complex = { re: 0, im: 0 }
  for (let i = 0; i < n; i++) {
    acc = cMul(acc, z)
    acc = { re: acc.re + (n - i) * (coeffs[i] ?? 0), im: acc.im }
  }
  return acc
}

/** 对单个根做 Newton 抛光（m 为试探重复度：z ← z − m·p/p′，重根收敛快得多） */
function newtonPolish(coeffs: number[], start: Complex, multiplicity: number): Complex {
  let w: Complex = { ...start }
  for (let iter = 0; iter < 40; iter++) {
    const pv = evalPolyComplex(coeffs, w)
    const dv = evalPolyDerivative(coeffs, w)
    if (cAbs(dv) < 1e-300) break
    const step = cDiv(pv, dv)
    w = { re: w.re - multiplicity * step.re, im: w.im - multiplicity * step.im }
    if (multiplicity * cAbs(step) < 1e-15 * Math.max(1, cAbs(w))) break
  }
  return w
}

/**
 * 重根抛光（v2.9）：Durand–Kerner 对重根收敛慢，可能残留 1e-4 量级虚部/误差。
 * 先用 m = 1 抛光；若残差仍大（疑似重根），再依次尝试 m = 2…8，取残差最小者。
 * 这样单位阵等“全部重根”情形会收敛到精确特征值（λ = 1）。
 */
function polishRoot(coeffs: number[], z: Complex): Complex {
  const scaleZ = Math.max(1, cAbs(z))
  let polyScale = 0
  for (let i = 0; i < coeffs.length; i++) {
    polyScale += Math.abs(coeffs[i] ?? 0) * Math.pow(scaleZ, coeffs.length - 1 - i)
  }
  const tolRes = 1e-12 * Math.max(1, polyScale)
  let best = newtonPolish(coeffs, z, 1)
  let bestRes = cAbs(evalPolyComplex(coeffs, best))
  if (bestRes > tolRes) {
    const maxM = Math.min(coeffs.length - 1, 8)
    for (let m = 2; m <= maxM; m++) {
      const candidate = newtonPolish(coeffs, z, m)
      const res = cAbs(evalPolyComplex(coeffs, candidate))
      if (res < bestRes) {
        best = candidate
        bestRes = res
      }
      if (bestRes <= tolRes) break
    }
  }
  return best
}

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
  const evalPoly = (z: Complex): Complex => evalPolyComplex(c, z)
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

  // v2.9：Newton 抛光（重根修正）
  const polished = roots.map((z) => polishRoot(c, z))

  // 同值合并（抛光后重根应精确重合）：后者替换为前者的精确副本，保持个数与顺序
  for (let i = 0; i < polished.length; i++) {
    for (let j = 0; j < i; j++) {
      const reference = polished[j]!
      if (cAbs(cSub(polished[i]!, reference)) <= 1e-8 * Math.max(1, cAbs(reference))) {
        polished[i] = { ...reference }
        break
      }
    }
  }

  // 微小虚部清理 + 近整数吸附（结合残差：抛光后残差极小才会走到这里）
  return polished.map((z) => {
    const scale = Math.max(1, cAbs(z))
    if (Math.abs(z.im) <= 1e-8 * scale) {
      const rounded = Math.abs(z.re - Math.round(z.re)) <= 1e-10 * scale ? Math.round(z.re) : z.re
      return { re: rounded, im: 0 }
    }
    return z
  })
}

// ---------- 零空间（RREF） ----------

/** 秩判定使用的相对容差（供 UI 说明）：eps = tol × max|aᵢⱼ| */
export function rankTolerance(a: Matrix, tol = 1e-9): number {
  return tol * scaleOf(a)
}

/** 高斯消元解 A·x = b（部分主元；奇异返回 null；容差随矩阵尺度缩放） */
function solveLinear(a: Matrix, b: number[]): number[] | null {
  const n = a.length
  const eps = 1e-12 * Math.max(scaleOf(a), Number.MIN_VALUE)
  const m = a.map((row) => [...row])
  const x = [...b]
  for (let k = 0; k < n; k++) {
    let pivotRow = k
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(m[i]?.[k] ?? 0) > Math.abs(m[pivotRow]?.[k] ?? 0)) pivotRow = i
    }
    if (Math.abs(m[pivotRow]?.[k] ?? 0) <= eps) return null
    ;[m[k], m[pivotRow]] = [m[pivotRow] ?? [], m[k] ?? []]
    const swap = x[k] ?? 0
    x[k] = x[pivotRow] ?? 0
    x[pivotRow] = swap
    for (let i = k + 1; i < n; i++) {
      const factor = (m[i]?.[k] ?? 0) / (m[k]?.[k] ?? 1)
      if (factor === 0) continue
      for (let j = k; j < n; j++) {
        if (m[i]) m[i]![j] = (m[i]?.[j] ?? 0) - factor * (m[k]?.[j] ?? 0)
      }
      x[i] = (x[i] ?? 0) - factor * (x[k] ?? 0)
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i] ?? 0
    for (let j = i + 1; j < n; j++) sum -= (m[i]?.[j] ?? 0) * (x[j] ?? 0)
    x[i] = sum / (m[i]?.[i] ?? 1)
  }
  return x
}

/**
 * 实特征值精化（v2.9）：以候选值为平移做逆迭代逼近特征向量，再用 Rayleigh 商给出特征值。
 * 关键收益：重特征值时 Durand–Kerner 的根位置受多项式求值噪声限制（残差看似为零、位置却偏 1e-4），
 * 而 Rayleigh 商在矩阵层面计算，仍能收敛到精确特征值（如单位阵恒为 1），并与残差复核互为印证。
 */
function refineRealEigenvalue(a: Matrix, lambda: number): number {
  const n = a.length
  let v = new Array<number>(n).fill(1)
  for (let iter = 0; iter < 4; iter++) {
    const shifted = a.map((row, i) => row.map((value, j) => value - (i === j ? lambda : 0)))
    const w = solveLinear(shifted, v)
    if (!w) {
      const basis = nullspace(shifted)
      if (basis[0]) v = basis[0]
      break
    }
    const norm = Math.hypot(...w)
    if (!Number.isFinite(norm) || norm === 0) break
    v = w.map((value) => value / norm)
  }
  const av = matVec(a, v)
  const num = v.reduce((sum, value, i) => sum + value * (av[i] ?? 0), 0)
  const den = v.reduce((sum, value) => sum + value * value, 0)
  return den === 0 ? lambda : num / den
}

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
  /** v2.9：复特征值（去重）与两种重数（ℂ 上可对角化判定的依据） */
  complexDistinct: Complex[]
  complexAlgebraicMultiplicities: number[]
  complexGeometricMultiplicities: number[]
  /** v2.9：在 ℂ 上是否可对角化（各特征值几何重数 = 代数重数；不预设结论） */
  diagonalizableOverComplex: boolean
}

/** 复数矩阵-向量乘法 */
function complexMatVec(a: Matrix, v: Complex[]): Complex[] {
  return a.map((row) => {
    let acc: Complex = { re: 0, im: 0 }
    row.forEach((value, j) => {
      const z = v[j]!
      acc = { re: acc.re + value * z.re, im: acc.im + value * z.im }
    })
    return acc
  })
}

/** 复数 RREF（A − λI；用于零度与零空间向量，容差随矩阵尺度缩放） */
function complexRref(
  a: Matrix,
  lambda: Complex,
  tol = 1e-9,
): { matrix: Complex[][]; pivots: number[]; rank: number } {
  const n = a.length
  const eps = tol * Math.max(scaleOf(a), Number.MIN_VALUE)
  const m: Complex[][] = a.map((row, i) =>
    row.map((value, j) => ({
      re: i === j ? value - lambda.re : value,
      im: i === j ? -lambda.im : 0,
    })),
  )
  const pivots: number[] = []
  for (let col = 0, row = 0; col < n && row < n; col++) {
    let pivotRow = row
    for (let i = row + 1; i < n; i++) {
      if (cAbs(m[i]![col]!) > cAbs(m[pivotRow]![col]!)) pivotRow = i
    }
    if (cAbs(m[pivotRow]![col]!) <= eps) continue
    ;[m[row], m[pivotRow]] = [m[pivotRow]!, m[row]!]
    const pivot = m[row]![col]!
    for (let j = col; j < n; j++) m[row]![j] = cDiv(m[row]![j]!, pivot)
    for (let i = 0; i < n; i++) {
      if (i === row) continue
      const factor = m[i]![col]!
      if (cAbs(factor) <= eps) continue
      for (let j = col; j < n; j++) m[i]![j] = cSub(m[i]![j]!, cMul(factor, m[row]![j]!))
    }
    pivots.push(col)
    row++
  }
  return { matrix: m, pivots, rank: pivots.length }
}

/** 复数零度：A − λI 在 ℂ 上的零空间维数 */
function complexNullity(a: Matrix, lambda: Complex, tol = 1e-9): number {
  return a.length - complexRref(a, lambda, tol).rank
}

/** 复数零空间向量（RREF 回代；秩满返回 null） */
function complexNullVector(a: Matrix, lambda: Complex): Complex[] | null {
  const n = a.length
  const { matrix, pivots, rank } = complexRref(a, lambda)
  if (rank === n) return null
  let free = 0
  while (pivots.includes(free)) free++
  const v: Complex[] = Array.from({ length: n }, () => ({ re: 0, im: 0 }))
  v[free] = { re: 1, im: 0 }
  for (let i = 0; i < pivots.length; i++) {
    const p = pivots[i]!
    const coefficient = matrix[i]![free]!
    v[p] = { re: -coefficient.re, im: -coefficient.im }
  }
  return v
}

/** 复数高斯消元解 (A − λI)·x = b；奇异返回 null */
function solveComplexShifted(a: Matrix, lambda: Complex, b: Complex[]): Complex[] | null {
  const n = a.length
  const eps = 1e-12 * Math.max(scaleOf(a), Number.MIN_VALUE)
  const m: Complex[][] = a.map((row, i) =>
    row.map((value, j) => ({
      re: i === j ? value - lambda.re : value,
      im: i === j ? -lambda.im : 0,
    })),
  )
  const x = b.map((z) => ({ ...z }))
  for (let k = 0; k < n; k++) {
    let pivotRow = k
    for (let i = k + 1; i < n; i++) {
      if (cAbs(m[i]![k]!) > cAbs(m[pivotRow]![k]!)) pivotRow = i
    }
    if (cAbs(m[pivotRow]![k]!) <= eps) return null
    ;[m[k], m[pivotRow]] = [m[pivotRow]!, m[k]!]
    ;[x[k], x[pivotRow]] = [x[pivotRow]!, x[k]!]
    for (let i = k + 1; i < n; i++) {
      const factor = cDiv(m[i]![k]!, m[k]![k]!)
      if (cAbs(factor) === 0) continue
      for (let j = k; j < n; j++) m[i]![j] = cSub(m[i]![j]!, cMul(factor, m[k]![j]!))
      x[i] = cSub(x[i]!, cMul(factor, x[k]!))
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i]!
    for (let j = i + 1; j < n; j++) sum = cSub(sum, cMul(m[i]![j]!, x[j]!))
    x[i] = cDiv(sum, m[i]![i]!)
  }
  return x
}

/** 复特征值精化（复逆迭代 + 复 Rayleigh 商 λ = v*Av / v*v） */
function refineComplexEigenvalue(a: Matrix, lambda: Complex): Complex {
  const n = a.length
  let v: Complex[] = Array.from({ length: n }, (_, i) => ({ re: i === 0 ? 1 : 0.5, im: i * 0.1 }))
  for (let iter = 0; iter < 4; iter++) {
    const w = solveComplexShifted(a, lambda, v)
    if (!w) {
      const basis = complexNullVector(a, lambda)
      if (basis) v = basis
      break
    }
    let normSq = 0
    for (const z of w) normSq += z.re * z.re + z.im * z.im
    const norm = Math.sqrt(normSq)
    if (!(norm > 0) || !Number.isFinite(norm)) break
    v = w.map((z) => ({ re: z.re / norm, im: z.im / norm }))
  }
  const av = complexMatVec(a, v)
  let num: Complex = { re: 0, im: 0 }
  let den = 0
  for (let i = 0; i < n; i++) {
    const vi = v[i]!
    // conj(vi)·(Av)i
    num = {
      re: num.re + vi.re * (av[i]?.re ?? 0) + vi.im * (av[i]?.im ?? 0),
      im: num.im + vi.re * (av[i]?.im ?? 0) - vi.im * (av[i]?.re ?? 0),
    }
    den += vi.re * vi.re + vi.im * vi.im
  }
  if (den === 0) return lambda
  return cDiv(num, { re: den, im: 0 })
}

export function eigenDecompose(input: Matrix, tol = 1e-7): EigenDecomposition {
  const n = input.length
  const coeffs = characteristicPolynomial(input)
  const rawRoots = polyRoots(coeffs)
  const scale = Math.max(1, scaleOf(input))
  const eps = tol * scale

  // v2.9：Rayleigh 商精化（逆迭代）——修复重特征值位置（如单位阵全部收敛为 1）；
  // 精化后再做近整数吸附，使整数特征值精确显示。
  const roots = rawRoots.map((z) => {
    let refined: Complex
    if (z.im === 0) refined = { re: refineRealEigenvalue(input, z.re), im: 0 }
    else refined = refineComplexEigenvalue(input, z)
    const refinedScale = Math.max(1, cAbs(refined))
    if (Math.abs(refined.im) <= 1e-8 * refinedScale) {
      const re =
        Math.abs(refined.re - Math.round(refined.re)) <= 1e-10 * refinedScale
          ? Math.round(refined.re)
          : refined.re
      return { re, im: 0 }
    }
    return refined
  })

  // 去重（v2.9：复值聚类；精化后的重根已精确重合，容差可收紧到 1e-8·scale）
  const distinct: { value: Complex; count: number }[] = []
  for (const root of roots) {
    const found = distinct.find(
      (item) => cAbs(cSub(item.value, root)) <= 1e-8 * Math.max(1, cAbs(item.value)),
    )
    if (found) found.count++
    else distinct.push({ value: { ...root }, count: 1 })
  }
  const hasComplex = distinct.some((item) => item.value.im !== 0)

  const eigenvectors: number[][] = []
  const valuesOrder: number[] = []
  const realDistinct: { value: number; count: number }[] = []
  const realGeo: number[] = []
  const complexDistinct: Complex[] = []
  const complexAlg: number[] = []
  const complexGeo: number[] = []

  for (const item of distinct) {
    if (item.value.im === 0) {
      const shifted = input.map((row, i) =>
        row.map((value, j) => value - (i === j ? item.value.re : 0)),
      )
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
      realGeo.push(orthonormal.length)
      realDistinct.push({ value: item.value.re, count: item.count })
      for (const v of orthonormal) {
        eigenvectors.push(v)
        valuesOrder.push(item.value.re)
      }
    } else {
      complexDistinct.push({ ...item.value })
      complexAlg.push(item.count)
      complexGeo.push(complexNullity(input, item.value))
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

  // v2.9：ℂ 上可对角化 ⟺ 每个特征值几何重数 = 代数重数（Σ 几何重数 = n，且不超出代数重数）
  const realGeoSum = realGeo.reduce((sum, value) => sum + value, 0)
  const complexGeoSum = complexGeo.reduce((sum, value) => sum + value, 0)
  const geometricWithinAlgebraic =
    realGeo.every((value, i) => value <= (realDistinct[i]?.count ?? 0)) &&
    complexGeo.every((value, i) => value <= (complexAlg[i] ?? 0))
  const diagonalizableOverComplex = geometricWithinAlgebraic && realGeoSum + complexGeoSum === n

  return {
    eigenvalues: roots,
    hasComplex,
    diagonalizable,
    p,
    d,
    distinctRealValues: realDistinct.map((item) => item.value),
    algebraicMultiplicities: realDistinct.map((item) => item.count),
    geometricMultiplicities: realGeo,
    residual,
    complexPairs: roots.filter((z) => z.im !== 0),
    complexDistinct,
    complexAlgebraicMultiplicities: complexAlg,
    complexGeometricMultiplicities: complexGeo,
    diagonalizableOverComplex,
  }
}
