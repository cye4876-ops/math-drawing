import { describe, expect, it } from 'vitest'
import {
  HypergraphFormatError,
  docFromEdgeSets,
  docToJson,
  dualHypergraph,
  memberIndices,
  parseHypergraphJson,
} from './model'
import {
  analyzeHypergraphDoc,
  hypergraphComponents,
  lineGraphEdges,
  propertyBColoring,
  twoSectionPairs,
} from './analysis'
import { HYPER_PRESETS, buildHypergraphPreset } from './presets'
import { findRainbowHyperMatching, maxRainbowHyperMatching } from './rainbow'
import { hyperAreIsomorphic } from '../lab/hypergraph'

const K5_3 = docFromEdgeSets('K5³', 5, [
  [0, 1, 2],
  [0, 1, 3],
  [0, 1, 4],
  [0, 2, 3],
  [0, 2, 4],
  [0, 3, 4],
  [1, 2, 3],
  [1, 2, 4],
  [1, 3, 4],
  [2, 3, 4],
])

const FANO = buildHypergraphPreset('fano', 7, 3)
const LOOSE = docFromEdgeSets('松三角形', 6, [
  [0, 1, 2],
  [2, 3, 4],
  [4, 5, 0],
])

describe('v3.4 超图模型', () => {
  it('紧凑 JSON 往返；重复超边去重、成员排序', () => {
    const doc = docFromEdgeSets('测试', 4, [
      [2, 0, 1],
      [1, 0, 2],
      [0, 3],
    ])
    expect(doc.edges).toHaveLength(2)
    expect(memberIndices(doc)).toEqual([
      [0, 1, 2],
      [0, 3],
    ])
    const parsed = parseHypergraphJson(docToJson(doc))
    expect(memberIndices(parsed)).toEqual(memberIndices(doc))
  })

  it('完整文档 JSON 保留标签与颜色；错误格式给出中文消息', () => {
    const full = {
      name: '自定义',
      vertices: [
        { id: 'a', label: 'A', color: '#ff0000' },
        { id: 'b', label: 'B', color: '#00ff00' },
        { id: 'c', label: 'C', color: '#0000ff' },
      ],
      edges: [{ id: 'x', label: 'X', members: ['a', 'b', 'c'], color: '#123456', weight: 2 }],
    }
    const parsed = parseHypergraphJson(JSON.stringify(full))
    expect(parsed.vertices[0]!.label).toBe('A')
    expect(parsed.edges[0]).toMatchObject({ label: 'X', color: '#123456', weight: 2 })
    expect(() => parseHypergraphJson('{')).toThrow(HypergraphFormatError)
    expect(() => parseHypergraphJson(JSON.stringify({ n: 3, edges: [[0, 3]] }))).toThrow(/成员/)
    expect(() => parseHypergraphJson(JSON.stringify({ n: 3, edges: [[0, 0, 1]] }))).toThrow(/重复/)
  })

  it('预设：完全 3-一致 K5 有 10 条边、Fano 自对偶、随机可复现', () => {
    expect(HYPER_PRESETS.length).toBeGreaterThanOrEqual(7)
    const complete = buildHypergraphPreset('complete', 5, 3)
    expect(memberIndices(complete)).toHaveLength(10)
    const dual = dualHypergraph(FANO)
    expect(dual.vertices).toHaveLength(7)
    expect(dual.edges).toHaveLength(7)
    const iso = hyperAreIsomorphic(
      { n: 7, edges: memberIndices(dual) },
      { n: 7, edges: memberIndices(FANO) },
    )
    expect(iso.isomorphic).toBe(true)

    const a = buildHypergraphPreset('random', 6, 3, 42)
    const b = buildHypergraphPreset('random', 6, 3, 42)
    expect(memberIndices(a)).toEqual(memberIndices(b))
    const c = buildHypergraphPreset('random', 6, 3, 43)
    expect(memberIndices(a)).not.toEqual(memberIndices(c))
    expect(() => buildHypergraphPreset('loose', 5, 3)).toThrow(/6/)
  })
})

describe('v3.4 超图分析', () => {
  it('K5³：3-一致、非线、正则、不可 2-着色；ν=1、τ=3、α=2', () => {
    const analysis = analyzeHypergraphDoc(K5_3)
    expect(analysis).toMatchObject({
      n: 5,
      m: 10,
      rank: 3,
      uniform: 3,
      linear: false,
      regular: true,
      connected: true,
      maxCodegree: 3,
    })
    expect(analysis.matching.value).toBe(1)
    expect(analysis.transversal.value).toBe(3)
    expect(analysis.transversal.witness).toHaveLength(3)
    expect(analysis.independence.value).toBe(2)
    expect(analysis.propertyB.colorable).toBe(false)
    expect(analysis.components).toEqual([[0, 1, 2, 3, 4]])
    expect(analysis.twoSectionPairs).toHaveLength(10)
    expect(analysis.lineGraphEdges).toHaveLength(45)
    expect(analysis.dual).toEqual({ n: 10, m: 5 })
  })

  it('Fano 平面：线性正则、τ=3、α=4、不可 2-着色、线图为 K7', () => {
    const analysis = analyzeHypergraphDoc(FANO)
    expect(analysis).toMatchObject({
      n: 7,
      m: 7,
      uniform: 3,
      linear: true,
      regular: true,
      connected: true,
      maxCodegree: 1,
    })
    expect(analysis.matching.value).toBe(1)
    expect(analysis.transversal.value).toBe(3)
    expect(analysis.independence.value).toBe(4)
    expect(analysis.propertyB.colorable).toBe(false)
    expect(analysis.twoSectionPairs).toHaveLength(21)
    expect(analysis.lineGraphEdges).toHaveLength(21)
  })

  it('松三角形：线性但非正则；ν=1、τ=2；可 2-着色', () => {
    const analysis = analyzeHypergraphDoc(LOOSE)
    expect(analysis.linear).toBe(true)
    expect(analysis.regular).toBe(false)
    expect(analysis.matching.value).toBe(1)
    expect(analysis.transversal.value).toBe(2)
    expect(analysis.independence.value).toBe(4)
    expect(analysis.propertyB.colorable).toBe(true)
    expect(analysis.propertyB.coloring).toHaveLength(6)
    // 见证着色确实不产生单色超边
    for (const edge of memberIndices(LOOSE)) {
      const colors = edge.map((vertex) => analysis.propertyB.coloring![vertex]!)
      expect(new Set(colors).size).toBeGreaterThan(1)
    }
  })

  it('K6³（n=6 上限）：20 条超边、ν=2、不可 2-着色', () => {
    const k6 = buildHypergraphPreset('complete', 6, 3)
    const analysis = analyzeHypergraphDoc(k6)
    expect(analysis.m).toBe(20)
    expect(analysis.uniform).toBe(3)
    expect(analysis.matching.value).toBe(2)
    expect(analysis.transversal.value).toBe(4)
    expect(analysis.propertyB.colorable).toBe(false)
  })

  it('不连通 + 孤立点：分量拆分正确；Property B 独立实现', () => {
    expect(
      hypergraphComponents(5, [
        [0, 1],
        [2, 3],
      ]),
    ).toEqual([[0, 1], [2, 3], [4]])
    const colorable = propertyBColoring(4, [
      [0, 1],
      [2, 3],
    ])
    expect(colorable.colorable).toBe(true)
    expect(colorable.coloring).not.toBeNull()
    const notColorable = propertyBColoring(5, [
      [0, 1, 2],
      [0, 1, 3],
      [0, 1, 4],
      [0, 2, 3],
      [0, 2, 4],
      [0, 3, 4],
      [1, 2, 3],
      [1, 2, 4],
      [1, 3, 4],
      [2, 3, 4],
    ])
    expect(notColorable.colorable).toBe(false)
    expect(notColorable.coloring).toBeNull()
    expect(
      twoSectionPairs([
        [0, 1, 2],
        [2, 3],
      ]),
    ).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 3],
    ])
    expect(
      lineGraphEdges([
        [0, 1],
        [1, 2],
        [3, 4],
      ]),
    ).toEqual([[0, 1]])
  })
})

describe('v3.5 超图彩虹匹配', () => {
  it('两条不交且异色的超边：最大彩虹匹配 = 2；目标 2 存在', () => {
    const doc = docFromEdgeSets('两条', 6, [
      [0, 1, 2],
      [3, 4, 5],
    ])
    const max = maxRainbowHyperMatching(doc)
    expect(max.size).toBe(2)
    expect(max.witnesses[0]).toHaveLength(2)
    const target = findRainbowHyperMatching(doc, 2)
    expect(target.witnesses.length).toBeGreaterThan(0)
    expect(target.complete).toBe(true)
  })

  it('同色即使不交也只能取 1；Fano 任意两线相交 → 1', () => {
    const sameColor = docFromEdgeSets('同色', 6, [
      [0, 1, 2],
      [3, 4, 5],
    ])
    sameColor.edges[1]!.color = sameColor.edges[0]!.color
    expect(maxRainbowHyperMatching(sameColor).size).toBe(1)
    expect(maxRainbowHyperMatching(FANO).size).toBe(1)
    const target = findRainbowHyperMatching(FANO, 2)
    expect(target.witnesses).toEqual([])
  })
})
