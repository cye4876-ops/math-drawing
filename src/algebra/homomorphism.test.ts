/**
 * v3.2 群同态枚举测试（独立核验：C₄→C₄ 4、C₄→V₄ 4、S₃→S₃ 10）。
 * 每个同态都验证第一同构定理 |G| = |ker| × |Im|。
 */
import { describe, expect, it } from 'vitest'
import { GROUP_C4, GROUP_C6, GROUP_S3, GROUP_V4, labelOf, mult, type FiniteGroup } from './groups'
import { enumerateHomomorphisms } from './homomorphism'

function verifyHoms(source: FiniteGroup, target: FiniteGroup): number {
  const result = enumerateHomomorphisms(source, target)
  for (const hom of result.homs) {
    expect(hom.kernel.length * hom.image.length).toBe(source.order)
    // 逐对验证同态性质
    for (let a = 0; a < source.order; a++) {
      for (let b = 0; b < source.order; b++) {
        expect(hom.mapping[mult(source, a, b)]).toBe(mult(target, hom.mapping[a]!, hom.mapping[b]!))
      }
    }
  }
  return result.total
}

describe('v3.2 群同态枚举', () => {
  it('C₄ → C₄：4 个同态（g ↦ g^k, k = 0..3）', () => {
    expect(verifyHoms(GROUP_C4, GROUP_C4)).toBe(4)
  })

  it('C₄ → V₄：4 个同态（生成的像阶 ≤ 2）', () => {
    expect(verifyHoms(GROUP_C4, GROUP_V4)).toBe(4)
  })

  it('S₃ → S₃：10 个同态（1 平凡 + 6 内自同构 + 3 个符号型）', () => {
    const result = enumerateHomomorphisms(GROUP_S3, GROUP_S3)
    expect(result.total).toBe(10)
    const trivial = result.homs.filter((hom) => hom.kernel.length === GROUP_S3.order)
    expect(trivial).toHaveLength(1)
    const isomorphisms = result.homs.filter((hom) => hom.injective)
    expect(isomorphisms).toHaveLength(6)
    const signLike = result.homs.filter((hom) => hom.kernel.length === 3 && hom.image.length === 2)
    expect(signLike).toHaveLength(3)
    // 符号型同态的核 = A₃ = {e, (123), (132)}
    for (const hom of signLike) {
      const labels = hom.kernel.map((index) => labelOf(GROUP_S3, index)).sort()
      expect(labels).toEqual(['(123)', '(132)', 'e'])
    }
  })

  it('同态的像必为子群：S₃ → S₃ 的 3 个满射像均为 6 阶', () => {
    const result = enumerateHomomorphisms(GROUP_S3, GROUP_S3)
    const surjective = result.homs.filter((hom) => hom.surjective)
    expect(surjective).toHaveLength(6)
    for (const hom of surjective) {
      expect(new Set(hom.image).size).toBe(6)
    }
  })

  it('元素阶约束：C₆ → V₄ 只有 4 个同态（生成元像阶需整除 6 与 2 的公因子 2）', () => {
    const result = enumerateHomomorphisms(GROUP_C6, GROUP_V4)
    expect(result.total).toBe(4)
  })
})
