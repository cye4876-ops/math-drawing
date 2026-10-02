/**
 * 反例数据与 GF(4) 表测试（v2.2）。
 */
import { describe, expect, it } from 'vitest'
import {
  COUNTEREXAMPLE_CASES,
  DEFAULT_CASE_ID,
  GF4_ADDITION,
  GF4_MULTIPLICATION,
  getAlgebraTable,
  getCounterexampleCase,
} from './counterexamples'
import { GROUP_Q8, GROUP_S3, allSubgroups, isNormalSubgroup } from './groups'

describe('v2.2 GF(4) 运算表', () => {
  it('加法：特征 2，每元素自逆，单位元 0', () => {
    expect(GF4_ADDITION.identity).toBe(0)
    for (let a = 0; a < 4; a++) {
      expect(GF4_ADDITION.table[a]?.[a]).toBe(0)
      expect(GF4_ADDITION.table[a]?.[0]).toBe(a)
      for (let b = 0; b < 4; b++) {
        expect(GF4_ADDITION.table[a]?.[b]).toBe(GF4_ADDITION.table[b]?.[a])
      }
    }
  })

  it('乘法：ω² = ω+1、ω³ = 1、0 吸收、单位元 1', () => {
    // 索引：0=0, 1=1, 2=ω, 3=ω+1
    expect(GF4_MULTIPLICATION.identity).toBe(1)
    expect(GF4_MULTIPLICATION.table[2]?.[2]).toBe(3) // ω·ω = ω+1
    expect(GF4_MULTIPLICATION.table[2]?.[3]).toBe(1) // ω·(ω+1) = 1
    expect(GF4_MULTIPLICATION.table[3]?.[3]).toBe(2) // (ω+1)² = ω
    // ω³ = 1（乘法群为 C₃）
    expect(GF4_MULTIPLICATION.table[2]?.[2]).toBe(3)
    expect(GF4_MULTIPLICATION.table[3]?.[2]).toBe(1)
    // 0 吸收
    for (let a = 0; a < 4; a++) {
      expect(GF4_MULTIPLICATION.table[0]?.[a]).toBe(0)
      expect(GF4_MULTIPLICATION.table[a]?.[0]).toBe(0)
    }
    // 无零因子：两个非零元素之积非零
    for (let a = 1; a < 4; a++) {
      for (let b = 1; b < 4; b++) {
        expect(GF4_MULTIPLICATION.table[a]?.[b]).not.toBe(0)
      }
    }
  })

  it('getAlgebraTable：群与 GF(4) 表均可解析，未知 id 抛错', () => {
    expect(getAlgebraTable('q8').id).toBe('q8')
    expect(getAlgebraTable('gf4-add').id).toBe('gf4-add')
    expect(getAlgebraTable('gf4-mul').id).toBe('gf4-mul')
    expect(() => getAlgebraTable('nope')).toThrowError(/未知运算表/)
  })
})

describe('v2.2 反例案例数据', () => {
  it('共 9 条案例、字段完整、面板非空', () => {
    expect(COUNTEREXAMPLE_CASES.length).toBe(9)
    for (const item of COUNTEREXAMPLE_CASES) {
      expect(item.id.length).toBeGreaterThan(0)
      expect(item.title.length).toBeGreaterThan(0)
      expect(item.claim.length).toBeGreaterThan(0)
      expect(item.object.length).toBeGreaterThan(0)
      expect(item.explanation.length).toBeGreaterThan(0)
      expect(item.panels.length).toBeGreaterThan(0)
    }
  })

  it('所有 table / table-compare 面板的表格 id 均可解析', () => {
    for (const item of COUNTEREXAMPLE_CASES) {
      for (const panel of item.panels) {
        if (panel.kind === 'table') {
          expect(() => getAlgebraTable(panel.groupId)).not.toThrow()
        } else if (panel.kind === 'table-compare') {
          for (const id of panel.groupIds) {
            expect(() => getAlgebraTable(id)).not.toThrow()
          }
        } else if (panel.kind === 'subgroup-report' || panel.kind === 'subgroup-product') {
          expect(() => getAlgebraTable(panel.groupId)).not.toThrow()
        }
      }
    }
  })

  it('案例断言与实际计算一致：Q₈ 全正规；A₄ 缺 6 阶子群', () => {
    const q8Case = getCounterexampleCase('q8-all-normal')
    expect(
      q8Case.panels.some((panel) => panel.kind === 'subgroup-report' && panel.groupId === 'q8'),
    ).toBe(true)
    expect(allSubgroups(GROUP_Q8).every((sub) => isNormalSubgroup(GROUP_Q8, sub))).toBe(true)

    const a4Case = getCounterexampleCase('a4-lagrange-converse')
    const report = a4Case.panels.find((panel) => panel.kind === 'subgroup-report')
    expect(report && report.kind === 'subgroup-report' ? report.missingOrder : null).toBe(6)

    // 子群之积案例：S₃ 的两个 2 阶子群生成元在群元素表中存在
    const productCase = getCounterexampleCase('s3-subgroup-product')
    const productPanel = productCase.panels.find((panel) => panel.kind === 'subgroup-product')
    expect(productPanel).toBeTruthy()
    if (productPanel && productPanel.kind === 'subgroup-product') {
      expect(GROUP_S3.elements).toContain(productPanel.generatorA)
      expect(GROUP_S3.elements).toContain(productPanel.generatorB)
    }
  })

  it('默认案例存在于列表中', () => {
    expect(COUNTEREXAMPLE_CASES.some((item) => item.id === DEFAULT_CASE_ID)).toBe(true)
  })
})
