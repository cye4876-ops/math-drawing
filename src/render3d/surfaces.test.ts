/** 曲面网格测试（v0.8）：平面/梯度法线、参数曲面（环面）、旋转体（圆柱/圆锥）、NaN 处理与索引合法性。 */
import { describe, expect, it } from 'vitest'
import { explicitSurfaceMesh, parametricSurfaceMesh, revolveSurfaceMesh } from './surfaces'

describe('v0.8 曲面：显式 z = f(x, y)', () => {
  it('平面 z = 0：位置 z 全 0、法线 (0, 0, 1)、规模正确', () => {
    const mesh = explicitSurfaceMesh(() => 0, {
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      cols: 4,
      rows: 3,
    })
    expect(mesh.vertexCount).toBe(5 * 4)
    expect(mesh.triangleCount).toBe(4 * 3 * 2)
    for (let i = 0; i < mesh.vertexCount; i++) {
      expect(mesh.positions[i * 3 + 2]).toBeCloseTo(0, 12)
      expect(mesh.normals[i * 3]).toBeCloseTo(0, 9)
      expect(mesh.normals[i * 3 + 1]).toBeCloseTo(0, 9)
      expect(mesh.normals[i * 3 + 2]).toBeCloseTo(1, 9)
    }
  })

  it('斜面 z = x + y：法线 ≈ (−1, −1, 1)/√3', () => {
    const mesh = explicitSurfaceMesh((x, y) => x + y, {
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
      cols: 4,
      rows: 4,
    })
    const expected = 1 / Math.sqrt(3)
    for (let i = 0; i < 5; i++) {
      expect(mesh.normals[i * 3]).toBeCloseTo(-expected, 6)
      expect(mesh.normals[i * 3 + 1]).toBeCloseTo(-expected, 6)
      expect(mesh.normals[i * 3 + 2]).toBeCloseTo(expected, 6)
    }
  })

  it('NaN 区域：相关三角形跳过（索引与顶点数不越界）', () => {
    const mesh = explicitSurfaceMesh((x) => (x < 0 ? Number.NaN : x), {
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      cols: 4,
      rows: 4,
    })
    expect(mesh.triangleCount).toBeLessThan(32)
    expect(mesh.triangleCount).toBeGreaterThan(0)
    for (const index of mesh.indices) {
      expect(index).toBeLessThan(mesh.vertexCount)
    }
  })

  it('分辨率上限约束生效', () => {
    const mesh = explicitSurfaceMesh(() => 0, {
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
      cols: 9999,
      rows: 1,
    })
    expect(mesh.vertexCount).toBeLessThanOrEqual(513 * 2)
  })

  it('values = z（高度着色数据）', () => {
    const mesh = explicitSurfaceMesh((x) => x, {
      xMin: 0,
      xMax: 2,
      yMin: 0,
      yMax: 1,
      cols: 2,
      rows: 1,
    })
    expect(mesh.values[0]).toBeCloseTo(0, 12)
    expect(mesh.values[2]).toBeCloseTo(2, 12)
  })
})

describe('v0.8 曲面：参数曲面', () => {
  it('环面：(√(x²+y²)−R)² + z² = r²（顶点满足隐式方程）', () => {
    const R = 2
    const r = 0.7
    const mesh = parametricSurfaceMesh(
      (u, v) => [
        (R + r * Math.cos(v)) * Math.cos(u),
        (R + r * Math.cos(v)) * Math.sin(u),
        r * Math.sin(v),
      ],
      { uMin: 0, uMax: Math.PI * 2, vMin: 0, vMax: Math.PI * 2, cols: 48, rows: 24 },
    )
    for (let i = 0; i < mesh.vertexCount; i += 7) {
      const x = mesh.positions[i * 3]!
      const y = mesh.positions[i * 3 + 1]!
      const z = mesh.positions[i * 3 + 2]!
      const torus = (Math.hypot(x, y) - R) ** 2 + z * z - r * r
      expect(Math.abs(torus)).toBeLessThan(1e-6)
    }
  })

  it('法线为单位向量', () => {
    const mesh = parametricSurfaceMesh((u, v) => [Math.cos(u), Math.sin(u), v], {
      uMin: 0,
      uMax: Math.PI * 2,
      vMin: 0,
      vMax: 1,
      cols: 16,
      rows: 4,
    })
    for (let i = 0; i < mesh.vertexCount; i += 5) {
      const norm = Math.hypot(
        mesh.normals[i * 3]!,
        mesh.normals[i * 3 + 1]!,
        mesh.normals[i * 3 + 2]!,
      )
      expect(norm).toBeCloseTo(1, 6)
    }
  })
})

describe('v0.8 曲面：旋转体', () => {
  it('常数母线 y = 1 绕 x 轴 → 半径 1 的圆柱面', () => {
    const mesh = revolveSurfaceMesh(() => 1, { xMin: 0, xMax: 1, cols: 4, rows: 12 })
    for (let i = 0; i < mesh.vertexCount; i += 3) {
      const y = mesh.positions[i * 3 + 1]!
      const z = mesh.positions[i * 3 + 2]!
      expect(Math.hypot(y, z)).toBeCloseTo(1, 6)
    }
  })

  it('母线 y = x 绕 x 轴 → 半顶角 45° 的圆锥面', () => {
    const mesh = revolveSurfaceMesh((x) => x, { xMin: 0, xMax: 2, cols: 8, rows: 16 })
    for (let i = 0; i < mesh.vertexCount; i += 5) {
      const x = mesh.positions[i * 3]!
      const y = mesh.positions[i * 3 + 1]!
      const z = mesh.positions[i * 3 + 2]!
      if (x > 1e-9) expect(Math.hypot(y, z)).toBeCloseTo(x, 6)
    }
  })

  it('法线径向向外（圆柱面上）', () => {
    const mesh = revolveSurfaceMesh(() => 1, { xMin: -1, xMax: 1, cols: 4, rows: 8 })
    for (let i = 0; i < mesh.vertexCount; i += 3) {
      const y = mesh.positions[i * 3 + 1]!
      const z = mesh.positions[i * 3 + 2]!
      const ny = mesh.normals[i * 3 + 1]!
      const nz = mesh.normals[i * 3 + 2]!
      // 法线与径向同向
      expect(ny * y + nz * z).toBeGreaterThan(0.9)
      expect(Math.abs(mesh.normals[i * 3] ?? 0)).toBeLessThan(1e-6)
    }
  })
})
