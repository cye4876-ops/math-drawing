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
 * 层 0 在顶部、层内水平均布，整体居中。适合树/DAG/流程图排布。
 */
export function layoutLayered(graph: GraphObject, spacing = 1.6): GraphNodeData[] {
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
  const byLayer = new Map<number, number[]>()
  layer.forEach((value, i) => {
    const list = byLayer.get(value)
    if (list) list.push(i)
    else byLayer.set(value, [i])
  })
  const maxLayer = Math.max(...layer)
  const result = graph.nodes.map((node) => ({ ...node }))
  for (const [value, members] of byLayer) {
    const width = (members.length - 1) * spacing
    members.forEach((memberIndex, k) => {
      const node = result[memberIndex]!
      node.x = k * spacing - width / 2
      node.y = (maxLayer - value - maxLayer / 2) * spacing
    })
  }
  return result
}
