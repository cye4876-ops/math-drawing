import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import { chromaticNumber } from './chromatic'
import type { GraphObject } from './model'

function g(dsl: string): GraphObject {
  const result = graphObjectFromDsl(dsl)
  expect(result.errors).toEqual([])
  return result.graph!
}

const EMPTY: GraphObject = {
  id: 'empty',
  type: 'graph',
  name: '',
  nodes: [],
  edges: [],
  visible: true,
}

describe('graph/chromatic: 色数 χ(G)', () => {
  it('经典图：K3=3、K4=4、K5=5、C5=3、C6=2、K3,3=2、Petersen=3', () => {
    expect(chromaticNumber(g('A-B, B-C, C-A')).value).toBe(3)
    expect(chromaticNumber(g('A-B, A-C, A-D, B-C, B-D, C-D')).value).toBe(4)
    expect(chromaticNumber(g('1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5')).value).toBe(5)
    expect(chromaticNumber(g('A-B, B-C, C-D, D-E, E-A')).value).toBe(3)
    expect(chromaticNumber(g('A-B, B-C, C-D, D-E, E-F, F-A')).value).toBe(2)
    expect(chromaticNumber(g('A-X, A-Y, A-Z, B-X, B-Y, B-Z, C-X, C-Y, C-Z')).value).toBe(2)
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
    expect(chromaticNumber(petersen).value).toBe(3)
  })

  it('边界：空图 0；孤立点 1；多点无边 1；含自环无正常着色', () => {
    expect(chromaticNumber(EMPTY).value).toBe(0)
    expect(chromaticNumber(g('A')).value).toBe(1)
    expect(chromaticNumber(g('A, B, C')).value).toBe(1)

    const loop = chromaticNumber(g('A-A, A-B'))
    expect(loop.hasLoop).toBe(true)
    expect(loop.value).toBeNull()
  })

  it('精确标记与上下界：lower ≤ χ ≤ upper', () => {
    const result = chromaticNumber(g('A-B, B-C, C-A'))
    expect(result.exact).toBe(true)
    expect(result.lower).toBeLessThanOrEqual(result.value!)
    expect(result.upper).toBeGreaterThanOrEqual(result.value!)
    expect(result.hasLoop).toBe(false)
  })

  it('大图（25 点奇环）：exact=false，贪心上下界 [2, 3] 包含真值 3', () => {
    const nodes = Array.from({ length: 25 }, (_, i) => `V${i}`)
    const dsl = nodes.map((label, i) => `${label}-${nodes[(i + 1) % 25]}`).join(', ')
    const result = chromaticNumber(g(dsl))
    expect(result.exact).toBe(false)
    expect(result.value).toBeNull()
    expect(result.lower).toBe(2)
    expect(result.upper).toBe(3)
  })

  it('大图（5×5 网格，二分）：上下界收窄到 [2, 2]', () => {
    const rows = 5
    const cols = 5
    const parts: string[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols) parts.push(`V${r}_${c}-V${r}_${c + 1}`)
        if (r + 1 < rows) parts.push(`V${r}_${c}-V${r + 1}_${c}`)
      }
    }
    const result = chromaticNumber(g(parts.join(', ')))
    expect(result.exact).toBe(false)
    expect(result.lower).toBe(2)
    expect(result.upper).toBe(2)
  })
})
