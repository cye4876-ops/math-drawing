/**
 * Oracle 交叉校验（v2.7）：与 WSL Sage 中的原实验台（v0.5）模块逐项对照。
 * 参考数据由 tools/lab-oracle/ref_core.py 与 ref_search.py 生成：
 *   wsl -d Ubuntu -- /opt/codex-sage/env/bin/python /mnt/e/drawing/tools/lab-oracle/ref_core.py
 *   wsl -d Ubuntu -- /opt/codex-sage/env/bin/python /mnt/e/drawing/tools/lab-oracle/ref_search.py
 * 对照内容：graph6、特征多项式、不变量、规划器边界、搜索候选（同构意义下的一致）。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { completeBipartiteGraph, fromEdges, type LabGraph } from './graph'
import { parseGraph6, toGraph6 } from './graph6'
import { areIsomorphic } from './iso'
import { GraphInvariants } from './invariants'
import {
  adjacencyIntMatrix,
  charPolyCoefficients,
  laplacianIntMatrix,
  signlessLaplacianIntMatrix,
} from './charpoly'
import { orderPlan } from './planner'
import { runGraphSearch } from './search'
import { validateGraphSpec, type GraphSpec } from './spec'

interface OracleGraph {
  graph6: string
  canonical_graph6: string
  invariants: Record<string, number | boolean>
  rho: number
  q: number
  lambda2: number
  charpoly: Record<'A' | 'L' | 'Q', string[]>
}

const core = JSON.parse(readFileSync('tools/lab-oracle/fixtures/core.json', 'utf8')) as {
  graphs: Record<string, OracleGraph>
  plans: Record<string, Array<Record<string, unknown>>>
}
const searchRef = JSON.parse(
  readFileSync('tools/lab-oracle/fixtures/search.json', 'utf8'),
) as Record<
  string,
  {
    spec: Record<string, unknown>
    termination: string
    complete: boolean
    candidate_count: number
    violations: number
    evidence: string
    coverage: string
    orders: Array<{
      n: number
      best: number | null
      candidate_count: number
      coverage: string
      complete: boolean
      candidates: string[]
    }>
  }
>

const GRAPHS: Record<string, LabGraph> = {
  K4: fromEdges(4, [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ]),
  C5: fromEdges(5, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 0],
  ]),
  K33: completeBipartiteGraph(3, 3),
  petersen: fromEdges(10, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 0],
    [5, 7],
    [7, 9],
    [9, 6],
    [6, 8],
    [8, 5],
    [0, 5],
    [1, 6],
    [2, 7],
    [3, 8],
    [4, 9],
  ]),
  c6_c3c3: fromEdges(6, [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0],
  ]),
  K44: completeBipartiteGraph(4, 4),
}

describe('Oracle：graph6 与原实验台一致', () => {
  it.each(Object.keys(GRAPHS))('%s', (name) => {
    const graph = GRAPHS[name]!
    const reference = core.graphs[name]!
    expect(toGraph6(graph)).toBe(reference.graph6)
    // 规范标号往返：解析后与原图同构，且再编码稳定
    const canonical = parseGraph6(reference.canonical_graph6)
    expect(areIsomorphic(canonical, graph).isomorphic).toBe(true)
    expect(toGraph6(parseGraph6(toGraph6(canonical)))).toBe(toGraph6(canonical))
  })
})

describe('Oracle：精确特征多项式与原实验台一致', () => {
  it.each(Object.keys(GRAPHS))('%s', (name) => {
    const graph = GRAPHS[name]!
    const reference = core.graphs[name]!
    for (const [key, matrix] of [
      ['A', adjacencyIntMatrix(graph)],
      ['L', laplacianIntMatrix(graph)],
      ['Q', signlessLaplacianIntMatrix(graph)],
    ] as const) {
      const coefficients = charPolyCoefficients(matrix).map(String)
      expect(coefficients).toEqual(reference.charpoly[key])
    }
  })
})

describe('Oracle：不变量与原实验台一致', () => {
  it.each(Object.keys(GRAPHS))('%s', (name) => {
    const graph = GRAPHS[name]!
    const reference = core.graphs[name]!
    const values = new GraphInvariants(graph)
    for (const key of ['delta', 'Delta', 'omega', 'alpha', 'nu', 'triangles']) {
      expect(values.get(key)).toBe(reference.invariants[key])
    }
    for (const key of ['bipartite', 'connected', 'regular']) {
      expect(values.get(key)).toBe(reference.invariants[key])
    }
    expect(values.rho()).toBeCloseTo(reference.rho, 6)
    expect(values.q()).toBeCloseTo(reference.q, 6)
    expect(values.lambda2()).toBeCloseTo(reference.lambda2, 6)
  })
})

describe('Oracle：规划器与原实验台一致', () => {
  const specFor = (payload: Record<string, unknown>): GraphSpec => {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
      if (camel === 'graphLimit') continue
      mapped[camel] = value
    }
    mapped.nodeBudget = 5_000_000
    return validateGraphSpec(mapped)
  }

  const PLAN_SPECS: Record<string, Record<string, unknown>> = {
    triangle_free_n6: {
      title: '无三角形图的边数极值',
      n_min: 6,
      n_max: 6,
      forbidden: ['K3'],
      objective: 'max_edges',
      strategy: 'auto',
    },
    triangle_free_n8: {
      title: '无三角形图的边数极值',
      n_min: 8,
      n_max: 8,
      forbidden: ['K3'],
      objective: 'max_edges',
      strategy: 'auto',
    },
    c4_free_n7: {
      title: '无普通 C4 的边数极值',
      n_min: 7,
      n_max: 7,
      forbidden: ['C4'],
      objective: 'max_edges',
      strategy: 'auto',
    },
    claw_free_connected_n6: {
      title: '连接无爪图',
      n_min: 6,
      n_max: 6,
      forbidden: ['claw'],
      objective: 'max_edges',
      connected: 'yes',
      strategy: 'auto',
    },
    bipartite_n7: {
      title: '二部图极值',
      n_min: 7,
      n_max: 7,
      bipartite: 'yes',
      objective: 'max_edges',
      strategy: 'auto',
    },
    enumerate_n6: {
      title: '逐图枚举对照',
      n_min: 6,
      n_max: 6,
      forbidden: ['K3'],
      objective: 'max_edges',
      strategy: 'enumerate',
    },
  }

  it.each(Object.keys(core.plans))('%s', (name) => {
    const spec = specFor(PLAN_SPECS[name]!)
    const reference = core.plans[name]!
    for (const row of reference) {
      const n = row.n as number
      const plan = orderPlan(n, spec)
      expect(plan.edgeMin).toBe(row.edge_min)
      expect(plan.edgeMax).toBe(row.edge_max)
      expect(plan.impossible).toBe(row.impossible)
      expect(plan.mode).toBe(row.mode)
      expect(plan.deletionUpper).toBe(row.deletion_upper)
      expect(plan.labelledSpace).toBe(row.labelled_space)
    }
  })
})

describe('Oracle：搜索结果与原实验台一致', () => {
  const specFor = (payload: Record<string, unknown>): GraphSpec => {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
      if (camel === 'graphLimit') continue
      mapped[camel] = value
    }
    mapped.nodeBudget = 40_000_000
    mapped.timeLimit = 600
    return validateGraphSpec(mapped)
  }

  const cases = Object.keys(searchRef)

  it.each(cases)(
    '%s',
    (name) => {
      const reference = searchRef[name]!
      const spec = specFor(reference.spec)
      const result = runGraphSearch(spec)
      // 完整性、覆盖与候选数量一致
      expect(result.complete).toBe(reference.complete)
      expect(result.candidateCount).toBe(reference.candidate_count)
      expect(result.violations).toBe(reference.violations)
      // 逐阶对照：最优值、候选数量、覆盖方式
      for (const refOrder of reference.orders) {
        const order = result.orders.find((entry) => entry.n === refOrder.n)!
        if (refOrder.best !== null) {
          expect(order.best).not.toBeNull()
          expect(Math.abs(order.best! - refOrder.best)).toBeLessThan(1e-6)
        }
        expect(order.candidateCount).toBe(refOrder.candidate_count)
        if (refOrder.coverage !== 'enumeration') {
          expect(order.coverage).toBe(refOrder.coverage)
        }
        // 候选项两两同构对应（我的发现标号 ↔ 原版规范标号）
        const mine = order.candidates.map((candidate) => candidate.graph)
        const theirs = refOrder.candidates.map((text) => parseGraph6(text))
        expect(mine.length).toBe(theirs.length)
        const unmatched = [...theirs]
        for (const graph of mine) {
          const index = unmatched.findIndex((other) => areIsomorphic(graph, other).isomorphic)
          expect(index).toBeGreaterThanOrEqual(0)
          unmatched.splice(index, 1)
        }
      }
    },
    120_000,
  )

  it('反例的 claim 值可精确复核（lambda2 边界）', () => {
    const reference = searchRef['lambda2_claim_n3_6']!
    const candidate = reference.orders.flatMap((order) => order.candidates)[0]
    if (!candidate) return
    const graph = parseGraph6(candidate)
    const values = new GraphInvariants(graph)
    // 反例必须真的违反 lambda2 >= 1（数值判定，容差 1e-9）
    expect(values.lambda2()).toBeLessThan(1 - 1e-9)
  })
})
