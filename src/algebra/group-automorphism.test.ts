/**
 * v3.2 群自同构测试（WSL Sage 环境独立核验：C₄ 2、V₄ 6、C₆ 2、S₃ 6、D₄ 8、Q₈ 24、
 * A₄ 24、S₄ 24、A₅ 120）。
 */
import { describe, expect, it } from 'vitest'
import {
  GROUP_A4,
  GROUP_A5,
  GROUP_C4,
  GROUP_C6,
  GROUP_D4,
  GROUP_Q8,
  GROUP_S3,
  GROUP_S4,
  GROUP_V4,
} from './groups'
import { groupAutomorphismSummary } from './group-automorphism'

describe('v3.2 群自同构 |Aut(G)|', () => {
  it('小群：C₄ 2、V₄ 6、C₆ 2、S₃ 6、D₄ 8、Q₈ 24', () => {
    expect(groupAutomorphismSummary(GROUP_C4).automorphisms).toBe(2)
    expect(groupAutomorphismSummary(GROUP_V4).automorphisms).toBe(6)
    expect(groupAutomorphismSummary(GROUP_C6).automorphisms).toBe(2)
    expect(groupAutomorphismSummary(GROUP_S3).automorphisms).toBe(6)
    expect(groupAutomorphismSummary(GROUP_D4).automorphisms).toBe(8)
    expect(groupAutomorphismSummary(GROUP_Q8).automorphisms).toBe(24)
  })

  it('较大群：A₄ 24、S₄ 24、A₅ 120；内/外自同构分解正确', () => {
    const a4 = groupAutomorphismSummary(GROUP_A4)
    expect(a4.automorphisms).toBe(24)
    expect(a4.inner).toBe(12)
    expect(a4.outer).toBe(2)

    const s4 = groupAutomorphismSummary(GROUP_S4)
    expect(s4.automorphisms).toBe(24)
    expect(s4.inner).toBe(24)
    expect(s4.outer).toBe(1)

    const a5 = groupAutomorphismSummary(GROUP_A5)
    expect(a5.automorphisms).toBe(120)
    expect(a5.inner).toBe(60)
    expect(a5.outer).toBe(2)
    expect(a5.complete).toBe(true)
    expect(a5.note).toContain('|Aut(G)|')
  })

  it('Q₈：内自同构 4（中心 {±1}）、外自同构 6（Out(Q₈) ≅ S₃）', () => {
    const q8 = groupAutomorphismSummary(GROUP_Q8)
    expect(q8.inner).toBe(4)
    expect(q8.outer).toBe(6)
  })
})
