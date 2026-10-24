import { describe, expect, it } from 'vitest'
import { decodeExtremalLink, encodeExtremalLink, type ExtremalLinkConfig } from './link'

const config: ExtremalLinkConfig = {
  n: 6,
  patternId: 'K3',
  extraPatternIds: ['C4', 'P4'],
  mode: 'subgraph',
  customFormat: 'edges',
  customEdges: '',
  complement: false,
  filters: {
    connected: true,
    bipartite: false,
    planar: true,
    triangleFree: false,
    maxDegree: 3,
  },
}

describe('v3.8 极值深链接', () => {
  it('编码后可完整解码', () => {
    const url = encodeExtremalLink(config, 'https://example.org/math-drawing/?mode=hyper')
    const decoded = decodeExtremalLink(new URL(url).search)
    expect(decoded).toEqual(config)
  })

  it('无 extremal 参数返回 null；自定义 graph6 也可恢复', () => {
    expect(decodeExtremalLink('?mode=hyper')).toBeNull()
    const url = encodeExtremalLink(
      {
        ...config,
        patternId: 'custom',
        extraPatternIds: [],
        customFormat: 'graph6',
        customEdges: 'Bw; C~',
      },
      'https://example.org/',
    )
    const decoded = decodeExtremalLink(new URL(url).search)
    expect(decoded?.patternId).toBe('custom')
    expect(decoded?.customFormat).toBe('graph6')
    expect(decoded?.customEdges).toBe('Bw; C~')
  })
})
