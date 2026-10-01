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
