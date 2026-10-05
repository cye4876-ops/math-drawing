/**
 * 普通图实验规格（v2.7）：与原实验台 v5 的图搜索契约一致（字段名转为 camelCase）。
 * - 校验错误消息与原版保持一致风格（中文、指明范围）；
 * - 内置禁图：K3、K4、C4、C5、P4、claw（K₁,₃）；另支持一个自定义 graph6 禁图（≤10 顶点）。
 */
import { Graph6Error, parseGraph6 } from './graph6'
import { completeGraph, cycleGraph, emptyGraph, pathGraph, type LabGraph, addEdgeAt } from './graph'

export type ForbiddenKey = 'K3' | 'K4' | 'C4' | 'C5' | 'P4' | 'claw'

export const FORBIDDEN_KEYS: ForbiddenKey[] = ['K3', 'K4', 'C4', 'C5', 'P4', 'claw']

export const FORBIDDEN_NAMES: Record<ForbiddenKey, string> = {
  K3: 'K₃（三角形）',
  K4: 'K₄（4 团）',
  C4: 'C₄（4 圈）',
  C5: 'C₅（5 圈）',
  P4: 'P₄（4 点路）',
  claw: 'K₁,₃（爪）',
}

export type Objective =
  | 'max_edges'
  | 'max_spectral_radius'
  | 'max_signless_laplacian_radius'
  | 'max_algebraic_connectivity'
  | 'counterexample'
export type ForbiddenMode = 'subgraph' | 'induced'
export type TriState = 'any' | 'yes' | 'no'
export type SearchStrategy = 'auto' | 'enumerate'

/** 目标数学定义（结果区与面板展示用） */
export const OBJECTIVE_DEFINITIONS: Partial<Record<Objective, string>> = {
  max_spectral_radius: 'ρ(A)：邻接矩阵最大特征值',
  max_signless_laplacian_radius: 'q(Q)：无符号 Laplacian Q = D + A 的最大特征值',
  max_algebraic_connectivity: 'λ₂(L)：Laplacian L = D − A 的第二小特征值（不连通为 0）',
}

export interface GraphSpec {
  title: string
  nMin: number
  nMax: number
  objective: Objective
  forbidden: ForbiddenKey[]
  forbiddenMode: ForbiddenMode
  /** 自定义禁图 graph6（空串表示无） */
  customForbidden: string
  connected: TriState
  bipartite: TriState
  minDegree: number | null
  maxDegree: number | null
  minEdges: number | null
  maxEdges: number | null
  degreeSequence: number[]
  /** v3.0 结构条件：围长下限（≥ 3；不限为 null） */
  minGirth: number | null
  /** v3.0 结构条件：直径上限（不限为 null；不连通图不满足任何有限上限） */
  maxDiameter: number | null
  /** v3.0 结构条件：色数上限（不限为 null） */
  maxChromatic: number | null
  claim: string
  /** 时间预算（秒） */
  timeLimit: number
  /** 搜索预算：DFS 生成节点数上限（浏览器实现） */
  nodeBudget: number
  strategy: SearchStrategy
}

export const GRAPH_VARIABLES = new Set([
  'n',
  'm',
  'delta',
  'Delta',
  'omega',
  'alpha',
  'nu',
  'rho',
  'q',
  'lambda2',
  'triangles',
  'bipartite',
  'connected',
  'regular',
])

export const GRAPH_BOOLEANS = new Set(['bipartite', 'connected', 'regular'])

export const DEFAULT_GRAPH_SPEC: GraphSpec = {
  title: '无三角形图的边数极值',
  nMin: 6,
  nMax: 6,
  objective: 'max_edges',
  forbidden: ['K3'],
  forbiddenMode: 'subgraph',
  customForbidden: '',
  connected: 'any',
  bipartite: 'any',
  minDegree: null,
  maxDegree: null,
  minEdges: null,
  maxEdges: null,
  degreeSequence: [],
  minGirth: null,
  maxDiameter: null,
  maxChromatic: null,
  claim: 'bipartite',
  timeLimit: 120,
  nodeBudget: 5_000_000,
  strategy: 'auto',
}

export class SpecError extends Error {}

function integer(value: unknown, name: string, lo: number, hi: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < lo || value > hi) {
    throw new SpecError(`${name}须为 ${lo}–${hi} 之间的整数`)
  }
  return value
}

/** 校验并归一化图实验规格（原版 validate_spec 的移植） */
export function validateGraphSpec(input: unknown): GraphSpec {
  if (typeof input !== 'object' || input === null) throw new SpecError('实验参数必须为对象')
  const payload = input as Partial<GraphSpec>
  const known = new Set(Object.keys(DEFAULT_GRAPH_SPEC))
  for (const key of Object.keys(payload)) {
    if (!known.has(key)) throw new SpecError(`未知实验参数：${key}`)
  }
  const spec: GraphSpec = { ...DEFAULT_GRAPH_SPEC, ...payload }
  // 数字输入清空时绑定值可能为 undefined / 空串：统一归一为 null（不限）
  const optionalNumericKeys = [
    'minDegree',
    'maxDegree',
    'minEdges',
    'maxEdges',
    'minGirth',
    'maxDiameter',
    'maxChromatic',
  ] as const
  const mutable = spec as unknown as Record<string, unknown>
  for (const key of optionalNumericKeys) {
    if (mutable[key] === undefined || mutable[key] === '') mutable[key] = null
  }
  if (
    typeof spec.title !== 'string' ||
    spec.title.trim().length < 1 ||
    spec.title.trim().length > 100
  ) {
    throw new SpecError('实验名称须为 1–100 个字符')
  }
  spec.title = spec.title.trim()
  spec.nMin = integer(spec.nMin, '顶点数', 1, 16)
  spec.nMax = integer(spec.nMax, '顶点数', 1, 16)
  if (spec.nMin > spec.nMax) throw new SpecError('顶点数下限不能大于上限')
  if (
    ![
      'max_edges',
      'max_spectral_radius',
      'max_signless_laplacian_radius',
      'max_algebraic_connectivity',
      'counterexample',
    ].includes(spec.objective)
  ) {
    throw new SpecError('不支持的搜索目标')
  }
  if (!['auto', 'enumerate'].includes(spec.strategy)) {
    throw new SpecError('搜索策略须为智能精确搜索或逐图枚举')
  }
  if (!['subgraph', 'induced'].includes(spec.forbiddenMode)) {
    throw new SpecError('禁图模式须为普通子图或诱导子图')
  }
  if (
    !Array.isArray(spec.forbidden) ||
    spec.forbidden.some((key) => !FORBIDDEN_KEYS.includes(key))
  ) {
    throw new SpecError('未知禁图，请选择内置图或输入自定义 graph6')
  }
  spec.forbidden = [...new Set(spec.forbidden)].sort()
  if (typeof spec.customForbidden !== 'string' || spec.customForbidden.length > 100) {
    throw new SpecError('自定义禁图须为至多 100 字符的 graph6')
  }
  spec.customForbidden = spec.customForbidden.trim()
  if (spec.customForbidden) {
    try {
      const graph = parseGraph6(spec.customForbidden)
      if (graph.n > 10) throw new SpecError('自定义禁图至多 10 个顶点')
    } catch (error) {
      if (error instanceof Graph6Error) throw new SpecError(`自定义禁图无效：${error.message}`)
      throw error
    }
  }
  for (const key of ['connected', 'bipartite'] as const) {
    if (!['any', 'yes', 'no'].includes(spec[key])) throw new SpecError('图性质必须选择不限、是或否')
  }
  for (const key of ['minDegree', 'maxDegree', 'minEdges', 'maxEdges'] as const) {
    if (spec[key] !== null) {
      const hi = key.includes('Degree') ? 15 : 120
      spec[key] = integer(spec[key], key, 0, hi)
    }
  }
  if (spec.minGirth !== null) spec.minGirth = integer(spec.minGirth, '围长下限', 3, 16)
  if (spec.maxDiameter !== null) spec.maxDiameter = integer(spec.maxDiameter, '直径上限', 0, 16)
  if (spec.maxChromatic !== null) spec.maxChromatic = integer(spec.maxChromatic, '色数上限', 1, 16)
  if (spec.minDegree !== null && spec.maxDegree !== null && spec.minDegree > spec.maxDegree) {
    throw new SpecError('条件下限不能大于上限')
  }
  if (spec.minEdges !== null && spec.maxEdges !== null && spec.minEdges > spec.maxEdges) {
    throw new SpecError('条件下限不能大于上限')
  }
  if (!Array.isArray(spec.degreeSequence)) throw new SpecError('度序列须为 0–15 的整数列表')
  spec.degreeSequence = spec.degreeSequence
    .map((value) => {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 15) {
        throw new SpecError('度序列须为 0–15 的整数列表')
      }
      return value
    })
    .sort((a, b) => b - a)
  if (spec.degreeSequence.length > 0) {
    if (spec.nMin !== spec.nMax || spec.degreeSequence.length !== spec.nMin) {
      throw new SpecError('使用度序列时请固定顶点数，并为每个顶点提供一个度')
    }
  }
  if (typeof spec.claim !== 'string') throw new SpecError('猜想必须为字符串')
  spec.timeLimit = integer(spec.timeLimit, '时间预算（秒）', 1, 1800)
  spec.nodeBudget = integer(spec.nodeBudget, '生成预算（节点）', 10_000, 200_000_000)
  return spec
}

/** 内置禁图模式图 */
export function builtinPattern(key: ForbiddenKey): LabGraph {
  switch (key) {
    case 'K3':
      return completeGraph(3)
    case 'K4':
      return completeGraph(4)
    case 'C4':
      return cycleGraph(4)
    case 'C5':
      return cycleGraph(5)
    case 'P4':
      return pathGraph(4)
    case 'claw': {
      const g = emptyGraph(4)
      addEdgeAt(g, 0, 1)
      addEdgeAt(g, 0, 2)
      addEdgeAt(g, 0, 3)
      return g
    }
  }
}

/** 禁用模式集合：内置 + 自定义（含显示名） */
export function patternGraphs(
  spec: GraphSpec,
): Array<{ name: string; graph: LabGraph; custom: boolean }> {
  const result = spec.forbidden.map((key) => ({
    name: FORBIDDEN_NAMES[key],
    graph: builtinPattern(key),
    custom: false,
  }))
  if (spec.customForbidden) {
    result.push({ name: '自定义禁图', graph: parseGraph6(spec.customForbidden), custom: true })
  }
  return result
}
