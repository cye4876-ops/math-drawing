/**
 * 子群格布局测试（v2.2）：节点数 = 子群数；覆盖边数对照教科书推导。
 */
import { describe, expect, it } from 'vitest'
import { computeSubgroupLattice } from './lattice'
import { GROUP_A4, GROUP_C4, GROUP_D4, GROUP_Q8, GROUP_S3, type FiniteGroup } from './groups'

function checkLattice(group: FiniteGroup): ReturnType<typeof computeSubgroupLattice> {
  const lattice = computeSubgroupLattice(group)
  // 底 = 平凡子群，顶 = 群自身
  const bottom = lattice.nodes.find((node) => node.level === 0)
  expect(bottom?.size).toBe(1)
  const maxLevel = Math.max(...lattice.nodes.map((node) => node.level))
  const top = lattice.nodes.find((node) => node.level === maxLevel)
  expect(top?.size).toBe(group.order)
  // 每条边：小 ⊂ 大 且 升层
  for (const [from, to] of lattice.edges) {
    const small = lattice.nodes[from]
    const big = lattice.nodes[to]
    expect(small).toBeTruthy()
    expect(big).toBeTruthy()
    if (!small || !big) continue
    expect(small.size).toBeLessThan(big.size)
    expect(big.level).toBeGreaterThan(small.level)
    expect(small.subgroup.every((value) => big.subgroup.includes(value))).toBe(true)
  }
  return lattice
}

describe('v2.2 子群格（Hasse 图）', () => {
  it('C₄：3 节点 2 边（链）', () => {
    const lattice = checkLattice(GROUP_C4)
    expect(lattice.nodes.length).toBe(3)
    expect(lattice.edges.length).toBe(2)
  })

  it('S₃：6 节点 8 边；A₃ 正规、3 个 2 阶子群非正规', () => {
    const lattice = checkLattice(GROUP_S3)
    expect(lattice.nodes.length).toBe(6)
    expect(lattice.edges.length).toBe(8)
    expect(lattice.nodes.filter((node) => node.size === 2).every((node) => !node.normal)).toBe(true)
    expect(lattice.nodes.filter((node) => node.size === 3).every((node) => node.normal)).toBe(true)
  })

  it('Q₈：6 节点 7 边、全部节点正规（哈密顿群）', () => {
    const lattice = checkLattice(GROUP_Q8)
    expect(lattice.nodes.length).toBe(6)
    expect(lattice.edges.length).toBe(7)
    expect(lattice.nodes.every((node) => node.normal)).toBe(true)
  })

  it('D₄：10 节点 15 边、4 个非正规（反射二阶子群）', () => {
    const lattice = checkLattice(GROUP_D4)
    expect(lattice.nodes.length).toBe(10)
    expect(lattice.edges.length).toBe(15)
    expect(lattice.nodes.filter((node) => !node.normal).length).toBe(4)
  })

  it('A₄：10 节点 15 边、无 6 阶节点', () => {
    const lattice = checkLattice(GROUP_A4)
    expect(lattice.nodes.length).toBe(10)
    expect(lattice.edges.length).toBe(15)
    expect(lattice.nodes.some((node) => node.size === 6)).toBe(false)
  })
})
