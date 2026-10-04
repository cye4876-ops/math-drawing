/**
 * 超图实验规格与分层计划（v2.7）：移植自原实验台 hypergraph_spec.py。
 * 校验规则与原版一致（含逐层扩展的规模上限；智能模式规模提示为浏览器版说明）。
 */
import { parseClaim, ClaimError, type ClaimNode } from './claims'
import {
  validateHypergraphInput,
  HYPER_PATTERNS,
  type HyperPatternKey,
  type PatternMode,
} from './hypergraph'

export type HyperObjective = 'max_edges' | 'counterexample'
export type TriState = 'any' | 'yes' | 'no'
export type HyperStrategy = 'auto' | 'enumerate'

export interface CustomHyperPattern {
  title: string
  n: number
  edges: number[][]
}

export interface HyperSpec {
  title: string
  nMin: number
  nMax: number
  r: number
  objective: HyperObjective
  claim: string
  linear: TriState
  connected: TriState
  minEdges: number | null
  maxEdges: number | null
  minDegree: number | null
  maxDegree: number | null
  maxCodegree: number | null
  forbidden: HyperPatternKey[]
  customForbidden: CustomHyperPattern[]
  forbiddenMode: PatternMode
  timeLimit: number
  nodeBudget: number
  strategy: HyperStrategy
}

export const HYPER_VARIABLES = new Set([
  'n',
  'm',
  'r',
  'rank',
  'delta',
  'Delta',
  'nu',
  'tau',
  'alpha',
  'codegree',
  'linear',
  'connected',
  'regular',
])

export const HYPER_BOOLEANS = new Set(['linear', 'connected', 'regular'])

export const DEFAULT_HYPER_SPEC: HyperSpec = {
  title: '线性 3 一致超图的边数极值',
  nMin: 6,
  nMax: 6,
  r: 3,
  objective: 'max_edges',
  claim: 'tau <= nu',
  linear: 'yes',
  connected: 'any',
  minEdges: null,
  maxEdges: null,
  minDegree: null,
  maxDegree: null,
  maxCodegree: null,
  forbidden: [],
  customForbidden: [],
  forbiddenMode: 'subgraph',
  timeLimit: 120,
  nodeBudget: 5_000_000,
  strategy: 'auto',
}

export class HyperSpecError extends Error {}

function integer(value: unknown, name: string, lo: number, hi: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < lo || value > hi) {
    throw new HyperSpecError(`${name}须为 ${lo}–${hi} 之间的整数`)
  }
  return value
}

export function validateHyperSpec(input: unknown): HyperSpec {
  if (typeof input !== 'object' || input === null) throw new HyperSpecError('超图实验参数须为对象')
  const payload = input as Partial<HyperSpec>
  const known = new Set(Object.keys(DEFAULT_HYPER_SPEC))
  for (const key of Object.keys(payload)) {
    if (!known.has(key)) throw new HyperSpecError(`未知超图实验参数：${key}`)
  }
  const spec: HyperSpec = { ...DEFAULT_HYPER_SPEC, ...payload }
  if (
    typeof spec.title !== 'string' ||
    spec.title.trim().length < 1 ||
    spec.title.trim().length > 100
  ) {
    throw new HyperSpecError('实验名称须为 1–100 个字符')
  }
  spec.title = spec.title.trim()
  spec.r = integer(spec.r, '一致阶数 r', 2, 4)
  spec.nMin = integer(spec.nMin, '搜索顶点数', spec.r, 12)
  spec.nMax = integer(spec.nMax, '搜索顶点数', spec.r, 12)
  if (spec.nMin > spec.nMax) throw new HyperSpecError('顶点数下限不能大于上限')
  if (!['max_edges', 'counterexample'].includes(spec.objective)) {
    throw new HyperSpecError('超图搜索目标须为边数极值或反例')
  }
  for (const key of ['linear', 'connected'] as const) {
    if (!['any', 'yes', 'no'].includes(spec[key]))
      throw new HyperSpecError('超图性质须为不限、是或否')
  }
  if (!['auto', 'enumerate'].includes(spec.strategy)) {
    throw new HyperSpecError('超图搜索策略须为 auto 或 enumerate')
  }
  const referenceMax = spec.r === 2 || (spec.r === 3 && spec.linear === 'yes') ? 7 : 6
  if (spec.strategy === 'enumerate' && spec.nMax > referenceMax) {
    throw new HyperSpecError(
      `逐层扩展对照在当前条件下至多 ${referenceMax} 点；扩大规模请选择智能搜索`,
    )
  }
  for (const key of ['minEdges', 'maxEdges', 'minDegree', 'maxDegree', 'maxCodegree'] as const) {
    if (spec[key] !== null) spec[key] = integer(spec[key], key, 0, 80)
  }
  if (spec.minEdges !== null && spec.maxEdges !== null && spec.minEdges > spec.maxEdges) {
    throw new HyperSpecError('条件下限不能大于上限')
  }
  if (spec.minDegree !== null && spec.maxDegree !== null && spec.minDegree > spec.maxDegree) {
    throw new HyperSpecError('条件下限不能大于上限')
  }
  if (
    !Array.isArray(spec.forbidden) ||
    spec.forbidden.some((key) => !HYPER_PATTERNS.includes(key))
  ) {
    throw new HyperSpecError('未知超图禁图；支持 K4_3 与 loose_triangle')
  }
  spec.forbidden = [...new Set(spec.forbidden)].sort()
  if (spec.forbidden.length > 0 && spec.r !== 3) {
    throw new HyperSpecError('内置禁超图仅适用于 3 一致搜索')
  }
  if (!['subgraph', 'induced'].includes(spec.forbiddenMode)) {
    throw new HyperSpecError('禁超图模式须为普通包含或诱导包含')
  }
  if (!Array.isArray(spec.customForbidden) || spec.customForbidden.length > 3) {
    throw new HyperSpecError('自定义禁超图须为列表，最多 3 个')
  }
  spec.customForbidden = spec.customForbidden.map((pattern, index) => {
    if (typeof pattern !== 'object' || pattern === null) {
      throw new HyperSpecError('每个自定义禁超图仅含 title、n 和 edges 字段')
    }
    const extra = Object.keys(pattern).filter((key) => !['title', 'n', 'edges'].includes(key))
    if (extra.length > 0) throw new HyperSpecError('每个自定义禁超图仅含 title、n 和 edges 字段')
    const title = pattern.title ?? `自定义禁超图 ${index + 1}`
    if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 100) {
      throw new HyperSpecError('自定义禁超图名称须为 1–100 个字符')
    }
    const n = pattern.n
    if (typeof n !== 'number' || !Number.isInteger(n) || n < spec.r || n > 7) {
      throw new HyperSpecError(`禁超图顶点数须为 ${spec.r}–7 之间的整数`)
    }
    if (!Array.isArray(pattern.edges) || pattern.edges.length < 1 || pattern.edges.length > 35) {
      throw new HyperSpecError('自定义禁超图须含 1–35 条非空超边')
    }
    let graph: { n: number; edges: number[][] }
    try {
      graph = validateHypergraphInput({ n, edges: pattern.edges })
    } catch (error) {
      throw new HyperSpecError(error instanceof Error ? error.message : '自定义禁超图无效')
    }
    if (graph.edges.some((edge) => edge.length !== spec.r)) {
      throw new HyperSpecError('自定义禁超图的每条超边大小须与搜索的一致阶数 r 相同')
    }
    return { title: title.trim(), n, edges: graph.edges }
  })
  if (typeof spec.claim !== 'string') throw new HyperSpecError('猜想须为字符串')
  if (spec.objective === 'counterexample') parseHyperClaim(spec)
  spec.timeLimit = integer(spec.timeLimit, '时间预算（秒）', 1, 1800)
  spec.nodeBudget = integer(spec.nodeBudget, '生成预算（节点）', 10_000, 200_000_000)
  return spec
}

/** 校验猜想（在给定规格上下文内） */
export function parseHyperClaim(spec: HyperSpec): ClaimNode {
  try {
    return parseClaim(spec.claim, { variables: HYPER_VARIABLES, booleans: HYPER_BOOLEANS })
  } catch (error) {
    if (error instanceof ClaimError) throw new HyperSpecError(error.message)
    throw error
  }
}

export interface HyperBoundReason {
  label: string
  value?: number
  formula?: string
}

export interface HyperOrderPlan {
  n: number
  r: number
  edgeMin: number
  edgeMax: number
  edgeUniverse: number
  impossible: boolean
  bounds: HyperBoundReason[]
  mode: 'descending_edges' | 'ascending_counterexample' | 'enumerate'
}

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1)
  return Math.round(result)
}

/** 单阶计划（移植自 hypergraph_spec._order_plan） */
export function hyperOrderPlan(n: number, spec: HyperSpec): HyperOrderPlan {
  const r = spec.r
  let upper = comb(n, r)
  const bounds: HyperBoundReason[] = [
    { label: '简单 r 一致超图', value: upper, formula: 'm ≤ C(n,r)' },
  ]
  if (spec.maxEdges !== null) {
    upper = Math.min(upper, spec.maxEdges)
    bounds.push({ label: '指定超边数上限', value: spec.maxEdges })
  }
  if (spec.maxDegree !== null) {
    const bound = Math.floor((n * spec.maxDegree) / r)
    upper = Math.min(upper, bound)
    bounds.push({ label: '度数握手界', value: bound, formula: 'rm ≤ nΔ' })
  }
  let codegreeLimit = spec.maxCodegree
  if (spec.linear === 'yes') codegreeLimit = codegreeLimit === null ? 1 : Math.min(codegreeLimit, 1)
  if (codegreeLimit !== null) {
    const bound = Math.floor((comb(n, 2) * codegreeLimit) / comb(r, 2))
    upper = Math.min(upper, bound)
    bounds.push({ label: '顶点对计数界', value: bound, formula: 'C(r,2)m ≤ C(n,2)·最大共度' })
    if (spec.strategy === 'auto') {
      const degreeBound = Math.floor(((n - 1) * codegreeLimit) / (r - 1))
      let bound2 = Math.floor((n * degreeBound) / r)
      upper = Math.min(upper, bound2)
      bounds.push({
        label: '逐顶点共度与握手界',
        value: bound2,
        formula: 'm ≤ ⌊n·⌊(n−1)c/(r−1)⌋/r⌋',
      })
      // 三一致：剩余共度图各点度为偶数，不可能仅剩一条顶点对
      if (
        r === 3 &&
        ((n - 1) * codegreeLimit) % 2 === 0 &&
        comb(n, 2) * codegreeLimit - 3 * bound2 === 1
      ) {
        bound2 -= 1
        upper = Math.min(upper, bound2)
        bounds.push({
          label: '三一致剩余顶点对奇偶界',
          value: bound2,
          formula: '剩余共度图各点度为偶数，不可能仅剩一条顶点对',
        })
      }
    }
  }
  let lower = spec.minEdges ?? 0
  if (spec.minDegree !== null) lower = Math.max(lower, Math.ceil((n * spec.minDegree) / r))
  if (spec.connected === 'yes') lower = Math.max(lower, Math.ceil((n - 1) / (r - 1)))
  const universe = comb(n, r)
  const mode: HyperOrderPlan['mode'] =
    spec.strategy === 'enumerate'
      ? 'enumerate'
      : spec.objective === 'max_edges'
        ? 'descending_edges'
        : 'ascending_counterexample'
  return {
    n,
    r,
    edgeMin: lower,
    edgeMax: upper,
    edgeUniverse: universe,
    impossible: lower > upper,
    bounds,
    mode,
  }
}
