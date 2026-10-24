import { describe, expect, it } from 'vitest'
import { DEFAULT_HOST_FILTERS, type HostFilters } from './filters'
import { patternGraph, patternPreset, parseCustomPattern } from './patterns'
import { extremalSearch, extremalSearchMulti } from './search'

const SUBGRAPH_TABLE: Record<string, number[]> = {
  K3: [2, 4, 6, 9, 12],
  C4: [3, 4, 6, 7, 9],
  P4: [3, 3, 4, 6, 6],
  K4: [3, 5, 8, 12, 16],
  '2K2': [3, 3, 4, 5, 6],
  C5: [3, 6, 7, 9, 12],
  K13: [3, 4, 5, 6, 7],
  diamond: [3, 4, 6, 9, 12],
  C6: [3, 6, 10, 11, 13],
}

describe('v3.6 ex(n,H) 图集精确搜索（与独立 Python 图集一致）', () => {
  it('n = 3..7 全部预设的普通子图极值', () => {
    for (const [id, values] of Object.entries(SUBGRAPH_TABLE)) {
      const preset = patternPreset(id)
      const graph = patternGraph(preset)
      values.forEach((value, index) => {
        const n = index + 3
        const result = extremalSearch(n, graph, 'subgraph', preset.label)
        expect(result.maxEdges, `${id} n=${n}`).toBe(value)
        expect(result.scanned).toBeGreaterThan(0)
        expect(result.freeCount).toBeGreaterThanOrEqual(result.extremalCount)
        expect(result.extremal[0]?.m).toBe(value)
      })
    }
  })

  it('Mantel / Turán 对照与唯一极图', () => {
    const k3 = extremalSearch(6, patternGraph(patternPreset('K3')), 'subgraph', 'K₃')
    expect(k3.maxEdges).toBe(9)
    expect(k3.extremalCount).toBe(1)
    expect(k3.known).toMatchObject({ value: 9, parts: 2, kind: 'mantel' })
    expect(k3.lowerBound).toMatchObject({ parts: 2, edges: 9, chromatic: 3 })
    const k4 = extremalSearch(6, patternGraph(patternPreset('K4')), 'subgraph', 'K₄')
    expect(k4.maxEdges).toBe(12)
    expect(k4.extremalCount).toBe(1)
    expect(k4.known?.formula).toContain('Turán')
    const k7 = extremalSearch(7, patternGraph(patternPreset('K3')), 'subgraph', 'K₃')
    expect(k7.maxEdges).toBe(12)
  })

  it('诱导禁图模式：K₆ 不含诱导 C₄，因此 ex_ind(6,C₄)=15', () => {
    const result = extremalSearch(6, patternGraph(patternPreset('C4')), 'induced', 'C₄')
    expect(result.maxEdges).toBe(15)
    expect(result.extremalCount).toBe(1)
    expect(result.known).toBeNull()
    const k3 = extremalSearch(6, patternGraph(patternPreset('K3')), 'induced', 'K₃')
    expect(k3.maxEdges).toBe(9)
    expect(k3.known).toBeNull()
  })

  it('n 超出图集范围时抛错', () => {
    expect(() => extremalSearch(8, patternGraph(patternPreset('K3')), 'subgraph', 'K₃')).toThrow(
      /图集支持/,
    )
  })
})

describe('v3.6 自定义禁图', () => {
  it('P₃（两邻边）禁止的极值可搜索且非空', () => {
    const p3 = parseCustomPattern('0-1, 1-2').graph
    const result = extremalSearch(6, p3, 'subgraph', '自定义 P₃')
    expect(result.maxEdges).toBe(3)
    expect(result.lowerBound).toBeNull()
  })
})

function spec(id: string) {
  const preset = patternPreset(id)
  return { graph: patternGraph(preset), label: preset.label }
}

function filters(patch: Partial<HostFilters>): HostFilters {
  return { ...DEFAULT_HOST_FILTERS, ...patch }
}

describe('v3.7 多禁图与结构约束', () => {
  it('ex(6,{K₃,C₄})=6，饱和数 sat=5', () => {
    const result = extremalSearchMulti({
      n: 6,
      patterns: [spec('K3'), spec('C4')],
      mode: 'subgraph',
      analyses: true,
    })
    expect(result.maxEdges).toBe(6)
    expect(result.patternCount).toBe(2)
    expect(result.patternLabel).toContain('{')
    expect(result.known).toBeNull()
    expect(result.saturation?.value).toBe(5)
    expect(result.extremalCount).toBe(2)
  })

  it('ex(6,{K₃,K₄})=9：三角-free 极值仍由 T₂(6) 达到', () => {
    const result = extremalSearchMulti({
      n: 6,
      patterns: [spec('K3'), spec('K4')],
      mode: 'subgraph',
      analyses: false,
    })
    expect(result.maxEdges).toBe(9)
    expect(result.lowerBound).toMatchObject({ parts: 2, edges: 9 })
    expect(result.extremalCount).toBe(1)
  })

  it('连通 / 二部 / 平面 / 三角形-free / Δ≤2 约束', () => {
    const k3 = spec('K3')
    const connected = extremalSearchMulti({
      n: 6,
      patterns: [k3],
      mode: 'subgraph',
      filters: filters({ connected: true }),
    })
    expect(connected.maxEdges).toBe(9)
    expect(connected.eligible).toBe(112)
    expect(connected.filteredOut).toBe(44)

    const bipartite = extremalSearchMulti({
      n: 6,
      patterns: [k3],
      mode: 'subgraph',
      filters: filters({ bipartite: true }),
    })
    expect(bipartite.maxEdges).toBe(9)
    expect(bipartite.eligible).toBe(35)

    const planar = extremalSearchMulti({
      n: 6,
      patterns: [k3],
      mode: 'subgraph',
      filters: filters({ planar: true }),
    })
    expect(planar.maxEdges).toBe(8)
    expect(planar.eligible).toBe(142)

    const triangleFree = extremalSearchMulti({
      n: 6,
      patterns: [k3],
      mode: 'subgraph',
      filters: filters({ triangleFree: true }),
    })
    expect(triangleFree.maxEdges).toBe(9)
    expect(triangleFree.eligible).toBe(38)

    const degree = extremalSearchMulti({
      n: 6,
      patterns: [k3],
      mode: 'subgraph',
      filters: filters({ maxDegree: 2 }),
      analyses: true,
    })
    expect(degree.maxEdges).toBe(6)
    expect(degree.saturation?.value).toBe(5)
  })

  it('C₄ 在二部宿主上 ex_bip(6,C₄)=6', () => {
    const result = extremalSearchMulti({
      n: 6,
      patterns: [spec('C4')],
      mode: 'subgraph',
      filters: filters({ bipartite: true }),
    })
    expect(result.maxEdges).toBe(6)
    expect(result.eligible).toBe(35)
    expect(result.lowerBound).toBeNull()
  })
})
