/**
 * 子群格布局（v2.2 近世代数模块）：由子群集合计算 Hasse 图的节点与覆盖关系。
 * 纯函数（不涉及 canvas），便于单测；绘制在 diagrams.ts 的 drawSubgroupLattice。
 */

import { allSubgroups, isNormalSubgroup, type FiniteGroup } from './groups'

export interface LatticeNode {
  index: number
  subgroup: number[]
  size: number
  normal: boolean
  /** 层级：0 = 平凡子群（底部），逐层向上，顶层为群自身 */
  level: number
}

export interface SubgroupLattice {
  nodes: LatticeNode[]
  /** 覆盖关系边 [小, 大] */
  edges: [number, number][]
}

export function computeSubgroupLattice(group: FiniteGroup): SubgroupLattice {
  const subgroups = allSubgroups(group)
  const sizes = [...new Set(subgroups.map((sub) => sub.length))].sort((a, b) => a - b)
  const levelOf = new Map(sizes.map((size, level) => [size, level]))
  const nodes: LatticeNode[] = subgroups.map((sub, index) => ({
    index,
    subgroup: sub,
    size: sub.length,
    normal: isNormalSubgroup(group, sub),
    level: levelOf.get(sub.length) ?? 0,
  }))

  const sets = subgroups.map((sub) => new Set(sub))
  const isSubsetOf = (small: Set<number>, big: Set<number>): boolean => {
    for (const value of small) {
      if (!big.has(value)) return false
    }
    return true
  }

  const edges: [number, number][] = []
  for (let i = 0; i < subgroups.length; i++) {
    for (let j = 0; j < subgroups.length; j++) {
      const small = sets[i]
      const big = sets[j]
      if (!small || !big || i === j || small.size >= big.size) continue
      if (!isSubsetOf(small, big)) continue
      // 覆盖关系：不存在严格居中且介于两者的子群
      let covered = true
      for (let k = 0; k < subgroups.length; k++) {
        if (k === i || k === j) continue
        const middle = sets[k]
        if (
          middle &&
          middle.size > small.size &&
          middle.size < big.size &&
          isSubsetOf(small, middle) &&
          isSubsetOf(middle, big)
        ) {
          covered = false
          break
        }
      }
      if (covered) edges.push([i, j])
    }
  }

  return { nodes, edges }
}
