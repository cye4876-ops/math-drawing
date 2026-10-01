/**
 * 不等式求解（v0.9）：多项式不等式 → 解集区间（含开闭端点）；
 * 供符号面板文本与数轴可视化使用。
 * 方法：f = lhs − rhs 转多项式 → 实根分割区间 → 各区间取测试点判号 → 合并。
 * 非严格不等式时根本身属于解集（含孤立点，如 (x−1)² ≤ 0 → {1}）。
 */
import { parse, type Expr } from '../expr'
import { astToPoly, polyRoots } from './poly'
import { simplify } from './simplify'

export interface Interval {
  /** null 表示 −∞ */
  lo: number | null
  /** null 表示 +∞ */
  hi: number | null
  loClosed: boolean
  hiClosed: boolean
}

export interface InequalityResult {
  ok: boolean
  intervals: Interval[]
  message?: string
}

const EPS = 1e-9

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort(
    (a, b) => (a.lo ?? Number.NEGATIVE_INFINITY) - (b.lo ?? Number.NEGATIVE_INFINITY),
  )
  const merged: Interval[] = []
  for (const item of sorted) {
    const last = merged[merged.length - 1]
    if (
      last &&
      last.hi !== null &&
      item.lo !== null &&
      Math.abs(last.hi - item.lo) < EPS &&
      (last.hiClosed || item.loClosed)
    ) {
      last.hi = item.hi
      last.hiClosed = item.hi === null ? false : item.hiClosed
      // 孤立点（[r,r]）与相邻开区间相接时也可能扩展 loClosed——从简处理：不处理该边界情形
      continue
    }
    merged.push({ ...item })
  }
  return merged
}

function containsPoint(intervals: Interval[], point: number): boolean {
  return intervals.some((interval) => {
    const aboveLo =
      interval.lo === null ||
      point > interval.lo + EPS ||
      (interval.loClosed && Math.abs(point - interval.lo) < EPS)
    const belowHi =
      interval.hi === null ||
      point < interval.hi - EPS ||
      (interval.hiClosed && Math.abs(point - interval.hi) < EPS)
    return aboveLo && belowHi
  })
}

/** 求解多项式不等式（输入 '<'、'<='、'>'、'>=' 的表达式字符串或 AST） */
export function solveInequality(input: Expr | string, varName = 'x'): InequalityResult {
  let parsed: Expr
  try {
    parsed = typeof input === 'string' ? parse(input) : input
  } catch (error) {
    return { ok: false, intervals: [], message: `解析失败：${(error as Error).message}` }
  }
  if (parsed.type !== 'binary' || !['<', '<=', '>', '>='].includes(parsed.op)) {
    return { ok: false, intervals: [], message: '请输入不等式（运算符 <、<=、>、>=）' }
  }
  const op = parsed.op as '<' | '<=' | '>' | '>='
  const difference = simplify({ type: 'binary', op: '-', left: parsed.left, right: parsed.right })
  const poly = astToPoly(difference, varName)
  if (!poly) return { ok: false, intervals: [], message: '当前仅支持关于 x 的多项式不等式' }
  const strict = op === '<' || op === '>'
  // 零多项式：0 ≤ 0 / 0 ≥ 0 恒真；0 < 0 / 0 > 0 无解
  if (poly.every((coefficient) => Math.abs(coefficient) < EPS)) {
    return strict
      ? { ok: true, intervals: [], message: '无实数解' }
      : { ok: true, intervals: [{ lo: null, hi: null, loClosed: false, hiClosed: false }] }
  }
  const roots = polyRoots(poly)
  if (!roots) return { ok: false, intervals: [], message: '无法求出多项式实根' }
  const realRoots = [
    ...new Set(
      roots
        .filter((root) => Math.abs(root.im) < EPS)
        .map((root) => Math.round(root.re / EPS) * EPS),
    ),
  ].sort((a, b) => a - b)
  const wantPositive = op === '>' || op === '>='
  const evaluate = (x: number): number => {
    let acc = 0
    for (let k = poly.length - 1; k >= 0; k--) acc = acc * x + poly[k]!
    return acc
  }
  const boundaries: (number | null)[] = [null, ...realRoots, null]
  const intervals: Interval[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const lo = boundaries[i]!
    const hi = boundaries[i + 1]!
    let test: number
    if (lo === null && hi === null) test = 0
    else if (lo === null) test = hi - 1
    else if (hi === null) test = lo + 1
    else test = (lo + hi) / 2
    const value = evaluate(test)
    if (value === 0) continue
    if (value > 0 === wantPositive) {
      intervals.push({
        lo,
        hi,
        loClosed: lo !== null && !strict,
        hiClosed: hi !== null && !strict,
      })
    }
  }
  // 非严格不等式：根满足 f = 0，若不在任何输出区间内则补孤立点
  if (!strict) {
    for (const root of realRoots) {
      if (!containsPoint(intervals, root)) {
        intervals.push({ lo: root, hi: root, loClosed: true, hiClosed: true })
      }
    }
  }
  if (intervals.length === 0) {
    return { ok: true, intervals: [], message: '无实数解' }
  }
  return { ok: true, intervals: mergeIntervals(intervals) }
}

/** 区间 → 文本（数轴/面板显示） */
export function formatInterval(interval: Interval): string {
  const format = (value: number): string => {
    const rounded = Math.round(value * 1e6) / 1e6
    return String(rounded)
  }
  if (interval.lo !== null && interval.hi !== null && Math.abs(interval.lo - interval.hi) < EPS) {
    return `{${format(interval.lo)}}`
  }
  const left =
    interval.lo === null ? '(-∞' : `${interval.loClosed ? '[' : '('}${format(interval.lo)}`
  const right =
    interval.hi === null ? '+∞)' : `${format(interval.hi)}${interval.hiClosed ? ']' : ')'}`
  return `${left}, ${right}`
}

/** 解集 → 文本（多区间并集） */
export function formatSolutionSet(intervals: Interval[]): string {
  if (intervals.length === 0) return '无实数解'
  return intervals.map(formatInterval).join(' ∪ ')
}
