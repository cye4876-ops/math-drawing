/**
 * 平面性 / 禁用子图检测测试（v0.5「禁图」）。
 * 覆盖：K5、K3,3 子图（Kuratowski 禁用子图）、K5−e 的平面性、方向/多重边/自环的化简、
 * 规模保护；并固化「Petersen 为已知局限（不含直接禁用子图）」的行为。
 */
import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import type { GraphObject } from './model'
import { detectPlanarity } from './planarity'

function make(dsl: string): GraphObject {
  const { graph } = graphObjectFromDsl(dsl)
  return graph!
}

const K5 = '1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5'
const K33 = '1-4, 1-5, 1-6, 2-4, 2-5, 2-6, 3-4, 3-5, 3-6'
const K4 = '1-2, 1-3, 1-4, 2-3, 2-4, 3-4'
const PETERSEN = '1-2, 2-3, 3-4, 4-5, 5-1, 6-8, 8-10, 10-7, 7-9, 9-6, 1-6, 2-7, 3-8, 4-9, 5-10'

describe('v0.5 禁图：平面性 / 禁用子图检测', () => {
  it('K5：确定非平面（forbidden=K5，证据 5 个顶点）', () => {
    const result = detectPlanarity(make(K5))
    expect(result.planar).toBe(false)
    expect(result.forbidden).toBe('K5')
    expect(result.evidence).toHaveLength(5)
  })

  it('K3,3：确定非平面（forbidden=K3,3，证据 6 个顶点）', () => {
    const result = detectPlanarity(make(K33))
    expect(result.planar).toBe(false)
    expect(result.forbidden).toBe('K3,3')
    expect(result.evidence).toHaveLength(6)
  })

  it('K6 含 K5 子图；K5 去掉一条边（K5−e）为可能平面', () => {
    const k6 = '1-2, 1-3, 1-4, 1-5, 1-6, 2-3, 2-4, 2-5, 2-6, 3-4, 3-5, 3-6, 4-5, 4-6, 5-6'
    expect(detectPlanarity(make(k6)).forbidden).toBe('K5')
    // K5 去掉边 4-5：m=9 ≤ 3·5−6=9，且无 K5/K3,3 子图 → 可能平面
    const k5e = '1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5'
    expect(detectPlanarity(make(k5e)).planar).toBe(true)
  })

  it('K4 / 环 C6 / 星 / 2×2 网格：未发现冲突', () => {
    expect(detectPlanarity(make(K4)).planar).toBe(true)
    expect(detectPlanarity(make('1-2, 2-3, 3-4, 4-5, 5-6, 6-1')).planar).toBe(true)
    expect(detectPlanarity(make('1-2, 1-3, 1-4')).planar).toBe(true)
    // 2×2 网格（4 点 4 边）为平面图
    expect(detectPlanarity(make('a1-a2, a1-b1, b1-b2, a2-b2')).planar).toBe(true)
  })

  it('已知局限：Petersen 不含 K5/K3,3 直接子图 → 「未发现冲突」（但仍非平面）', () => {
    const result = detectPlanarity(make(PETERSEN))
    expect(result.planar).toBe(true)
    expect(result.forbidden).toBeNull()
    expect(result.reason).toContain('未发现')
  })

  it('化简：方向/多重边/自环不影响；带平行边的 K5 仍检出', () => {
    expect(detectPlanarity(make(K5 + ', 1-2, 3-3, 5->4')).forbidden).toBe('K5')
  })

  it('小图与规模保护：n ≤ 4 直接可能平面；n > 40 跳过子图枚举（planar=null）', () => {
    expect(detectPlanarity(make('1-2, 1-3')).planar).toBe(true)
    const labels = Array.from({ length: 41 }, (_, i) => `v${i}`)
    const result = detectPlanarity(make(labels.join(', ')))
    expect(result.planar).toBeNull()
    expect(result.reason).toContain('跳过')
  })
})
