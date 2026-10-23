/**
 * v3.2 立方体旋转群与 Burnside 测试（WSL Sage 环境显式枚举核验：
 * 面 2→10/3→57；顶点 2→23/3→333；棱 2→218/3→22815）。
 */
import { describe, expect, it } from 'vitest'
import { burnsideCount, cubeAction, cubeBurnside, cycleCount } from './polyhedral'

describe('v3.2 立方体旋转群（24 阶 ≅ S₄）', () => {
  it('群阶 24；面/顶点/棱 的作用均为置换', () => {
    const action = cubeAction()
    expect(action.group.order).toBe(24)
    expect(action.vertexPerms).toHaveLength(24)
    expect(action.facePerms).toHaveLength(24)
    expect(action.edgePerms).toHaveLength(24)
    for (const perm of action.facePerms) {
      expect(new Set(perm).size).toBe(6)
      expect(Math.max(...perm)).toBe(5)
    }
    for (const perm of action.edgePerms) {
      expect(new Set(perm).size).toBe(12)
      expect(Math.max(...perm)).toBe(11)
    }
  })

  it('Burnside 着色计数：面 2 色 = 10、3 色 = 57', () => {
    expect(cubeBurnside('faces', 2)).toBe(10)
    expect(cubeBurnside('faces', 3)).toBe(57)
  })

  it('Burnside 着色计数：顶点 2 色 = 23、3 色 = 333', () => {
    expect(cubeBurnside('vertices', 2)).toBe(23)
    expect(cubeBurnside('vertices', 3)).toBe(333)
  })

  it('Burnside 着色计数：棱 2 色 = 218、3 色 = 22815', () => {
    expect(cubeBurnside('edges', 2)).toBe(218)
    expect(cubeBurnside('edges', 3)).toBe(22815)
  })

  it('cycleCount 与 burnsideCount 基础行为：恒等置换 n 个循环、单元素群计数 = k^n', () => {
    expect(cycleCount([0, 1, 2, 3])).toBe(4)
    expect(cycleCount([1, 0, 3, 2])).toBe(2)
    expect(burnsideCount([[0, 1, 2]], 3)).toBe(27)
  })
})
