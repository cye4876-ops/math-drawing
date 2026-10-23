/**
 * 子群格布局（v2.2 近世代数模块）：由子群集合计算 Hasse 图的节点与覆盖关系。
 * 纯函数（不涉及 canvas），便于单测；绘制在 diagrams.ts 的 drawSubgroupLattice。
 */

import { allSubgroups, isNormalSubgroup, type FiniteGroup } from './groups'
import { enumerateSubgroupsSmart } from './subgroups'

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
  return latticeFromSubgroups(group, allSubgroups(group))
}

/** 由给定子群集合构造 Hasse 图（位掩码包含判定；支持 S₄/A₅ 等较大子群集合） */
export function latticeFromSubgroups(group: FiniteGroup, subgroups: number[][]): SubgroupLattice {
  const sizes = [...new Set(subgroups.map((sub) => sub.length))].sort((a, b) => a - b)
  const levelOf = new Map(sizes.map((size, level) => [size, level]))
  const nodes: LatticeNode[] = subgroups.map((sub, index) => ({
    index,
    subgroup: sub,
    size: sub.length,
    normal: isNormalSubgroup(group, sub),
    level: levelOf.get(sub.length) ?? 0,
  }))

  const masks = subgroups.map((sub) =>
    sub.reduce((mask, value) => mask | (1n << BigInt(value)), 0n),
  )
  const isSubsetOf = (small: bigint, big: bigint): boolean => (small & big) === small

  const edges: [number, number][] = []
  for (let i = 0; i < subgroups.length; i++) {
    for (let j = 0; j < subgroups.length; j++) {
      const small = masks[i]!
      const big = masks[j]!
      if (i === j || subgroups[i]!.length >= subgroups[j]!.length) continue
      if (!isSubsetOf(small, big)) continue
      let covered = true
      for (let k = 0; k < subgroups.length; k++) {
        if (k === i || k === j) continue
        const middleSize = subgroups[k]!.length
        if (middleSize <= subgroups[i]!.length || middleSize >= subgroups[j]!.length) continue
        const middle = masks[k]!
        if (isSubsetOf(small, middle) && isSubsetOf(middle, big)) {
          covered = false
          break
        }
      }
      if (covered) edges.push([i, j])
    }
  }

  return { nodes, edges }
}

/** 智能子群枚举 + Hasse 图（v3.2：覆盖 S₄/A₅） */
export function computeSmartLattice(group: FiniteGroup): SubgroupLattice {
  return latticeFromSubgroups(group, enumerateSubgroupsSmart(group))
}
