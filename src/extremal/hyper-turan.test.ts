import { describe, expect, it } from 'vitest'
import { HYPER_TURAN_LABELS, ex3Uniform } from './hyper-turan'

function triples(n: number): number[][] {
  const list: number[][] = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) list.push([a, b, c])
    }
  }
  return list
}

function keyOf(edge: number[]): string {
  return [...edge].sort((a, b) => a - b).join(',')
}

function hasK4(witness: number[][]): boolean {
  const set = new Set(witness.map(keyOf))
  const list = [...new Set(witness.flat())].sort((a, b) => a - b)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      for (let k = j + 1; k < list.length; k++) {
        for (let l = k + 1; l < list.length; l++) {
          const set4 = [list[i]!, list[j]!, list[k]!, list[l]!]
          const complete = triples(4).every((edge) => {
            const [a, b, c] = edge as [number, number, number]
            return set.has(keyOf([set4[a]!, set4[b]!, set4[c]!]))
          })
          if (complete) return true
        }
      }
    }
  }
  return false
}

function hasLooseTriangle(witness: number[][], n = 6): boolean {
  const set = new Set(witness.map(keyOf))
  const perms = (current: number[], rest: number[]): number[][] => {
    if (rest.length === 0) return [current]
    return rest.flatMap((value, index) =>
      perms([...current, value], [...rest.slice(0, index), ...rest.slice(index + 1)]),
    )
  }
  for (const assignment of perms(
    [],
    Array.from({ length: n }, (_, index) => index),
  )) {
    const edges = [
      [assignment[0]!, assignment[1]!, assignment[2]!],
      [assignment[2]!, assignment[3]!, assignment[4]!],
      [assignment[4]!, assignment[5]!, assignment[0]!],
    ]
    if (edges.every((edge) => set.has(keyOf(edge)))) return true
  }
  return false
}

describe('v3.6 3-一致超图 Turán（禁 K₄³ / 松三角形）', () => {
  it('n=5、6 禁 K₄³ 的精确值 7、14', () => {
    const n5 = ex3Uniform(5, 'K4_3')
    expect(n5.maxEdges).toBe(7)
    expect(n5.instances).toBe(5)
    expect(n5.complete).toBe(true)
    expect(n5.witness).toHaveLength(7)
    expect(hasK4(n5.witness)).toBe(false)
    const n6 = ex3Uniform(6, 'K4_3')
    expect(n6.maxEdges).toBe(14)
    expect(n6.instances).toBe(15)
    expect(n6.witness).toHaveLength(14)
    expect(hasK4(n6.witness)).toBe(false)
    expect(new Set(n6.witness.map(keyOf)).size).toBe(14)
  })

  it('n=5 无松三角形禁例（10 条边全选），n=6 精确值 10', () => {
    const n5 = ex3Uniform(5, 'loose_triangle')
    expect(n5.instances).toBe(0)
    expect(n5.maxEdges).toBe(10)
    expect(n5.witness).toHaveLength(10)
    const n6 = ex3Uniform(6, 'loose_triangle')
    expect(n6.instances).toBe(120)
    expect(n6.maxEdges).toBe(10)
    expect(n6.witness).toHaveLength(10)
    expect(hasLooseTriangle(n6.witness)).toBe(false)
  })

  it('见证均为合法的升序顶点三元组，标签可读', () => {
    const result = ex3Uniform(6, 'K4_3')
    const universe = new Set(triples(6).map(keyOf))
    for (const edge of result.witness) {
      expect(edge).toHaveLength(3)
      expect([...edge].sort((a, b) => a - b)).toEqual(edge)
      expect(universe.has(keyOf(edge))).toBe(true)
    }
    expect(HYPER_TURAN_LABELS.K4_3).toContain('K₄³')
  })
})
