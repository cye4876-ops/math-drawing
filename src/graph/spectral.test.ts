/**
 * 谱分析测试（v0.5）：邻接矩阵构造、Jacobi 全谱（含经典图论谱案例）、
 * 幂迭代谱半径与 Perron 向量（Perron–Frobenius）。
 */
import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import type { GraphObject } from './model'
import {
  buildAdjacencyMatrix,
  buildLaplacianMatrix,
  computeSpectrum,
  jacobiEigenSymmetric,
  perronVector,
} from './spectral'

function make(dsl: string): GraphObject {
  const { graph } = graphObjectFromDsl(dsl)
  return graph!
}

const EMPTY: GraphObject = {
  id: 'empty',
  type: 'graph',
  name: '空图',
  nodes: [],
  edges: [],
  visible: true,
}

/** 用 V·Λ·Vᵀ 重建对称矩阵（验证特征分解正确性） */
function reconstruct(values: number[], vectors: number[][]): number[][] {
  const n = values.length
  const result = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i]![j]! += vectors[k]![i]! * values[k]! * vectors[k]![j]!
      }
    }
  }
  return result
}

function expectMatrixClose(actual: number[][], expected: number[][]): void {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    for (let j = 0; j < expected[i]!.length; j++) {
      expect(actual[i]![j]!).toBeCloseTo(expected[i]![j]!, 9)
    }
  }
}

describe('v0.5 谱：邻接矩阵构造', () => {
  it('无向图：对称 0/1 矩阵', () => {
    const { matrix, symmetric, labels } = buildAdjacencyMatrix(make('1-2, 2-3, 3-1'))
    expectMatrixClose(matrix, [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ])
    expect(symmetric).toBe(true)
    expect(labels.map((item) => item.label)).toEqual(['1', '2', '3'])
  })

  it('有向图：i→j 记入 [i][j]；非对称', () => {
    const { matrix, symmetric } = buildAdjacencyMatrix(make('A->B'))
    expectMatrixClose(matrix, [
      [0, 1],
      [0, 0],
    ])
    expect(symmetric).toBe(false)
  })

  it('权重取边权；平行边累加；无向边两端各累加', () => {
    expectMatrixClose(buildAdjacencyMatrix(make('A-B:3')).matrix, [
      [0, 3],
      [3, 0],
    ])
    expectMatrixClose(buildAdjacencyMatrix(make('A-B:2, A-B')).matrix, [
      [0, 3],
      [3, 0],
    ])
  })

  it('自环计对角一次；无向自环不翻倍', () => {
    expectMatrixClose(buildAdjacencyMatrix(make('A-A')).matrix, [[1]])
    expectMatrixClose(buildAdjacencyMatrix(make('A-A:2.5')).matrix, [[2.5]])
  })

  it('有向对称对（A->B, B->A）被判定为对称', () => {
    const { matrix, symmetric } = buildAdjacencyMatrix(make('A->B, B->A'))
    // 两条有向边分别记入 [A][B] 与 [B][A]，各 1
    expectMatrixClose(matrix, [
      [0, 1],
      [1, 0],
    ])
    expect(symmetric).toBe(true)
  })
})

describe('v0.5 谱：Jacobi 全谱（经典案例）', () => {
  it('K3：特征值 [2, -1, -1] 且 V·Λ·Vᵀ 重建矩阵', () => {
    const graph = make('1-2, 2-3, 3-1')
    const { matrix } = buildAdjacencyMatrix(graph)
    const { values, vectors } = jacobiEigenSymmetric(matrix)
    expect(values[0]).toBeCloseTo(2, 9)
    expect(values[1]).toBeCloseTo(-1, 9)
    expect(values[2]).toBeCloseTo(-1, 9)
    expectMatrixClose(reconstruct(values, vectors), matrix)
  })

  it('K4：[3, -1, -1, -1]', () => {
    const graph = make('1-2, 1-3, 1-4, 2-3, 2-4, 3-4')
    const { matrix } = buildAdjacencyMatrix(graph)
    const { values } = jacobiEigenSymmetric(matrix)
    expect(values[0]).toBeCloseTo(3, 9)
    for (let i = 1; i < 4; i++) expect(values[i]).toBeCloseTo(-1, 9)
  })

  it('C4：[2, 0, 0, -2]；P3：[√2, 0, -√2]', () => {
    const c4 = jacobiEigenSymmetric(buildAdjacencyMatrix(make('1-2, 2-3, 3-4, 4-1')).matrix)
    expect(c4.values[0]).toBeCloseTo(2, 9)
    expect(c4.values[1]).toBeCloseTo(0, 9)
    expect(c4.values[2]).toBeCloseTo(0, 9)
    expect(c4.values[3]).toBeCloseTo(-2, 9)

    const p3 = jacobiEigenSymmetric(buildAdjacencyMatrix(make('1-2, 2-3')).matrix)
    expect(p3.values[0]).toBeCloseTo(Math.SQRT2, 9)
    expect(p3.values[1]).toBeCloseTo(0, 9)
    expect(p3.values[2]).toBeCloseTo(-Math.SQRT2, 9)
  })

  it('带权路径 A-B:2, B-C:3：±√13', () => {
    const { values } = jacobiEigenSymmetric(buildAdjacencyMatrix(make('A-B:2, B-C:3')).matrix)
    expect(values[0]).toBeCloseTo(Math.sqrt(13), 9)
    expect(values[1]).toBeCloseTo(0, 9)
    expect(values[2]).toBeCloseTo(-Math.sqrt(13), 9)
  })

  it('边界：空矩阵、1×1、零矩阵', () => {
    expect(jacobiEigenSymmetric([]).values).toEqual([])
    expect(jacobiEigenSymmetric([[5]]).values).toEqual([5])
    const zero = jacobiEigenSymmetric([
      [0, 0],
      [0, 0],
    ])
    expect(zero.values).toEqual([0, 0])
  })
})

describe('v0.5 谱：Perron 向量与谱半径', () => {
  it('K3：ρ=2，Perron 向量均匀 [1,1,1]', () => {
    const result = perronVector(make('1-2, 2-3, 3-1'))
    expect(result.eigenvalue).toBeCloseTo(2, 9)
    expect(result.vector.map((value) => Math.round(value * 1e6) / 1e6)).toEqual([1, 1, 1])
    expect(result.converged).toBe(true)
  })

  it('星图 K1,3：ρ=√3，中心 1、叶子 1/√3', () => {
    const result = perronVector(make('1-2, 1-3, 1-4'))
    expect(result.eigenvalue).toBeCloseTo(Math.sqrt(3), 9)
    expect(result.vector[0]).toBeCloseTo(1, 9)
    expect(result.vector[1]).toBeCloseTo(1 / Math.sqrt(3), 9)
    expect(result.vector[2]).toBeCloseTo(1 / Math.sqrt(3), 9)
    expect(result.vector[3]).toBeCloseTo(1 / Math.sqrt(3), 9)
  })

  it('Petersen 图（3-正则、点传递）：ρ=3、Perron 向量全 1', () => {
    const PETERSEN = '1-2, 2-3, 3-4, 4-5, 5-1, 6-8, 8-10, 10-7, 7-9, 9-6, 1-6, 2-7, 3-8, 4-9, 5-10'
    const result = perronVector(make(PETERSEN))
    expect(result.eigenvalue).toBeCloseTo(3, 8)
    for (const value of result.vector) expect(value).toBeCloseTo(1, 8)
  })

  it('周期图（C4 二分）与有向环均收敛：A+I 变体处理振荡', () => {
    const c4 = perronVector(make('1-2, 2-3, 3-4, 4-1'))
    expect(c4.eigenvalue).toBeCloseTo(2, 9)
    expect(c4.converged).toBe(true)

    const directed = perronVector(make('A->B, B->C, C->A'))
    expect(directed.eigenvalue).toBeCloseTo(1, 9)
    expect(directed.converged).toBe(true)
    expect(directed.vector[0]).toBeCloseTo(1, 9)
  })

  it('边界：空图 ρ=0；孤立单点 ρ=0、Perron [1]；单点自环 ρ=1', () => {
    expect(perronVector(EMPTY)).toEqual({ eigenvalue: 0, vector: [], converged: true })
    const single = perronVector(make('A'))
    expect(single.eigenvalue).toBe(0)
    expect(single.vector).toEqual([1])
    expect(perronVector(make('A-A')).eigenvalue).toBeCloseTo(1, 9)
  })

  it('有向链（Jordan 型，慢收敛）：ρ 近似 0', () => {
    const result = perronVector(make('A->B, B->C'))
    expect(result.eigenvalue).toBeLessThan(0.2)
  })
})

describe('v0.5 谱：拉普拉斯矩阵 L = D − A', () => {
  it('K3：L 行和为 0；Jacobi 谱为 [3, 3, 0]', () => {
    const graph = make('1-2, 2-3, 3-1')
    const laplacian = buildLaplacianMatrix(buildAdjacencyMatrix(graph))
    expectMatrixClose(laplacian, [
      [2, -1, -1],
      [-1, 2, -1],
      [-1, -1, 2],
    ])
    for (const row of laplacian) {
      expect(row.reduce((sum, value) => sum + value, 0)).toBeCloseTo(0, 9)
    }
    const { values } = jacobiEigenSymmetric(laplacian)
    expect(values[0]).toBeCloseTo(3, 9)
    expect(values[1]).toBeCloseTo(3, 9)
    expect(values[2]).toBeCloseTo(0, 9)
  })

  it('带权路径：对角 = 加权度和，行和 0', () => {
    const laplacian = buildLaplacianMatrix(buildAdjacencyMatrix(make('A-B:1.5, B-C:2.5')))
    expectMatrixClose(laplacian, [
      [1.5, -1.5, 0],
      [-1.5, 4, -2.5],
      [0, -2.5, 2.5],
    ])
  })

  it('空图安全', () => {
    expect(buildLaplacianMatrix(buildAdjacencyMatrix(EMPTY))).toEqual([])
  })
})

describe('v0.5 谱：computeSpectrum 高层入口', () => {
  it('对称图：全谱可用且 eigenvalues[0] 与谱半径一致', () => {
    const PETERSEN = '1-2, 2-3, 3-4, 4-5, 5-1, 6-8, 8-10, 10-7, 7-9, 9-6, 1-6, 2-7, 3-8, 4-9, 5-10'
    const spectrum = computeSpectrum(make(PETERSEN))
    expect(spectrum.symmetric).toBe(true)
    expect(spectrum.eigenvalues).not.toBeNull()
    expect(spectrum.eigenvalues![0]).toBeCloseTo(3, 8)
    expect(spectrum.spectralRadius).toBeCloseTo(3, 8)
    expect(spectrum.perron).toHaveLength(10)
  })

  it('非对称图：全谱为 null，仍给出谱半径与 Perron 向量', () => {
    const spectrum = computeSpectrum(make('A->B:2, B->C:3'))
    expect(spectrum.symmetric).toBe(false)
    expect(spectrum.eigenvalues).toBeNull()
    expect(spectrum.perron).toHaveLength(3)
  })

  it('规模上限：超过 maxFullSpectrumSize 时跳过全谱', () => {
    const graph = make('1-2, 2-3, 3-4, 4-1')
    expect(computeSpectrum(graph, { maxFullSpectrumSize: 3 }).eigenvalues).toBeNull()
    expect(computeSpectrum(graph, { maxFullSpectrumSize: 4 }).eigenvalues).not.toBeNull()
  })

  it('空图安全：矩阵为空、ρ=0、Perron 为空', () => {
    const spectrum = computeSpectrum(EMPTY)
    expect(spectrum.adjacency.matrix).toEqual([])
    expect(spectrum.eigenvalues).toBeNull()
    expect(spectrum.spectralRadius).toBe(0)
    expect(spectrum.perron).toEqual([])
  })
})
