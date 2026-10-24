import { describe, expect, it } from 'vitest'
import { completeEdgePairs } from '../graph/rainbow'
import { triangleRamsey, ramseyCertificate } from './ramsey'
import { patternGraph, patternPreset } from './patterns'

function monoTriangle(n: number, colors: number[]): boolean {
  const pairs = completeEdgePairs(n)
  const index = new Map(pairs.map(([u, v], position) => [`${u},${v}`, position]))
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        const x = colors[index.get(`${a},${b}`)!]!
        const y = colors[index.get(`${a},${c}`)!]!
        const z = colors[index.get(`${b},${c}`)!]!
        if (x === y && y === z) return true
      }
    }
  }
  return false
}

describe('v3.6 Ramsey R(3,3) 小证书', () => {
  it('n=3..6 的首边固定等价类计数为 3、9、6、0', () => {
    expect([3, 4, 5, 6].map((n) => triangleRamsey(n).canonicalCount)).toEqual([3, 9, 6, 0])
    expect([3, 4, 5, 6].map((n) => triangleRamsey(n).exists)).toEqual([true, true, true, false])
    expect(triangleRamsey(5).totalCount).toBe(12)
    expect(triangleRamsey(6).colors).toBeNull()
    expect(triangleRamsey(6).triangles).toBe(20)
  })

  it('n=5 见证是无单色三角形的 2-着色，且首边固定为颜色 0', () => {
    const result = triangleRamsey(5)
    expect(result.colors).not.toBeNull()
    const colors = result.colors!
    expect(colors).toHaveLength(10)
    expect(colors[0]).toBe(0)
    expect(monoTriangle(5, colors)).toBe(false)
    expect(colors.every((color) => color === 0 || color === 1)).toBe(true)
  })

  it('n=6 穷举所有首边固定着色均含单色三角形（R(3,3)=6 的方向）', () => {
    const result = triangleRamsey(6)
    expect(result.canonicalCount).toBe(0)
    expect(result.note).toContain('R(3,3) ≤ 6')
    expect(result.complete).toBe(true)
  })

  it('通用证书：任意小禁图与 K₃ 包装结果一致', () => {
    const k3 = patternGraph(patternPreset('K3'))
    const generic = ramseyCertificate(5, k3, 'K₃')
    expect(generic.canonicalCount).toBe(6)
    expect(generic.patternLabel).toBe('K₃')
    expect(generic.colors).toEqual(triangleRamsey(5).colors)
  })
})
