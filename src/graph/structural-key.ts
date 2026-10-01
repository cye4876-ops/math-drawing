/**
 * 图结构签名（v0.5）：标签 + 边（方向/权重）的稳定字符串。
 * 坐标变化（拖动）不改变签名——面板据此缓存矩阵/谱/算法运行等结构相关计算。
 */
import type { GraphObject } from './model'

export function structuralKey(graph: GraphObject): string {
  const nodes = graph.nodes.map((node) => node.label).join('|')
  const edges = graph.edges
    .map((edge) => `${edge.source}${edge.directed ? '>' : '-'}${edge.target}:${edge.weight ?? ''}`)
    .join(';')
  return `${nodes}#${edges}`
}
