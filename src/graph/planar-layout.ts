/**
 * 平面嵌入布局（v3.2 起）：LR 平面性检验得到组合嵌入，再以 Tutte 凸绘制给出无交叉坐标。
 * v3.3 扩展：支持森林/树（二连通块按割点展开）与不连通图（分量装箱），顶点数 ≤ 31。
 * 非平面图（K₅/K₃,₃ minor）仍明确报错。
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

// ---------------- v3.3：连通分量 / 二连通块装配 ----------------

interface Block {
  vertices: number[]
  edges: Array<[number, number]>
}

function connectedComponents(lab: LabGraph): number[][] {
  const seen = new Array<boolean>(lab.n).fill(false)
  const components: number[][] = []
  for (let start = 0; start < lab.n; start++) {
    if (seen[start]) continue
    const members: number[] = []
    seen[start] = true
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]!
      members.push(u)
      for (const v of neighborsOf(lab, u)) {
        if (!seen[v]) {
          seen[v] = true
          queue.push(v)
        }
      }
    }
    components.push(members)
  }
  return components
}

/** Tarjan 边栈求二连通块（含单边块）；图可含割点、可含孤立点 */
function biconnectedBlocks(lab: LabGraph): Block[] {
  const n = lab.n
  const disc = new Array<number>(n).fill(-1)
  const low = new Array<number>(n).fill(0)
  const parent = new Array<number>(n).fill(-1)
  const stack: Array<[number, number]> = []
  const blocks: Block[] = []
  let timer = 0
  const emit = (u: number, v: number): void => {
    const edges: Array<[number, number]> = []
    const vertices = new Set<number>()
    while (stack.length > 0) {
      const [a, b] = stack.pop()!
      edges.push([a, b])
      vertices.add(a)
      vertices.add(b)
      if (a === u && b === v) break
    }
    blocks.push({ vertices: [...vertices], edges })
  }
  const dfs = (u: number): void => {
    disc[u] = timer
    low[u] = timer
    timer++
    for (const v of neighborsOf(lab, u)) {
      if (disc[v] === -1) {
        stack.push([u, v])
        parent[v] = u
        dfs(v)
        low[u] = Math.min(low[u]!, low[v]!)
        if (low[v]! >= disc[u]!) emit(u, v)
      } else if (v !== parent[u] && disc[v]! < disc[u]!) {
        stack.push([u, v])
        low[u] = Math.min(low[u]!, disc[v]!)
      }
    }
  }
  for (let v = 0; v < n; v++) {
    if (disc[v] === -1) dfs(v)
  }
  // 防御：根节点残余边（正常情况应已清空）
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    blocks.push({ vertices: [a, b], edges: [[a, b]] })
  }
  return blocks
}

interface BlockLayoutOk {
  ok: true
  positions: Map<number, { x: number; y: number }>
  faceCount: number
  outerLength: number
}

type BlockLayoutResult = BlockLayoutOk | { ok: false; error: string }

/**
 * 单个二连通块（或单边）的局部凸绘制：
 * 顶点数 2 → 水平单边；≥3 → LR 组合嵌入 + Tutte（外表面半径 radius）。
 * 局部坐标以块自身为参照，供块树装配时旋转/平移。
 */
function blockLayout(lab: LabGraph, vertices: number[], radius: number): BlockLayoutResult {
  const count = vertices.length
  if (count === 1) {
    return {
      ok: true,
      positions: new Map([[vertices[0]!, { x: 0, y: 0 }]]),
      faceCount: 0,
      outerLength: 0,
    }
  }
  if (count === 2) {
    return {
      ok: true,
      positions: new Map([
        [vertices[0]!, { x: -radius / 2, y: 0 }],
        [vertices[1]!, { x: radius / 2, y: 0 }],
      ]),
      faceCount: 0,
      outerLength: 0,
    }
  }
  const localOf = new Map(vertices.map((v, i) => [v, i]))
  const adj = new Array<number>(count).fill(0)
  for (const v of vertices) {
    const i = localOf.get(v)!
    for (const u of neighborsOf(lab, v)) {
      const j = localOf.get(u)
      if (j !== undefined) adj[i]! |= 1 << j
    }
  }
  const local: LabGraph = { n: count, adj }
  const internals = lrInternals(local)
  if (!internals.planar)
    return { ok: false, error: '图非平面（含 K₅/K₃,₃ minor），无法无交叉绘制。' }
  const ordered =
    count <= 4 ? (smallEmbedding(local) ?? []) : (buildEmbedding(local, internals) ?? [])
  if (ordered.length === 0) return { ok: false, error: '组合嵌入重建失败，请改用其他布局。' }
  const faces = facesOf(local, ordered, 1) ?? facesOf(local, ordered, -1)
  if (!faces) return { ok: false, error: '组合嵌入重建失败，请改用其他布局。' }
  // 外表面取最长面（≥3）
  let outer = faces[0]!
  for (const face of faces) {
    if (face.length > outer.length) outer = face
  }
  if (outer.length < 3) return { ok: false, error: '未能找到长度 ≥ 3 的外表面。' }

  const outerSet = new Set(outer)
  const x = new Array<number>(count).fill(0)
  const y = new Array<number>(count).fill(0)
  outer.forEach((v, i) => {
    const angle = (2 * Math.PI * i) / outer.length
    x[v] = radius * Math.cos(angle)
    y[v] = radius * Math.sin(angle)
  })

  const interior: number[] = []
  for (let v = 0; v < count; v++) if (!outerSet.has(v)) interior.push(v)
  if (interior.length > 0) {
    const positionOf = new Map(interior.map((v, i) => [v, i]))
    const size = interior.length
    const matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0))
    const rhsX = new Array<number>(size).fill(0)
    const rhsY = new Array<number>(size).fill(0)
    interior.forEach((v, i) => {
      const neighbors = neighborsOf(local, v)
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

  const positions = new Map<number, { x: number; y: number }>()
  vertices.forEach((v, i) => positions.set(v, { x: x[i]!, y: y[i]! }))
  return { ok: true, positions, faceCount: faces.length, outerLength: outer.length }
}

const ROOT_RADIUS = 3
const CHILD_RADIUS = 1.7

interface PartLayout {
  positions: Map<number, { x: number; y: number }>
}

/**
 * 块树装配：以顶点数最多的块为根块，沿割点按角度扇出子块（子块旋转到背离父块质心的方向），
 * 使树/森林/哑铃图等非 2-连通平面图也能无交叉展开。
 */
function assembleComponent(
  lab: LabGraph,
  vertices: number[],
  blocks: Block[],
  blockIds: number[],
): PartLayout {
  if (blockIds.length === 0) {
    return { positions: new Map([[vertices[0]!, { x: 0, y: 0 }]]) }
  }
  let root = blockIds[0]!
  for (const id of blockIds) {
    if (blocks[id]!.vertices.length > blocks[root]!.vertices.length) root = id
  }
  const rootLayout = blockLayout(lab, blocks[root]!.vertices, ROOT_RADIUS)
  if (!rootLayout.ok) throw new Error(rootLayout.error)
  const positions = new Map(rootLayout.positions)
  const placed = new Set<number>([root])
  const queue = [root]
  const blocksAt = new Map<number, number[]>()
  for (const id of blockIds) {
    for (const v of blocks[id]!.vertices) {
      const list = blocksAt.get(v)
      if (list) list.push(id)
      else blocksAt.set(v, [id])
    }
  }
  while (queue.length > 0) {
    const parentId = queue.shift()!
    const parent = blocks[parentId]!
    let cx = 0
    let cy = 0
    for (const v of parent.vertices) {
      const point = positions.get(v)!
      cx += point.x
      cy += point.y
    }
    cx /= parent.vertices.length
    cy /= parent.vertices.length
    for (const a of parent.vertices) {
      const children = (blocksAt.get(a) ?? []).filter((id) => !placed.has(id))
      if (children.length === 0) continue
      const pivot = positions.get(a)!
      const baseAngle = Math.atan2(pivot.y - cy, pivot.x - cx)
      children.forEach((childId, k) => {
        const child = blocks[childId]!
        const layout = blockLayout(lab, child.vertices, CHILD_RADIUS)
        if (!layout.ok) throw new Error(layout.error)
        const anchor = layout.positions.get(a)!
        let ccx = 0
        let ccy = 0
        for (const v of child.vertices) {
          const point = layout.positions.get(v)!
          ccx += point.x
          ccy += point.y
        }
        ccx /= child.vertices.length
        ccy /= child.vertices.length
        const localAngle = Math.atan2(ccy - anchor.y, ccx - anchor.x)
        const targetAngle = baseAngle + (k * 2 * Math.PI) / (children.length + 1)
        const theta = targetAngle - localAngle
        const cos = Math.cos(theta)
        const sin = Math.sin(theta)
        for (const [vertex, point] of layout.positions) {
          const dx = point.x - anchor.x
          const dy = point.y - anchor.y
          positions.set(vertex, {
            x: pivot.x + dx * cos - dy * sin,
            y: pivot.y + dx * sin + dy * cos,
          })
        }
        placed.add(childId)
        queue.push(childId)
      })
    }
  }
  return { positions }
}

/** 多连通分量按行排布（单分量保持原坐标，不破坏既有半径语义） */
function packParts(parts: PartLayout[]): void {
  if (parts.length <= 1) return
  const MAX_ROW = 9
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  for (const part of parts) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const point of part.positions.values()) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
    const width = maxX - minX
    const height = maxY - minY
    if (cursorX > 0 && cursorX + width > MAX_ROW) {
      cursorX = 0
      cursorY -= rowHeight + 1.4
      rowHeight = 0
    }
    const dx = cursorX - minX
    const dy = cursorY - maxY
    for (const [vertex, point] of part.positions) {
      part.positions.set(vertex, { x: point.x + dx, y: point.y + dy })
    }
    cursorX += width + 1.4
    rowHeight = Math.max(rowHeight, height)
  }
}

export function layoutPlanarGraph(graph: GraphObject): PlanarLayoutResult {
  if (graph.nodes.length < 3) {
    return { ok: false, error: '顶点数不足 3，无法做平面嵌入（建议使用环形/力导向布局）。' }
  }
  if (graph.nodes.length > MAX_N) {
    return { ok: false, error: `平面嵌入布局支持最多 ${MAX_N} 个顶点（位掩码实现上限）。` }
  }
  const { lab, ids } = buildLab(graph)
  const components = connectedComponents(lab)
  const blocks = biconnectedBlocks(lab)
  const componentOf = new Array<number>(lab.n).fill(0)
  components.forEach((members, index) => {
    for (const v of members) componentOf[v] = index
  })
  const blockIdsOf: number[][] = components.map(() => [])
  blocks.forEach((block, id) => {
    const first = block.vertices[0]!
    blockIdsOf[componentOf[first]!]!.push(id)
  })
  const parts: PartLayout[] = []
  for (let index = 0; index < components.length; index++) {
    try {
      parts.push(assembleComponent(lab, components[index]!, blocks, blockIdsOf[index]!))
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '平面嵌入失败，请改用其他布局。',
      }
    }
  }
  packParts(parts)
  const x = new Array<number>(lab.n).fill(0)
  const y = new Array<number>(lab.n).fill(0)
  for (const part of parts) {
    for (const [vertex, point] of part.positions) {
      x[vertex] = point.x
      y[vertex] = point.y
    }
  }
  const componentText = components.length > 1 ? `${components.length} 个连通分量` : '连通图'
  const edgeBlocks = blocks.filter((block) => block.vertices.length === 2).length
  const blockText =
    blocks.length > 0 && edgeBlocks === blocks.length
      ? '树/森林（按割点展开）'
      : `${blocks.length} 个二连通块装配`
  return {
    ok: true,
    positions: ids.map((id, i) => ({ id, x: x[i]!, y: y[i]! })),
    note: `平面嵌入：${componentText} · ${blockText}；LR 组合嵌入 + Tutte 凸绘制。`,
  }
}
