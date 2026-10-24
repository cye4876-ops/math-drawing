/**
 * 图布局（v0.5 阶段 4）：
 * - 环形 / 网格：纯函数，按顶点顺序布置（不修改输入）；
 * - 力导向：graphology-layout-forceatlas2 同步迭代，以当前坐标为初始位置。
 * 大图（数百顶点）在 UI 中走 layout-worker（同名协议见 LayoutWorkerRequest），避免阻塞主线程；
 * 本模块的同步版被单测与 worker 复用。
 */
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { toGraphology, type GraphNodeData, type GraphObject } from './model'

/** 环形布局：顶点按当前顺序均布于半径 radius 的圆上（首个顶点在 +x 轴） */
export function layoutCircular(graph: GraphObject, radius = 3): GraphNodeData[] {
  const count = graph.nodes.length
  return graph.nodes.map((node, index) => {
    const angle = count > 0 ? (index / count) * Math.PI * 2 : 0
    return { ...node, x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
  })
}

/** 网格布局：每行 ceil(√n) 列、间距 spacing，整体以原点居中 */
export function layoutGrid(graph: GraphObject, spacing = 1.6): GraphNodeData[] {
  const count = graph.nodes.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.max(1, Math.ceil(count / cols))
  return graph.nodes.map((node, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    return {
      ...node,
      x: (col - (cols - 1) / 2) * spacing,
      y: ((rows - 1) / 2 - row) * spacing,
    }
  })
}

/**
 * 力导向布局（同步版，worker 与测试使用）：
 * FA2 参数按顶点数经 inferSettings 推断；从当前坐标出发迭代 iterations 次，返回新坐标数组。
 */
export function layoutForceAtlas(graph: GraphObject, iterations = 250): GraphNodeData[] {
  const g = toGraphology(graph)
  const settings = forceAtlas2.inferSettings(g.order)
  forceAtlas2.assign(g, { iterations, settings })
  return graph.nodes.map((node) => {
    const x = g.getNodeAttribute(node.id, 'x') as number
    const y = g.getNodeAttribute(node.id, 'y') as number
    return { ...node, x, y }
  })
}

/**
 * 分层布局（DAG 语义的「最长路径分层」）：
 * - 含**有向边**：沿箭头方向迭代松弛 layer[v] ≥ layer[u] + 1（无向边双向；至多 n 轮，环图亦有界）；
 * - 全**无向**图：退化为 BFS 分层（各连通分量自 0 起）；
 * 分层后用**重心法（barycenter）上下扫描**重排层内顺序以减少交叉，取扫描中交叉最少的一次；
 * 层 0 在顶部、层内按 nodeGap 均布，垂直层距 layerGap，整体居中。
 */
export interface LayeredOptions {
  /** 相邻层垂直距离 */
  layerGap?: number
  /** 同层相邻顶点水平距离 */
  nodeGap?: number
  /** 重心扫描轮数（下→上算一轮） */
  sweeps?: number
}

/** 由图构造相邻层交叉统计用的顶点索引对（无向边双向；忽略自环） */
export function layeredEdgePairs(graph: GraphObject): Array<[number, number]> {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const pairs: Array<[number, number]> = []
  for (const edge of graph.edges) {
    const i = index.get(edge.source)
    const j = index.get(edge.target)
    if (i === undefined || j === undefined || i === j) continue
    pairs.push([i, j])
    if (!edge.directed) pairs.push([j, i])
  }
  return pairs
}

export function layoutLayered(
  graph: GraphObject,
  options: number | LayeredOptions = {},
): GraphNodeData[] {
  const resolved: Required<LayeredOptions> =
    typeof options === 'number'
      ? { layerGap: options, nodeGap: options, sweeps: 8 }
      : {
          layerGap: options.layerGap ?? 1.8,
          nodeGap: options.nodeGap ?? 1.8,
          sweeps: Math.max(0, Math.min(50, options.sweeps ?? 8)),
        }
  const n = graph.nodes.length
  if (n === 0) return []
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
  const layer = new Array<number>(n).fill(0)
  const hasDirected = graph.edges.some((edge) => edge.directed)
  if (!hasDirected) {
    // 无向图：BFS 分层
    const adjacency = new Map<string, string[]>()
    const push = (u: string, v: string): void => {
      const list = adjacency.get(u)
      if (list) list.push(v)
      else adjacency.set(u, [v])
    }
    for (const edge of graph.edges) {
      if (edge.source === edge.target) continue
      push(edge.source, edge.target)
      push(edge.target, edge.source)
    }
    const visited = new Array<boolean>(n).fill(false)
    for (let s = 0; s < n; s++) {
      if (visited[s]) continue
      visited[s] = true
      layer[s] = 0
      const queue = [s]
      while (queue.length > 0) {
        const u = queue.shift()!
        for (const id of adjacency.get(graph.nodes[u]!.id) ?? []) {
          const v = index.get(id)!
          if (visited[v]) continue
          visited[v] = true
          layer[v] = layer[u]! + 1
          queue.push(v)
        }
      }
    }
  } else {
    // 有向语义：最长路径分层（迭代松弛，n 轮封顶）
    for (let round = 0; round < n; round++) {
      let changed = false
      for (const edge of graph.edges) {
        const i = index.get(edge.source)
        const j = index.get(edge.target)
        if (i === undefined || j === undefined || i === j) continue
        if (layer[j]! < layer[i]! + 1) {
          layer[j] = layer[i]! + 1
          changed = true
        }
        if (!edge.directed && layer[i]! < layer[j]! + 1) {
          layer[i] = layer[j]! + 1
          changed = true
        }
      }
      if (!changed) break
    }
  }
  const maxLayer = Math.max(...layer)
  // 层内顺序：初始按顶点顺序；重心法上下扫描取最优
  const orders: number[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (let i = 0; i < n; i++) orders[layer[i]!]!.push(i)
  // 相邻层之间的边对（[上层顶点, 下层顶点]）
  const pairs: Array<[number, number]> = []
  const upNeighbors = new Map<number, number[]>()
  const downNeighbors = new Map<number, number[]>()
  const addPair = (u: number, v: number): void => {
    pairs.push([u, v])
    const up = downNeighbors.get(u)
    if (up) up.push(v)
    else downNeighbors.set(u, [v])
    const down = upNeighbors.get(v)
    if (down) down.push(u)
    else upNeighbors.set(v, [u])
  }
  for (const edge of graph.edges) {
    const i = index.get(edge.source)
    const j = index.get(edge.target)
    if (i === undefined || j === undefined || i === j) continue
    addPair(i, j)
    if (!edge.directed) addPair(j, i)
  }

  const positionMap = (order: number[][]): Map<number, number> => {
    const map = new Map<number, number>()
    order.forEach((members) => members.forEach((v, k) => map.set(v, k)))
    return map
  }

  const sortLayer = (li: number, reference: Map<number, number>): number[] => {
    const members = [...orders[li]!]
    const key = new Map<number, number>()
    members.forEach((v, k) => {
      const neighbors = [...(upNeighbors.get(v) ?? []), ...(downNeighbors.get(v) ?? [])]
        .map((u) => reference.get(u))
        .filter((x): x is number => x !== undefined)
      const sum = neighbors.reduce((acc, x) => acc + x, 0)
      key.set(v, neighbors.length > 0 ? sum / neighbors.length : k)
    })
    members.sort((a, b) => key.get(a)! - key.get(b)! || a - b)
    return members
  }

  const flatten = (order: number[][]): number[] => order.flat()
  const crossingFor = (order: number[][]): number => {
    const flat = flatten(order)
    const rank = new Map<number, number>()
    flat.forEach((v, k) => rank.set(v, k))
    let total = 0
    for (let i = 0; i < pairs.length; i++) {
      const [ua, va] = pairs[i]!
      if (Math.abs(layer[ua]! - layer[va]!) !== 1) continue
      for (let j = i + 1; j < pairs.length; j++) {
        const [ub, vb] = pairs[j]!
        if (Math.abs(layer[ub]! - layer[vb]!) !== 1) continue
        const ra = rank.get(ua)!
        const rb = rank.get(ub)!
        const ca = rank.get(va)!
        const cb = rank.get(vb)!
        // 同层交叉只可能发生在同层之间，按层内次序与对层次序判断
        if (layer[ua] === layer[ub] && layer[va] === layer[vb]) {
          if ((ra - rb) * (ca - cb) < 0) total++
        }
      }
    }
    return total
  }

  let best = orders.map((members) => [...members])
  let bestCrossings = crossingFor(best)
  if (resolved.sweeps > 0 && pairs.length > 0) {
    for (let sweep = 0; sweep < resolved.sweeps; sweep++) {
      // 向下：按上层位置重排
      for (let li = 1; li <= maxLayer; li++) {
        const reference = positionMap(orders)
        orders[li] = sortLayer(li, reference)
      }
      // 向上：按下层位置重排
      for (let li = maxLayer - 1; li >= 0; li--) {
        const reference = positionMap(orders)
        orders[li] = sortLayer(li, reference)
      }
      const crossings = crossingFor(orders)
      if (crossings < bestCrossings) {
        bestCrossings = crossings
        best = orders.map((members) => [...members])
      }
    }
  }

  const result = graph.nodes.map((node) => ({ ...node }))
  best.forEach((members, li) => {
    const width = (members.length - 1) * resolved.nodeGap
    members.forEach((memberIndex, k) => {
      const node = result[memberIndex]!
      node.x = k * resolved.nodeGap - width / 2
      node.y = (maxLayer - li - maxLayer / 2) * resolved.layerGap
    })
  })
  return result
}

/** 统计当前坐标下分层布局的相邻层交叉数（供 UI 显示；层按 y 四舍五入分辨） */
export function crossingsOfPositions(
  nodes: GraphNodeData[],
  pairs: Array<[number, number]>,
): number {
  if (nodes.length === 0) return 0
  const yValues = [...new Set(nodes.map((node) => Math.round(node.y * 1000) / 1000))].sort(
    (a, b) => a - b,
  )
  const layerOf = nodes.map((node) => yValues.indexOf(Math.round(node.y * 1000) / 1000))
  const order: number[][] = yValues.map(() => [])
  nodes.forEach((node, i) => {
    const layerIndex = layerOf[i]!
    order[layerIndex]!.push(i)
  })
  // 层内按 x 排序（从大到小与坐标方向一致时无影响，保持稳定即可）
  order.forEach((members) => members.sort((a, b) => nodes[a]!.x - nodes[b]!.x || a - b))
  const rank = new Map<number, number>()
  order.forEach((members) => members.forEach((v, k) => rank.set(v, k)))
  let total = 0
  for (let i = 0; i < pairs.length; i++) {
    const [ua, va] = pairs[i]!
    // 只有跨相邻层的边参与交叉统计（同层边/长边不产生 Sugiyama 意义下的交叉）
    if (Math.abs(layerOf[ua]! - layerOf[va]!) !== 1) continue
    for (let j = i + 1; j < pairs.length; j++) {
      const [ub, vb] = pairs[j]!
      if (Math.abs(layerOf[ub]! - layerOf[vb]!) !== 1) continue
      if (layerOf[ua] !== layerOf[ub] || layerOf[va] !== layerOf[vb]) continue
      if ((rank.get(ua)! - rank.get(ub)!) * (rank.get(va)! - rank.get(vb)!) < 0) total++
    }
  }
  return total
}
