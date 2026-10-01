import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import { bipartizationNumber, type BipartizationResult } from './bipartization'
import type { GraphObject } from './model'

function g(text: string): GraphObject {
  const result = graphObjectFromDsl(text)
  expect(result.errors).toEqual([])
  return result.graph!
}

function sideOf(result: BipartizationResult, graph: GraphObject, label: string): 'L' | 'R' {
  const id = graph.nodes.find((node) => node.label === label)!.id
  return result.partition.left.includes(id) ? 'L' : 'R'
}

describe('graph/bipartization: 基础情形', () => {
  it('空图/孤立点 b=0', () => {
    const graph = g('A, B, C')
    const result = bipartizationNumber(graph)
    expect(result.count).toBe(0)
    expect(result.exact).toBe(true)
  })

  it('C4 与 K3,3 已是二分图（b=0，精确）', () => {
    const c4 = g('A-B, B-C, C-D, D-A')
    const r1 = bipartizationNumber(c4)
    expect(r1.count).toBe(0)
    expect(r1.exact).toBe(true)
    // 对径同侧：A 与 C 同侧、B 与 D 同侧，两侧不同
    expect(sideOf(r1, c4, 'A')).toBe(sideOf(r1, c4, 'C'))
    expect(sideOf(r1, c4, 'B')).toBe(sideOf(r1, c4, 'D'))
    expect(sideOf(r1, c4, 'A')).not.toBe(sideOf(r1, c4, 'B'))

    const k33 = g('A-X, A-Y, A-Z, B-X, B-Y, B-Z, C-X, C-Y, C-Z')
    expect(bipartizationNumber(k33).count).toBe(0)
  })

  it('三角形 b=1，K4 b=2', () => {
    const triangle = g('A-B, B-C, C-A')
    const r1 = bipartizationNumber(triangle)
    expect(r1.count).toBe(1)
    expect(r1.edgeIds).toHaveLength(1)
    expect(r1.exact).toBe(true)

    const k4 = g('A-B, A-C, A-D, B-C, B-D, C-D')
    expect(bipartizationNumber(k4).count).toBe(2)

    // K5：maxcut = 2×3 = 6 → b = 10 - 6 = 4
    const k5 = g('1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5')
    expect(bipartizationNumber(k5).count).toBe(4)
  })

  it('C5 b=1（奇环），C6 b=0', () => {
    const c5 = g('A-B, B-C, C-D, D-E, E-A')
    expect(bipartizationNumber(c5).count).toBe(1)

    const c6 = g('A-B, B-C, C-D, D-E, E-F, F-A')
    expect(bipartizationNumber(c6).count).toBe(0)
  })

  it('自环必删；平行边分别计数', () => {
    const loop = g('A-A, A-B')
    const r1 = bipartizationNumber(loop)
    expect(r1.count).toBe(1)

    // 三角形每条边双平行：删 2 条（同侧那对的两条平行边）
    const parallel = g('A-B, A-B, B-C, B-C, C-A, C-A')
    expect(bipartizationNumber(parallel).count).toBe(2)
  })

  it('Petersen 图 b=3（maxcut=12）', () => {
    const petersen = g(
      [
        'A0-A1',
        'A1-A2',
        'A2-A3',
        'A3-A4',
        'A4-A0',
        'B0-B2',
        'B2-B4',
        'B4-B1',
        'B1-B3',
        'B3-B0',
        'A0-B0',
        'A1-B1',
        'A2-B2',
        'A3-B3',
        'A4-B4',
      ].join(', '),
    )
    const result = bipartizationNumber(petersen)
    expect(result.count).toBe(3)
    expect(result.exact).toBe(true)
  })
})

describe('graph/bipartization: 贪心路径（n > 20）', () => {
  it('21 点奇环：b=1 且标记为非精确', () => {
    const nodes = Array.from({ length: 21 }, (_, i) => `V${i}`)
    const dsl = nodes.map((label, i) => `${label}-${nodes[(i + 1) % 21]}`).join(', ')
    const graph = g(dsl)
    const result = bipartizationNumber(graph)
    expect(result.count).toBe(1)
    expect(result.exact).toBe(false)
  })
})
