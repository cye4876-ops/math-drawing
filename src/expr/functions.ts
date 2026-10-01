/**
 * 内置函数表（数值实现 + 参数个数 + 可求导标记）。
 *
 * 边界行为约定见 docs/expr-syntax.md；几个要点：
 * - log(x) 为自然对数（与 ln 等价），log(x, b) 为任意底；
 * - mod(a, b) 与 `%` 运算符均为"数学取模"（结果符号跟随除数，如 -7 % 3 = 2）；
 * - factorial 对非整数使用 Gamma 函数延拓；负数整数返回 NaN（极点）；
 * - 所有函数在定义域外返回 NaN（实数域约定）。
 */

export interface FunctionDefinition {
  name: string
  minArgs: number
  maxArgs: number
  signature: string
  differentiable: boolean
  fn: (...args: number[]) => number
}

// ---------- 特殊函数实现 ----------

const GAMMA_G = 7
const GAMMA_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/** Gamma 函数（Lanczos 近似，g=7；负数走反射公式；非正整数返回 NaN） */
export function gamma(x: number): number {
  if (Number.isNaN(x)) return NaN
  if (x <= 0 && Number.isInteger(x)) return NaN
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x))

  const z = x - 1
  let a = GAMMA_COEFFICIENTS[0] ?? 0
  for (let i = 1; i < GAMMA_COEFFICIENTS.length; i++) {
    a += (GAMMA_COEFFICIENTS[i] ?? 0) / (z + i)
  }
  const t = z + GAMMA_G + 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a
}

/** 阶乘：整数精确（n > 170 溢出为 Infinity）；负数整数 NaN；非整数用 Gamma 延拓 */
export function factorial(x: number): number {
  if (Number.isNaN(x)) return NaN
  if (x < 0 && Number.isInteger(x)) return NaN
  if (Number.isInteger(x)) {
    if (x > 170) return Infinity
    let result = 1
    for (let i = 2; i <= x; i++) result *= i
    return result
  }
  return gamma(x + 1)
}

/** 误差函数（Abramowitz & Stegun 7.1.26，绝对误差 < 1.5e-7） */
export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN
  if (x === 0) return 0
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  return sign * (1 - poly * Math.exp(-ax * ax))
}

/** 数学取模：结果符号跟随除数（-7 % 3 = 2；7 % -3 = -2）；除数为 0 时 NaN */
export function modulo(a: number, b: number): number {
  if (b === 0) return NaN
  const r = a % b
  if (r !== 0 && r < 0 !== b < 0) return r + b
  return r
}

/** 最大公约数（仅整数；非整数返回 NaN） */
export function gcd(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return NaN
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** 最小公倍数（仅整数；lcm(0, x) = 0） */
export function lcm(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return NaN
  if (a === 0 || b === 0) return 0
  return Math.abs((a / gcd(a, b)) * b)
}

/** 二项式系数 C(n, k)；非整数参数 NaN；越界（k<0 或 k>n）为 0 */
export function binomial(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k)) return NaN
  if (n < 0) return NaN
  if (k < 0 || k > n) return 0
  const kk = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= kk; i++) {
    result = (result * (n - kk + i)) / i
    if (!Number.isFinite(result)) return Infinity
  }
  return Math.round(result)
}

function signOf(x: number): number {
  if (Number.isNaN(x)) return NaN
  return x === 0 ? 0 : Math.sign(x)
}

// ---------- 函数表 ----------

function unary(
  name: string,
  signature: string,
  fn: (x: number) => number,
  differentiable = true,
): [string, FunctionDefinition] {
  return [name, { name, minArgs: 1, maxArgs: 1, signature, differentiable, fn: (x = NaN) => fn(x) }]
}

function binary(
  name: string,
  signature: string,
  fn: (a: number, b: number) => number,
  differentiable = true,
): [string, FunctionDefinition] {
  return [
    name,
    { name, minArgs: 2, maxArgs: 2, signature, differentiable, fn: (a = NaN, b = NaN) => fn(a, b) },
  ]
}

export const FUNCTIONS: Record<string, FunctionDefinition> = Object.fromEntries([
  // 三角
  unary('sin', 'sin(x)', Math.sin),
  unary('cos', 'cos(x)', Math.cos),
  unary('tan', 'tan(x)', Math.tan),
  unary('asin', 'asin(x)', Math.asin),
  unary('acos', 'acos(x)', Math.acos),
  unary('atan', 'atan(x)', Math.atan),
  binary('atan2', 'atan2(y, x)', (y, x) => Math.atan2(y, x), false),
  // 双曲
  unary('sinh', 'sinh(x)', Math.sinh),
  unary('cosh', 'cosh(x)', Math.cosh),
  unary('tanh', 'tanh(x)', Math.tanh),
  unary('asinh', 'asinh(x)', Math.asinh),
  unary('acosh', 'acosh(x)', Math.acosh),
  unary('atanh', 'atanh(x)', Math.atanh),
  // 指数与对数
  unary('exp', 'exp(x)', Math.exp),
  unary('ln', 'ln(x)', Math.log),
  [
    'log',
    {
      name: 'log',
      minArgs: 1,
      maxArgs: 2,
      signature: 'log(x) 或 log(x, base)',
      differentiable: true,
      fn: (x = NaN, base?: number) =>
        base === undefined ? Math.log(x) : Math.log(x) / Math.log(base),
    },
  ],
  unary('log2', 'log2(x)', Math.log2),
  unary('log10', 'log10(x)', Math.log10),
  unary('sqrt', 'sqrt(x)', Math.sqrt),
  unary('cbrt', 'cbrt(x)', Math.cbrt),
  binary('pow', 'pow(x, y)', (x, y) => Math.pow(x, y)),
  // 取整与符号
  unary('abs', 'abs(x)', Math.abs),
  unary('floor', 'floor(x)', Math.floor, false),
  unary('ceil', 'ceil(x)', Math.ceil, false),
  unary('round', 'round(x)', Math.round, false),
  unary('sign', 'sign(x)', signOf, false),
  [
    'min',
    {
      name: 'min',
      minArgs: 1,
      maxArgs: Infinity,
      signature: 'min(a, b, ...)',
      differentiable: false,
      fn: (...args: number[]) => Math.min(...args),
    },
  ],
  [
    'max',
    {
      name: 'max',
      minArgs: 1,
      maxArgs: Infinity,
      signature: 'max(a, b, ...)',
      differentiable: false,
      fn: (...args: number[]) => Math.max(...args),
    },
  ],
  [
    'clamp',
    {
      name: 'clamp',
      minArgs: 3,
      maxArgs: 3,
      signature: 'clamp(x, lo, hi)',
      differentiable: false,
      fn: (x = NaN, lo = NaN, hi = NaN) => Math.min(Math.max(x, lo), hi),
    },
  ],
  // 组合
  unary('factorial', 'factorial(n)', factorial, false),
  binary('gcd', 'gcd(a, b)', gcd, false),
  binary('lcm', 'lcm(a, b)', lcm, false),
  binary('binomial', 'binomial(n, k)', binomial, false),
  binary('mod', 'mod(a, b)', modulo, false),
  // 特殊函数
  unary('erf', 'erf(x)', erf),
  unary('gamma', 'gamma(x)', gamma, false),
])

export const FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTIONS)

/** 人类可读的参数个数描述，用于错误信息 */
export function describeArity(def: FunctionDefinition): string {
  if (def.minArgs === def.maxArgs) return `${def.minArgs} 个参数`
  if (def.maxArgs === Infinity) return `至少 ${def.minArgs} 个参数`
  return `${def.minArgs}~${def.maxArgs} 个参数`
}
