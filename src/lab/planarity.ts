/**
 * 平面性检验（v3.1）：de Fraysseix–Rosenstiehl / Brandes 的左右（LR）平面性检验。
 *
 * 算法结构参照 Ulrik Brandes, "The Left-Right Planarity Test"（2009）及
 * networkx（BSD-3-Clause）的 `LRPlanarity` 实现（测试阶段与冲突对结构对应；
 * 不含嵌入生成）。本实现面向实验台小图（|V| ≤ 16），递归深度 ≤ |V|。
 *
 * 判定链：
 *   1) 快速排斥：|V| > 2 且 |E| > 3|V| − 6 ⇒ 非平面；
 *   2) DFS 定向：height / lowpt / lowpt2 / nesting 深度；
 *   3) 测试阶段：约束对（ConflictPair）冲突检查；任一冲突不可满足 ⇒ 非平面。
 *
 * 已用 Sage（WSL）随机图交叉核验（见 planarity-fixture 与单测）。
 */
import { bitsOf, edgeCount, type LabGraph } from './graph'

interface Interval {
  low: number | null
  high: number | null
}

interface ConflictPair {
  left: Interval
  right: Interval
}

const emptyInterval = (): Interval => ({ low: null, high: null })
const intervalEmpty = (interval: Interval): boolean =>
  interval.low === null && interval.high === null

/** 平面性检验：true 表示可画在平面上无交叉 */
export function isPlanar(g: LabGraph): boolean {
  return lrRun(g).planar
}

interface LrTables {
  planar: boolean
  height: number[]
  parentEdge: number[]
  lowpt: number[]
  lowpt2: number[]
  nesting: number[]
  ordered: number[][]
}

/** 内部表导出（单测与 Sage/networkx 交叉核验用，不属于公开 API） */
export function lrInternals(g: LabGraph): LrTables {
  return lrRun(g)
}

function lrRun(g: LabGraph): LrTables {
  const n = g.n
  if (n <= 4) {
    return emptyTables(n, true)
  }
  const m = edgeCount(g)
  if (m > 3 * n - 6) {
    return emptyTables(n, false)
  }

  const idx = (v: number, w: number): number => v * n + w
  const neighbors = Array.from({ length: n }, (_, v) => [...bitsOf(g.adj[v]!)])

  // —— 阶段一：DFS 定向 ——
  const height = new Array<number>(n).fill(-1)
  const parentEdge = new Array<number>(n).fill(-1)
  const oriented = Array.from({ length: n }, () => [] as number[])
  const lowpt = new Array<number>(n * n).fill(0)
  const lowpt2 = new Array<number>(n * n).fill(0)
  const nesting = new Array<number>(n * n).fill(0)
  const done = new Array<boolean>(n * n).fill(false)
  const roots: number[] = []

  /** 边的 lowpt 已就绪：写嵌套深度，并把 lowpt 回传给 V 的父边 */
  function finalizeEdge(ei: number): void {
    const v = Math.floor(ei / n)
    nesting[ei] = 2 * lowpt[ei]! + (lowpt2[ei]! < height[v]! ? 1 : 0)
    const e = parentEdge[v]!
    if (e < 0) return
    if (lowpt[ei]! < lowpt[e]!) {
      lowpt2[e] = Math.min(lowpt[e]!, lowpt2[ei]!)
      lowpt[e] = lowpt[ei]!
    } else if (lowpt[ei]! > lowpt[e]!) {
      lowpt2[e] = Math.min(lowpt2[e]!, lowpt[ei]!)
    } else {
      lowpt2[e] = Math.min(lowpt2[e]!, lowpt2[ei]!)
    }
  }

  function dfsOrientation(root: number): void {
    height[root] = 0
    type Frame = { v: number; index: number; pending: number }
    const stack: Frame[] = [{ v: root, index: 0, pending: -1 }]
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      if (frame.pending >= 0) {
        finalizeEdge(frame.pending)
        frame.pending = -1
      }
      const v = frame.v
      const list = neighbors[v]!
      if (frame.index >= list.length) {
        stack.pop()
        continue
      }
      const w = list[frame.index]!
      frame.index++
      const vw = idx(v, w)
      if (done[vw] || done[idx(w, v)]) continue

      done[vw] = true
      oriented[v]!.push(w)
      lowpt[vw] = height[v]!
      lowpt2[vw] = height[v]!
      if (height[w]! < 0) {
        parentEdge[w] = vw
        height[w] = height[v]! + 1
        frame.pending = vw
        stack.push({ v: w, index: 0, pending: -1 })
      } else {
        lowpt[vw] = height[w]!
        finalizeEdge(vw)
      }
    }
  }

  for (let v = 0; v < n; v++) {
    if (height[v]! < 0) {
      roots.push(v)
      dfsOrientation(v)
    }
  }

  // —— 阶段二：测试 ——
  const orderedAdj = Array.from({ length: n }, (_, v) =>
    [...oriented[v]!].sort((a, b) => nesting[idx(v, a)]! - nesting[idx(v, b)]!),
  )
  const ref = new Array<number | null>(n * n).fill(null)
  const S: ConflictPair[] = []
  const bottomOf = new Map<number, ConflictPair | null>()
  const lowptEdge = new Array<number>(n * n).fill(-1)

  const top = (): ConflictPair | null => (S.length > 0 ? S[S.length - 1]! : null)

  function lowest(pair: ConflictPair): number {
    if (intervalEmpty(pair.left)) return lowpt[pair.right.low!]!
    if (intervalEmpty(pair.right)) return lowpt[pair.left.low!]!
    return Math.min(lowpt[pair.left.low!]!, lowpt[pair.right.low!]!)
  }

  const conflicting = (interval: Interval, ei: number): boolean =>
    !intervalEmpty(interval) && lowpt[interval.high!]! > lowpt[ei]!

  /** 合并约束（对应 networkx add_constraints）；false = 非平面 */
  function addConstraints(ei: number, e: number): boolean {
    const P: ConflictPair = { left: emptyInterval(), right: emptyInterval() }
    const bottom = bottomOf.get(ei) ?? null
    for (;;) {
      const Q = S.pop()
      if (!Q) throw new Error('LR 平面性：约束栈状态异常')
      if (!intervalEmpty(Q.left)) {
        const temp = Q.left
        Q.left = Q.right
        Q.right = temp
      }
      if (!intervalEmpty(Q.left)) return false
      if (lowpt[Q.right.low!]! > lowpt[e]!) {
        if (intervalEmpty(P.right)) {
          P.right = { low: Q.right.low, high: Q.right.high }
        } else {
          ref[P.right.low!] = Q.right.high
        }
        P.right.low = Q.right.low
      } else {
        ref[Q.right.low!] = lowptEdge[e]! >= 0 ? lowptEdge[e]! : null
      }
      if (top() === bottom) break
    }
    for (;;) {
      const current = top()
      if (!current || (!conflicting(current.left, ei) && !conflicting(current.right, ei))) {
        break
      }
      const Q = S.pop()!
      if (conflicting(Q.right, ei)) {
        const temp = Q.left
        Q.left = Q.right
        Q.right = temp
      }
      if (conflicting(Q.right, ei)) return false
      if (P.right.low !== null) ref[P.right.low] = Q.right.high
      if (Q.right.low !== null) P.right.low = Q.right.low
      if (intervalEmpty(P.left)) {
        P.left = { low: Q.left.low, high: Q.left.high }
      } else if (P.left.low !== null) {
        ref[P.left.low] = Q.left.high
      }
      P.left.low = Q.left.low
    }
    if (!(intervalEmpty(P.left) && intervalEmpty(P.right))) S.push(P)
    return true
  }

  function removeBackEdges(e: number): void {
    const u = Math.floor(e / n) // networkx: u = e[0]（父边起点；回边终点为 u 的需裁剪）
    while (S.length > 0 && lowest(top()!) === height[u]!) {
      S.pop()
    }
    if (S.length > 0) {
      const P = S.pop()!
      while (P.left.high !== null && P.left.high % n === u) {
        P.left.high = ref[P.left.high] ?? null
      }
      if (P.left.high === null && P.left.low !== null) {
        ref[P.left.low] = P.right.low
        P.left.low = null
      }
      while (P.right.high !== null && P.right.high % n === u) {
        P.right.high = ref[P.right.high] ?? null
      }
      if (P.right.high === null && P.right.low !== null) {
        ref[P.right.low] = P.left.low
        P.right.low = null
      }
      S.push(P)
    }
    if (lowpt[e]! < height[u]!) {
      const current = top()
      if (current) {
        const hl = current.left.high
        const hr = current.right.high
        if (hl !== null && (hr === null || lowpt[hl]! > lowpt[hr]!)) {
          ref[e] = hl
        } else {
          ref[e] = hr
        }
      }
    }
  }

  function dfsTesting(v: number): boolean {
    const e = parentEdge[v]!
    const list = orderedAdj[v]!
    for (let i = 0; i < list.length; i++) {
      const w = list[i]!
      const ei = idx(v, w)
      bottomOf.set(ei, top())
      if (ei === parentEdge[w]) {
        if (!dfsTesting(w)) return false
      } else {
        lowptEdge[ei] = ei
        S.push({ left: emptyInterval(), right: { low: ei, high: ei } })
      }
      if (lowpt[ei]! < height[v]!) {
        if (i === 0) {
          if (e >= 0) lowptEdge[e] = lowptEdge[ei]!
        } else if (!addConstraints(ei, e)) {
          return false
        }
      }
    }
    if (e >= 0) removeBackEdges(e)
    return true
  }

  for (const root of roots) {
    if (!dfsTesting(root)) {
      return {
        planar: false,
        height,
        parentEdge,
        lowpt,
        lowpt2,
        nesting,
        ordered: orderedAdj,
      }
    }
  }
  return { planar: true, height, parentEdge, lowpt, lowpt2, nesting, ordered: orderedAdj }
}

function emptyTables(n: number, planar: boolean): LrTables {
  return {
    planar,
    height: new Array<number>(n).fill(0),
    parentEdge: new Array<number>(n).fill(-1),
    lowpt: new Array<number>(n * n).fill(0),
    lowpt2: new Array<number>(n * n).fill(0),
    nesting: new Array<number>(n * n).fill(0),
    ordered: Array.from({ length: n }, () => [] as number[]),
  }
}
