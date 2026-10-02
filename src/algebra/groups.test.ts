/**
 * 有限群构造与结构计算测试（v2.2）：全部对照教科书结论。
 */
import { describe, expect, it } from 'vitest'
import {
  GROUP_A4,
  GROUP_C4,
  GROUP_C6,
  GROUP_D4,
  GROUP_Q8,
  GROUP_S3,
  GROUP_V4,
  allSubgroups,
  centerElements,
  composePerm,
  cyclicSubgroup,
  elementOrder,
  elementOrderStats,
  firstNonCommutingPair,
  getGroup,
  isAbelian,
  isCyclic,
  isNormalSubgroup,
  labelOf,
  mult,
  permFromCycles,
  subsetProduct,
  type FiniteGroup,
} from './groups'

function stats(sorted: boolean, group: FiniteGroup): [number, number][] {
  const entries = [...elementOrderStats(group).entries()]
  return sorted ? entries.sort((a, b) => a[0] - b[0]) : entries
}

function subgroupOrders(group: FiniteGroup): number[] {
  return [...new Set(allSubgroups(group).map((sub) => sub.length))].sort((a, b) => a - b)
}

describe('v2.2 有限群构造', () => {
  it('置换合成与轮换记号：S₃ 元素构造正确', () => {
    const swap12 = permFromCycles(3, [[1, 2]])
    const swap13 = permFromCycles(3, [[1, 3]])
    expect(swap12).toEqual([1, 0, 2])
    expect(swap13).toEqual([2, 1, 0])
    // (12)∘(13)：先作用 (13) 再作用 (12)
    expect(composePerm(swap12, swap13)).toEqual([2, 0, 1])
    expect(elementOrder(GROUP_S3, 1)).toBe(2)
    expect(mult(GROUP_S3, 0, 1)).toBe(1) // e·(12) = (12)
  })

  it('C₄：交换、循环、元素阶分布 {1,2,4,4}', () => {
    expect(GROUP_C4.order).toBe(4)
    expect(isAbelian(GROUP_C4)).toBe(true)
    expect(isCyclic(GROUP_C4)).toBe(true)
    expect(stats(true, GROUP_C4)).toEqual([
      [1, 1],
      [2, 1],
      [4, 2],
    ])
    expect(allSubgroups(GROUP_C4).length).toBe(3)
  })

  it('V₄：交换、不循环、非单位元全为 2 阶、恰有 5 个子群', () => {
    expect(isAbelian(GROUP_V4)).toBe(true)
    expect(isCyclic(GROUP_V4)).toBe(false)
    expect(stats(true, GROUP_V4)).toEqual([
      [1, 1],
      [2, 3],
    ])
    expect(allSubgroups(GROUP_V4).length).toBe(5)
  })

  it('C₆：循环、元素阶分布 {1,2,3,6}、4 个子群', () => {
    expect(isCyclic(GROUP_C6)).toBe(true)
    expect(stats(true, GROUP_C6)).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [6, 2],
    ])
    expect(allSubgroups(GROUP_C6).length).toBe(4)
  })

  it('Q₈：非交换、全部子群正规（哈密顿群）、中心 {±1}、6 个子群', () => {
    expect(GROUP_Q8.order).toBe(8)
    expect(isAbelian(GROUP_Q8)).toBe(false)
    const pair = firstNonCommutingPair(GROUP_Q8)
    expect(pair).not.toBeNull()
    const [a, b] = pair ?? [0, 0]
    expect(labelOf(GROUP_Q8, a)).toBe('i')
    expect(labelOf(GROUP_Q8, b)).toBe('j')
    // i·j = k（索引 6），j·i = −k（索引 7）
    expect(mult(GROUP_Q8, a, b)).toBe(6)
    expect(mult(GROUP_Q8, b, a)).toBe(7)
    const subgroups = allSubgroups(GROUP_Q8)
    expect(subgroups.length).toBe(6)
    expect(subgroups.every((sub) => isNormalSubgroup(GROUP_Q8, sub))).toBe(true)
    expect(centerElements(GROUP_Q8).map((i) => labelOf(GROUP_Q8, i))).toEqual(['1', '−1'])
    expect(stats(true, GROUP_Q8)).toEqual([
      [1, 1],
      [2, 1],
      [4, 6],
    ])
  })
})

describe('v2.2 结构计算', () => {
  it('S₃：非交换、6 个子群、阶分布 {1,2,3}、中心平凡', () => {
    expect(isAbelian(GROUP_S3)).toBe(false)
    expect(stats(true, GROUP_S3)).toEqual([
      [1, 1],
      [2, 3],
      [3, 2],
    ])
    const subgroups = allSubgroups(GROUP_S3)
    expect(subgroups.length).toBe(6)
    expect(subgroupOrders(GROUP_S3)).toEqual([1, 2, 3, 6])
    const center = centerElements(GROUP_S3)
    expect(center.length).toBe(1)
    expect(labelOf(GROUP_S3, center[0] ?? 0)).toBe('e')
    // 3 阶子群（A₃）正规；2 阶子群均不正规
    const order2 = subgroups.filter((sub) => sub.length === 2)
    const order3 = subgroups.filter((sub) => sub.length === 3)
    expect(order2.length).toBe(3)
    expect(order2.every((sub) => !isNormalSubgroup(GROUP_S3, sub))).toBe(true)
    expect(order3.length).toBe(1)
    expect(isNormalSubgroup(GROUP_S3, order3[0] ?? [])).toBe(true)
  })

  it('S₃ 子群之积：⟨(12)⟩·⟨(13)⟩ 有 4 个元素，不可能是子群', () => {
    const genA = GROUP_S3.elements.indexOf('(12)')
    const genB = GROUP_S3.elements.indexOf('(13)')
    const h = cyclicSubgroup(GROUP_S3, genA)
    const k = cyclicSubgroup(GROUP_S3, genB)
    expect(h.map((i) => labelOf(GROUP_S3, i))).toEqual(['e', '(12)'])
    expect(k.map((i) => labelOf(GROUP_S3, i))).toEqual(['e', '(13)'])
    const hk = subsetProduct(GROUP_S3, h, k)
    expect(hk.map((i) => labelOf(GROUP_S3, i))).toEqual(['e', '(12)', '(13)', '(132)'])
    expect(hk.length).toBe(4)
    expect(GROUP_S3.order % hk.length).not.toBe(0) // 4 不整除 6
    // 逆元 (132)⁻¹ = (123) 不在 HK 中 ⇒ 连封闭性都不满足
    expect(hk).not.toContain(GROUP_S3.elements.indexOf('(123)'))
  })

  it('D₄：非交换、中心 {e, r²}、10 个子群且存在非正规', () => {
    expect(GROUP_D4.order).toBe(8)
    expect(isAbelian(GROUP_D4)).toBe(false)
    const center = centerElements(GROUP_D4).map((i) => labelOf(GROUP_D4, i))
    expect(center).toEqual(['e', 'r²'])
    const subgroups = allSubgroups(GROUP_D4)
    expect(subgroups.length).toBe(10)
    expect(subgroups.filter((sub) => !isNormalSubgroup(GROUP_D4, sub)).length).toBe(4)
    // 旋转子群 {e, r, r², r³}（指数 2）正规
    const rotation = [0, 1, 2, 3]
    expect(isNormalSubgroup(GROUP_D4, rotation)).toBe(true)
  })

  it('A₄：12 阶非交换、无 6 阶子群（拉格朗日之逆反例）、10 个子群', () => {
    expect(GROUP_A4.order).toBe(12)
    expect(isAbelian(GROUP_A4)).toBe(false)
    expect(subgroupOrders(GROUP_A4)).toEqual([1, 2, 3, 4, 12])
    expect(allSubgroups(GROUP_A4).some((sub) => sub.length === 6)).toBe(false)
    expect(allSubgroups(GROUP_A4).length).toBe(10)
    expect(centerElements(GROUP_A4).length).toBe(1)
    expect(stats(true, GROUP_A4)).toEqual([
      [1, 1],
      [2, 3],
      [3, 8],
    ])
  })

  it('getGroup：已知 id 可解析、未知 id 抛错', () => {
    expect(getGroup('s3').name).toContain('S₃')
    expect(() => getGroup('nope')).toThrowError(/未知群/)
  })
})
