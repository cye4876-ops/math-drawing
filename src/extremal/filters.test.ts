import { describe, expect, it } from 'vitest'
import { simpleGraphFromEdges } from './containment'
import {
  DEFAULT_HOST_FILTERS,
  describeHostFilters,
  hasActiveHostFilters,
  passesHostFilters,
  type HostFilters,
} from './filters'

function withFilters(patch: Partial<HostFilters>): HostFilters {
  return { ...DEFAULT_HOST_FILTERS, ...patch }
}

function completeGraph(n: number) {
  const edges: Array<[number, number]> = []
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) edges.push([u, v])
  }
  return simpleGraphFromEdges(n, edges)
}

const K5 = completeGraph(5)
const C5 = simpleGraphFromEdges(5, [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 0],
])
const C6 = simpleGraphFromEdges(6, [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 0],
])
const K23 = simpleGraphFromEdges(5, [
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 2],
  [1, 3],
  [1, 4],
])
const K3 = completeGraph(3)
const K3_PLUS_ISOLATED = simpleGraphFromEdges(4, [
  [0, 1],
  [1, 2],
  [0, 2],
])

describe('v3.7 宿主结构约束', () => {
  it('连通 / 二部 / 三角形-free / 最大度', () => {
    expect(passesHostFilters(K3_PLUS_ISOLATED, withFilters({ connected: true }))).toBe(false)
    expect(passesHostFilters(C6, withFilters({ connected: true }))).toBe(true)
    expect(passesHostFilters(K23, withFilters({ bipartite: true }))).toBe(true)
    expect(passesHostFilters(K5, withFilters({ bipartite: true }))).toBe(false)
    expect(passesHostFilters(K3, withFilters({ triangleFree: true }))).toBe(false)
    expect(passesHostFilters(C5, withFilters({ triangleFree: true }))).toBe(true)
    expect(passesHostFilters(C6, withFilters({ maxDegree: 2 }))).toBe(true)
    expect(passesHostFilters(K5, withFilters({ maxDegree: 2 }))).toBe(false)
  })

  it('平面性使用 LR 精确检验（K5 非平面、C5 平面）', () => {
    expect(passesHostFilters(K5, withFilters({ planar: true }))).toBe(false)
    expect(passesHostFilters(C5, withFilters({ planar: true }))).toBe(true)
  })

  it('约束描述与激活判断', () => {
    expect(hasActiveHostFilters(DEFAULT_HOST_FILTERS)).toBe(false)
    expect(describeHostFilters(DEFAULT_HOST_FILTERS)).toBe('无')
    const filters = withFilters({
      connected: true,
      bipartite: true,
      planar: true,
      triangleFree: true,
      maxDegree: 3,
    })
    expect(hasActiveHostFilters(filters)).toBe(true)
    expect(describeHostFilters(filters)).toBe('连通、二部、平面、无三角形、Δ ≤ 3')
  })
})
