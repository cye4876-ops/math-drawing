/**
 * 复数运算与复初等函数（v0.9）。
 * 表示：{ re, im } 普通对象（便于序列化与调试；热点路径请直接使用分量运算）。
 * - 初等函数：exp / log / 三角 / 双曲 / 幂 / 平方根；
 * - Γ(z)：Lanczos（g=7，与 v0.7 统计模块同系数）+ 反射公式（Re z < 0.5）；
 * - ζ(s)：Dirichlet η 级数 + 欧拉变换加速（Re s > 0 带区）＋函数方程（全域），
 *   参考实现定位（差分/教学），精度约 1e-8（见 docs/complex.md 已知限制）。
 */
export interface Complex {
  re: number
  im: number
}

export const cplx = (re: number, im = 0): Complex => ({ re, im })
export const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im })
export const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im })
export const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
})
export const cScale = (a: Complex, k: number): Complex => ({ re: a.re * k, im: a.im * k })
export const cConj = (a: Complex): Complex => ({ re: a.re, im: -a.im })

export function cDiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im
  if (d === 0) return { re: Number.NaN, im: Number.NaN }
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}

export const cAbs = (a: Complex): number => Math.hypot(a.re, a.im)
export const cArg = (a: Complex): number => Math.atan2(a.im, a.re)
export const isFiniteComplex = (a: Complex): boolean =>
  Number.isFinite(a.re) && Number.isFinite(a.im)

/** e^z */
export function cExp(z: Complex): Complex {
  const r = Math.exp(z.re)
  return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}

/** 主值对数 ln|z| + i·arg z（分支割线：负实轴） */
export function cLog(z: Complex): Complex {
  return { re: 0.5 * Math.log(z.re * z.re + z.im * z.im), im: Math.atan2(z.im, z.re) }
}

/** z^w = e^{w ln z}（主值） */
export function cPow(z: Complex, w: Complex): Complex {
  if (z.re === 0 && z.im === 0)
    return w.im === 0 && w.re > 0 ? { re: 0, im: 0 } : { re: Number.NaN, im: Number.NaN }
  return cExp(cMul(w, cLog(z)))
}

/** 整数幂的快速路径（域着色热点） */
export function cIntPow(z: Complex, n: number): Complex {
  let result: Complex = { re: 1, im: 0 }
  let base = z
  let power = Math.abs(n)
  while (power > 0) {
    if (power & 1) result = cMul(result, base)
    base = cMul(base, base)
    power >>= 1
  }
  return n < 0 ? cDiv({ re: 1, im: 0 }, result) : result
}

/** 主值平方根（分支割线：负实轴） */
export function cSqrt(z: Complex): Complex {
  const r = Math.hypot(z.re, z.im)
  const re = Math.sqrt(Math.max(0, (r + z.re) / 2))
  const im = Math.sign(z.im || 1) * Math.sqrt(Math.max(0, (r - z.re) / 2))
  return { re, im }
}

export function cSin(z: Complex): Complex {
  return { re: Math.sin(z.re) * Math.cosh(z.im), im: Math.cos(z.re) * Math.sinh(z.im) }
}

export function cCos(z: Complex): Complex {
  return { re: Math.cos(z.re) * Math.cosh(z.im), im: -Math.sin(z.re) * Math.sinh(z.im) }
}

export function cTan(z: Complex): Complex {
  return cDiv(cSin(z), cCos(z))
}

export function cSinh(z: Complex): Complex {
  return { re: Math.sinh(z.re) * Math.cos(z.im), im: Math.cosh(z.re) * Math.sin(z.im) }
}

export function cCosh(z: Complex): Complex {
  return { re: Math.cosh(z.re) * Math.cos(z.im), im: Math.sinh(z.re) * Math.sin(z.im) }
}

export function cTanh(z: Complex): Complex {
  return cDiv(cSinh(z), cCosh(z))
}

// ---------- Γ(z) ----------

const LANCZOS_G = 7
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
]

/** Γ(z)（Lanczos + 反射公式；z 为负整数与 0 处返回 NaN） */
export function cGamma(z: Complex): Complex {
  if (z.im === 0 && z.re <= 0 && Number.isInteger(z.re)) return { re: Number.NaN, im: Number.NaN }
  if (z.re < 0.5) {
    // 反射公式：Γ(z)Γ(1−z) = π / sin(πz)
    const oneMinus = cSub({ re: 1, im: 0 }, z)
    const sinPiZ = cSin(cScale(z, Math.PI))
    const numerator: Complex = { re: Math.PI, im: 0 }
    return cDiv(numerator, cMul(sinPiZ, cGamma(oneMinus)))
  }
  const zm1 = cSub(z, { re: 1, im: 0 })
  let x: Complex = { re: LANCZOS_COEFFICIENTS[0]!, im: 0 }
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    x = cAdd(x, cDiv({ re: LANCZOS_COEFFICIENTS[i]!, im: 0 }, cAdd(zm1, { re: i, im: 0 })))
  }
  const t = cAdd(zm1, { re: LANCZOS_G + 0.5, im: 0 })
  // Γ(z) = √(2π) · t^{z−0.5} · e^{−t} · x
  const power = cPow(t, cAdd(zm1, { re: 0.5, im: 0 }))
  const expNegT = cExp(cScale(t, -1))
  const factor = Math.sqrt(2 * Math.PI)
  return cScale(cMul(cMul(power, expNegT), x), factor)
}

// ---------- ζ(s) ----------

/** η(s) = Σ (−1)^{n−1} n^{−s} 的欧拉变换（Re s > 0 时收敛） */
function dirichletEta(s: Complex): Complex {
  const terms = 40
  // 欧拉变换：η(s) = Σ_{k≥0} 2^{−(k+1)} Δ^k a₀，其中 aₙ = (n+1)^{−s}
  // Δ^k a₀ = Σ_{j=0}^{k} (−1)^j C(k,j) (j+1)^{−s}
  let sum: Complex = { re: 0, im: 0 }
  let binomial = [1]
  for (let k = 0; k < terms; k++) {
    // 第 k 阶差分
    let diff: Complex = { re: 0, im: 0 }
    for (let j = 0; j <= k; j++) {
      const term = cPow({ re: j + 1, im: 0 }, cScale(s, -1))
      const sign = j % 2 === 0 ? 1 : -1
      diff = cAdd(diff, cScale(term, sign * (binomial[j] ?? 0)))
    }
    sum = cAdd(sum, cScale(diff, Math.pow(2, -(k + 1))))
    // Pascal 三角下一行
    const next: number[] = [1]
    for (let j = 1; j < binomial.length; j++) next.push((binomial[j - 1] ?? 0) + (binomial[j] ?? 0))
    next.push(1)
    binomial = next
  }
  return sum
}

/**
 * ζ(s)：Re(s) > 0 用 η 欧拉变换；其余经函数方程映射。
 * ζ(s) = 2^s π^{s−1} sin(πs/2) Γ(1−s) ζ(1−s)（s 映射到 1−s > 0）。
 */
export function cZeta(s: Complex): Complex {
  // s = 1 极点
  if (Math.abs(s.re - 1) < 1e-12 && Math.abs(s.im) < 1e-12) {
    return { re: Number.NaN, im: Number.NaN }
  }
  // s = 0：函数方程在该点 0×∞ 对消，直接给出解析值
  if (Math.abs(s.re) < 1e-12 && Math.abs(s.im) < 1e-12) {
    return { re: -0.5, im: 0 }
  }
  if (s.re > 0) {
    const eta = dirichletEta(s)
    // ζ(s) = η(s) / (1 − 2^{1−s})
    const oneMinusS: Complex = { re: 1 - s.re, im: -s.im }
    const two = cPow({ re: 2, im: 0 }, oneMinusS)
    return cDiv(eta, cSub({ re: 1, im: 0 }, two))
  }
  // 函数方程
  const oneMinusS: Complex = { re: 1 - s.re, im: -s.im }
  const twoPowS = cPow({ re: 2, im: 0 }, s)
  const piPow = cPow({ re: Math.PI, im: 0 }, { re: s.re - 1, im: s.im })
  const sinHalf = cSin(cScale(s, Math.PI / 2))
  const gamma = cGamma(oneMinusS)
  const zetaReflected = cZeta(oneMinusS)
  return cMul(cMul(cMul(twoPowS, piPow), cMul(sinHalf, gamma)), zetaReflected)
}
