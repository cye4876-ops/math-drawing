/**
 * 矩阵分解内核测试（v2.3）：全部对照解析结果。
 */
import { describe, expect, it } from 'vitest'
import {
  characteristicPolynomial,
  cleanNumber,
  determinant,
  eigenDecompose,
  identity,
  inverse,
  luDecompose,
  matmul,
  nullspace,
  polyRoots,
  qrDecompose,
  rank,
  rankTolerance,
  transpose,
} from './linalg'

const A24 = [
  [1, 2],
  [3, 4],
]
const SYM = [
  [2, 1],
  [1, 2],
]

function expectMatrixClose(a: number[][], b: number[][], digits = 9): void {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) {
    expect(a[i]?.length).toBe(b[i]?.length)
    for (let j = 0; j < (a[i]?.length ?? 0); j++) {
      expect(a[i]?.[j] ?? 0).toBeCloseTo(b[i]?.[j] ?? 0, digits)
    }
  }
}

describe('v2.3 矩阵基础', () => {
  it('乘法与转置', () => {
    expectMatrixClose(matmul(A24, identity(2)), A24)
    expectMatrixClose(transpose(A24), [
      [1, 3],
      [2, 4],
    ])
  })

  it('行列式：2×2 / 对角 / 奇异', () => {
    expect(determinant(A24)).toBeCloseTo(-2, 10)
    expect(
      determinant([
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4],
      ]),
    ).toBeCloseTo(24, 10)
    expect(
      determinant([
        [1, 2],
        [2, 4],
      ]),
    ).toBeCloseTo(0, 10)
  })

  it('逆矩阵：A·A⁻¹ = I；奇异返回 null', () => {
    const inv = inverse(A24)
    expect(inv).not.toBeNull()
    if (inv) expectMatrixClose(matmul(A24, inv), identity(2), 9)
    expect(
      inverse([
        [1, 2],
        [2, 4],
      ]),
    ).toBeNull()
  })

  it('秩', () => {
    expect(
      rank([
        [1, 2],
        [2, 4],
      ]),
    ).toBe(1)
    expect(
      rank([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]),
    ).toBe(2)
    expect(rank(identity(4))).toBe(4)
  })

  it('cleanNumber 抹零', () => {
    expect(cleanNumber(4.44e-16)).toBe(0)
    expect(cleanNumber(-1e-12)).toBe(0)
    expect(cleanNumber(0.5)).toBe(0.5)
  })
})

describe('v2.3 LU 分解（P·A = L·U）', () => {
  const cases: number[][][] = [
    [
      [2, 1],
      [4, 3],
    ],
    [
      [0, 1],
      [1, 0],
    ],
    [
      [2, 1, 1],
      [4, -6, 0],
      [-2, 7, 2],
    ],
    [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 10],
    ],
  ]
  for (const [index, matrix] of cases.entries()) {
    it(`用例 ${index + 1}：重构 P·A ≈ L·U，L 单位下三角、U 上三角`, () => {
      const { p, l, u } = luDecompose(matrix)
      expectMatrixClose(matmul(p, matrix), matmul(l, u), 8)
      const n = matrix.length
      for (let i = 0; i < n; i++) {
        expect(l[i]?.[i] ?? 0).toBeCloseTo(1, 10)
        for (let j = 0; j < i; j++) expect(Math.abs(u[i]?.[j] ?? 0)).toBeLessThan(1e-12)
        for (let j = i + 1; j < n; j++) expect(Math.abs(l[i]?.[j] ?? 0)).toBeLessThan(1e-12)
      }
    })
  }
})

describe('v2.3 QR 分解（A = Q·R）', () => {
  const cases: number[][][] = [
    [
      [1, 2],
      [3, 4],
    ],
    [
      [1, 1],
      [1, 0],
    ],
    [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 10],
    ],
  ]
  for (const [index, matrix] of cases.entries()) {
    it(`用例 ${index + 1}：Q 正交、R 上三角、Q·R ≈ A`, () => {
      const { q, r } = qrDecompose(matrix)
      const m = matrix.length
      expectMatrixClose(matmul(transpose(q), q), identity(m), 8)
      expectMatrixClose(matmul(q, r), matrix, 8)
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < Math.min(i, matrix[0]?.length ?? 0); j++) {
          expect(r[i]?.[j] ?? 0).toBe(0)
        }
      }
    })
  }

  it('[[1,2],[3,4]] 的 R 对角为 3.1623 / 0.6325（手算对照）', () => {
    const { r } = qrDecompose(A24)
    expect(r[0]?.[0] ?? 0).toBeCloseTo(3.16227766, 6)
    expect(r[1]?.[1] ?? 0).toBeCloseTo(0.63245553, 6)
  })
})

describe('v2.3 特征多项式与复根', () => {
  it('charPoly([[2,1],[1,2]]) = λ² − 4λ + 3', () => {
    expect(characteristicPolynomial(SYM).map((value) => cleanNumber(value, 1e-10))).toEqual([
      1, -4, 3,
    ])
  })

  it('charPoly([[1,2],[3,4]]) = λ² − 5λ − 2', () => {
    expect(characteristicPolynomial(A24).map((value) => cleanNumber(value, 1e-10))).toEqual([
      1, -5, -2,
    ])
  })

  it('charPoly(diag(1,2,3)) = λ³ − 6λ² + 11λ − 6', () => {
    const poly = characteristicPolynomial([
      [1, 0, 0],
      [0, 2, 0],
      [0, 0, 3],
    ])
    expect(poly.map((value) => cleanNumber(value, 1e-9))).toEqual([1, -6, 11, -6])
  })

  it('polyRoots：λ² − 5λ − 2 与 λ³ − 6λ² + 11λ − 6', () => {
    const roots2 = polyRoots([1, -5, -2])
      .map((z) => z.re)
      .sort((a, b) => a - b)
    expect(roots2[0]).toBeCloseTo((5 - Math.sqrt(33)) / 2, 8)
    expect(roots2[1]).toBeCloseTo((5 + Math.sqrt(33)) / 2, 8)
    const roots3 = polyRoots([1, -6, 11, -6])
      .map((z) => Math.round(z.re))
      .sort((a, b) => a - b)
    expect(roots3).toEqual([1, 2, 3])
  })

  it('polyRoots：λ² + 1 → ±i（复根）', () => {
    const roots = polyRoots([1, 0, 1])
    expect(roots.length).toBe(2)
    for (const root of roots) {
      expect(Math.abs(root.re)).toBeLessThan(1e-9)
      expect(Math.abs(Math.abs(root.im) - 1)).toBeLessThan(1e-9)
    }
  })
})

describe('v2.3 零空间', () => {
  it('[[1,2],[2,4]] 的零空间由 (−2,1) 张成', () => {
    const basis = nullspace([
      [1, 2],
      [2, 4],
    ])
    expect(basis.length).toBe(1)
    const v = basis[0] ?? []
    // 归一方向检查：v ∝ (−2,1)
    const ratio = (v[0] ?? 0) / (v[1] ?? 1)
    expect(ratio).toBeCloseTo(-2, 9)
  })

  it('可逆矩阵零空间为空', () => {
    expect(nullspace(A24).length).toBe(0)
  })
})

describe('v2.3 相似对角化（A = P·D·P⁻¹）', () => {
  it('对称 [[2,1],[1,2]]：λ = 3, 1，残差 ≈ 0', () => {
    const result = eigenDecompose(SYM)
    expect(result.hasComplex).toBe(false)
    expect(result.diagonalizable).toBe(true)
    expect([...result.distinctRealValues].sort((a, b) => a - b)).toEqual([1, 3])
    expect(result.residual).toBeLessThan(1e-9)
    // 每个特征向量满足 A·v = λ·v
    const p = result.p ?? []
    const d = result.d ?? []
    for (let col = 0; col < 2; col++) {
      const lambda = d[col]?.[col] ?? 0
      const v = p.map((row) => row[col] ?? 0)
      const av = SYM.map((row) => row[0]! * (v[0] ?? 0) + row[1]! * (v[1] ?? 0))
      const lv = v.map((value) => lambda * value)
      for (let i = 0; i < 2; i++) expect(av[i] ?? 0).toBeCloseTo(lv[i] ?? 0, 8)
    }
  })

  it('旋转 [[0,−1],[1,0]]：复特征值 → ℝ 上不可对角化', () => {
    const result = eigenDecompose([
      [0, -1],
      [1, 0],
    ])
    expect(result.hasComplex).toBe(true)
    expect(result.diagonalizable).toBe(false)
    expect(result.complexPairs.length).toBe(2)
  })

  it('剪切 [[1,1],[0,1]]：重根但几何重数 1 → 不可对角化', () => {
    const result = eigenDecompose([
      [1, 1],
      [0, 1],
    ])
    expect(result.hasComplex).toBe(false)
    expect(result.diagonalizable).toBe(false)
    expect(result.algebraicMultiplicities).toEqual([2])
    expect(result.geometricMultiplicities).toEqual([1])
  })

  it('一般 [[1,2],[3,4]]：两个实特征值，可对角化', () => {
    const result = eigenDecompose(A24)
    expect(result.hasComplex).toBe(false)
    expect(result.diagonalizable).toBe(true)
    expect(result.residual).toBeLessThan(1e-9)
    expect([...result.distinctRealValues].sort((a, b) => a - b)[0]).toBeCloseTo(
      (5 - Math.sqrt(33)) / 2,
      8,
    )
  })

  it('对称 3×3：λ = 2, 2±√2，残差 ≈ 0', () => {
    const result = eigenDecompose([
      [2, 1, 0],
      [1, 2, 1],
      [0, 1, 2],
    ])
    expect(result.diagonalizable).toBe(true)
    expect(result.residual).toBeLessThan(1e-8)
    const sorted = [...result.distinctRealValues].sort((a, b) => a - b)
    expect(sorted[0]).toBeCloseTo(2 - Math.SQRT2, 6)
    expect(sorted[1]).toBeCloseTo(2, 6)
    expect(sorted[2]).toBeCloseTo(2 + Math.SQRT2, 6)
  })
})

describe('v2.9 数值核验修正（单位阵/重特征值/小尺度）', () => {
  it('单位阵 I4：全部特征值 1、可实对角化（回归：曾被误判复特征值）', () => {
    const result = eigenDecompose(identity(4))
    expect(result.hasComplex).toBe(false)
    expect(result.diagonalizable).toBe(true)
    expect(result.eigenvalues.map((z) => z.re)).toEqual([1, 1, 1, 1])
    expect(result.distinctRealValues).toEqual([1])
    expect(result.algebraicMultiplicities).toEqual([4])
    expect(result.geometricMultiplicities).toEqual([4])
    expect(result.residual).toBeLessThan(1e-9)
    expect(result.diagonalizableOverComplex).toBe(true)
  })

  it('单位阵 I3：同样可实对角化（D = I、P = I）', () => {
    const result = eigenDecompose(identity(3))
    expect(result.diagonalizable).toBe(true)
    expect(result.p).not.toBeNull()
    expect(result.d).not.toBeNull()
    expect(result.residual).toBeLessThan(1e-9)
  })

  it('Jordan 块：重根但几何重数 1 → ℝ 与 ℂ 上均不可对角化', () => {
    const result = eigenDecompose([
      [1, 1],
      [0, 1],
    ])
    expect(result.hasComplex).toBe(false)
    expect(result.diagonalizable).toBe(false)
    expect(result.algebraicMultiplicities).toEqual([2])
    expect(result.geometricMultiplicities).toEqual([1])
    expect(result.diagonalizableOverComplex).toBe(false)
  })

  it('旋转矩阵：不能实对角化，但 ℂ 上可对角化（几何重数 = 代数重数 = 1）', () => {
    const result = eigenDecompose([
      [0, -1],
      [1, 0],
    ])
    expect(result.hasComplex).toBe(true)
    expect(result.diagonalizable).toBe(false)
    expect(result.diagonalizableOverComplex).toBe(true)
    expect(result.complexGeometricMultiplicities).toEqual([1, 1])
  })

  it('行列式不再被直接归零：det diag(1e-6, 1e-6) = 1e-12 且逆矩阵一致', () => {
    const a = [
      [1e-6, 0],
      [0, 1e-6],
    ]
    const det = determinant(a)
    expect(det).toBeGreaterThan(0)
    expect(Math.abs(det - 1e-12)).toBeLessThan(1e-18)
    const inv = inverse(a)
    expect(inv).not.toBeNull()
    expect(inv![0]![0]).toBeCloseTo(1e6, 0)
  })

  it('小尺度矩阵数值秩正确：1e-10·I2 秩 2（回归：曾被判秩 0）', () => {
    expect(
      rank([
        [1e-10, 0],
        [0, 1e-10],
      ]),
    ).toBe(2)
    expect(rank(identity(2))).toBe(2)
    expect(
      rank([
        [0, 0],
        [0, 0],
      ]),
    ).toBe(0)
    expect(rankTolerance(identity(2))).toBeCloseTo(1e-9, 20)
  })
})
