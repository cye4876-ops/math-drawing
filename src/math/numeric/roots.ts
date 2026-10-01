/**
 * 数值求根（v0.4 交互分析）。
 *
 * 策略（规格要求"符号分析 + 数值细化结合"，避免纯网格扫描漏根）：
 * 1. 在可视范围内均匀扫描（默认 2048 点）建立"符号变化括号"；
 * 2. 每个括号用**安全牛顿法**细化：牛顿步落在括号内才接受，否则二分回退（rtsafe 思路）；
 * 3. 偶数重根（如 x² 在 0）没有符号变化：用 |f| 的局部极小值检测 + 黄金分割细化；
 * 4. 全部根去重排序；重根/触根标记返回（含 |x| 类不可导触根）。
 *
 * 已知限制（写入 docs/tools.md）：
 * - 扫描分辨率有限，宽度小于窗口/扫描点数的窄峰根系可能漏检（如极限缩放下 sin(1/x) 的密集根）；
 * - 平移不变函数的恒零区域（f ≡ 0）返回空数组。
 */
import type { Root } from './types'

export interface RootOptions {
  /** 网格扫描点数（默认 2048；clamp 64..32768） */
  scanSamples?: number
  /** 可选符号导数闭包：提供时每个括号用安全牛顿法（更快更准），缺省用纯二分 */
  derivative?: (x: number) => number
  /** 单根最大迭代次数（默认 120） */
  maxIterations?: number
}

export type { Root }

/** 根之间小于该相对间隔视为同一根 */
const MERGE_RELATIVE = 1e-7

/** x 收敛容差（相对） */
const X_TOL = 1e-13

/** 安全牛顿法（括号内回退二分） */
function refineBracketed(
  f: (x: number) => number,
  df: ((x: number) => number) | undefined,
  a: number,
  b: number,
  fa: number,
  maxIterations: number,
): number {
  let lo = a
  let hi = b
  let flo = fa
  let x = (a + b) / 2
  let fx = f(x)

  for (let i = 0; i < maxIterations; i++) {
    if (!Number.isFinite(fx)) {
      x = (lo + hi) / 2
      fx = f(x)
      continue
    }
    if (fx === 0) return x
    // 收缩括号
    if (flo * fx < 0) {
      hi = x
    } else {
      lo = x
      flo = fx
    }
    if (hi - lo <= X_TOL * Math.max(1, Math.abs(x))) return x
    // 尝试牛顿步（必须落在括号内）
    const d = df?.(x)
    let next = Number.NaN
    if (d !== undefined && Number.isFinite(d) && d !== 0) next = x - fx / d
    x = Number.isFinite(next) && next > lo && next < hi ? next : (lo + hi) / 2
    fx = f(x)
  }
  return x
}

/** 黄金分割最小化 |f|（用于触根/重根细化） */
function refineMinimum(f: (x: number) => number, a: number, b: number, iterations = 120): number {
  const phi = (1 + Math.sqrt(5)) / 2
  const invPhi = 1 / phi
  let lo = a
  let hi = b
  let c = hi - (hi - lo) * invPhi
  let d = lo + (hi - lo) * invPhi
  let fc = Math.abs(f(c))
  let fd = Math.abs(f(d))
  for (let i = 0; i < iterations; i++) {
    if (!Number.isFinite(fc)) {
      lo = c
      c = d
      fc = fd
      d = lo + (hi - lo) * invPhi
      fd = Math.abs(f(d))
      continue
    }
    if (!Number.isFinite(fd)) {
      hi = d
      d = c
      fd = fc
      c = hi - (hi - lo) * invPhi
      fc = Math.abs(f(c))
      continue
    }
    if (fc < fd) {
      hi = d
      d = c
      fd = fc
      c = hi - (hi - lo) * invPhi
      fc = Math.abs(f(c))
    } else {
      lo = c
      c = d
      fc = fd
      d = lo + (hi - lo) * invPhi
      fd = Math.abs(f(d))
    }
  }
  return (lo + hi) / 2
}

/**
 * 在 [xMin, xMax] 内找出 f 的全部零点（不遗漏已知范围内的常规根）。
 * 返回按 x 升序去重后的根列表。
 */
export function findRoots(
  f: (x: number) => number,
  xMin: number,
  xMax: number,
  options: RootOptions = {},
): Root[] {
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !(xMax > xMin)) return []
  const samples = Math.min(32768, Math.max(64, Math.round(options.scanSamples ?? 2048)))
  const maxIterations = options.maxIterations ?? 120
  const df = options.derivative

  const xs = new Array<number>(samples + 1)
  const fs = new Array<number>(samples + 1)
  for (let i = 0; i <= samples; i++) {
    const x = xMin + ((xMax - xMin) * i) / samples
    xs[i] = x
    fs[i] = f(x)
  }

  // 触根阈值：以 |f| 的 90 分位数为函数尺度（避免极点的大值把阈值抬高）
  const absSorted = fs
    .filter(Number.isFinite)
    .map(Math.abs)
    .sort((p, q) => p - q)
  const p90 = absSorted.length > 0 ? (absSorted[Math.floor(absSorted.length * 0.9)] ?? 0) : 0
  if (p90 === 0) return [] // 恒零函数：数学上处处是根，按约定返回空
  const touchTol = Math.max(1e-12, p90 * 1e-5)
  // 精化结果的接受阈值：拒绝"跨极点伪根"（如 1/x 的符号变化处 |f| 极大）
  const acceptTol = Math.max(touchTol, p90 * 1e-8, 1e-12)

  const found: Root[] = []
  const maxRoots = 2048

  // 1a) 精确零区段（f 恰为 0 的连续网格点）：只记一个根；两侧同号 → 触根（x²）
  {
    let runStart = -1
    for (let i = 0; i <= samples; i++) {
      const fv = fs[i] as number
      const isZero = Number.isFinite(fv) && fv === 0
      if (isZero && runStart < 0) runStart = i
      if (!isZero && runStart >= 0) {
        // 区段 [runStart, i-1]：用两侧最近的非零符号分类
        let signBefore = 0
        for (let j = runStart - 1; j >= 0; j--) {
          const v = fs[j] as number
          if (Number.isFinite(v) && v !== 0) {
            signBefore = Math.sign(v)
            break
          }
        }
        let signAfter = 0
        for (let j = i; j <= samples; j++) {
          const v = fs[j] as number
          if (Number.isFinite(v) && v !== 0) {
            signAfter = Math.sign(v)
            break
          }
        }
        found.push({
          x: xs[runStart] as number,
          repeated: signBefore !== 0 && signBefore === signAfter,
        })
        runStart = -1
      }
    }
  }

  // 1b) 符号变化括号（两端均非零）
  for (let i = 0; i < samples && found.length < maxRoots; i++) {
    const f0 = fs[i] as number
    const f1 = fs[i + 1] as number
    if (!Number.isFinite(f0) || !Number.isFinite(f1) || f0 === 0 || f1 === 0) continue
    if (f0 * f1 < 0) {
      const x = refineBracketed(f, df, xs[i] as number, xs[i + 1] as number, f0, maxIterations)
      const value = Math.abs(f(x))
      if (Number.isFinite(value) && value <= acceptTol) {
        found.push({ x, repeated: false })
      }
    }
  }

  // 1c) 视窗端点恰为零点（如 sin 在 ±2π 边界处）
  for (const [x, anchor] of [
    [xMin, 0],
    [xMax, samples],
  ] as const) {
    const value = Math.abs(fs[anchor] as number)
    if (Number.isFinite(value) && value <= acceptTol) {
      found.push({ x, repeated: false })
    }
  }

  // 2) |f| 局部极小值（偶数重根 / 不可导触根，如 x²、|x| 在 0 处）
  for (let i = 1; i < samples && found.length < maxRoots; i++) {
    const fPrev = fs[i - 1] as number
    const fCurr = fs[i] as number
    const fNext = fs[i + 1] as number
    // 零区段内部由 1a 处理，跳过
    if (fCurr === 0 && (fPrev === 0 || fNext === 0)) continue
    const a0 = Math.abs(fPrev)
    const a1 = Math.abs(fCurr)
    const a2 = Math.abs(fNext)
    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(a2)) continue
    if (a1 < touchTol && a1 <= a0 && a1 <= a2 && a1 < a0 + a2) {
      const xStar = refineMinimum(f, xs[i - 1] as number, xs[i + 1] as number)
      const value = Math.abs(f(xStar))
      if (Number.isFinite(value) && value <= touchTol) {
        found.push({ x: xStar, repeated: true })
      }
    }
  }

  // 3) 去重 + 排序：接近的根合并；仅当全部来源均为触根才标记 repeated
  found.sort((p, q) => p.x - q.x)
  const mergeTol = Math.max(1e-12, (xMax - xMin) * MERGE_RELATIVE)
  const merged: Root[] = []
  for (const root of found) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(root.x - last.x) <= mergeTol) {
      last.repeated = last.repeated && root.repeated
      // 保留 |f| 更小的代表（更接近真根）
      if (Math.abs(f(root.x)) < Math.abs(f(last.x))) last.x = root.x
      continue
    }
    merged.push({ ...root })
  }
  return merged
}

/** 曲线的交点（显函数 × 显函数；x 升序） */
export interface Intersection {
  x: number
  y: number
}

/**
 * 两条显函数曲线在 [xMin, xMax] 内的全部交点（求差函数的零点）。
 * 提供两条曲线的符号导数时走安全牛顿法，否则纯二分。
 */
export function findIntersections(
  f1: (x: number) => number,
  f2: (x: number) => number,
  xMin: number,
  xMax: number,
  options: RootOptions & { derivative2?: (x: number) => number } = {},
): Intersection[] {
  const g = (x: number): number => f1(x) - f2(x)
  const d1 = options.derivative
  const d2 = options.derivative2
  const derivative =
    d1 !== undefined && d2 !== undefined ? (x: number): number => d1(x) - d2(x) : undefined
  const roots = findRoots(g, xMin, xMax, { ...options, derivative })
  return roots.map((root) => ({ x: root.x, y: f1(root.x) }))
}
