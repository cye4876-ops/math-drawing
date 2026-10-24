import { describe, expect, it } from 'vitest'
import { containsPattern } from './containment'
import { heuristicLowerBound } from './heuristic'
import { patternGraph, patternPreset } from './patterns'

function spec(id: string) {
  const preset = patternPreset(id)
  return { graph: patternGraph(preset), label: preset.label }
}

describe('v3.9 n>8 启发式下界', () => {
  it('n=9 禁 K₃：至少拿到 T₂(9)=20 条边的无三角形见证', () => {
    const result = heuristicLowerBound({ n: 9, patterns: [spec('K3')], seed: 7 })
    expect(result.lowerBound).toBe(true)
    expect(result.complete).toBe(false)
    expect(result.maxEdges).toBeGreaterThanOrEqual(20)
    const graph = {
      n: 9,
      adj: Array.from({ length: 9 }, (_, u) => {
        let mask = 0
        for (const [a, b] of result.edges) {
          if (a === u) mask |= 1 << b
          if (b === u) mask |= 1 << a
        }
        return mask
      }),
    }
    expect(containsPattern(graph, spec('K3').graph)).toBe(false)
  })

  it('阶数上限与确定性种子', () => {
    const a = heuristicLowerBound({ n: 20, patterns: [spec('K3')], maxN: 12, seed: 1 })
    const b = heuristicLowerBound({ n: 20, patterns: [spec('K3')], maxN: 12, seed: 1 })
    expect(a.n).toBe(12)
    expect(a.edges).toEqual(b.edges)
  })
})
