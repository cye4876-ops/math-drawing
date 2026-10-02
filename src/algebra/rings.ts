/**
 * ℤ/nℤ 环与有限域相关计算（v2.2 近世代数模块）：运算表、单位、零因子、欧拉函数。
 * 教学规模（n ≤ 12），全部直接计算。
 */

export interface ZnTables {
  n: number
  elements: string[]
  addition: number[][]
  multiplication: number[][]
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

export function buildZnTables(n: number): ZnTables {
  const size = Math.max(2, Math.min(12, Math.round(n)))
  const elements = Array.from({ length: size }, (_, i) => String(i))
  const addition = Array.from({ length: size }, (_, a) =>
    Array.from({ length: size }, (_, b) => (a + b) % size),
  )
  const multiplication = Array.from({ length: size }, (_, a) =>
    Array.from({ length: size }, (_, b) => (a * b) % size),
  )
  return { n: size, elements, addition, multiplication }
}

/** ℤₙ 中的单位（可逆元）⟺ gcd(a, n) = 1 */
export function isUnit(n: number, a: number): boolean {
  return gcd(a, n) === 1
}

/** ℤₙ 中的零因子（n ≥ 2）：非零且 gcd(a, n) > 1 ⟺ 存在 b ≠ 0 使 ab ≡ 0 */
export function isZeroDivisor(n: number, a: number): boolean {
  return a !== 0 && gcd(a, n) !== 1
}

export function unitsOf(n: number): number[] {
  const result: number[] = []
  for (let a = 0; a < n; a++) {
    if (isUnit(n, a) && a !== 0) result.push(a)
  }
  return result
}

export function zeroDivisorsOf(n: number): number[] {
  const result: number[] = []
  for (let a = 1; a < n; a++) {
    if (isZeroDivisor(n, a)) result.push(a)
  }
  return result
}

/** 欧拉函数 φ(n)：[1, n] 中与 n 互素的个数 */
export function eulerPhi(n: number): number {
  let count = 0
  for (let a = 1; a <= n; a++) {
    if (gcd(a, n) === 1) count++
  }
  return count
}

export function isPrime(n: number): boolean {
  if (n < 2) return false
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false
  }
  return true
}

/** 幂等元：a² ≡ a (mod n)（含 0 与 1） */
export function idempotentsOf(n: number): number[] {
  const result: number[] = []
  for (let a = 0; a < n; a++) {
    if ((a * a) % n === a) result.push(a)
  }
  return result
}

/** 下标数字（ℤ₆ 等排版） */
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

export function subscriptNumber(value: number): string {
  return String(value)
    .split('')
    .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
    .join('')
}
