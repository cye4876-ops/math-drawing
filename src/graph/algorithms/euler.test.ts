/**
 * 欧拉路（Hierholzer）测试：回路/通路/不存在三态、路径覆盖每条边恰好一次、
 * 平行边与自环、不连通、有向图按无向语义、步骤流与确定性。
 */
import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from '../dsl-to-doc'
import type { GraphObject } from '../model'
import { eulerTrailSteps } from './euler'
import { runAlgorithm, type EulerResult } from './index'
import { collectSteps } from './types'

function make(dsl: string): GraphObject {
  const { graph } = graphObjectFromDsl(dsl)
  return graph!
}

/** 无向多重边的键（排序后拼接） */
function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** 校验路径恰好覆盖图的每条边一次（按多重集比较；孤立点忽略） */
function coversEveryEdgeOnce(graph: GraphObject, path: string[]): boolean {
  const remaining = new Map<string, number>()
  for (const edge of graph.edges) {
    const key = edgeKey(edge.source, edge.target)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }
  let consumed = 0
  for (let i = 0; i + 1 < path.length; i++) {
    const key = edgeKey(path[i]!, path[i + 1]!)
    const count = remaining.get(key) ?? 0
    if (count <= 0) return false
    remaining.set(key, count - 1)
    consumed += 1
  }
  return consumed === graph.edges.length && path.length === graph.edges.length + 1
}

describe('v0.5 算法：欧拉路（Hierholzer）', () => {
  it('三角形：欧拉回路，路径覆盖 3 条边且首尾闭合', () => {
    const graph = make('A-B, B-C, C-A')
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.exists).toBe(true)
    expect(result.kind).toBe('circuit')
    const path = result.path!
    expect(path).toHaveLength(4)
    expect(path[0]).toBe(path[path.length - 1])
    expect(coversEveryEdgeOnce(graph, path)).toBe(true)
  })

  it('路径 A-B-C：恰 2 个奇度顶点 → 欧拉通路（从奇度端出发）', () => {
    const graph = make('A-B, B-C')
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.exists).toBe(true)
    expect(result.kind).toBe('path')
    const byId = new Map(graph.nodes.map((node) => [node.id, node.label]))
    const labels = result.path!.map((id) => byId.get(id) ?? id)
    expect(labels).toEqual(['A', 'B', 'C'])
  })

  it('K5：全偶度 → 欧拉回路覆盖全部 10 条边', () => {
    const graph = make('1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5')
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.kind).toBe('circuit')
    expect(coversEveryEdgeOnce(graph, result.path!)).toBe(true)
  })

  it('星形 K1,3：4 个奇度顶点 → 不存在，原因含奇度说明', () => {
    const graph = make('C-A, C-B, C-D')
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.exists).toBe(false)
    expect(result.kind).toBe('none')
    expect(result.path).toBeNull()
    expect(result.reason).toContain('4 个奇度顶点')
  })

  it('不连通（两个含边分量）：不存在，原因含不连通', () => {
    const graph = make('A-B, C-D')
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.exists).toBe(false)
    expect(result.reason).toContain('不连通')
  })

  it('平行边：A=B×2 + B-C + C-A（2 奇度点）→ 通路覆盖 4 条边', () => {
    const graph = make('A-B, A-B, B-C, C-A')
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.exists).toBe(true)
    expect(result.kind).toBe('path')
    expect(coversEveryEdgeOnce(graph, result.path!)).toBe(true)
  })

  it('自环：A-A + A-B = 双重边 → 回路，路径含重复顶点', () => {
    const graph = make('A-A, A-B, A-B')
    const result = runAlgorithm('euler', graph).result as EulerResult
    // 度：A = 2（自环）+2 = 4，B = 2 → 全偶
    expect(result.kind).toBe('circuit')
    expect(coversEveryEdgeOnce(graph, result.path!)).toBe(true)
  })

  it('无边图：平凡回路（空路径）', () => {
    const graph = make('A')
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.exists).toBe(true)
    expect(result.kind).toBe('circuit')
    expect(result.path).toEqual([])
  })

  it('有向边按无向语义处理（A->B, B->C, C->A 等价无向三角形）', () => {
    const graph = make('A->B, B->C, C->A')
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.kind).toBe('circuit')
    expect(coversEveryEdgeOnce(graph, result.path!)).toBe(true)
  })

  it('确定性：同一图两次运行路径一致', () => {
    const graph = make('1-2, 2-3, 3-4, 4-1, 1-2, 2-4')
    const first = runAlgorithm('euler', graph).result as EulerResult
    const second = runAlgorithm('euler', graph).result as EulerResult
    expect(first.path).toEqual(second.path)
  })

  it('步骤流：select 步数 = 边数；轨迹覆盖全部边', () => {
    const graph = make('A-B, B-C, C-A, C-D')
    const { steps } = collectSteps(eulerTrailSteps(graph))
    const selects = steps.filter((step) => step.kind === 'select')
    expect(selects).toHaveLength(graph.edges.length)
    const trailEdges = new Set(selects.map((step) => edgeKey(step.edge!.source, step.edge!.target)))
    expect(trailEdges.size).toBe(4)
    expect(steps[steps.length - 1]?.note).toContain('欧拉')
  })

  it('网格 2×3（全偶或 2 奇度）：可构造且覆盖全部边', () => {
    const graph = make('1-2, 2-3, 4-5, 5-6, 1-4, 2-5, 3-6')
    // 度数：1:2, 2:3, 3:2, 4:2, 5:3, 6:2 → 2 个奇度（2、5）→ 通路
    const result = runAlgorithm('euler', graph).result as EulerResult
    expect(result.exists).toBe(true)
    expect(coversEveryEdgeOnce(graph, result.path!)).toBe(true)
  })
})
