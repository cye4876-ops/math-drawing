import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import { minimumVertexCover } from './vertex-cover'
import type { GraphObject } from './model'

function g(dsl: string): GraphObject {
  const result = graphObjectFromDsl(dsl)
  expect(result.errors).toEqual([])
  return result.graph!
}

/** 校验解确实覆盖全部边 */
function coversAll(graph: GraphObject, ids: string[]): boolean {
  const set = new Set(ids)
  return graph.edges.every((edge) => set.has(edge.source) || set.has(edge.target))
}

describe('graph/vertex-cover: 最小点覆盖 τ(G)', () => {
  it('经典图：C4=2、K3=2、K4=3、C5=3、星图=1、三条独立边=3', () => {
    const cases: [string, number][] = [
      ['A-B, B-C, C-D, D-A', 2],
      ['A-B, B-C, C-A', 2],
      ['A-B, A-C, A-D, B-C, B-D, C-D', 3],
      ['A-B, B-C, C-D, D-E, E-A', 3],
      ['C-A, C-B, C-D, C-E', 1],
      ['A-B, C-D, E-F', 3],
    ]
    for (const [dsl, expected] of cases) {
      const graph = g(dsl)
      const result = minimumVertexCover(graph)
      expect(result.size).toBe(expected)
      expect(result.exact).toBe(true)
      expect(result.vertices).toHaveLength(expected)
      expect(coversAll(graph, result.vertices)).toBe(true)
    }
  })

  it('K3,3（二分）：τ = 3 = 最大匹配数', () => {
    const graph = g('A-X, A-Y, A-Z, B-X, B-Y, B-Z, C-X, C-Y, C-Z')
    const result = minimumVertexCover(graph)
    expect(result.size).toBe(3)
    expect(coversAll(graph, result.vertices)).toBe(true)
  })

  it('自环必选其端点：A-A + A-B → τ=1 且包含 A', () => {
    const graph = g('A-A, A-B')
    const result = minimumVertexCover(graph)
    expect(result.size).toBe(1)
    const a = graph.nodes.find((node) => node.label === 'A')!
    expect(result.vertices).toContain(a.id)
  })

  it('无边/空图：τ=0', () => {
    const graph = g('A, B, C')
    const result = minimumVertexCover(graph)
    expect(result.size).toBe(0)
    expect(result.vertices).toEqual([])
    expect(result.exact).toBe(true)
  })

  it('大图（41 点：20 条独立边 + 1 孤立）：exact=false 且解覆盖全部边', () => {
    const parts: string[] = []
    for (let i = 0; i < 20; i++) parts.push(`V${2 * i}-V${2 * i + 1}`)
    parts.push('V40')
    const graph = g(parts.join(', '))
    const result = minimumVertexCover(graph)
    expect(result.exact).toBe(false)
    expect(coversAll(graph, result.vertices)).toBe(true)
    // 2-近似：每条独立边两端点均入选（40 个）；最优为 20
    expect(result.size).toBe(40)
  })
})
