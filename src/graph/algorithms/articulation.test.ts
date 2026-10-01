/**
 * 割点与桥（Tarjan）测试：经典结构（路径/环/蝴蝶图）、平行边与自环、
 * 不连通分量、有向图按无向语义、步骤流覆盖。
 */
import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from '../dsl-to-doc'
import type { GraphObject } from '../model'
import { cutVerticesSteps } from './articulation'
import { runAlgorithm, type CutResult } from './index'
import { collectSteps } from './types'

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

function labelsOf(graph: GraphObject, ids: string[]): string[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node.label]))
  return ids.map((id) => byId.get(id) ?? id)
}

function bridgeLabels(graph: GraphObject, bridges: CutResult['bridges']): string[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node.label]))
  return bridges
    .map((bridge) => {
      const a = byId.get(bridge.source) ?? bridge.source
      const b = byId.get(bridge.target) ?? bridge.target
      return [a, b].sort().join('-')
    })
    .sort()
}

describe('v0.5 算法：割点与桥（Tarjan）', () => {
  it('路径 P3（A-B-C）：割点 B；两条桥', () => {
    const graph = make('A-B, B-C')
    const { result } = runAlgorithm('articulation', graph)
    const cut = result as CutResult
    expect(labelsOf(graph, cut.articulation)).toEqual(['B'])
    expect(bridgeLabels(graph, cut.bridges)).toEqual(['A-B', 'B-C'])
  })

  it('三角形：无割点、无桥', () => {
    const graph = make('A-B, B-C, C-A')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    expect(cut.articulation).toEqual([])
    expect(cut.bridges).toEqual([])
  })

  it('路径 P4（A-B-C-D）：割点 B、C；三条桥', () => {
    const graph = make('A-B, B-C, C-D')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    // 割点按回溯发现顺序，断言集合
    expect(labelsOf(graph, cut.articulation).sort()).toEqual(['B', 'C'])
    expect(bridgeLabels(graph, cut.bridges)).toEqual(['A-B', 'B-C', 'C-D'])
  })

  it('蝴蝶图（两三角形共享顶点）：仅共享点是割点，无桥', () => {
    // 三角形 A-B-C 与 C-D-E 共享 C
    const graph = make('A-B, B-C, C-A, C-D, D-E, E-C')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    expect(labelsOf(graph, cut.articulation)).toEqual(['C'])
    expect(cut.bridges).toEqual([])
  })

  it('平行边不构成桥（A=B×2, B-C）：只桥 B-C；割点 B', () => {
    const graph = make('A-B, A-B, B-C')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    expect(bridgeLabels(graph, cut.bridges)).toEqual(['B-C'])
    expect(labelsOf(graph, cut.articulation)).toEqual(['B'])
  })

  it('不连通：两个分量各自统计，桥分别在两分量中', () => {
    const graph = make('A-B, C-D')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    expect(cut.components).toBe(2)
    expect(cut.articulation).toEqual([])
    expect(bridgeLabels(graph, cut.bridges)).toEqual(['A-B', 'C-D'])
  })

  it('自环忽略：A-A + A-B 只有桥 A-B', () => {
    const graph = make('A-A, A-B')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    expect(bridgeLabels(graph, cut.bridges)).toEqual(['A-B'])
    expect(cut.articulation).toEqual([])
  })

  it('有向边按无向语义处理（A->B, B->C 等价链）', () => {
    const graph = make('A->B, B->C')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    expect(labelsOf(graph, cut.articulation)).toEqual(['B'])
    expect(bridgeLabels(graph, cut.bridges)).toEqual(['A-B', 'B-C'])
  })

  it('K4：无割点无桥', () => {
    const graph = make('1-2, 1-3, 1-4, 2-3, 2-4, 3-4')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    expect(cut.articulation).toEqual([])
    expect(cut.bridges).toEqual([])
    expect(cut.components).toBe(1)
  })

  it('空图与孤立点边界', () => {
    expect(runAlgorithm('articulation', EMPTY).result).toEqual({
      articulation: [],
      bridges: [],
      components: 0,
    })
    const isolated = make('A')
    expect(runAlgorithm('articulation', isolated).result).toEqual({
      articulation: [],
      bridges: [],
      components: 1,
    })
  })

  it('步骤流：含 push / select（割点或桥）与汇总 note', () => {
    const graph = make('A-B, B-C')
    const { steps } = collectSteps(cutVerticesSteps(graph))
    expect(steps.some((step) => step.kind === 'push')).toBe(true)
    expect(steps.filter((step) => step.kind === 'select').length).toBeGreaterThanOrEqual(3)
    expect(steps[steps.length - 1]?.note).toContain('割点')
  })

  it('2×3 网格：无割点无桥（每条边都在环中）', () => {
    // 2 行 3 列网格：1-2, 2-3, 4-5, 5-6, 1-4, 2-5, 3-6
    const graph = make('1-2, 2-3, 4-5, 5-6, 1-4, 2-5, 3-6')
    const cut = runAlgorithm('articulation', graph).result as CutResult
    expect(cut.articulation).toEqual([])
    expect(cut.bridges).toEqual([])
  })
})
