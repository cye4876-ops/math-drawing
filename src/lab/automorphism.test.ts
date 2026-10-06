/**
 * v3.1 图的自同构群测试：经典计数（C₅ → 10、Petersen → 120）+ Sage 基准核验。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  completeBipartiteGraph,
  completeGraph,
  cycleGraph,
  emptyGraph,
  pathGraph,
  petersenGraph,
} from './graph'
import { parseGraph6 } from './graph6'
import { automorphismGroup } from './automorphism'

describe('v3.1 图的自同构群', () => {
  it('C₅ → 10（单轨道、稳定子 2）；C₆ → 12', () => {
    const c5 = automorphismGroup(cycleGraph(5))
    expect(c5?.order).toBe(10)
    expect(c5?.orbits).toHaveLength(1)
    expect(c5?.orbits[0]).toHaveLength(5)
    expect(c5?.stabilizerSizes[0]).toBe(2)
    expect(automorphismGroup(cycleGraph(6))?.order).toBe(12)
  })

  it('Petersen → 120（单轨道 10、稳定子 12）——跨模块教学样例', () => {
    const petersen = automorphismGroup(petersenGraph())
    expect(petersen?.order).toBe(120)
    expect(petersen?.orbits).toHaveLength(1)
    expect(petersen?.stabilizerSizes[0]).toBe(12)
  })

  it('K₄ → 24；K₃,₃ → 72（顶点传递：单轨道 6 点、稳定子 12）；P₄ → 2（轨道 2+2）', () => {
    expect(automorphismGroup(completeGraph(4))?.order).toBe(24)
    const k33 = automorphismGroup(completeBipartiteGraph(3, 3))
    expect(k33?.order).toBe(72)
    // K₃,₃ 两侧可互换：作用在 6 个顶点上传递（|Stab| = 72 / 6 = 12）
    expect(k33?.orbits.map((orbit) => orbit.length)).toEqual([6])
    expect(k33?.stabilizerSizes[0]).toBe(12)
    const p4 = automorphismGroup(pathGraph(4))
    expect(p4?.order).toBe(2)
    expect(p4?.orbits.map((orbit) => orbit.length).sort()).toEqual([2, 2])
  })

  it('空图 / 完全图直达 n!（n=5 → 120，轨道为单点）', () => {
    const empty = automorphismGroup(emptyGraph(5))
    expect(empty?.order).toBe(120)
    expect(empty?.orbits).toHaveLength(5)
    expect(empty?.stabilizerSizes[0]).toBe(24)
  })

  it('单点与两点图', () => {
    expect(automorphismGroup(emptyGraph(1))?.order).toBe(1)
    expect(automorphismGroup(pathGraph(2))?.order).toBe(2)
  })

  it('Sage 基准交叉核验（随机图 |Aut| 一致）', () => {
    const raw = readFileSync(new URL('./automorphism-fixture.json', import.meta.url), 'utf-8')
    const items = JSON.parse(raw) as Array<{ name: string; graph6: string; aut: number }>
    expect(items.length).toBeGreaterThan(20)
    const mismatches: string[] = []
    for (const item of items) {
      const summary = automorphismGroup(parseGraph6(item.graph6))
      if (!summary || summary.order !== item.aut) {
        mismatches.push(
          `${item.name}（${item.graph6}）：期望 ${item.aut}，实得 ${summary?.order ?? 'null'}`,
        )
      }
    }
    expect(mismatches).toEqual([])
  })
})
