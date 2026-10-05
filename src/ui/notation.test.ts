import { describe, expect, it } from 'vitest'
import { notation } from './notation'

describe('v3.0.1 数学记号排版', () => {
  it('n_p → n + 下标 p', () => {
    expect(notation('n_p')).toEqual([
      { text: 'n', sub: false },
      { text: 'p', sub: true },
    ])
  })

  it('n_{10} → 多字符下标；C_G、P_1 同样处理', () => {
    expect(notation('n_{10} = 1')).toEqual([
      { text: 'n', sub: false },
      { text: '10', sub: true },
      { text: ' = 1', sub: false },
    ])
    expect(notation('C_G(g)')).toEqual([
      { text: 'C', sub: false },
      { text: 'G', sub: true },
      { text: '(g)', sub: false },
    ])
    expect(notation('P_2 = x·P_1·x⁻¹')).toEqual([
      { text: 'P', sub: false },
      { text: '2', sub: true },
      { text: ' = x·P', sub: false },
      { text: '1', sub: true },
      { text: '·x⁻¹', sub: false },
    ])
  })

  it('无下划线文本保持原样；混合文本分段正确', () => {
    expect(notation('轨道-稳定子')).toEqual([{ text: '轨道-稳定子', sub: false }])
    expect(notation('|Cl(g)| = [G : C_G(g)] = 12 / 3')).toEqual([
      { text: '|Cl(g)| = [G : C', sub: false },
      { text: 'G', sub: true },
      { text: '(g)] = 12 / 3', sub: false },
    ])
    expect(notation('n_p | m 且 n_p ≡ 1 (mod p)')).toEqual([
      { text: 'n', sub: false },
      { text: 'p', sub: true },
      { text: ' | m 且 n', sub: false },
      { text: 'p', sub: true },
      { text: ' ≡ 1 (mod p)', sub: false },
    ])
  })
})
