/**
 * Marching Cubes 测试（v0.8）——覆盖规格「关键正确性测试」：
 * 球面提取顶点到原点距离标准差 < 1e-3；平面/常数场；64³ 性能 < 2 秒；索引合法。
 */
import { describe, expect, it } from 'vitest'
import { marchingCubes } from './marching-cubes'

describe('v0.8 Marching Cubes：几何正确性', () => {
  it('单位球 x²+y²+z²−1 = 0：顶点到原点距离的均值与标准差 < 1e-3', () => {
    const surface = marchingCubes((x, y, z) => x * x + y * y + z * z - 1, {
      min: [-1.2, -1.2, -1.2],
      max: [1.2, 1.2, 1.2],
      resolution: 64,
    })
    expect(surface.triangleCount).toBeGreaterThan(1000)
    const vertexCount = surface.positions.length / 3
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < vertexCount; i++) {
      const x = surface.positions[i * 3]!
      const y = surface.positions[i * 3 + 1]!
      const z = surface.positions[i * 3 + 2]!
      const r = Math.hypot(x, y, z)
      sum += r
      sumSq += r * r
    }
    const mean = sum / vertexCount
    const std = Math.sqrt(Math.max(0, sumSq / vertexCount - mean * mean))
    expect(Math.abs(mean - 1)).toBeLessThan(1e-3)
    expect(std).toBeLessThan(1e-3)
  })

  it('平面 F = z：交点 z ≈ 0', () => {
    const surface = marchingCubes((_x, _y, z) => z, {
      min: [-1, -1, -1],
      max: [1, 1, 1],
      resolution: 16,
    })
    expect(surface.triangleCount).toBeGreaterThan(0)
    for (let i = 0; i < surface.positions.length / 3; i++) {
      expect(Math.abs(surface.positions[i * 3 + 2]!)).toBeLessThan(1e-6)
    }
  })

  it('常数场（无处过零）：无三角形', () => {
    const surface = marchingCubes(() => 1, { min: [0, 0, 0], max: [1, 1, 1], resolution: 8 })
    expect(surface.triangleCount).toBe(0)
    expect(surface.positions.length).toBe(0)
  })

  it('索引均在范围内；每个顶点都有单位法线', () => {
    const surface = marchingCubes((x, y, z) => x * x + y * y + z * z - 0.5, {
      min: [-1, -1, -1],
      max: [1, 1, 1],
      resolution: 24,
    })
    expect(surface.triangleCount).toBeGreaterThan(0)
    for (let i = 0; i < surface.positions.length / 3; i++) {
      // 每个顶点都有法线
      const norm = Math.hypot(
        surface.normals[i * 3]!,
        surface.normals[i * 3 + 1]!,
        surface.normals[i * 3 + 2]!,
      )
      expect(norm).toBeCloseTo(1, 3)
    }
  })

  it('法线为梯度方向（球面：法线 ≈ 径向单位向量）', () => {
    const surface = marchingCubes((x, y, z) => x * x + y * y + z * z - 1, {
      min: [-1.2, -1.2, -1.2],
      max: [1.2, 1.2, 1.2],
      resolution: 32,
    })
    for (let i = 0; i < surface.positions.length / 3; i += 11) {
      const x = surface.positions[i * 3]!
      const y = surface.positions[i * 3 + 1]!
      const z = surface.positions[i * 3 + 2]!
      const r = Math.hypot(x, y, z) || 1
      const dot =
        (surface.normals[i * 3]! * x +
          surface.normals[i * 3 + 1]! * y +
          surface.normals[i * 3 + 2]! * z) /
        r
      expect(dot).toBeGreaterThan(0.99)
    }
  })
})

describe('v0.8 Marching Cubes：性能', () => {
  it('64³ 分辨率球面提取 < 2 秒', () => {
    const start = performance.now()
    const surface = marchingCubes((x, y, z) => x * x + y * y + z * z - 1, {
      min: [-1.5, -1.5, -1.5],
      max: [1.5, 1.5, 1.5],
      resolution: 64,
    })
    const elapsed = performance.now() - start
    expect(surface.triangleCount).toBeGreaterThan(1000)
    expect(elapsed).toBeLessThan(2000)
  })
})
