import { describe, expect, it } from 'vitest'
import { areIsomorphic, edgeCountOf } from './containment'
import {
  PATTERN_PRESETS,
  complementSimpleGraph,
  formatPatternLabel,
  parseGraph6Pattern,
  parsePatternInput,
  patternGraph,
  patternPreset,
} from './patterns'

describe('v3.7 禁图预设与自定义输入', () => {
  it('新增预设覆盖树 / 匹配 / 完全二部 / 非连通图', () => {
    const ids = new Set(PATTERN_PRESETS.map((preset) => preset.id))
    for (const id of ['K23', 'P5', '3K2', 'K3K1', 'K14', 'K33', 'C7']) {
      expect(ids.has(id), id).toBe(true)
    }
    expect(edgeCountOf(patternGraph(patternPreset('K23')))).toBe(6)
    expect(edgeCountOf(patternGraph(patternPreset('3K2')))).toBe(3)
    expect(edgeCountOf(patternGraph(patternPreset('K33')))).toBe(9)
  })

  it('graph6 输入：Bw=K₃，C~=K₄；支持多个字符串', () => {
    const k3 = parseGraph6Pattern('Bw')
    expect(k3.graph.n).toBe(3)
    expect(edgeCountOf(k3.graph)).toBe(3)
    const k4 = parseGraph6Pattern('C~')
    expect(k4.graph.n).toBe(4)
    expect(edgeCountOf(k4.graph)).toBe(6)
    const parsed = parsePatternInput('Bw; C~', 'graph6')
    expect(parsed).toHaveLength(2)
    expect(parsed.map((item) => item.graph.n)).toEqual([3, 4])
  })

  it('边表多禁图：分号分隔，标签保留自定义前缀', () => {
    const parsed = parsePatternInput('0-1, 1-2; 1-2, 2-3', 'edges')
    expect(parsed).toHaveLength(2)
    expect(parsed[0]?.graph.n).toBe(3)
    expect(parsed[1]?.graph.n).toBe(4)
    expect(parsed[0]?.label).toContain('自定义禁图')
    expect(() => parsePatternInput('0-0', 'edges')).toThrow(/自环/)
  })

  it('补图：C₄ 的补图是 2K₂，P₄ / C₅ 自补', () => {
    expect(
      areIsomorphic(
        complementSimpleGraph(patternGraph(patternPreset('C4'))),
        patternGraph(patternPreset('2K2')),
      ),
    ).toBe(true)
    expect(
      areIsomorphic(
        complementSimpleGraph(patternGraph(patternPreset('P4'))),
        patternGraph(patternPreset('P4')),
      ),
    ).toBe(true)
    expect(
      areIsomorphic(
        complementSimpleGraph(patternGraph(patternPreset('C5'))),
        patternGraph(patternPreset('C5')),
      ),
    ).toBe(true)
  })

  it('集合标签：单图直接显示，多图用花括号', () => {
    expect(formatPatternLabel(['K₃'])).toBe('K₃')
    expect(formatPatternLabel(['K₃', 'C₄'])).toBe('{K₃, C₄}')
  })
})
