/**
 * DSL ⇄ 图对象（v0.5）双向转换：
 * - `graphObjectFromDsl`：文本 → 图对象（坐标继承：同名顶点保留原坐标，新顶点环形布点）；
 * - `graphToDsl`：图对象 → 规范文本（孤立点一行一个；边 `A-B:3` / `C->A`；坐标不在文本中表达）；
 * - `dslMatchesGraph`：结构等价判断（labels 集合 + 边多重集），供同步层防循环重写。
 * 这是「文本 ⇄ 画布」双向同步的底层函数（阶段 4 的同步层负责防抖与循环防护）。
 */
import { parseGraphDsl, type DslError, type DslParseResult } from './dsl-parser'
import { createEdge, createNode, paletteColor, type GraphNodeData, type GraphObject } from './model'

export interface DslToGraphResult {
  /** 解析失败（无任何有效顶点）时为 null；部分成功时仍返回图对象 */
  graph: GraphObject | null
  errors: DslError[]
}

/**
 * 解析 DSL 并生成图对象：
 * - `previous` 中同名顶点继承坐标/颜色/样式；新顶点按环形均布（半径 radius）；
 * - 边保留有向性与权重；引用缺失端点（不应发生）时跳过；
 * - errors 非空但存在有效顶点时，仍返回部分解析的图（UI 决定是否应用）。
 */
export function graphObjectFromDsl(
  text: string,
  name = '图',
  radius = 3,
  previous: GraphObject | null = null,
): DslToGraphResult {
  const parsed = parseGraphDsl(text)
  if (parsed.nodes.length === 0) {
    return { graph: null, errors: parsed.errors }
  }
  const count = parsed.nodes.length
  const nodes: GraphNodeData[] = parsed.nodes.map((label, index) => {
    const old = previous?.nodes.find((node) => node.label === label)
    if (old) return { ...old }
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
      id: previous?.id ?? crypto.randomUUID(),
      type: 'graph',
      name,
      nodes,
      edges,
      visible: true,
    },
    errors: parsed.errors,
  }
}

/** 图对象 → 规范 DSL 文本（孤立点一行一个；边含权重与方向） */
export function graphToDsl(graph: GraphObject): string {
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]))
  const used = new Set<string>()
  for (const edge of graph.edges) {
    used.add(edge.source)
    used.add(edge.target)
  }
  const lines: string[] = []
  for (const node of graph.nodes) {
    if (!used.has(node.id)) lines.push(node.label)
  }
  for (const edge of graph.edges) {
    const source = labelById.get(edge.source)
    const target = labelById.get(edge.target)
    if (!source || !target) continue
    const op = edge.directed ? '->' : '-'
    const weight = edge.weight === null ? '' : `:${edge.weight}`
    lines.push(`${source}${op}${target}${weight}`)
  }
  return lines.join('\n')
}

/** 边归一化键：无向边按端点排序（A-B 与 B-A 视为同一条）；含权重 */
function edgeKey(source: string, target: string, directed: boolean, weight: number | null): string {
  let s = source
  let t = target
  if (!directed && s > t) [s, t] = [t, s]
  return `${s}${directed ? '>' : '-'}${t}#${weight ?? ''}`
}

/** DSL 解析结果与图对象结构是否一致（labels 集合 + 边多重集；要求无解析错误） */
export function dslMatchesGraph(result: DslParseResult, graph: GraphObject): boolean {
  if (result.errors.length > 0) return false
  const sortedResult = [...result.nodes].sort()
  const graphLabels = graph.nodes.map((node) => node.label).sort()
  if (graphLabels.length !== sortedResult.length) return false
  for (let i = 0; i < graphLabels.length; i++) {
    if (graphLabels[i] !== sortedResult[i]) return false
  }
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]))
  const graphEdges = graph.edges
    .map((edge) => {
      const s = labelById.get(edge.source)
      const t = labelById.get(edge.target)
      return s !== undefined && t !== undefined ? edgeKey(s, t, edge.directed, edge.weight) : null
    })
    .filter((key): key is string => key !== null)
    .sort()
  const dslEdges = result.edges
    .map((edge) => edgeKey(edge.source, edge.target, edge.directed, edge.weight))
    .sort()
  if (graphEdges.length !== dslEdges.length) return false
  for (let i = 0; i < graphEdges.length; i++) {
    if (graphEdges[i] !== dslEdges[i]) return false
  }
  return true
}
