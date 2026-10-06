/**
 * v3.1 平面性检验测试：特殊图族 + Sage 随机基准交叉核验。
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
import { isPlanar } from './planarity'

describe('v3.1 平面性（LR 检验）', () => {
  it('特殊图：K₅/K₃,₃/Petersen/K₆ 非平面；K₄/C₅/树/轮/立方体 平面', () => {
    expect(isPlanar(completeGraph(5))).toBe(false)
    expect(isPlanar(completeBipartiteGraph(3, 3))).toBe(false)
    expect(isPlanar(petersenGraph())).toBe(false)
    expect(isPlanar(completeGraph(6))).toBe(false)
    expect(isPlanar(completeGraph(4))).toBe(true)
    expect(isPlanar(cycleGraph(5))).toBe(true)
    expect(isPlanar(pathGraph(8))).toBe(true)
    expect(isPlanar(emptyGraph(7))).toBe(true)
  })

  it('Sage 基准交叉核验（258 图，含 K₅/K₃,₃ 细分与随机图）', () => {
    const raw = readFileSync(new URL('./planarity-fixture.json', import.meta.url), 'utf-8')
    const items = JSON.parse(raw) as Array<{ name: string; graph6: string; planar: boolean }>
    expect(items.length).toBeGreaterThanOrEqual(250)
    const mismatches: string[] = []
    for (const item of items) {
      const graph = parseGraph6(item.graph6)
      const got = isPlanar(graph)
      if (got !== item.planar) {
        mismatches.push(`${item.name}（${item.graph6}）：期望 ${item.planar}，实得 ${got}`)
      }
    }
    expect(mismatches).toEqual([])
  })
})
