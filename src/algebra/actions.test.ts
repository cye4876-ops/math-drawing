/**
 * 群作用、共轭类与 Sylow 计算测试（v3.0）：全部对照 Sage/教科书结论。
 *
 * 关键对照（方案第三步验收）：
 * - A₄：共轭类 1、3、4、4；n₂ = 1（V₄ 正规）、n₃ = 4；
 * - S₄：n₂ = 3、n₃ = 4；
 * - A₅：n₂ = 5、n₃ = 10、n₅ = 6；
 * - 约束核验：n_p | |G|/pᵃ、n_p ≡ 1 (mod p)、n_p = [G:N_G(P)]。
 */
import { describe, expect, it } from 'vitest'
import {
  GROUP_A4,
  GROUP_A5,
  GROUP_D4,
  GROUP_Q8,
  GROUP_S3,
  GROUP_S4,
  GROUP_V4,
  cyclicSubgroup,
  isAbelian,
  labelOf,
  permLabel,
} from './groups'
import {
  burnsideColoring,
  classEquation,
  closureOfGenerators,
  conjugacyClassOf,
  conjugacyClasses,
  conjugateSubgroup,
  cosets,
  findConjugator,
  isNormal,
  normalizerOfSubgroup,
  primeFactorization,
  quotientGroup,
  sylowAllowedCounts,
  sylowReport,
  sylowSubgroups,
} from './actions'

describe('v3.0 S₄/A₅ 构造', () => {
  it('S₄：24 阶、非交换；A₅：60 阶、非交换、中心平凡', () => {
    expect(GROUP_S4.order).toBe(24)
    expect(isAbelian(GROUP_S4)).toBe(false)
    expect(GROUP_A5.order).toBe(60)
    expect(isAbelian(GROUP_A5)).toBe(false)
    const a5Center = classEquation(GROUP_A5).center
    expect(a5Center).toEqual([0])
  })

  it('轮换记号标签：单位元为 e，双轮换形如 (12)(34)', () => {
    expect(permLabel([0, 1, 2, 3])).toBe('e')
    expect(permLabel([1, 0, 3, 2])).toBe('(12)(34)')
    expect(permLabel([1, 2, 3, 0])).toBe('(1234)')
    // A₅ 含 5-轮换 (12345)
    expect(GROUP_A5.elements).toContain('(12345)')
  })
})

describe('v3.0 共轭作用与类方程', () => {
  it('A₄：共轭类大小 1、3、4、4；类方程 1+3+4+4 = 12', () => {
    const { classes, sizes, center } = classEquation(GROUP_A4)
    expect([...sizes].sort((a, b) => a - b)).toEqual([1, 3, 4, 4])
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(12)
    expect(center.map((index) => labelOf(GROUP_A4, index))).toEqual(['e'])
    // 4 阶类的中心化子大小为 3（|Cl|·|C_G| = |G|）
    const size4 = classes.find((item) => item.members.length === 4)
    expect(size4?.centralizer.length).toBe(3)
  })

  it('A₅：共轭类 1、15、20、12、12', () => {
    const { sizes } = classEquation(GROUP_A5)
    expect([...sizes].sort((a, b) => a - b)).toEqual([1, 12, 12, 15, 20])
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(60)
  })

  it('S₃：共轭类 1、2、3；Q₈：1、1、2、2、2', () => {
    expect([...classEquation(GROUP_S3).sizes].sort()).toEqual([1, 2, 3])
    expect([...classEquation(GROUP_Q8).sizes].sort()).toEqual([1, 1, 2, 2, 2])
  })

  it('轨道-稳定子：|Cl(g)| = [G : C_G(g)]（A₄ 全部元素）', () => {
    for (let a = 0; a < GROUP_A4.order; a++) {
      const cls = conjugacyClassOf(GROUP_A4, a)
      const cent = classEquation(GROUP_A4).classes.find((item) =>
        item.members.includes(a),
      )?.centralizer
      expect(cent).toBeDefined()
      expect(cls.length * (cent?.length ?? 0)).toBe(GROUP_A4.order)
    }
  })

  it('closureOfGenerators：由两个对换生成的子群是 V₄', () => {
    const s4 = GROUP_S4
    const indexOfLabel = Math.max(0, s4.elements.indexOf('(12)'))
    const other = Math.max(0, s4.elements.indexOf('(34)'))
    const generated = closureOfGenerators(s4, [indexOfLabel, other])
    expect(generated.length).toBe(4)
    const labels = generated.map((index) => labelOf(s4, index)).sort()
    expect(labels).toEqual(['(12)(34)', '(12)', '(34)', 'e'].sort())
  })
})

describe('v3.0 Sylow 工作台（方案验收样例）', () => {
  it('A₄：n₂ = 1（V₄ 正规）、n₃ = 4', () => {
    const r2 = sylowReport(GROUP_A4, 2)
    expect(r2.count).toBe(1)
    expect(r2.pPart).toBe(4)
    expect(r2.subgroups[0]?.normal).toBe(true)
    // 唯一的 Sylow 2-子群就是 V₄ = {e, (12)(34), (13)(24), (14)(23)}
    expect(r2.subgroups[0]?.labels.sort()).toEqual(['e', '(12)(34)', '(13)(24)', '(14)(23)'].sort())
    const r3 = sylowReport(GROUP_A4, 3)
    expect(r3.count).toBe(4)
    expect(r3.pPart).toBe(3)
    expect(r3.subgroups.every((sub) => !sub.normal)).toBe(true)
  })

  it('S₄：n₂ = 3、n₃ = 4', () => {
    expect(sylowReport(GROUP_S4, 2).count).toBe(3)
    expect(sylowReport(GROUP_S4, 3).count).toBe(4)
  })

  it('A₅：n₂ = 5、n₃ = 10、n₅ = 6（单群讨论样例）', () => {
    expect(sylowReport(GROUP_A5, 2).count).toBe(5)
    expect(sylowReport(GROUP_A5, 3).count).toBe(10)
    expect(sylowReport(GROUP_A5, 5).count).toBe(6)
    // A₅ 是单群：所有 Sylow 子群都非正规
    for (const p of [2, 3, 5]) {
      const report = sylowReport(GROUP_A5, p)
      expect(report.subgroups.every((sub) => !sub.normal)).toBe(true)
    }
  })

  it('全部约束核验通过：|P| = pᵃ、n_p ∣ m、n_p ≡ 1 (mod p)、n_p = [G:N_G(P)]', () => {
    const samples: [typeof GROUP_A4, number][] = [
      [GROUP_A4, 2],
      [GROUP_A4, 3],
      [GROUP_S4, 2],
      [GROUP_S4, 3],
      [GROUP_A5, 2],
      [GROUP_A5, 3],
      [GROUP_A5, 5],
      [GROUP_S3, 2],
      [GROUP_D4, 2],
      [GROUP_Q8, 2],
    ]
    for (const [group, p] of samples) {
      const report = sylowReport(group, p)
      for (const check of report.checks) {
        expect(check.ok, `${group.id} p=${p} ${check.label}`).toBe(true)
      }
    }
  })

  it('算术允许 vs 实际：明显不是唯一候选，教学区分必要条件与实现', () => {
    // S₄ 的 p=2：m = 3，允许 {1, 3}，实际 3
    expect(sylowAllowedCounts(GROUP_S4, 2)).toEqual([1, 3])
    expect(sylowReport(GROUP_S4, 2).count).toBe(3)
    // A₅ 的 p=2：m = 15，允许 {1, 3, 5, 15}，实际 5
    expect(sylowAllowedCounts(GROUP_A5, 2)).toEqual([1, 3, 5, 15])
    expect(sylowReport(GROUP_A5, 2).count).toBe(5)
    // A₅ 的 p=5：m = 12，允许 {1, 6}，实际 6
    expect(sylowAllowedCounts(GROUP_A5, 5)).toEqual([1, 6])
    const report5 = sylowReport(GROUP_A5, 5)
    expect(report5.allowedCounts).toEqual([1, 6])
    expect(report5.count).toBe(6)
  })

  it('Sylow 子群两两共轭：存在见证元 x 使 Q = xPx⁻¹', () => {
    for (const [group, p] of [
      [GROUP_A4, 3],
      [GROUP_S4, 2],
      [GROUP_A5, 3],
    ] as [typeof GROUP_A4, number][]) {
      const subgroups = sylowSubgroups(group, p)
      const first = subgroups[0] ?? []
      for (const other of subgroups) {
        const x = findConjugator(group, first, other)
        expect(x).not.toBeNull()
        if (x !== null) {
          expect(conjugateSubgroup(group, first, x)).toEqual(other)
        }
      }
    }
  })

  it('正规化子：[G:N_G(P)] = n_p；A₄ 的 V₄ 正规化子是 G 自身', () => {
    const report = sylowReport(GROUP_A4, 2)
    const normalizer = normalizerOfSubgroup(GROUP_A4, report.subgroups[0]?.members ?? [])
    expect(normalizer.length).toBe(12)
    expect(isNormal(GROUP_A4, report.subgroups[0]?.members ?? [])).toBe(true)

    const r3 = sylowReport(GROUP_A4, 3)
    const p3 = r3.subgroups[0]
    expect(p3).toBeDefined()
    const n3 = normalizerOfSubgroup(GROUP_A4, p3?.members ?? [])
    expect(GROUP_A4.order / n3.length).toBe(4)
  })

  it('质因数分解：24 = 2³·3，60 = 2²·3·5', () => {
    expect(primeFactorization(24)).toEqual([
      { prime: 2, exponent: 3 },
      { prime: 3, exponent: 1 },
    ])
    expect(primeFactorization(60)).toEqual([
      { prime: 2, exponent: 2 },
      { prime: 3, exponent: 1 },
      { prime: 5, exponent: 1 },
    ])
  })
})

describe('v3.0 陪集作用与商群', () => {
  it('A₄ 对 V₄：商群 C₃（3 个陪集，正规）', () => {
    const v4 = sylowSubgroups(GROUP_A4, 2)[0] ?? []
    const info = cosets(GROUP_A4, v4)
    expect(info.index).toBe(3)
    expect(info.normal).toBe(true)
    const quotient = quotientGroup(GROUP_A4, v4)
    expect(quotient).not.toBeNull()
    // 商群每个元素是陪集（3 个元素的表）
    const elements = quotient?.elements ?? []
    expect(elements.length).toBe(3)
  })

  it('S₃ 对 A₃ = ⟨(123)⟩：指数 2、正规，商群 C₂', () => {
    const a3 = cyclicSubgroup(GROUP_S3, Math.max(0, GROUP_S3.elements.indexOf('(123)')))
    const info = cosets(GROUP_S3, a3)
    expect(info.index).toBe(2)
    expect(info.normal).toBe(true)
    const quotient = quotientGroup(GROUP_S3, a3)
    expect(quotient?.elements.length).toBe(2)
  })

  it('S₃ 对 ⟨(12)⟩：左右陪集不同集合（非正规），商群为 null', () => {
    const h = cyclicSubgroup(GROUP_S3, Math.max(0, GROUP_S3.elements.indexOf('(12)')))
    const info = cosets(GROUP_S3, h)
    expect(info.index).toBe(3)
    expect(info.normal).toBe(false)
    expect(quotientGroup(GROUP_S3, h)).toBeNull()
  })
})

describe('v3.0 Burnside 计数（着色/项链例子）', () => {
  it('D₄ 作用于正方形 4 顶点着色：k=2 → 6 种；k=3 → 21 种', () => {
    const two = burnsideColoring(GROUP_D4, 2)
    expect(two).not.toBeNull()
    expect(two?.orbits).toBe(6)
    const three = burnsideColoring(GROUP_D4, 3)
    expect(three?.orbits).toBe(21)
    // 每行不动点计数 = k^{轮换数}
    for (const row of two?.rows ?? []) {
      expect(row.fixed).toBe(2 ** row.cycles)
    }
  })

  it('S₃ 作用于三角形 3 顶点着色：k=2 → 4 种', () => {
    const report = burnsideColoring(GROUP_S3, 2)
    expect(report?.orbits).toBe(4)
  })

  it('表构造群（无置换数据）返回 null', () => {
    expect(burnsideColoring(GROUP_V4, 2)).toBeNull()
    expect(burnsideColoring(GROUP_Q8, 2)).toBeNull()
  })
})

describe('v3.0 共轭类与子群共轭一致性', () => {
  it('共轭类划分互不相交且覆盖全群（A₅ 抽查）', () => {
    const seen = new Set<number>()
    for (const cls of conjugacyClasses(GROUP_A5)) {
      for (const member of cls.members) {
        expect(seen.has(member)).toBe(false)
        seen.add(member)
      }
    }
    expect(seen.size).toBe(60)
  })

  it('共轭子群同阶（S₄ 的 Sylow 3-子群全部 3 阶）', () => {
    for (const subgroup of sylowSubgroups(GROUP_S4, 3)) {
      expect(subgroup.length).toBe(3)
    }
  })
})
