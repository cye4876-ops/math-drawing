/**
 * v3.0 图论研究流程扩展测试：
 * - 结构条件：围长（去边最短路）、直径（全点对 BFS）、色数（贪心+回溯精确）；
 * - 新搜索目标：无符号 Laplacian 谱半径 q(Q)、代数连通度 λ₂(L)（含数学定义对照）；
 * - 普通 vs 诱导禁 C₄ 教学对照（n = 4：4 边 vs 6 边）；
 * - matches() 结构条件复核。
 */
import { describe, expect, it } from 'vitest'
import {
  completeBipartiteGraph,
  completeGraph,
  cycleGraph,
  emptyGraph,
  pathGraph,
  petersenGraph,
} from './graph'
import { chromaticNumber, diameterOf, girthOf } from './invariants'
import { matches, runGraphSearch, type SearchResumeSeed } from './search'
import { DEFAULT_GRAPH_SPEC, validateGraphSpec } from './spec'
import {
  experimentFromGraphSearch,
  resumeSeedFromGraphExperiment,
  type LabExperiment,
} from './archive'

describe('v3.0 结构不变量：围长 / 直径 / 色数', () => {
  it('围长：K₃→3、C₄→4、C₅→5、Petersen→5、K₃,₃→4、树→∞', () => {
    expect(girthOf(completeGraph(3))).toBe(3)
    expect(girthOf(cycleGraph(4))).toBe(4)
    expect(girthOf(cycleGraph(5))).toBe(5)
    expect(girthOf(petersenGraph())).toBe(5)
    expect(girthOf(completeBipartiteGraph(3, 3))).toBe(4)
    expect(girthOf(pathGraph(4))).toBe(Infinity)
    expect(girthOf(emptyGraph(4))).toBe(Infinity)
  })

  it('直径：P₄→3、C₅→2、K₃,₃→2、单点→0、含孤立点→∞', () => {
    expect(diameterOf(pathGraph(4))).toBe(3)
    expect(diameterOf(cycleGraph(5))).toBe(2)
    expect(diameterOf(completeBipartiteGraph(3, 3))).toBe(2)
    expect(diameterOf(emptyGraph(1))).toBe(0)
    expect(diameterOf(emptyGraph(3))).toBe(Infinity)
  })

  it('色数：K₄→4、C₅→3、K₃,₃→2、Petersen→3、空图→1', () => {
    expect(chromaticNumber(completeGraph(4))).toBe(4)
    expect(chromaticNumber(cycleGraph(5))).toBe(3)
    expect(chromaticNumber(completeBipartiteGraph(3, 3))).toBe(2)
    expect(chromaticNumber(petersenGraph())).toBe(3)
    expect(chromaticNumber(emptyGraph(3))).toBe(1)
  })
})

describe('v3.0 结构条件复核（matches）', () => {
  const base = {
    ...DEFAULT_GRAPH_SPEC,
    nMin: 1,
    nMax: 10,
    forbidden: [],
    claim: 'bipartite',
  } as const

  it('围长下限：C₅ 满足 ≥ 5，C₄ 不满足', () => {
    const spec = validateGraphSpec({ ...base, minGirth: 5 })
    expect(matches(cycleGraph(5), spec, []).ok).toBe(true)
    expect(matches(cycleGraph(4), spec, []).ok).toBe(false)
    // 树（围长 ∞）满足任何有限下限
    expect(matches(pathGraph(5), spec, []).ok).toBe(true)
  })

  it('直径上限：C₅ 满足 ≤ 2，P₄ 不满足；不连通图不满足', () => {
    const spec = validateGraphSpec({ ...base, maxDiameter: 2 })
    expect(matches(cycleGraph(5), spec, []).ok).toBe(true)
    expect(matches(pathGraph(4), spec, []).ok).toBe(false)
    expect(matches(emptyGraph(3), spec, []).ok).toBe(false)
  })

  it('色数上限：K₃,₃ 满足 ≤ 2，C₅ 不满足', () => {
    const spec = validateGraphSpec({ ...base, maxChromatic: 2 })
    expect(matches(completeBipartiteGraph(3, 3), spec, []).ok).toBe(true)
    expect(matches(cycleGraph(5), spec, []).ok).toBe(false)
  })

  it('平面性：K₅/K₃,₃ 不满足「要求平面」；C₅/K₄ 满足；「要求非平面」反转', () => {
    const yes = validateGraphSpec({ ...base, planar: 'yes' })
    expect(matches(cycleGraph(5), yes, []).ok).toBe(true)
    expect(matches(completeGraph(4), yes, []).ok).toBe(true)
    expect(matches(completeGraph(5), yes, []).ok).toBe(false)
    expect(matches(completeBipartiteGraph(3, 3), yes, []).ok).toBe(false)
    const no = validateGraphSpec({ ...base, planar: 'no' })
    expect(matches(completeGraph(5), no, []).ok).toBe(true)
    expect(matches(cycleGraph(5), no, []).ok).toBe(false)
  })

  it('平面性条件参与搜索：无三角形 n=6 要求平面 → 最优 8（排除 K₃,₃）', () => {
    const spec = validateGraphSpec({
      ...DEFAULT_GRAPH_SPEC,
      title: '无三角形且平面',
      nMin: 6,
      nMax: 6,
      forbidden: ['K3'],
      planar: 'yes',
      objective: 'max_edges',
      timeLimit: 60,
    })
    const result = runGraphSearch(spec)
    expect(result.orders[0]?.best).toBe(8)
    expect(result.orders[0]?.coverage).toBe('optimal_edge_layer')
  })

  it('校验：围长下限须 ≥ 3、色数上限须 ≥ 1；空输入归一为 null（不限）', () => {
    expect(() => validateGraphSpec({ ...base, minGirth: 2 })).toThrow()
    expect(() => validateGraphSpec({ ...base, maxChromatic: 0 })).toThrow()
    const spec = validateGraphSpec({ ...base, minGirth: undefined })
    expect(spec.minGirth).toBeNull()
  })
})

describe('v3.0 新搜索目标：q(Q) 与 λ₂(L)', () => {
  it('无三角形图上：q(Q) 最大 = 4（C₄：D+A 的特征值 4,2,2,0）', () => {
    const spec = validateGraphSpec({
      ...DEFAULT_GRAPH_SPEC,
      title: '无三角形图的无符号 Laplacian 谱半径极值',
      nMin: 4,
      nMax: 4,
      forbidden: ['K3'],
      objective: 'max_signless_laplacian_radius',
      timeLimit: 60,
    })
    const result = runGraphSearch(spec)
    expect(result.orders[0]?.best).toBeCloseTo(4, 9)
    // 并列最优：K₁,₃（星图，3 条边）与 C₄（4 条边）的 q 都等于 4
    const candidates = result.orders[0]?.candidates ?? []
    expect(candidates.some((candidate) => candidate.m === 4)).toBe(true)
    const c4 = candidates.find((candidate) => candidate.m === 4)
    expect(c4?.rho).toBeCloseTo(4, 9)
  })

  it('无三角形图上：λ₂(L) 最大 = 2（C₄ 的 Laplacian 特征值 0,2,2,4）', () => {
    const spec = validateGraphSpec({
      ...DEFAULT_GRAPH_SPEC,
      title: '无三角形图的代数连通度极值',
      nMin: 4,
      nMax: 4,
      forbidden: ['K3'],
      objective: 'max_algebraic_connectivity',
      timeLimit: 60,
    })
    const result = runGraphSearch(spec)
    expect(result.orders[0]?.best).toBeCloseTo(2, 9)
  })

  it('新目标不启用 ρ(A) 上界剪枝（spectralComparison 说明与谱评估计数）', () => {
    const spec = validateGraphSpec({
      ...DEFAULT_GRAPH_SPEC,
      nMin: 4,
      nMax: 4,
      forbidden: ['K3'],
      objective: 'max_signless_laplacian_radius',
      timeLimit: 60,
    })
    const result = runGraphSearch(spec)
    expect(result.spectralPruned).toBe(0)
    expect(result.spectralEvaluations).toBeGreaterThan(0)
    expect(result.spectralComparison).toContain('无上界剪枝')
  })
})

describe('v3.1 搜索续算（阶数级 checkpoint）', () => {
  const base = {
    ...DEFAULT_GRAPH_SPEC,
    forbidden: ['K3'],
    claim: 'bipartite',
    nMin: 4,
    nMax: 5,
    timeLimit: 60,
  } as const

  it('种子并入已完成阶、跳过重算，结果与直接全跑一致', () => {
    const first = runGraphSearch(validateGraphSpec(base))
    const order0 = first.orders[0]!
    const seed: SearchResumeSeed = {
      orders: [order0],
      checked: order0.checked,
      feasible: order0.feasible,
      violations: order0.violations,
      uncertainViolations: order0.uncertainViolations,
      nodes: order0.nodes,
      spectralEvaluations: order0.spectralEvaluations,
      spectralPruned: order0.spectralPruned,
    }
    const spec = validateGraphSpec({ ...base, nMax: 6 })
    const resumed = runGraphSearch(spec, { seed })
    expect(resumed.orders.map((order) => order.n)).toEqual([4, 5, 6])
    // 种子阶直接复用原对象（未重算）
    expect(resumed.orders[0]).toBe(order0)
    // 与直接全跑的最优值、候选数、总检查量一致
    const direct = runGraphSearch(spec)
    expect(resumed.orders.map((order) => order.best)).toEqual(
      direct.orders.map((order) => order.best),
    )
    expect(resumed.orders.map((order) => order.candidateCount)).toEqual(
      direct.orders.map((order) => order.candidateCount),
    )
    expect(resumed.checked).toBe(direct.checked)
    expect(resumed.nodes).toBe(direct.nodes)
  })

  it('未完成的阶不会被种子采纳（重新搜索）', () => {
    // nodeBudget 取最小值 1 万：无三角形 8 阶搜索必然中途触发 graph_limit
    const spec = validateGraphSpec({ ...base, nMin: 8, nMax: 8, nodeBudget: 10_000 })
    const first = runGraphSearch(spec)
    const partial = first.orders[0]!
    expect(partial.complete).toBe(false)
    const seed: SearchResumeSeed = {
      orders: [partial],
      checked: 0,
      feasible: 0,
      violations: 0,
      uncertainViolations: 0,
      nodes: 0,
      spectralEvaluations: 0,
      spectralPruned: 0,
    }
    const resumed = runGraphSearch(spec, { seed })
    expect(resumed.orders.length).toBe(1)
    expect(resumed.orders[0]).not.toBe(partial)
    expect(resumed.complete).toBe(false)
  })

  it('档案→种子：候选由 graph6 重建，续算最优值与全跑一致', () => {
    const spec4 = validateGraphSpec({ ...base, nMax: 4 })
    const result = runGraphSearch(spec4)
    const experiment: LabExperiment = {
      id: 't1',
      createdAt: '2026-10-06T00:00:00.000Z',
      ...experimentFromGraphSearch(result, ''),
    }
    const seed = resumeSeedFromGraphExperiment(experiment)
    expect(seed).not.toBeNull()
    expect(seed?.orders.length).toBe(1)
    expect(seed?.orders[0]?.complete).toBe(true)
    expect(seed?.orders[0]?.candidates[0]?.graph6).toBe(result.orders[0]?.candidates[0]?.graph6)
    const spec5 = validateGraphSpec({ ...base, nMax: 5 })
    const resumed = runGraphSearch(spec5, { seed: seed ?? undefined })
    const direct = runGraphSearch(spec5)
    expect(resumed.orders.map((order) => order.best)).toEqual(
      direct.orders.map((order) => order.best),
    )
  })

  it('非图实验（超图档案）不产生续算种子', () => {
    const spec4 = validateGraphSpec({ ...base, nMax: 4 })
    const result = runGraphSearch(spec4)
    const experiment: LabExperiment = {
      id: 't2',
      createdAt: '2026-10-06T00:00:00.000Z',
      ...experimentFromGraphSearch(result, ''),
      kind: 'hypergraph',
    }
    expect(resumeSeedFromGraphExperiment(experiment)).toBeNull()
  })
})

describe('v3.0 普通 vs 诱导禁 C₄ 对照（方案第四步教学样例）', () => {
  it('n = 4 普通禁 C₄：最大边数 4（三角形 + 悬挂边；5 边必含 4 圈作子图）', () => {
    const spec = validateGraphSpec({
      ...DEFAULT_GRAPH_SPEC,
      title: '对照·普通禁 C₄',
      nMin: 4,
      nMax: 4,
      forbidden: ['C4'],
      forbiddenMode: 'subgraph',
      objective: 'max_edges',
      timeLimit: 60,
    })
    const result = runGraphSearch(spec)
    expect(result.orders[0]?.best).toBe(4)
    expect(result.orders[0]?.coverage).toBe('optimal_edge_layer')
  })

  it('n = 4 诱导禁 C₄：可达 6 边（K₄ 的四点子图是 6 边，不是诱导 C₄）', () => {
    const spec = validateGraphSpec({
      ...DEFAULT_GRAPH_SPEC,
      title: '对照·诱导禁 C₄',
      nMin: 4,
      nMax: 4,
      forbidden: ['C4'],
      forbiddenMode: 'induced',
      objective: 'max_edges',
      timeLimit: 60,
    })
    const result = runGraphSearch(spec)
    expect(result.orders[0]?.best).toBe(6)
  })
})
