/**
 * 极值查询 URL 编解码（v3.8）：放在普通 .ts 模块中，避免在 Svelte 状态模块里
 * 实例化可变的 URLSearchParams / URL（svelte/prefer-svelte-reactivity 约束）。
 */
import type { HostFilters } from './filters'
import type { PatternInputFormat } from './patterns'

export interface ExtremalLinkConfig {
  n: number
  patternId: string
  extraPatternIds: string[]
  mode: 'subgraph' | 'induced'
  customFormat: PatternInputFormat
  customEdges: string
  complement: boolean
  filters: HostFilters
}

export function encodeExtremalLink(config: ExtremalLinkConfig, href: string): string {
  const params = new URLSearchParams()
  params.set('mode', 'hyper')
  params.set('extremal', String(config.n))
  params.set('pattern', config.patternId)
  params.set('semantics', config.mode)
  if (config.extraPatternIds.length > 0) params.set('extras', config.extraPatternIds.join(','))
  if (config.complement) params.set('complement', '1')
  if (config.patternId === 'custom') {
    params.set('customFormat', config.customFormat)
    params.set('custom', config.customEdges)
  }
  if (config.filters.connected) params.set('connected', '1')
  if (config.filters.bipartite) params.set('bipartite', '1')
  if (config.filters.planar) params.set('planar', '1')
  if (config.filters.triangleFree) params.set('triangleFree', '1')
  if (config.filters.maxDegree > 0) params.set('maxDegree', String(config.filters.maxDegree))
  const url = new URL(href)
  url.search = params.toString()
  return url.toString()
}

export function decodeExtremalLink(search: string): ExtremalLinkConfig | null {
  const params = new URLSearchParams(search)
  const rawN = params.get('extremal')
  if (rawN === null) return null
  return {
    n: Number(rawN) || 1,
    patternId: params.get('pattern') ?? 'K3',
    extraPatternIds: (params.get('extras') ?? '').split(',').filter(Boolean),
    mode: params.get('semantics') === 'induced' ? 'induced' : 'subgraph',
    customFormat: params.get('customFormat') === 'graph6' ? 'graph6' : 'edges',
    customEdges: params.get('custom') ?? '',
    complement: params.get('complement') === '1',
    filters: {
      connected: params.get('connected') === '1',
      bipartite: params.get('bipartite') === '1',
      planar: params.get('planar') === '1',
      triangleFree: params.get('triangleFree') === '1',
      maxDegree: Number(params.get('maxDegree')) || 0,
    },
  }
}
