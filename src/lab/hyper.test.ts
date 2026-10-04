import { describe, expect, it } from 'vitest'
import {
  builtinHyperPattern,
  constructHypergraph,
  compareHypergraphs,
  findHyperPattern,
  hyperBBtSpectrum,
  hyperDegrees,
  hyperFingerprint,
  hyperIsConnected,
  hyperIsLinear,
  hyperIsRegular,
  hyperMatchingNumber,
  hyperMaxCodegree,
  hyperRank,
  hyperUniformity,
  hyperWeakIndependence,
  normalizeHypergraph,
  validateHypergraphInput,
  FANO_EDGES,
  HyperError,
} from './hypergraph'

describe('超图模型与校验', () => {
  it('规范化与非法输入', () => {
    const h = validateHypergraphInput({
      n: 4,
      edges: [
        [2, 1, 0],
        [0, 1],
      ],
    })
    expect(h.edges).toEqual([
      [0, 1],
      [0, 1, 2],
    ])
    expect(() => validateHypergraphInput({ n: 0, edges: [] })).toThrow(HyperError)
    expect(() => validateHypergraphInput({ n: 3, edges: [[0, 0]] })).toThrow('不能重复包含同一顶点')
    expect(() =>
      validateHypergraphInput({
        n: 3,
        edges: [
          [0, 1],
          [1, 0],
        ],
      }),
    ).toThrow('不允许重复超边')
    expect(() =>
      validateHypergraphInput({ n: 2, edges: Array.from({ length: 81 }, () => [0]) }),
    ).toThrow()
  })

  it('内置构造', () => {
    expect(constructHypergraph('fano', 7, 3).edges).toHaveLength(7)
    expect(constructHypergraph('complete', 4, 3).edges).toHaveLength(4)
    expect(constructHypergraph('star', 5, 2).edges).toHaveLength(4)
    expect(constructHypergraph('matching', 6, 2).edges).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ])
    expect(constructHypergraph('empty', 4, 3).edges).toHaveLength(0)
  })
})

describe('超图分析（Fano 平面基准）', () => {
  const fano = normalizeHypergraph({ n: 7, edges: FANO_EDGES })

  it('结构与不变量', () => {
    expect(hyperDegrees(fano)).toEqual([3, 3, 3, 3, 3, 3, 3])
    expect(hyperMaxCodegree(fano)).toBe(1)
    expect(hyperRank(fano)).toBe(3)
    expect(hyperUniformity(fano)).toBe(3)
    expect(hyperIsLinear(fano)).toBe(true)
    expect(hyperIsConnected(fano)).toBe(true)
    expect(hyperIsRegular(fano)).toBe(true)
    expect(hyperMatchingNumber(fano).value).toBe(1)
    const weak = hyperWeakIndependence(fano)
    expect(weak.tau).toBe(3)
    expect(weak.alpha).toBe(4)
    expect(weak.alpha).toBe(fano.n - weak.tau)
  })

  it('BBᵀ 谱：特征值 9 与六个 2', () => {
    const spectrum = hyperBBtSpectrum(fano)
    expect(spectrum.coefficients.map(String)).toEqual([
      '1',
      '-21',
      '168',
      '-700',
      '1680',
      '-2352',
      '1792',
      '-576',
    ])
    const sorted = [...spectrum.eigenvalues].sort((a, b) => b - a)
    expect(sorted[0]).toBeCloseTo(9, 8)
    for (let i = 1; i < 7; i++) expect(sorted[i]).toBeCloseTo(2, 8)
  })

  it('孤立点与空超图', () => {
    const h = normalizeHypergraph({
      n: 6,
      edges: [
        [0, 1, 2],
        [2, 3, 4],
      ],
    })
    expect(hyperDegrees(h)).toEqual([1, 1, 2, 1, 1, 0])
    expect(hyperIsConnected(h)).toBe(false)
    expect(hyperUniformity(h)).toBe(3)
    const empty = normalizeHypergraph({ n: 4, edges: [] })
    expect(hyperUniformity(empty)).toBeNull()
    expect(hyperIsRegular(empty)).toBe(true)
    expect(hyperIsConnected(empty)).toBe(false)
  })
})

describe('禁超图包含', () => {
  it('普通包含：单边禁超图可映射到任意超边', () => {
    const host = normalizeHypergraph({
      n: 4,
      edges: [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ],
    })
    const pattern = normalizeHypergraph({ n: 4, edges: [[0, 1, 2]] })
    expect(findHyperPattern(host, pattern, 'subgraph')).not.toBeNull()
    const partial = normalizeHypergraph({
      n: 4,
      edges: [
        [0, 1, 3],
        [0, 2, 3],
      ],
    })
    expect(findHyperPattern(partial, pattern, 'subgraph')).not.toBeNull()
  })

  it('诱导包含：映射集内完整超边须恰等', () => {
    const k4 = normalizeHypergraph({
      n: 4,
      edges: [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ],
    })
    const single = normalizeHypergraph({ n: 4, edges: [[0, 1, 2]] })
    // K₄³ 的 4 点集内完整超边有 4 条 ≠ 1 条 → 诱导不命中
    expect(findHyperPattern(k4, single, 'induced')).toBeNull()
    // 普通包含则命中
    expect(findHyperPattern(k4, single, 'subgraph')).not.toBeNull()
    // 只含一条超边的宿主对其自身命中
    const one = normalizeHypergraph({ n: 4, edges: [[0, 1, 2]] })
    expect(findHyperPattern(one, single, 'induced')).not.toBeNull()
  })

  it('内置禁超图：K₄³ 与松三角形', () => {
    const k4 = builtinHyperPattern('K4_3')
    expect(findHyperPattern(k4, k4, 'subgraph')).not.toBeNull()
    const loose = builtinHyperPattern('loose_triangle')
    expect(findHyperPattern(loose, loose, 'subgraph')).not.toBeNull()
    // 4 点的 K₄³ 装不下 6 点的松三角形
    expect(findHyperPattern(k4, loose, 'subgraph')).toBeNull()
  })
})

describe('超图比较', () => {
  it('同构与重标记', () => {
    const a = normalizeHypergraph({
      n: 6,
      edges: [
        [0, 1, 2],
        [2, 3, 4],
      ],
    })
    const b = normalizeHypergraph({
      n: 6,
      edges: [
        [5, 3, 1],
        [1, 0, 2],
      ],
    })
    const result = compareHypergraphs(a, b)
    expect(result.isomorphic).toBe(true)
    expect(result.mappingVerified).toBe(true)
    expect(result.cospectral).toBe(true)
    for (const row of result.parameterRows) {
      if (row.label === '顶点数 n' || row.label === '超边数 m') expect(row.delta).toBe('0')
    }
  })

  it('不同构但同顶点数/超边数', () => {
    // 两条不交边（τ = 2）vs 共享一个顶点的两条边（τ = 1）：度序列不同 → 不同构
    const a = normalizeHypergraph({
      n: 6,
      edges: [
        [0, 1, 2],
        [3, 4, 5],
      ],
    })
    const b = normalizeHypergraph({
      n: 6,
      edges: [
        [0, 1, 2],
        [2, 3, 4],
      ],
    })
    const result = compareHypergraphs(a, b)
    expect(result.isomorphic).toBe(false)
    const tauRow = result.parameterRows.find((row) => row.label === '覆盖数 τ')!
    expect(tauRow.left).toBe('2')
    expect(tauRow.right).toBe('1')
    expect(tauRow.delta).toBe('-1')
  })
})

describe('指纹一致性', () => {
  it('同构超图指纹相同', () => {
    const a = normalizeHypergraph({
      n: 6,
      edges: [
        [0, 1, 2],
        [2, 3, 4],
      ],
    })
    const b = normalizeHypergraph({
      n: 6,
      edges: [
        [2, 3, 4],
        [0, 1, 2],
      ],
    })
    expect(hyperFingerprint(a)).toBe(hyperFingerprint(b))
  })
})
