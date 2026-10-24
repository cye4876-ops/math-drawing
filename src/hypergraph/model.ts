/**
 * 超图实验室数据模型（v3.4）：
 * - 文档层为可序列化的顶点 / 超边数组（带 id、标签、颜色）；
 * - 支持紧凑 JSON（{name, n, edges:number[][]}）与完整文档 JSON 两种导入格式；
 * - 所有算法消费「成员索引」视图，便于与 src/lab/hypergraph.ts 的核验代码对接。
 */

export const HYPER_COLORS = [
  '#38bdf8',
  '#f97316',
  '#a3e635',
  '#e879f9',
  '#facc15',
  '#60a5fa',
  '#fb7185',
  '#34d399',
  '#c084fc',
  '#fbbf24',
] as const

export const HYPER_MAX_N = 12
export const HYPER_MAX_EDGES = 120

export interface HyperVertex {
  id: string
  label: string
  color: string
}

export interface HyperEdge {
  id: string
  label: string
  /** 成员顶点 id（顺序无关） */
  members: string[]
  color: string
  weight: number
}

export interface HypergraphDoc {
  name: string
  vertices: HyperVertex[]
  edges: HyperEdge[]
}

export class HypergraphFormatError extends Error {}

export function hyperColor(index: number): string {
  return HYPER_COLORS[((index % HYPER_COLORS.length) + HYPER_COLORS.length) % HYPER_COLORS.length]!
}

/** 由「顶点数 + 超边索引表」构造规范文档：成员升序、超边去重、标签自动生成 */
export function docFromEdgeSets(
  name: string,
  n: number,
  rawEdges: readonly (readonly number[])[],
): HypergraphDoc {
  if (!Number.isInteger(n) || n < 1 || n > HYPER_MAX_N) {
    throw new HypergraphFormatError(`顶点数须为 1–${HYPER_MAX_N} 的整数`)
  }
  const seen = new Set<string>()
  const edges: HyperEdge[] = []
  for (const raw of rawEdges) {
    if (raw.length === 0) throw new HypergraphFormatError('超边不能为空')
    const members = [...new Set(raw)].sort((a, b) => a - b)
    if (members.length !== raw.length) throw new HypergraphFormatError('同一超边内不能重复包含顶点')
    for (const member of members) {
      if (!Number.isInteger(member) || member < 0 || member >= n) {
        throw new HypergraphFormatError('超边成员须为 0 到 n−1 的整数')
      }
    }
    const key = members.join(',')
    if (seen.has(key)) continue
    seen.add(key)
    const index = edges.length
    edges.push({
      id: `e${index}`,
      label: `e${index + 1}`,
      members: members.map((value) => `v${value}`),
      color: hyperColor(index),
      weight: 1,
    })
    if (edges.length > HYPER_MAX_EDGES) {
      throw new HypergraphFormatError(`超边数超过上限 ${HYPER_MAX_EDGES}`)
    }
  }
  return {
    name,
    vertices: Array.from({ length: n }, (_, index) => ({
      id: `v${index}`,
      label: String(index),
      color: hyperColor(index + 3),
    })),
    edges,
  }
}

/** 文档 → 超边成员索引（无效引用会被跳过，保证算法层安全） */
export function memberIndices(doc: HypergraphDoc): number[][] {
  const index = new Map(doc.vertices.map((vertex, i) => [vertex.id, i]))
  const result: number[][] = []
  for (const edge of doc.edges) {
    const members = edge.members
      .map((id) => index.get(id))
      .filter((value): value is number => value !== undefined)
    if (members.length > 0) result.push([...new Set(members)].sort((a, b) => a - b))
  }
  return result
}

export function incidentEdgeIndices(doc: HypergraphDoc, vertexIndex: number): number[] {
  const vertexId = doc.vertices[vertexIndex]?.id
  if (!vertexId) return []
  const result: number[] = []
  doc.edges.forEach((edge, index) => {
    if (edge.members.includes(vertexId)) result.push(index)
  })
  return result
}

/** 紧凑 JSON（保留名称 / 顶点数 / 超边索引表；颜色由位置决定） */
export function docToJson(doc: HypergraphDoc): string {
  return JSON.stringify(
    { name: doc.name, n: doc.vertices.length, edges: memberIndices(doc) },
    null,
    2,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 解析 JSON：
 * 1) 紧凑格式 `{ name?, n, edges: number[][] }`
 * 2) 完整格式 `{ name, vertices: [...], edges: [{ members: [...] }] }`
 * 返回规范文档；失败抛出 HypergraphFormatError（中文消息）。
 */
export function parseHypergraphJson(text: string): HypergraphDoc {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new HypergraphFormatError('JSON 解析失败，请检查语法')
  }
  if (!isRecord(raw)) throw new HypergraphFormatError('超图 JSON 须为对象')
  const name =
    typeof raw['name'] === 'string' && raw['name'].trim() ? raw['name'].trim() : '导入超图'
  const edgesRaw = raw['edges']
  if (!Array.isArray(edgesRaw)) throw new HypergraphFormatError('缺少 edges 数组')
  if (Array.isArray(raw['vertices'])) {
    const verticesRaw = raw['vertices']
    if (verticesRaw.length < 1 || verticesRaw.length > HYPER_MAX_N) {
      throw new HypergraphFormatError(`顶点数须为 1–${HYPER_MAX_N}`)
    }
    const vertices: HyperVertex[] = verticesRaw.map((item, index) => {
      if (!isRecord(item)) throw new HypergraphFormatError(`第 ${index + 1} 个顶点须为对象`)
      const id = typeof item['id'] === 'string' && item['id'] ? item['id'] : `v${index}`
      const label =
        typeof item['label'] === 'string' && item['label'] ? item['label'] : String(index)
      const color =
        typeof item['color'] === 'string' && item['color'] ? item['color'] : hyperColor(index)
      return { id, label, color }
    })
    if (new Set(vertices.map((vertex) => vertex.id)).size !== vertices.length) {
      throw new HypergraphFormatError('顶点 id 不能重复')
    }
    const ids = new Set(vertices.map((vertex) => vertex.id))
    const seen = new Set<string>()
    const edges: HyperEdge[] = []
    for (const [index, item] of edgesRaw.entries()) {
      if (!isRecord(item)) throw new HypergraphFormatError(`第 ${index + 1} 条超边须为对象`)
      const membersRaw = item['members']
      if (!Array.isArray(membersRaw) || membersRaw.length === 0) {
        throw new HypergraphFormatError('每条超边须为非空成员列表')
      }
      const members: string[] = []
      for (const member of membersRaw) {
        if (typeof member !== 'string' || !ids.has(member)) {
          throw new HypergraphFormatError('超边成员须引用已声明的顶点 id')
        }
        if (!members.includes(member)) members.push(member)
      }
      const key = [...members].sort().join(',')
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({
        id: typeof item['id'] === 'string' && item['id'] ? item['id'] : `e${index}`,
        label: typeof item['label'] === 'string' && item['label'] ? item['label'] : `e${index + 1}`,
        members,
        color:
          typeof item['color'] === 'string' && item['color'] ? item['color'] : hyperColor(index),
        weight:
          typeof item['weight'] === 'number' && Number.isFinite(item['weight'])
            ? item['weight']
            : 1,
      })
      if (edges.length > HYPER_MAX_EDGES) {
        throw new HypergraphFormatError(`超边数超过上限 ${HYPER_MAX_EDGES}`)
      }
    }
    return { name, vertices, edges }
  }
  const n = raw['n']
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > HYPER_MAX_N) {
    throw new HypergraphFormatError(`顶点数 n 须为 1–${HYPER_MAX_N} 的整数`)
  }
  const edgeSets: number[][] = []
  for (const item of edgesRaw) {
    if (!Array.isArray(item)) throw new HypergraphFormatError('edges 的每一项须为成员数组')
    const members: number[] = []
    for (const member of item) {
      if (typeof member !== 'number' || !Number.isInteger(member)) {
        throw new HypergraphFormatError('超边成员须为整数')
      }
      members.push(member)
    }
    edgeSets.push(members)
  }
  return docFromEdgeSets(name, n, edgeSets)
}

/** 对偶超图：原超边 ↔ 新顶点；原顶点 ↔ 新超边（孤立原顶点不产生空超边） */
export function dualHypergraph(doc: HypergraphDoc): HypergraphDoc {
  const incident: string[][] = doc.vertices.map(() => [])
  doc.edges.forEach((edge) => {
    edge.members.forEach((memberId) => {
      const index = doc.vertices.findIndex((vertex) => vertex.id === memberId)
      if (index >= 0) incident[index]!.push(edge.id)
    })
  })
  const vertices: HyperVertex[] = doc.edges.map((edge, index) => ({
    id: `d${index}`,
    label: edge.label,
    color: edge.color,
  }))
  const dualIdOf = new Map(doc.edges.map((edge, index) => [edge.id, `d${index}`]))
  const edges: HyperEdge[] = []
  doc.vertices.forEach((vertex, index) => {
    if (incident[index]!.length === 0) return
    const members = incident[index]!.map((edgeId) => dualIdOf.get(edgeId)).filter(
      (id): id is string => id !== undefined,
    )
    edges.push({
      id: `de${index}`,
      label: vertex.label,
      members,
      color: vertex.color,
      weight: 1,
    })
  })
  return { name: `${doc.name} 的对偶`, vertices, edges }
}
