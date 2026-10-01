/**
 * 图数据模型（v0.5）：文档层为可序列化的 nodes / edges 普通数组；
 * graphology 作为**派生层**供布局与算法消费（单向数据流：文档 → graphology → 坐标回写）。
 * 这样撤销/序列化/编辑只面对数组，算法层拿到成熟的图结构，避免双源同步问题。
 */
import Graph from 'graphology'

/** 顶点形状（渲染层使用） */
export type NodeShape = 'circle' | 'square' | 'diamond'

export interface GraphNodeData {
  id: string
  /** 显示名（DSL 中的标识，文档内唯一） */
  label: string
  x: number
  y: number
  color: string
  /** 屏幕空间半径（px，不随缩放变化） */
  size: number
  shape: NodeShape
  /** 自定义属性（键值对，序列化保留） */
  attrs: Record<string, string | number>
}

export interface GraphEdgeData {
  id: string
  /** 端点（节点 id） */
  source: string
  target: string
  directed: boolean
  /** 权重（无权为 null） */
  weight: number | null
  color: string
  style: 'solid' | 'dashed'
}

/** 图文档（可 JSON 序列化） */
export interface GraphDoc {
  nodes: GraphNodeData[]
  edges: GraphEdgeData[]
}

export const DEFAULT_NODE_SIZE = 14
export const DEFAULT_EDGE_COLOR = '#9ca3af'

/** 自动配色环（新增顶点时按序取色） */
export const NODE_PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2']

export function paletteColor(index: number): string {
  const list = NODE_PALETTE
  return list[((index % list.length) + list.length) % list.length] as string
}

export function createGraphDoc(): GraphDoc {
  return { nodes: [], edges: [] }
}

export function createNode(label: string, x: number, y: number, color: string): GraphNodeData {
  return {
    id: crypto.randomUUID(),
    label,
    x,
    y,
    color,
    size: DEFAULT_NODE_SIZE,
    shape: 'circle',
    attrs: {},
  }
}

export function createEdge(
  source: string,
  target: string,
  options: {
    directed?: boolean
    weight?: number | null
    color?: string
    style?: 'solid' | 'dashed'
  } = {},
): GraphEdgeData {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    directed: options.directed ?? false,
    weight: options.weight ?? null,
    color: options.color ?? DEFAULT_EDGE_COLOR,
    style: options.style ?? 'solid',
  }
}

export function findNodeByLabel(doc: GraphDoc, label: string): GraphNodeData | undefined {
  return doc.nodes.find((node) => node.label === label)
}

/** 生成文档内唯一的标签：base、base2、base3…… */
export function uniqueLabel(doc: GraphDoc, base: string): string {
  if (!findNodeByLabel(doc, base)) return base
  let index = 2
  while (findNodeByLabel(doc, `${base}${index}`)) index += 1
  return `${base}${index}`
}

/** 顶点键值属性（graphology node attrs 使用的形状） */
export interface NodeAttributes {
  label: string
  x: number
  y: number
}

/** 边属性（graphology edge attrs） */
export interface EdgeAttributes {
  edgeId: string
  weight: number | null
}

/**
 * 文档 → graphology：
 * - 节点 key = 节点 id（label 存于属性）；支持有向/无向混合、自环、重边（multi + mixed）；
 * - 引用不存在的端点的边被跳过（防御脏数据）。
 */
export function toGraphology(doc: GraphDoc): Graph<NodeAttributes, EdgeAttributes> {
  const graph = new Graph<NodeAttributes, EdgeAttributes>({
    multi: true,
    type: 'mixed',
    allowSelfLoops: true,
  })
  for (const node of doc.nodes) {
    graph.addNode(node.id, { label: node.label, x: node.x, y: node.y })
  }
  for (const edge of doc.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue
    const attrs: EdgeAttributes = { edgeId: edge.id, weight: edge.weight }
    if (edge.directed) graph.addDirectedEdge(edge.source, edge.target, attrs)
    else graph.addUndirectedEdge(edge.source, edge.target, attrs)
  }
  return graph
}

/** 布局/算法结果（graphology 节点 x/y 属性）回写到文档坐标（返回新文档，不可变更新） */
export function applyPositions(
  doc: GraphDoc,
  graph: Graph<NodeAttributes, EdgeAttributes>,
): GraphDoc {
  return {
    nodes: doc.nodes.map((node) => {
      if (!graph.hasNode(node.id)) return node
      const attrs = graph.getNodeAttributes(node.id)
      return { ...node, x: attrs.x, y: attrs.y }
    }),
    edges: doc.edges,
  }
}

/** 序列化（纯 JSON） */
export function serializeGraphDoc(doc: GraphDoc): string {
  return JSON.stringify(doc)
}

/** 反序列化（最小校验；非法输入抛中文错误） */
export function deserializeGraphDoc(text: string): GraphDoc {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('图数据不是合法 JSON')
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('图数据必须是对象')
  const record = raw as Record<string, unknown>
  if (!Array.isArray(record['nodes']) || !Array.isArray(record['edges'])) {
    throw new Error('图数据缺少 nodes / edges 数组')
  }
  const nodes = record['nodes'] as unknown[]
  const edges = record['edges'] as unknown[]
  for (const [index, node] of nodes.entries()) {
    if (typeof node !== 'object' || node === null) throw new Error(`第 ${index} 个顶点不是对象`)
    const n = node as Record<string, unknown>
    if (
      typeof n['id'] !== 'string' ||
      typeof n['label'] !== 'string' ||
      typeof n['x'] !== 'number' ||
      typeof n['y'] !== 'number'
    ) {
      throw new Error(`第 ${index} 个顶点缺少 id/label/x/y`)
    }
  }
  for (const [index, edge] of edges.entries()) {
    if (typeof edge !== 'object' || edge === null) throw new Error(`第 ${index} 条边不是对象`)
    const e = edge as Record<string, unknown>
    if (
      typeof e['id'] !== 'string' ||
      typeof e['source'] !== 'string' ||
      typeof e['target'] !== 'string'
    ) {
      throw new Error(`第 ${index} 条边缺少 id/source/target`)
    }
  }
  // 规范化：补齐可选字段默认值
  return {
    nodes: nodes.map((node) => {
      const n = node as Record<string, unknown>
      return {
        id: n['id'] as string,
        label: n['label'] as string,
        x: n['x'] as number,
        y: n['y'] as number,
        color: typeof n['color'] === 'string' ? n['color'] : (NODE_PALETTE[0] as string),
        size: typeof n['size'] === 'number' ? n['size'] : DEFAULT_NODE_SIZE,
        shape:
          n['shape'] === 'square' || n['shape'] === 'diamond'
            ? (n['shape'] as NodeShape)
            : 'circle',
        attrs:
          typeof n['attrs'] === 'object' && n['attrs'] !== null
            ? (n['attrs'] as Record<string, string | number>)
            : {},
      }
    }),
    edges: edges.map((edge) => {
      const e = edge as Record<string, unknown>
      return {
        id: e['id'] as string,
        source: e['source'] as string,
        target: e['target'] as string,
        directed: e['directed'] === true,
        weight: typeof e['weight'] === 'number' ? e['weight'] : null,
        color: typeof e['color'] === 'string' ? e['color'] : DEFAULT_EDGE_COLOR,
        style: e['style'] === 'dashed' ? 'dashed' : 'solid',
      }
    }),
  }
}
