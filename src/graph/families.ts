/**
 * 预置图族（v0.5）：返回**结构**（标签 + 边）；坐标由布局阶段填充。
 * `specToDoc` 提供「结构 → 图文档」转换（初始坐标 = 环形均布），供 UI 一键生成使用。
 * 参数均有上界保护，防止误输入生成超大图。
 */
import {
  createEdge,
  createNode,
  paletteColor,
  type GraphDoc,
  type GraphEdgeData,
  type GraphNodeData,
} from './model'

export type FamilyKind =
  'complete' | 'complete-bipartite' | 'cycle' | 'path' | 'tree' | 'petersen' | 'hypercube' | 'grid'

export interface FamilyEdge {
  source: string
  target: string
}

export interface FamilySpec {
  labels: string[]
  edges: FamilyEdge[]
}

export interface FamilyParams {
  n?: number
  m?: number
  rows?: number
  cols?: number
}

/** 图族清单（UI 下拉使用）：参数名列表为空 = 无参数 */
export interface FamilyInfo {
  kind: FamilyKind
  name: string
  /** 需要的参数（顺序与默认值见 DEFAULT_PARAMS） */
  params: ('n' | 'm' | 'rows' | 'cols')[]
}

export const FAMILIES: FamilyInfo[] = [
  { kind: 'complete', name: '完全图 K_n', params: ['n'] },
  { kind: 'complete-bipartite', name: '二分图 K_m,n', params: ['m', 'n'] },
  { kind: 'cycle', name: '环 C_n', params: ['n'] },
  { kind: 'path', name: '路 P_n', params: ['n'] },
  { kind: 'tree', name: '完全二叉树（n 个节点）', params: ['n'] },
  { kind: 'petersen', name: 'Petersen 图', params: [] },
  { kind: 'hypercube', name: '超立方体 Q_k', params: ['n'] },
  { kind: 'grid', name: '网格 rows×cols', params: ['rows', 'cols'] },
]

export const DEFAULT_PARAMS: Required<FamilyParams> = { n: 5, m: 3, rows: 3, cols: 4 }

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const raw = value === undefined || !Number.isFinite(value) ? fallback : Math.round(value)
  return Math.min(max, Math.max(min, raw))
}

export function createFamily(kind: FamilyKind, params: FamilyParams = {}): FamilySpec {
  const labels: string[] = []
  const edges: FamilyEdge[] = []
  const numberLabels = (count: number): string[] =>
    Array.from({ length: count }, (_, i) => String(i + 1))

  switch (kind) {
    case 'complete': {
      const n = clampInt(params.n, DEFAULT_PARAMS.n, 2, 64)
      labels.push(...numberLabels(n))
      for (let i = 1; i <= n; i++) {
        for (let j = i + 1; j <= n; j++) {
          edges.push({ source: String(i), target: String(j) })
        }
      }
      break
    }
    case 'complete-bipartite': {
      const m = clampInt(params.m, DEFAULT_PARAMS.m, 1, 32)
      const n = clampInt(params.n, DEFAULT_PARAMS.n, 1, 32)
      const left = Array.from({ length: m }, (_, i) => `a${i + 1}`)
      const right = Array.from({ length: n }, (_, i) => `b${i + 1}`)
      labels.push(...left, ...right)
      for (const a of left) {
        for (const b of right) edges.push({ source: a, target: b })
      }
      break
    }
    case 'cycle': {
      const n = clampInt(params.n, DEFAULT_PARAMS.n, 3, 64)
      labels.push(...numberLabels(n))
      for (let i = 1; i <= n; i++) {
        edges.push({ source: String(i), target: String((i % n) + 1) })
      }
      break
    }
    case 'path': {
      const n = clampInt(params.n, DEFAULT_PARAMS.n, 1, 64)
      labels.push(...numberLabels(n))
      for (let i = 1; i < n; i++) {
        edges.push({ source: String(i), target: String(i + 1) })
      }
      break
    }
    case 'tree': {
      const n = clampInt(params.n, DEFAULT_PARAMS.n, 1, 64)
      labels.push(...numberLabels(n))
      for (let i = 2; i <= n; i++) {
        edges.push({ source: String(Math.floor(i / 2)), target: String(i) })
      }
      break
    }
    case 'petersen': {
      // 外环 u0..u4、内星 v0..v4（v_i 连 v_{i+2}）、辐条 u_i—v_i
      labels.push(...Array.from({ length: 5 }, (_, i) => `u${i}`))
      labels.push(...Array.from({ length: 5 }, (_, i) => `v${i}`))
      for (let i = 0; i < 5; i++) {
        edges.push({ source: `u${i}`, target: `u${(i + 1) % 5}` })
        edges.push({ source: `v${i}`, target: `v${(i + 2) % 5}` })
        edges.push({ source: `u${i}`, target: `v${i}` })
      }
      break
    }
    case 'hypercube': {
      const k = clampInt(params.n, 3, 1, 6)
      const count = 2 ** k
      labels.push(...Array.from({ length: count }, (_, i) => i.toString(2).padStart(k, '0')))
      for (let i = 0; i < count; i++) {
        for (let bit = 0; bit < k; bit++) {
          const j = i ^ (1 << bit)
          if (j > i) {
            edges.push({
              source: i.toString(2).padStart(k, '0'),
              target: j.toString(2).padStart(k, '0'),
            })
          }
        }
      }
      break
    }
    case 'grid': {
      const rows = clampInt(params.rows, DEFAULT_PARAMS.rows, 1, 12)
      const cols = clampInt(params.cols, DEFAULT_PARAMS.cols, 1, 12)
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) labels.push(`${r}x${c}`)
      }
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          if (c < cols) edges.push({ source: `${r}x${c}`, target: `${r}x${c + 1}` })
          if (r < rows) edges.push({ source: `${r}x${c}`, target: `${r + 1}x${c}` })
        }
      }
      break
    }
  }
  return { labels, edges }
}

/**
 * 结构 → 图文档：顶点按环形均布（半径默认 3），边全部无向无权重。
 * 生成后通常接一次布局算法（或用户手动拖动）。
 */
export function specToDoc(spec: FamilySpec, options: { radius?: number } = {}): GraphDoc {
  const radius = options.radius ?? 3
  const count = spec.labels.length
  const nodes: GraphNodeData[] = spec.labels.map((label, index) => {
    const angle = count > 0 ? (index / count) * Math.PI * 2 : 0
    const node = createNode(
      label,
      radius * Math.cos(angle),
      radius * Math.sin(angle),
      paletteColor(index),
    )
    return node
  })
  const byLabel = new Map(nodes.map((node) => [node.label, node]))
  const edges: GraphEdgeData[] = []
  for (const edge of spec.edges) {
    const source = byLabel.get(edge.source)
    const target = byLabel.get(edge.target)
    if (!source || !target) continue
    edges.push(createEdge(source.id, target.id))
  }
  return { nodes, edges }
}
