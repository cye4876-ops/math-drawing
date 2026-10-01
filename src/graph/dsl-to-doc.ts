/**
 * DSL → 图对象（v0.5）：解析文本、按环形布局生成初始坐标、构造可直接入文档的图对象。
 * 这是「文本 → 画布」同步的底层函数（阶段 4 的同步层负责错误呈现与循环防护）。
 */
import { parseGraphDsl, type DslError } from './dsl-parser'
import { createEdge, createNode, paletteColor, type GraphObject } from './model'

export interface DslToGraphResult {
  /** 解析失败（无任何有效顶点）时为 null；部分成功时仍返回图对象 */
  graph: GraphObject | null
  errors: DslError[]
}

/**
 * 解析 DSL 并生成图对象：
 * - 顶点按环形均布（半径 3），颜色按序取调色环；
 * - 边保留有向性与权重；引用缺失端点（不应发生）时跳过；
 * - errors 非空但存在有效顶点时，仍返回部分解析的图（UI 决定是否应用）。
 */
export function graphObjectFromDsl(text: string, name = '图', radius = 3): DslToGraphResult {
  const parsed = parseGraphDsl(text)
  if (parsed.nodes.length === 0) {
    return { graph: null, errors: parsed.errors }
  }
  const count = parsed.nodes.length
  const nodes = parsed.nodes.map((label, index) => {
    const angle = count > 0 ? (index / count) * Math.PI * 2 : 0
    return createNode(
      label,
      radius * Math.cos(angle),
      radius * Math.sin(angle),
      paletteColor(index),
    )
  })
  const idByLabel = new Map(nodes.map((node) => [node.label, node.id]))
  const edges = []
  for (const edge of parsed.edges) {
    const source = idByLabel.get(edge.source)
    const target = idByLabel.get(edge.target)
    if (!source || !target) continue
    edges.push(createEdge(source, target, { directed: edge.directed, weight: edge.weight }))
  }
  return {
    graph: {
      id: crypto.randomUUID(),
      type: 'graph',
      name,
      nodes,
      edges,
      visible: true,
    },
    errors: parsed.errors,
  }
}
