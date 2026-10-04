/**
 * 搜索限制与分层计划（v2.7）：移植自原实验台 planner.py。
 * - hereditaryEdgeUpper：删点后仍成立的性质给出的边数上界
 *   （claw→Δ≤2、K3/二部→⌊n²/4⌋、普通 C4→公共邻点计数界）；
 * - orderPlan：单阶计划（边数范围、不可行判定、上界来源列表、标号空间大小）。
 * 上界只是数学限制；原始标号空间不等于实际生成量，也不是预计用时。
 */
import type { GraphSpec } from './spec'

export interface BoundReason {
  label: string
  lower?: number
  upper?: number
  formula?: string
}

export type PlanMode =
  'descending_edges' | 'ascending_counterexample' | 'spectral_bounds' | 'enumerate'

export interface OrderPlan {
  n: number
  mode: PlanMode
  edgeMin: number
  edgeMax: number
  impossible: boolean
  bounds: BoundReason[]
  /** 2^C(n,2) 的十进制字符串 */
  labelledSpace: string
  deletionUpper: number | null
}

function tri(n: number): number {
  return (n * (n - 1)) / 2
}

/** 删去一个顶点后仍成立的边数上界（不继承不被删点保持的条件） */
export function hereditaryEdgeUpper(n: number, spec: GraphSpec): number {
  if (n <= 0) return 0
  let high = tri(n)
  let maximum = spec.maxDegree ?? n - 1
  if (spec.degreeSequence.length > 0) {
    maximum = Math.min(maximum, Math.max(...spec.degreeSequence))
  }
  if (spec.forbidden.includes('claw') && spec.forbiddenMode === 'subgraph')
    maximum = Math.min(maximum, 2)
  high = Math.min(high, Math.floor((n * maximum) / 2))
  if (spec.forbidden.includes('K3') || spec.bipartite === 'yes')
    high = Math.min(high, Math.floor((n * n) / 4))
  if (spec.forbidden.includes('C4') && spec.forbiddenMode === 'subgraph') {
    while (4 * high * high - 2 * high * n > n * n * (n - 1)) high--
  }
  return high
}

export function orderPlan(n: number, spec: GraphSpec): OrderPlan {
  const auto = spec.strategy === 'auto'
  let low = spec.minEdges ?? 0
  let high = Math.min(spec.maxEdges ?? tri(n), tri(n))
  let minimum = spec.minDegree ?? 0
  let maximum = Math.min(spec.maxDegree ?? n - 1, n - 1)
  const reasons: BoundReason[] = [{ label: '简单图上界', upper: tri(n) }]
  const forbidden = new Set(spec.forbidden)
  const ordinary = spec.forbiddenMode === 'subgraph'

  if (auto) {
    if (spec.forbidden.includes('claw') && ordinary) {
      // 禁普通 K₁,₃ 等价于最大度至多 2（任一度 ≥3 的顶点都含爪作为子图）
      maximum = Math.min(maximum, 2)
      reasons.push({ label: '禁普通 K₁,₃ 等价于最大度至多 2', upper: n })
    }
    if (spec.degreeSequence.length > 0) {
      const sequence = spec.degreeSequence
      minimum = Math.max(minimum, Math.min(...sequence))
      maximum = Math.min(maximum, Math.max(...sequence))
      const total = sequence.reduce((a, b) => a + b, 0)
      low = Math.max(low, Math.ceil(total / 2))
      high = Math.min(high, Math.floor(total / 2))
      reasons.push({
        label: '度序列的握手等式',
        lower: Math.ceil(total / 2),
        upper: Math.floor(total / 2),
      })
    }
    if (spec.connected === 'yes') {
      low = Math.max(low, n - 1)
      reasons.push({ label: '连通图至少 n−1 条边', lower: n - 1 })
    }
    low = Math.max(low, Math.ceil((n * minimum) / 2))
    high = Math.min(high, Math.floor((n * maximum) / 2))
    reasons.push({
      label: '握手引理与度界',
      lower: Math.ceil((n * minimum) / 2),
      upper: Math.floor((n * maximum) / 2),
    })
    if (forbidden.has('K3') || spec.bipartite === 'yes') {
      const bound = Math.floor((n * n) / 4)
      high = Math.min(high, bound)
      reasons.push({
        label: '无三角形 / 二部图边数上界',
        upper: bound,
        formula: 'ex(n, K₃) = ⌊n²/4⌋（Mantel）',
      })
    }
    if (forbidden.has('C4') && ordinary) {
      // 无普通 C4：任两顶点至多一个公共邻点，Σ C(d(v),2) ≤ C(n,2)，
      // 即 4m² − 2mn ≤ n²(n−1)，由 m 从 C(n,2) 向下检查。
      let bound = tri(n)
      while (4 * bound * bound - 2 * bound * n > n * n * (n - 1)) bound--
      high = Math.min(high, bound)
      reasons.push({
        label: '无普通 C₄：公共邻点计数上界',
        upper: bound,
        formula: '4m² − 2mn ≤ n²(n−1)',
      })
    }
  }

  const mode: PlanMode =
    spec.strategy === 'enumerate'
      ? 'enumerate'
      : spec.objective === 'max_edges'
        ? 'descending_edges'
        : spec.objective === 'counterexample'
          ? 'ascending_counterexample'
          : 'spectral_bounds'

  return {
    n,
    mode,
    edgeMin: low,
    edgeMax: high,
    impossible: low > high || minimum > maximum,
    bounds: reasons,
    labelledSpace: (1n << BigInt(tri(n))).toString(),
    deletionUpper: auto ? hereditaryEdgeUpper(n - 1, spec) : null,
  }
}

export interface SearchPlan {
  strategy: GraphSpec['strategy']
  orders: OrderPlan[]
  note: string
}

export function searchPlan(spec: GraphSpec): SearchPlan {
  const orders: OrderPlan[] = []
  for (let n = spec.nMin; n <= spec.nMax; n++) orders.push(orderPlan(n, spec))
  return {
    strategy: spec.strategy,
    orders,
    note: '上界是数学限制；原始标号空间不等于实际生成量，也不是预计用时。',
  }
}
