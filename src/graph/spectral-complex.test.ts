/**
 * 有向图复数全谱测试（Faddeev–LeVerrier 特征多项式 + Durand–Kerner 复根）：
 * 已知谱结构（三角/旋转/有向环）、迹与行列式不变量、与 Jacobi 实数谱一致性、
 * computeSpectrum 集成（有向图给复谱、无向图为 null、超规模为 null）。
 */
import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import type { GraphEdgeData, GraphNodeData, GraphObject } from './model'
import {
  characteristicPolynomial,
  complexEigenvalues,
  computeSpectrum,
  jacobiEigenSymmetric,
  type ComplexNumber,
} from './spectral'

function make(dsl: string): GraphObject {
  const { graph } = graphObjectFromDsl(dsl)
  return graph!
}

function node(id: string): GraphNodeData {
  return { id, label: id, x: 0, y: 0, color: '#2563eb', size: 14, shape: 'circle', attrs: {} }
}

function edge(id: string, source: string, target: string): GraphEdgeData {
  return { id, source, target, directed: true, weight: null, color: '#9ca3af', style: 'solid' }
}

/** 断言存在一个与给定复数接近的特征值 */
function expectEigenvalue(values: ComplexNumber[], re: number, im: number, digits = 6): void {
  const found = values.find(
    (value) => Math.abs(value.re - re) < 10 ** -digits && Math.abs(value.im - im) < 10 ** -digits,
  )
  expect(
    found,
    `未找到特征值 ${re}${im >= 0 ? '+' : '−'}${Math.abs(im)}i；实际：${JSON.stringify(values)}`,
  ).toBeDefined()
}

describe('v0.5 谱：特征多项式（Faddeev–LeVerrier）', () => {
  it('上三角矩阵：p(λ) = (λ−2)(λ+1)(λ−5) = λ³−6λ²+3λ+10', () => {
    const c = characteristicPolynomial([
      [2, 1, 3],
      [0, -1, 4],
      [0, 0, 5],
    ])
    expect(c).toHaveLength(4)
    expect(c[0]).toBeCloseTo(1, 12)
    expect(c[1]).toBeCloseTo(-6, 10)
    expect(c[2]).toBeCloseTo(3, 10)
    expect(c[3]).toBeCloseTo(10, 10)
  })

  it('2×2：p(λ) = λ² − tr·λ + det', () => {
    const c = characteristicPolynomial([
      [1, 2],
      [3, 4],
    ])
    expect(c[0]).toBeCloseTo(1, 12)
    expect(c[1]).toBeCloseTo(-5, 10)
    expect(c[2]).toBeCloseTo(-2, 10)
  })
})

describe('v0.5 谱：复数全谱（Durand–Kerner）', () => {
  it('上三角矩阵：谱 = 对角元（|λ| 降序）', () => {
    const values = complexEigenvalues([
      [2, 1, 3],
      [0, -1, 4],
      [0, 0, 5],
    ])
    expect(values).toHaveLength(3)
    expect(values[0]!.re).toBeCloseTo(5, 6)
    expect(values[1]!.re).toBeCloseTo(2, 6)
    expect(values[2]!.re).toBeCloseTo(-1, 6)
    for (const value of values) expect(value.im).toBeCloseTo(0, 9)
  })

  it('旋转矩阵 [[0,−1],[1,0]]：特征值 ±i', () => {
    const values = complexEigenvalues([
      [0, -1],
      [1, 0],
    ])
    expect(values).toHaveLength(2)
    expectEigenvalue(values, 0, 1)
    expectEigenvalue(values, 0, -1)
  })

  it('三节点有向环：特征值 = 三次单位根（1, −0.5±0.866i）', () => {
    const graph = make('A->B, B->C, C->A')
    const { matrix } = computeSpectrum(graph).adjacency
    const values = complexEigenvalues(matrix)
    expect(values).toHaveLength(3)
    expectEigenvalue(values, 1, 0)
    expectEigenvalue(values, -0.5, Math.sqrt(3) / 2)
    expectEigenvalue(values, -0.5, -Math.sqrt(3) / 2)
  })

  it('四节点有向环：特征值 = ±1, ±i', () => {
    const graph = make('A->B, B->C, C->D, D->A')
    const { matrix } = computeSpectrum(graph).adjacency
    const values = complexEigenvalues(matrix)
    expect(values).toHaveLength(4)
    expectEigenvalue(values, 1, 0)
    expectEigenvalue(values, -1, 0)
    expectEigenvalue(values, 0, 1)
    expectEigenvalue(values, 0, -1)
  })

  it('迹与行列式不变量：Σλ = tr(A)，∏λ = det(A)', () => {
    // 混合有向图（非对称、权重各异）
    const graph = make('A->B:2, B->C, C->A:3, A->C:1, B->A:0.5')
    const { matrix } = computeSpectrum(graph).adjacency
    const values = complexEigenvalues(matrix)
    const n = matrix.length

    // Σλ 的实部 = 迹；虚部相互抵消
    let sumRe = 0
    let sumIm = 0
    for (const value of values) {
      sumRe += value.re
      sumIm += value.im
    }
    let trace = 0
    for (let i = 0; i < n; i++) trace += matrix[i]![i]!
    expect(sumRe).toBeCloseTo(trace, 8)
    expect(sumIm).toBeCloseTo(0, 8)

    // ∏λ 的实部 = 行列式（3×3 直接展开）
    let product: ComplexNumber = { re: 1, im: 0 }
    for (const value of values) {
      product = {
        re: product.re * value.re - product.im * value.im,
        im: product.re * value.im + product.im * value.re,
      }
    }
    const det =
      matrix[0]![0]! * (matrix[1]![1]! * matrix[2]![2]! - matrix[1]![2]! * matrix[2]![1]!) -
      matrix[0]![1]! * (matrix[1]![0]! * matrix[2]![2]! - matrix[1]![2]! * matrix[2]![0]!) +
      matrix[0]![2]! * (matrix[1]![0]! * matrix[2]![1]! - matrix[1]![1]! * matrix[2]![0]!)
    expect(product.re).toBeCloseTo(det, 8)
    expect(product.im).toBeCloseTo(0, 8)
  })

  it('对称矩阵：复谱与 Jacobi 实数谱一致（虚部归零）', () => {
    const graph = make('1-2, 2-3, 3-1')
    const { matrix } = computeSpectrum(graph).adjacency
    const complex = complexEigenvalues(matrix)
    const real = jacobiEigenSymmetric(matrix).values
    expect(complex).toHaveLength(3)
    for (const value of complex) expect(Math.abs(value.im)).toBeLessThan(1e-9)
    const sortedRe = complex.map((value) => value.re)
    expect(sortedRe[0]!).toBeCloseTo(real[0]!, 6)
    expect(sortedRe[1]!).toBeCloseTo(real[1]!, 6)
    expect(sortedRe[2]!).toBeCloseTo(real[2]!, 6)
  })

  it('空矩阵与 1×1', () => {
    expect(complexEigenvalues([])).toEqual([])
    const single = complexEigenvalues([[3]])
    expect(single).toHaveLength(1)
    expect(single[0]!.re).toBeCloseTo(3, 9)
  })

  it('幂零矩阵（有向链 A->B:2, B->C:3）：特征值全为 0（三重根）', () => {
    const graph = make('A->B:2, B->C:3')
    const { matrix } = computeSpectrum(graph).adjacency
    const values = complexEigenvalues(matrix)
    expect(values).toHaveLength(3)
    for (const value of values) {
      expect(Math.abs(value.re) + Math.abs(value.im)).toBeLessThan(1e-6)
    }
  })
})

describe('v0.5 谱：computeSpectrum 集成（复谱字段）', () => {
  it('无向图：complexEigenvalues 为 null（走 Jacobi 实数谱）', () => {
    const spectrum = computeSpectrum(make('A-B, B-C, C-A'))
    expect(spectrum.complexEigenvalues).toBeNull()
    expect(spectrum.eigenvalues).not.toBeNull()
  })

  it('有向图：complexEigenvalues 非 null 且与 eigenvalues（null）互斥', () => {
    const spectrum = computeSpectrum(make('A->B, B->C, C->A'))
    expect(spectrum.eigenvalues).toBeNull()
    expect(spectrum.complexEigenvalues).not.toBeNull()
    expect(spectrum.complexEigenvalues!).toHaveLength(3)
  })

  it('有向环（41 节点，超复谱上限 40）：complexEigenvalues 为 null', () => {
    const nodes = Array.from({ length: 41 }, (_, i) => node(`n${i}`))
    const edges = Array.from({ length: 41 }, (_, i) => edge(`e${i}`, `n${i}`, `n${(i + 1) % 41}`))
    const graph: GraphObject = {
      id: 'big',
      type: 'graph',
      name: 'big',
      visible: true,
      nodes,
      edges,
    }
    const spectrum = computeSpectrum(graph)
    expect(spectrum.complexEigenvalues).toBeNull()
    // 40 节点有向环则给复谱
    const smaller = computeSpectrum({
      ...graph,
      nodes: nodes.slice(0, 40),
      edges: edges.slice(0, 40),
    })
    expect(smaller.complexEigenvalues).not.toBeNull()
  })

  it('谱半径与复谱最大模一致（Perron–Frobenius）', () => {
    const graph = make('A->B, B->C, C->A, C->B')
    const spectrum = computeSpectrum(graph)
    const maxMod = Math.max(
      ...spectrum.complexEigenvalues!.map((value) => Math.hypot(value.re, value.im)),
    )
    expect(spectrum.spectralRadius).toBeCloseTo(maxMod, 6)
  })
})
