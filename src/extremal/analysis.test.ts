import { describe, expect, it } from 'vitest'
import {
  asymptoticInfo,
  graphInvariants,
  maximalityCertificate,
  saturationSearch,
  stabilityInfo,
} from './analysis'
import type { AtlasGraph } from './atlas'
import { areIsomorphic, graphDegrees, simpleGraphFromEdges } from './containment'
import { DEFAULT_HOST_FILTERS, type HostFilters } from './filters'
import { parseGraph6Pattern, patternGraph, patternPreset, turanGraph } from './patterns'
import { extremalSearchMulti } from './search'

function presetGraph(id: string) {
  return patternGraph(patternPreset(id))
}

const C5 = simpleGraphFromEdges(5, [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 0],
])
const P4 = simpleGraphFromEdges(4, [
  [0, 1],
  [1, 2],
  [2, 3],
])
const STAR6 = simpleGraphFromEdges(6, [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
])

function filters(patch: Partial<HostFilters> = {}): HostFilters {
  return { ...DEFAULT_HOST_FILTERS, ...patch }
}

describe('v3.7 极大性证书 / 饱和数', () => {
  it('C₅ 是 K₃-饱和的：5 条缺失边全部会产生三角形', () => {
    const certificate = maximalityCertificate(C5, [presetGraph('K3')], false)
    expect(certificate.maximal).toBe(true)
    expect(certificate.missingEdges).toBe(5)
    expect(certificate.addableEdges).toBe(5)
    expect(certificate.breakingEdges).toBe(5)
    expect(certificate.witnessEdge).toBeNull()
  })

  it('P₄ 不是 K₃-极大：加入 0-3 仍无三角形', () => {
    const certificate = maximalityCertificate(P4, [presetGraph('K3')], false)
    expect(certificate.maximal).toBe(false)
    expect(certificate.witnessEdge).toEqual([0, 3])
  })

  it('结构约束只统计仍可加入的边（Δ ≤ 2 时弦被阻止）', () => {
    const certificate = maximalityCertificate(
      C5,
      [presetGraph('K3')],
      false,
      filters({ maxDegree: 2 }),
    )
    expect(certificate.blockedByFilters).toBe(5)
    expect(certificate.addableEdges).toBe(0)
    expect(certificate.maximal).toBe(true)
  })

  it('sat(6,K₃)=5（星形 K₁,₅ 是最小 K₃-饱和图）', () => {
    const result = saturationSearch(6, [presetGraph('K3')], false, DEFAULT_HOST_FILTERS)
    expect(result.value).toBe(5)
    expect(result.examples[0]?.m).toBe(5)
    expect(result.count).toBeGreaterThanOrEqual(1)
  })

  it('多禁图饱和数：sat(6,{K₃,C₄})=5', () => {
    const result = saturationSearch(
      6,
      [presetGraph('K3'), presetGraph('C4')],
      false,
      DEFAULT_HOST_FILTERS,
    )
    expect(result.value).toBe(5)
  })

  it('星形 K₁,₅ 是 K₃-饱和图', () => {
    const certificate = maximalityCertificate(STAR6, [presetGraph('K3')], false)
    expect(certificate.maximal).toBe(true)
  })
})

describe('v3.7 稳定性与渐近信息', () => {
  it('T₂(6) 与 Turán 参照同构、边差为 0', () => {
    const turan = turanGraph(6, 2)
    const graph: AtlasGraph = {
      n: 6,
      m: turan.edges.length,
      adj: [...turan.graph.adj],
      degrees: graphDegrees(turan.graph),
      graph6: '',
    }
    const info = stabilityInfo(graph, presetGraph('K3'))
    expect(info).not.toBeNull()
    expect(info?.parts).toBe(2)
    expect(info?.referenceEdges).toBe(9)
    expect(info?.edgeGap).toBe(0)
    expect(info?.degreeGap).toBe(0)
    expect(info?.isomorphicToTuran).toBe(true)
  })

  it('C₄ 与 P₄ 互补，C₅ 自补', () => {
    expect(areIsomorphic(complementOf(presetGraph('C4')), presetGraph('2K2'))).toBe(true)
    expect(areIsomorphic(complementOf(presetGraph('P4')), presetGraph('P4'))).toBe(true)
    expect(areIsomorphic(complementOf(presetGraph('C5')), presetGraph('C5'))).toBe(true)
  })

  it('Erdős–Stone 渐近密度：K₃ → 1/2，K₄ → 2/3；C₄ → 0', () => {
    const k3 = asymptoticInfo([{ graph: presetGraph('K3'), label: 'K₃' }])
    expect(k3.familyDensity).toBeCloseTo(0.5)
    const k4 = asymptoticInfo([{ graph: presetGraph('K4'), label: 'K₄' }])
    expect(k4.familyDensity).toBeCloseTo(2 / 3)
    const c4 = asymptoticInfo([{ graph: presetGraph('C4'), label: 'C₄' }])
    expect(c4.familyDensity).toBe(0)
    expect(c4.bipartite).toBe(true)
    const family = asymptoticInfo([
      { graph: presetGraph('K3'), label: 'K₃' },
      { graph: presetGraph('C4'), label: 'C₄' },
    ])
    expect(family.familyChromatic).toBe(2)
    expect(family.familyDensity).toBe(0)
  })
})

describe('v3.8 极图不变量', () => {
  it('C₅：χ=3、ω=2、α=2；K₄：χ=ω=4、α=1', () => {
    expect(graphInvariants(C5)).toEqual({ chromatic: 3, clique: 2, independence: 2 })
    expect(graphInvariants(presetGraph('K4'))).toEqual({
      chromatic: 4,
      clique: 4,
      independence: 1,
    })
  })

  it('T₂(6)：χ=2、ω=2、α=3', () => {
    const turan = turanGraph(6, 2)
    expect(graphInvariants(turan.graph)).toEqual({ chromatic: 2, clique: 2, independence: 3 })
  })
})

describe('v3.8 全量极图', () => {
  it('n=7、自定义 D]w 返回 8 个极图（画廊分页数据）', () => {
    const result = extremalSearchMulti({
      n: 7,
      patterns: [{ graph: parseGraph6Pattern('D]w').graph, label: 'D]w' }],
      mode: 'subgraph',
    })
    expect(result.maxEdges).toBe(12)
    expect(result.extremal).toHaveLength(8)
    expect(result.extremalCount).toBe(8)
  })
})

function complementOf(graph: ReturnType<typeof presetGraph>) {
  const edges: Array<[number, number]> = []
  for (let u = 0; u < graph.n; u++) {
    for (let v = u + 1; v < graph.n; v++) {
      if (((graph.adj[u]! >> v) & 1) === 0) edges.push([u, v])
    }
  }
  return simpleGraphFromEdges(graph.n, edges)
}
