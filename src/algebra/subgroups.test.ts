/**
 * v3.2 智能子群枚举与子群格测试（Sage 核验：S₄=30、A₅=59、A₄=10；含阶直方图）。
 */
import { describe, expect, it } from 'vitest'
import {
  GROUP_A4,
  GROUP_A5,
  GROUP_C4,
  GROUP_C6,
  GROUP_D4,
  GROUP_Q8,
  GROUP_S3,
  GROUP_S4,
  GROUP_V4,
  allSubgroups,
} from './groups'
import { enumerateSubgroupsSmart, minimalGenerators, pSubgroups } from './subgroups'
import { computeSmartLattice } from './lattice'

function histogram(subgroups: number[][]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const subgroup of subgroups) {
    result[String(subgroup.length)] = (result[String(subgroup.length)] ?? 0) + 1
  }
  return result
}

describe('v3.2 智能子群枚举', () => {
  it('|G| ≤ 12 时与幂集扫描结果一致（C₄/V₄/C₆/S₃/D₄/Q₈/A₄）', () => {
    for (const group of [GROUP_C4, GROUP_V4, GROUP_C6, GROUP_S3, GROUP_D4, GROUP_Q8, GROUP_A4]) {
      const legacy = allSubgroups(group).map((sub) => sub.join(','))
      const smart = enumerateSubgroupsSmart(group).map((sub) => sub.join(','))
      expect(new Set(smart)).toEqual(new Set(legacy))
    }
  })

  it('S₄ = 30 个子群（阶直方图 1:1, 2:9, 3:4, 4:7, 6:4, 8:3, 12:1, 24:1）', () => {
    const subgroups = enumerateSubgroupsSmart(GROUP_S4)
    expect(subgroups).toHaveLength(30)
    expect(histogram(subgroups)).toEqual({
      '1': 1,
      '2': 9,
      '3': 4,
      '4': 7,
      '6': 4,
      '8': 3,
      '12': 1,
      '24': 1,
    })
  })

  it('A₅ = 59 个子群（阶直方图 1:1, 2:15, 3:10, 4:5, 5:6, 6:10, 10:6, 12:5, 60:1）', () => {
    const subgroups = enumerateSubgroupsSmart(GROUP_A5)
    expect(subgroups).toHaveLength(59)
    expect(histogram(subgroups)).toEqual({
      '1': 1,
      '2': 15,
      '3': 10,
      '4': 5,
      '5': 6,
      '6': 10,
      '10': 6,
      '12': 5,
      '60': 1,
    })
  })

  it('p-子群：A₄ 的 2-子群 = 5（平凡 1 + 3 个 C₂ + V₄），3-子群 = 5', () => {
    expect(pSubgroups(GROUP_A4, 2)).toHaveLength(5)
    expect(pSubgroups(GROUP_A4, 3)).toHaveLength(5)
  })

  it('最小生成元：C₄ 需 1 个、S₄ 需 2 个', () => {
    expect(minimalGenerators(GROUP_C4)).toHaveLength(1)
    expect(minimalGenerators(GROUP_S4)).toHaveLength(2)
  })

  it('子群格：S₄ 30 个节点 / A₅ 59 个节点，覆盖边非空', () => {
    const s4 = computeSmartLattice(GROUP_S4)
    expect(s4.nodes).toHaveLength(30)
    expect(s4.edges.length).toBeGreaterThan(30)
    const a5 = computeSmartLattice(GROUP_A5)
    expect(a5.nodes).toHaveLength(59)
    expect(a5.edges.length).toBeGreaterThan(59)
    // 平凡子群与群自身位于两端
    expect(Math.min(...a5.nodes.map((node) => node.size))).toBe(1)
    expect(Math.max(...a5.nodes.map((node) => node.size))).toBe(60)
  })
})
