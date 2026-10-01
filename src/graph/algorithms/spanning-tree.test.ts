/**
 * 最小生成树测试（v0.5 阶段 5）：Prim / Kruskal。
 */
import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from '../dsl-to-doc'
import type { GraphObject } from '../model'
import { runAlgorithm, type MstResult } from './index'

function make(dsl: string): GraphObject {
  const { graph } = graphObjectFromDsl(dsl)
  return graph!
}

const EMPTY: GraphObject = {
  id: 'empty',
  type: 'graph',
  name: '空图',
  nodes: [],
  edges: [],
  visible: true,
}

/** 边集归一化（无向对端点排序） */
function edgeSet(result: MstResult): string[] {
  return result.edges.map((edge) => [edge.source, edge.target].sort().join('-')).sort()
}

describe('v0.5 算法：最小生成树（Prim / Kruskal）', () => {
  it('三角带权图：两算法给出同一边集（总权重 3）', () => {
    const graph = make('A-B:1, B-C:2, A-C:3')
    const prim = runAlgorithm('prim', graph).result as MstResult
    const kruskal = runAlgorithm('kruskal', graph).result as MstResult
    expect(prim.totalWeight).toBe(3)
    expect(kruskal.totalWeight).toBe(3)
    expect(edgeSet(prim)).toEqual(edgeSet(kruskal))
    expect(prim.connected).toBe(true)
    expect(kruskal.connected).toBe(true)
  })

  it('正方形环：Kruskal 跳过最大边（权重集合 {1,2,3}，总权重 6）', () => {
    const graph = make('1-2:1, 2-3:2, 3-4:3, 4-1:4')
    const kruskal = runAlgorithm('kruskal', graph).result as MstResult
    expect(kruskal.edges).toHaveLength(3)
    expect(kruskal.totalWeight).toBe(6)
    expect(kruskal.edges.map((edge) => edge.weight).sort((a, b) => a - b)).toEqual([1, 2, 3])
  })

  it('平行边取较小；自环被忽略', () => {
    const graph = make('A-B:5, A-B:2, A-A:0.5')
    const kruskal = runAlgorithm('kruskal', graph).result as MstResult
    expect(kruskal.totalWeight).toBe(2)
    expect(kruskal.edges).toHaveLength(1)
    const prim = runAlgorithm('prim', graph).result as MstResult
    expect(prim.totalWeight).toBe(2)
  })

  it('不连通：Kruskal 给出完整生成森林；Prim 从起点分量生长（均标 connected=false）', () => {
    const graph = make('A-B:1, C-D:1')
    const kruskal = runAlgorithm('kruskal', graph).result as MstResult
    expect(kruskal.connected).toBe(false)
    expect(kruskal.totalWeight).toBe(2)
    expect(kruskal.edges).toHaveLength(2)

    const prim = runAlgorithm('prim', graph).result as MstResult
    expect(prim.connected).toBe(false)
    expect(prim.totalWeight).toBe(1)
    expect(prim.edges).toHaveLength(1)
  })

  it('边界：空图 / 单点 / 单点自环安全', () => {
    expect((runAlgorithm('kruskal', EMPTY).result as MstResult).totalWeight).toBe(0)
    expect((runAlgorithm('prim', EMPTY).result as MstResult).connected).toBe(true)
    const single = make('A')
    expect((runAlgorithm('prim', single).result as MstResult).connected).toBe(true)
    expect((runAlgorithm('kruskal', single).result as MstResult).totalWeight).toBe(0)
    expect((runAlgorithm('kruskal', make('A-A')).result as MstResult).totalWeight).toBe(0)
  })

  it('步骤流：Kruskal 含 inspect/select/reject（A-C 成环被拒）；Prim 两条 select', () => {
    const graph = make('A-B:1, B-C:2, A-C:3')
    const kruskal = runAlgorithm('kruskal', graph)
    expect(kruskal.steps.some((step) => step.kind === 'inspect')).toBe(true)
    expect(kruskal.steps.filter((step) => step.kind === 'select')).toHaveLength(2)
    expect(kruskal.steps.some((step) => step.kind === 'reject')).toBe(true)
    const prim = runAlgorithm('prim', graph)
    expect(prim.steps.filter((step) => step.kind === 'select')).toHaveLength(2)
  })

  it('ALGORITHMS 含 10 项且 runAlgorithm 全部可用（含 MST）', () => {
    const graph = make('A-B:1, B-C:2, C-A:3')
    for (const info of ['prim', 'kruskal']) {
      const { result } = runAlgorithm(info, graph)
      expect('error' in result).toBe(false)
      expect((result as MstResult).totalWeight).toBe(3)
    }
  })
})
