/**
 * 精确有理数（v2.7/v2.8）：BigInt 分数运算的共享工具。
 * 供图论实验台（claim 表达式）与符号计算（精确定积分、根式显示）共用。
 * 数值语义：结果始终约分、分母恒正。
 */

export interface Rat {
  n: bigint
  d: bigint
}

export class RatError extends Error {}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** 归一化构造：约分、分母恒正 */
export function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) throw new RatError('除数为零')
  let num = n
  let den = d
  if (den < 0n) {
    num = -num
    den = -den
  }
  const g = gcd(num, den)
  if (g > 1n) {
    num /= g
    den /= g
  }
  return { n: num, d: den }
}

export function ratFromInt(value: bigint | number): Rat {
  return rat(typeof value === 'bigint' ? value : BigInt(value))
}

export function ratFromNumber(value: number): Rat {
  if (!Number.isFinite(value)) throw new RatError('数值必须有限')
  if (Number.isInteger(value)) return rat(BigInt(value))
  // 小数按十进制展开精确转换（Number 的 String() 是最短往返表示）
  return ratFromDecimalString(String(value))
}

export function ratFromDecimalString(source: string): Rat {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(source.trim())
  if (!match) throw new RatError(`无法解析数值常量：${source}`)
  const sign = match[1] === '-' ? -1n : 1n
  const intPart = match[2]!
  const fracPart = match[3] ?? ''
  const exponent = Number(match[4] ?? '0')
  if (Math.abs(exponent) > 300) throw new RatError('小数常量的指数绝对值过大')
  let num = BigInt(intPart + fracPart)
  let den = 10n ** BigInt(fracPart.length)
  if (exponent > 0) num *= 10n ** BigInt(exponent)
  else if (exponent < 0) den *= 10n ** BigInt(-exponent)
  return rat(sign * num, den)
}

export function ratAdd(a: Rat, b: Rat): Rat {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d)
}

export function ratSub(a: Rat, b: Rat): Rat {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d)
}

export function ratMul(a: Rat, b: Rat): Rat {
  return rat(a.n * b.n, a.d * b.d)
}

export function ratDiv(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new RatError('除数为零')
  return rat(a.n * b.d, a.d * b.n)
}

export function ratNeg(a: Rat): Rat {
  return { n: -a.n, d: a.d }
}

export function ratAbs(a: Rat): Rat {
  return a.n < 0n ? { n: -a.n, d: a.d } : a
}

/** 非负整数幂 */
export function ratPow(a: Rat, exponent: number): Rat {
  if (!Number.isInteger(exponent) || exponent < 0) throw new RatError('幂指数须为非负整数')
  return rat(a.n ** BigInt(exponent), a.d ** BigInt(exponent))
}

export function ratCmp(a: Rat, b: Rat): number {
  const left = a.n * b.d
  const right = b.n * a.d
  return left < right ? -1 : left > right ? 1 : 0
}

export function ratEquals(a: Rat, b: Rat): boolean {
  return a.n === b.n && a.d === b.d
}

export function ratIsZero(a: Rat): boolean {
  return a.n === 0n
}

export function ratIsInteger(a: Rat): boolean {
  return a.d === 1n
}

export function ratToNumber(a: Rat): number {
  return Number(a.n) / Number(a.d)
}

/** 完全平方数时返回精确平方根，否则返回 null */
export function ratSqrtExact(a: Rat): Rat | null {
  if (a.n < 0n) throw new RatError('sqrt 的负数参数')
  const rootN = bigintSqrt(a.n)
  if (rootN * rootN !== a.n) return null
  const rootD = bigintSqrt(a.d)
  if (rootD * rootD !== a.d) return null
  return rat(rootN, rootD)
}

export function bigintSqrt(value: bigint): bigint {
  if (value < 2n) return value
  let x = value
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + value / x) / 2n
  }
  return x
}

/** 素因子分解（试除；供根式与 ln 归一化使用，输入须为正整数） */
export function primeFactorize(value: bigint): Map<bigint, number> {
  const factors = new Map<bigint, number>()
  let n = value
  for (let p = 2n; p * p <= n; p += p === 2n ? 1n : 2n) {
    while (n % p === 0n) {
      factors.set(p, (factors.get(p) ?? 0) + 1)
      n /= p
    }
  }
  if (n > 1n) factors.set(n, (factors.get(n) ?? 0) + 1)
  return factors
}
