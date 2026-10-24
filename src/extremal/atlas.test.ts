import { describe, expect, it } from 'vitest'
import {
  ATLAS_COUNTS,
  ATLAS_MAX_N,
  atlasEdgeList,
  atlasGraphs,
  loadAtlas8,
  EXTREMAL_MAX_N,
} from './atlas'
import { containsPattern, edgeCountOf, graphDegrees, simpleGraphFromEdges } from './containment'
import {
  PATTERN_PRESETS,
  chromaticNumber,
  knownExtremalValue,
  parseCustomPattern,
  patternGraph,
  turanEdges,
  turanGraph,
} from './patterns'

describe('v3.6 图集与禁图判定', () => {
  it('图集规模与 nauty 计数一致（1,2,4,11,34,156,1044）', () => {
    expect(ATLAS_MAX_N).toBe(7)
    expect(EXTREMAL_MAX_N).toBe(8)
    expect(ATLAS_COUNTS).toEqual({ 1: 1, 2: 2, 3: 4, 4: 11, 5: 34, 6: 156, 7: 1044 })
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const graphs = atlasGraphs(n)
      expect(graphs).toHaveLength(ATLAS_COUNTS[n]!)
      for (const graph of graphs) {
        expect(graph.n).toBe(n)
        expect(graph.m).toBe(edgeCountOf(graph))
        expect(graph.degrees).toEqual(graphDegrees(graph))
        expect(atlasEdgeList(graph)).toHaveLength(graph.m)
      }
    }
    expect(atlasGraphs(6).some((graph) => graph.m === 15)).toBe(true)
  })

  it('n=8 图集按需加载：12346 个非同构图', async () => {
    await loadAtlas8()
    const graphs = atlasGraphs(8)
    expect(graphs).toHaveLength(12346)
    expect(graphs.every((graph) => graph.n === 8)).toBe(true)
  })

  it('子图 / 诱导子图判定：K₃、C₄、2K₂', () => {
    const k4 = simpleGraphFromEdges(4, [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ])
    const k3 = patternGraph(PATTERN_PRESETS.find((item) => item.id === 'K3')!)
    expect(containsPattern(k4, k3)).toBe(true)
    expect(containsPattern(k4, k3, true)).toBe(true)
    const c4 = patternGraph(PATTERN_PRESETS.find((item) => item.id === 'C4')!)
    expect(containsPattern(k4, c4)).toBe(true)
    expect(containsPattern(k4, c4, true)).toBe(false)
    const twoEdges = simpleGraphFromEdges(4, [
      [0, 1],
      [2, 3],
    ])
    const path = simpleGraphFromEdges(4, [
      [0, 1],
      [1, 2],
    ])
    const k2k2 = patternGraph(PATTERN_PRESETS.find((item) => item.id === '2K2')!)
    expect(containsPattern(twoEdges, k2k2, true)).toBe(true)
    expect(containsPattern(path, k2k2, true)).toBe(false)
    expect(containsPattern(path, k2k2)).toBe(false)
  })

  it('禁图预设色数 / 完全性 / 自定义解析', () => {
    const chromatic = Object.fromEntries(
      PATTERN_PRESETS.map((preset) => [preset.id, chromaticNumber(patternGraph(preset))]),
    )
    expect(chromatic).toMatchObject({ K3: 3, C4: 2, P4: 2, K4: 4, '2K2': 2, C5: 3, K13: 2 })
    const custom = parseCustomPattern('0-1, 1-2; 2-3 3-0')
    expect(custom.graph.n).toBe(4)
    expect(custom.edges).toHaveLength(4)
    expect(() => parseCustomPattern('0-0, 1-2')).toThrow(/自环/)
    expect(() => parseCustomPattern('hello')).toThrow(/边/)
  })
})

describe('v3.6 Turán 构造与已知公式', () => {
  it('平衡完全 r 部图：T₂(6)=9、T₃(6)=12、T₂(7)=12', () => {
    expect(turanEdges(6, 2)).toBe(9)
    expect(turanEdges(6, 3)).toBe(12)
    expect(turanEdges(7, 2)).toBe(12)
    const t = turanGraph(6, 3)
    expect(t.edges).toHaveLength(12)
    expect(t.parts.map((part) => part.length)).toEqual([2, 2, 2])
    // 部内无边、部间全连
    const side = new Array<number>(6).fill(0)
    t.parts.forEach((part, index) => part.forEach((vertex) => (side[vertex] = index)))
    for (let u = 0; u < 6; u++) {
      for (let v = u + 1; v < 6; v++) {
        const present = t.edges.some(([a, b]) => a === u && b === v)
        expect(present).toBe(side[u] !== side[v])
      }
    }
  })

  it('Mantel / Turán 定理对照：ex(6,K₃)=9、ex(6,K₄)=12', () => {
    const k3 = patternGraph(PATTERN_PRESETS.find((item) => item.id === 'K3')!)
    const k4 = patternGraph(PATTERN_PRESETS.find((item) => item.id === 'K4')!)
    expect(knownExtremalValue(k3, 6)).toMatchObject({ value: 9, parts: 2, kind: 'mantel' })
    expect(knownExtremalValue(k4, 6)).toMatchObject({ value: 12, parts: 3, kind: 'turan' })
    expect(knownExtremalValue(k3, 7)?.value).toBe(12)
  })
})
