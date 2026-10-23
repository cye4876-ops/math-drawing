/**
 * 平面嵌入布局（v3.2）：LR 平面性检验得到组合嵌入，再以 Tutte 凸绘制给出无交叉坐标。
 * 适用：连通、2-连通、平面、顶点数 ≤ 31 的简单无向图；否则给出明确错误（建议用力导向）。
 * 依赖：src/lab/planarity（LR 检验与 ordered 邻接顺序）。
 */
import { lrInternals, type LrTables } from '../lab/planarity'
import type { LabGraph } from '../lab/graph'
import type { GraphObject } from './model'

export interface PlanarPosition {
  id: string
  x: number
  y: number
}

export type PlanarLayoutResult =
  { ok: true; positions: PlanarPosition[]; note: string } | { ok: false; error: string }

const MAX_N = 31
const OUTER_RADIUS = 3

function buildLab(graph: GraphObject): { lab: LabGraph; ids: string[]; edgeCount: number } {
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const adj = new Array<number>(n).fill(0)
  let edgeCount = 0
  for (const edge of graph.edges) {
    const u = index.get(edge.source)
    const v = index.get(edge.target)
    if (u === undefined || v === undefined || u === v) continue
    if (((adj[u]! >> v) & 1) === 1) continue
    adj[u]! |= 1 << v
    adj[v]! |= 1 << u
    edgeCount++
  }
  return { lab: { n, adj }, ids: graph.nodes.map((node) => node.id), edgeCount }
}

function neighborsOf(lab: LabGraph, v: number): number[] {
  const result: number[] = []
  const mask = lab.adj[v]!
  for (let i = 0; i < lab.n; i++) {
    if ((mask >> i) & 1) result.push(i)
  }
  return result
}

function isConnected(lab: LabGraph): boolean {
  if (lab.n === 0) return true
  const seen = new Array<boolean>(lab.n).fill(false)
  seen[0] = true
  const queue = [0]
  for (let head = 0; head < queue.length; head++) {
    for (const v of neighborsOf(lab, queue[head]!)) {
      if (!seen[v]) {
        seen[v] = true
        queue.push(v)
      }
    }
  }
  return seen.every(Boolean)
}

/** 2-连通性：去掉任一顶点仍连通（n ≤ 31 可直接试删） */
function isBiconnected(lab: LabGraph): boolean {
  for (let removed = 0; removed < lab.n; removed++) {
    const seen = new Array<boolean>(lab.n).fill(false)
    let start = -1
    for (let v = 0; v < lab.n; v++) {
      if (v !== removed) {
        start = v
        break
      }
    }
    if (start === -1) continue
    seen[start] = true
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      for (const v of neighborsOf(lab, queue[head]!)) {
        if (v !== removed && !seen[v]) {
          seen[v] = true
          queue.push(v)
        }
      }
    }
    for (let v = 0; v < lab.n; v++) {
      if (v !== removed && !seen[v]) return false
    }
  }
  return true
}

/** 由 ordered 邻接表遍历面；失败返回 null（面数不符合欧拉公式） */
export function facesOfEmbedding(
  lab: LabGraph,
  ordered: number[][],
  direction: 1 | -1,
): number[][] | null {
  return facesOf(lab, ordered, direction)
}

/** 由 ordered 邻接表遍历面；失败返回 null（面数不符合欧拉公式） */
function facesOf(lab: LabGraph, ordered: number[][], direction: 1 | -1): number[][] | null {
  const position = ordered.map((list) => {
    const map = new Map<number, number>()
    list.forEach((v, i) => map.set(v, i))
    return map
  })
  const visited = new Set<number>()
  const faces: number[][] = []
  let edgeCount = 0
  for (let u = 0; u < lab.n; u++) {
    for (const v of ordered[u]!) {
      edgeCount++
      const key = u * lab.n + v
      if (visited.has(key)) continue
      const face: number[] = []
      let from = u
      let to = v
      let guard = 0
      while (guard++ <= lab.n * 4) {
        const currentKey = from * lab.n + to
        if (visited.has(currentKey)) break
        visited.add(currentKey)
        face.push(from)
        const list = ordered[to]!
        const index = position[to]!.get(from)
        if (index === undefined) return null
        const nextIndex = (index + direction + list.length) % list.length
        const next = list[nextIndex]!
        from = to
        to = next
        if (from === u && to === v) break
      }
      faces.push(face)
    }
  }
  edgeCount /= 2
  const expected = edgeCount - lab.n + 2
  return faces.length === expected ? faces : null
}

/** 稠密高斯消元（部分主元）；奇异返回 null */
function solveDense(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length
  const a = matrix.map((row, i) => [...row, rhs[i]!])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row]![col]!) > Math.abs(a[pivot]![col]!)) pivot = row
    }
    if (Math.abs(a[pivot]![col]!) < 1e-12) return null
    if (pivot !== col) {
      const temp = a[col]!
      a[col] = a[pivot]!
      a[pivot] = temp
    }
    const pivotValue = a[col]![col]!
    for (let row = col + 1; row < n; row++) {
      const factor = a[row]![col]! / pivotValue
      if (factor === 0) continue
      for (let k = col; k <= n; k++) a[row]![k]! -= factor * a[col]![k]!
    }
  }
  const solution = new Array<number>(n).fill(0)
  for (let row = n - 1; row >= 0; row--) {
    let sum = a[row]![n]!
    for (let col = row + 1; col < n; col++) sum -= a[row]![col]! * solution[col]!
    solution[row] = sum / a[row]![row]!
  }
  return solution
}

/** 由 LR 内部表重建旋转系统（移植 networkx dfs_embedding：半边插入 + side/ref 符号） */
function buildEmbedding(lab: LabGraph, tables: LrTables): number[][] | null {
  const n = lab.n
  const succ = Array.from({ length: n }, () => ({
    cw: new Map<number, number>(),
    ccw: new Map<number, number>(),
  }))
  const order: number[][] = Array.from({ length: n }, () => [])

  const addHalfEdge = (
    start: number,
    end: number,
    cwRef: number | null,
    ccwRef: number | null,
  ): boolean => {
    const list = succ[start]!
    const keys = order[start]!
    if (list.cw.size === 0) {
      if (cwRef !== null || ccwRef !== null) return false
      list.cw.set(end, end)
      list.ccw.set(end, end)
      keys.push(end)
      return true
    }
    const leftmost = keys[keys.length - 1]!
    let moveLeftmost: boolean
    if (cwRef !== null) {
      const refCcw = list.ccw.get(cwRef)
      if (refCcw === undefined) return false
      list.cw.set(end, cwRef)
      list.ccw.set(end, refCcw)
      list.ccw.set(cwRef, end)
      list.cw.set(refCcw, end)
      moveLeftmost = cwRef !== leftmost
    } else if (ccwRef !== null) {
      const refCw = list.cw.get(ccwRef)
      if (refCw === undefined) return false
      list.cw.set(end, refCw)
      list.ccw.set(end, ccwRef)
      list.ccw.set(refCw, end)
      list.cw.set(ccwRef, end)
      moveLeftmost = true
    } else {
      return false
    }
    keys.push(end)
    if (moveLeftmost && leftmost !== end) {
      const index = keys.indexOf(leftmost)
      if (index >= 0) {
        keys.splice(index, 1)
        keys.push(leftmost)
      }
    }
    return true
  }

  const signMemo = new Map<number, number>()
  const signOf = (edge: number): number => {
    const chain: number[] = []
    let current: number | null = edge
    let guard = 0
    while (current !== null && !signMemo.has(current) && guard++ < n * n * 2) {
      chain.push(current)
      current = tables.ref[current] ?? null
    }
    let acc = current !== null ? (signMemo.get(current) ?? 1) : 1
    for (let i = chain.length - 1; i >= 0; i--) {
      const id = chain[i]!
      acc *= tables.side[id] ?? 1
      signMemo.set(id, acc)
    }
    return signMemo.get(edge) ?? 1
  }

  const leftRef = new Array<number>(n).fill(-1)
  const rightRef = new Array<number>(n).fill(-1)

  // 用 sign 修正嵌套深度后重排（networkx：nesting_depth[e] = sign(e) * nesting_depth[e]）
  const signedNesting = new Array<number>(n * n).fill(0)
  for (let v = 0; v < n; v++) {
    for (const w of tables.ordered[v]!) {
      const edge = v * n + w
      signedNesting[edge] = signOf(edge) * tables.nesting[edge]!
    }
  }
  const sorted = tables.ordered.map((list, v) =>
    [...list].sort((a, b) => signedNesting[v * n + a]! - signedNesting[v * n + b]!),
  )
  // 初始化：每个顶点的出半边按重排顺序逐条接到前一条的 ccw 侧
  for (let v = 0; v < n; v++) {
    let previous: number | null = null
    for (const w of sorted[v]!) {
      addHalfEdge(v, w, null, previous)
      previous = w
    }
  }

  const dfsEmbedding = (v: number): void => {
    for (const w of sorted[v]!) {
      const edge = v * n + w
      if (edge === tables.parentEdge[w]) {
        // 树边：把 v 插到 w 的最左位置（add_half_edge_first(w, v)）
        const keys = order[w]!
        const leftmost = keys.length > 0 ? keys[keys.length - 1]! : null
        if (!addHalfEdge(w, v, leftmost, null)) return
        leftRef[v] = w
        rightRef[v] = w
        dfsEmbedding(w)
      } else if (signOf(edge) === 1) {
        addHalfEdge(w, v, null, rightRef[w]! < 0 ? null : rightRef[w]!)
      } else {
        addHalfEdge(w, v, leftRef[w]! < 0 ? null : leftRef[w]!, null)
        leftRef[w] = v
      }
    }
  }
  dfsEmbedding(0)

  const rotation: number[][] = []
  for (let v = 0; v < n; v++) {
    const list = succ[v]!
    if (list.cw.size === 0) {
      rotation.push([])
      continue
    }
    const keys = order[v]!
    const start = keys[keys.length - 1]!
    const sequence = [start]
    let current = list.cw.get(start)!
    let guard = 0
    while (current !== start && guard++ <= n + 1) {
      sequence.push(current)
      current = list.cw.get(current)!
    }
    rotation.push(sequence)
  }
  return facesOf(lab, rotation, 1) ? rotation : null
}

/** n ≤ 4 时 LR 会短路返回空表：枚举邻接顺序找一个满足欧拉公式的旋转系统 */
function smallEmbedding(lab: LabGraph): number[][] | null {
  const lists = Array.from({ length: lab.n }, (_, v) => neighborsOf(lab, v))
  const permutations = (list: number[]): number[][] => {
    if (list.length <= 1) return [list]
    const result: number[][] = []
    const walk = (prefix: number[], rest: number[]): void => {
      if (rest.length === 0) {
        result.push(prefix)
        return
      }
      rest.forEach((value, index) => {
        walk([...prefix, value], [...rest.slice(0, index), ...rest.slice(index + 1)])
      })
    }
    walk([], list)
    return result
  }
  const options = lists.map(permutations)
  const current: number[][] = lists.map(() => [])
  const search = (index: number): boolean => {
    if (index === lists.length) return facesOf(lab, current, 1) !== null
    for (const option of options[index]!) {
      current[index] = option
      if (search(index + 1)) return true
    }
    return false
  }
  return search(0) ? current : null
}

export function layoutPlanarGraph(graph: GraphObject): PlanarLayoutResult {
  if (graph.nodes.length < 3) {
    return { ok: false, error: '顶点数不足 3，无法做平面嵌入（建议使用环形/力导向布局）。' }
  }
  if (graph.nodes.length > MAX_N) {
    return { ok: false, error: `平面嵌入布局支持最多 ${MAX_N} 个顶点（位掩码实现上限）。` }
  }
  const { lab, ids, edgeCount } = buildLab(graph)
  if (!isConnected(lab))
    return { ok: false, error: '图不连通，无法做平面嵌入（建议使用力导向布局）。' }
  if (edgeCount < lab.n) {
    return { ok: false, error: '图含割点或过稀（树/森林），没有可用的内部面（建议使用分层布局）。' }
  }
  if (!isBiconnected(lab)) {
    return { ok: false, error: '图不是 2-连通的（存在割点），Tutte 布局不适用（建议力导向）。' }
  }
  const internals = lrInternals(lab)
  if (!internals.planar)
    return { ok: false, error: '图非平面（含 K₅/K₃,₃ minor），无法无交叉绘制。' }
  const ordered = lab.n <= 4 ? (smallEmbedding(lab) ?? []) : (buildEmbedding(lab, internals) ?? [])
  if (ordered.length === 0) return { ok: false, error: '组合嵌入重建失败，请改用其他布局。' }
  const faces = facesOf(lab, ordered, 1) ?? facesOf(lab, ordered, -1)
  if (!faces) return { ok: false, error: '组合嵌入重建失败，请改用其他布局。' }
  // 外表面取最长面（≥3）
  let outer = faces[0]!
  for (const face of faces) {
    if (face.length > outer.length) outer = face
  }
  if (outer.length < 3) return { ok: false, error: '未能找到长度 ≥ 3 的外表面。' }

  const outerSet = new Set(outer)
  const x = new Array<number>(lab.n).fill(0)
  const y = new Array<number>(lab.n).fill(0)
  outer.forEach((v, i) => {
    const angle = (2 * Math.PI * i) / outer.length
    x[v] = OUTER_RADIUS * Math.cos(angle)
    y[v] = OUTER_RADIUS * Math.sin(angle)
  })

  const interior: number[] = []
  for (let v = 0; v < lab.n; v++) if (!outerSet.has(v)) interior.push(v)
  if (interior.length > 0) {
    const positionOf = new Map(interior.map((v, i) => [v, i]))
    const size = interior.length
    const matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0))
    const rhsX = new Array<number>(size).fill(0)
    const rhsY = new Array<number>(size).fill(0)
    interior.forEach((v, i) => {
      const neighbors = neighborsOf(lab, v)
      matrix[i]![i] = neighbors.length
      for (const u of neighbors) {
        const j = positionOf.get(u)
        if (j === undefined) {
          rhsX[i]! += x[u]!
          rhsY[i]! += y[u]!
        } else {
          matrix[i]![j]! -= 1
        }
      }
    })
    const solvedX = solveDense(matrix, rhsX)
    const solvedY = solvedX ? solveDense(matrix, rhsY) : null
    if (!solvedX || !solvedY) {
      return { ok: false, error: '线性系统求解失败（图可能退化为退化嵌入），请改用其他布局。' }
    }
    interior.forEach((v, i) => {
      x[v] = solvedX[i]!
      y[v] = solvedY[i]!
    })
  }

  return {
    ok: true,
    positions: ids.map((id, i) => ({ id, x: x[i]!, y: y[i]! })),
    note: `平面嵌入（LR 组合嵌入 + Tutte 凸绘制）：${faces.length} 个面，外表面 ${outer.length} 边。`,
  }
}
