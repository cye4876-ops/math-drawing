/**
 * 平面性 / 禁用子图检测（v0.5「禁图」）：
 * 按 Kuratowski 定理方向检测 **K5 与 K3,3** 两种禁用子图，并辅以平面图必要条件（边数判据）：
 * - 找到 K5 / K3,3 **直接子图** → 确定非平面（给出证据顶点，可高亮）；
 * - 边数超过 3n−6（或 n≥3 无三角形时超过 2n−4）→ 确定非平面（必要条件不满足）；
 * - 未发现冲突 → 返回「未发现冲突（可能平面）」——注意：不含细分/minor 的完整判定，
 *   例如 Petersen 图不含 K5/K3,3 直接子图但（作为 minor）非平面，属已知局限。
 *
 * 语义：平面性是**无向简单图**性质——检测时忽略方向、多重边与自环。
 * 规模保护：顶点数 > 40 时跳过子图枚举（仅边数判据）。
 */
import type { GraphObject } from './model'

export type ForbiddenKind = 'K5' | 'K3,3' | 'edge-bound'

export interface PlanarityResult {
  /** true = 未发现冲突（可能平面）；false = 确定非平面；null = 规模超限未完整判定 */
  planar: boolean | null
  /** 判定依据说明（中文，可直接展示） */
  reason: string
  /** 命中的禁用子图类型（无则为 null） */
  forbidden: ForbiddenKind | null
  /** 禁用子图证据顶点 id 列表（供画布高亮；边数判据无单点证据） */
  evidence: string[] | null
}

const SUBGRAPH_LIMIT = 40

/** 简化图：忽略方向/多重边/自环后的邻接矩阵与边数 */
function simplify(graph: GraphObject): {
  ids: string[]
  adj: boolean[][]
  edgeCount: number
} {
  const ids = graph.nodes.map((node) => node.id)
  const n = ids.length
  const index = new Map(ids.map((id, i) => [id, i]))
  const adj: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  let edgeCount = 0
  for (const edge of graph.edges) {
    const i = index.get(edge.source)
    const j = index.get(edge.target)
    if (i === undefined || j === undefined || i === j) continue
    if (!adj[i]![j]) {
      adj[i]![j] = true
      adj[j]![i] = true
      edgeCount += 1
    }
  }
  return { ids, adj, edgeCount }
}

/** 是否存在三角形（n ≤ 40 时 O(n³) 可接受） */
function hasTriangle(adj: boolean[][], n: number): boolean {
  for (let a = 0; a < n - 2; a++) {
    for (let b = a + 1; b < n - 1; b++) {
      if (!adj[a]![b]) continue
      for (let c = b + 1; c < n; c++) {
        if (adj[a]![c] && adj[b]![c]) return true
      }
    }
  }
  return false
}

/** 查找 K5 子图（五重循环 + 强剪枝：每个新顶点须与全部已选顶点相邻） */
function findK5(adj: boolean[][], n: number): number[] | null {
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      if (!adj[a]![b]) continue
      for (let c = b + 1; c < n - 2; c++) {
        if (!adj[a]![c] || !adj[b]![c]) continue
        for (let d = c + 1; d < n - 1; d++) {
          if (!adj[a]![d] || !adj[b]![d] || !adj[c]![d]) continue
          for (let e = d + 1; e < n; e++) {
            if (adj[a]![e] && adj[b]![e] && adj[c]![e] && adj[d]![e]) {
              return [a, b, c, d, e]
            }
          }
        }
      }
    }
  }
  return null
}

/**
 * 查找 K3,3 子图：一对顶点 (a,b)（同侧）共享 ≥3 个公共邻点，
 * 再取第三个同侧顶点 x（也与某三个公共邻点全部相邻）→ {a,b,x} × Y 完全二分。
 */
function findK33(adj: boolean[][], n: number): number[] | null {
  for (let a = 0; a < n - 2; a++) {
    for (let b = a + 1; b < n - 1; b++) {
      const common: number[] = []
      for (let c = 0; c < n; c++) {
        if (c !== a && c !== b && adj[a]![c] && adj[b]![c]) common.push(c)
      }
      if (common.length < 3) continue
      // 枚举三元素公共邻点组合 Y
      for (let i = 0; i < common.length - 2; i++) {
        for (let j = i + 1; j < common.length - 1; j++) {
          for (let k = j + 1; k < common.length; k++) {
            const y1 = common[i]!
            const y2 = common[j]!
            const y3 = common[k]!
            // 第三个同侧点 x：与 y1..y3 全部相邻
            for (let x = 0; x < n; x++) {
              if (x === a || x === b || x === y1 || x === y2 || x === y3) continue
              if (adj[x]![y1] && adj[x]![y2] && adj[x]![y3]) {
                return [a, b, x, y1, y2, y3]
              }
            }
          }
        }
      }
    }
  }
  return null
}

/** 平面性 / 禁用子图检测（结果含中文依据，可直接展示） */
export function detectPlanarity(graph: GraphObject): PlanarityResult {
  const { ids, adj, edgeCount } = simplify(graph)
  const n = ids.length
  if (n <= 4) {
    return {
      planar: true,
      reason: `顶点数 ${n} ≤ 4：任何简单图都是平面图`,
      forbidden: null,
      evidence: null,
    }
  }
  if (n <= SUBGRAPH_LIMIT) {
    const k5 = findK5(adj, n)
    if (k5) {
      return {
        planar: false,
        reason: '含 K5 子图（Kuratowski 禁用子图）',
        forbidden: 'K5',
        evidence: k5.map((i) => ids[i]!),
      }
    }
    const k33 = findK33(adj, n)
    if (k33) {
      return {
        planar: false,
        reason: '含 K3,3 子图（Kuratowski 禁用子图）',
        forbidden: 'K3,3',
        evidence: k33.map((i) => ids[i]!),
      }
    }
  }
  if (edgeCount > 3 * n - 6) {
    return {
      planar: false,
      reason: `边数 ${edgeCount} > 3n − 6 = ${3 * n - 6}（平面图必要条件不满足）`,
      forbidden: 'edge-bound',
      evidence: null,
    }
  }
  if (!hasTriangle(adj, n) && edgeCount > 2 * n - 4) {
    return {
      planar: false,
      reason: `无三角形且边数 ${edgeCount} > 2n − 4 = ${2 * n - 4}（平面图必要条件不满足）`,
      forbidden: 'edge-bound',
      evidence: null,
    }
  }
  if (n > SUBGRAPH_LIMIT) {
    return {
      planar: null,
      reason: `顶点数较大（${n}）：仅完成边数判据，禁用子图枚举已跳过`,
      forbidden: null,
      evidence: null,
    }
  }
  return {
    planar: true,
    reason: '未发现 K5/K3,3 直接子图与边数冲突（不含细分/minor 判定，可能平面）',
    forbidden: null,
    evidence: null,
  }
}
