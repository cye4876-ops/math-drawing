/**
 * 二分匹配（v0.5）：匈牙利算法（Kuhn）——生成器实现。
 * 前置：图必须可二着色（否则返回错误）；在左部顶点上逐个寻找增广路。
 * 步骤：`visit` 开始为某左点找增广路、`inspect` 检查候选、`select` 匹配成型、`reject` 饱和。
 */
import type { GraphObject } from '../model'
import { graphView } from './common'
import { isBipartite } from './coloring'
import type { AlgorithmFailure, AlgorithmStep } from './types'

export interface MatchingResult {
  /** 匹配对（left/right 为顶点 id；left 取二着色中的 0 色部） */
  pairs: { left: string; right: string }[]
  size: number
}

export function* bipartiteMatchingSteps(
  graph: GraphObject,
): Generator<AlgorithmStep, MatchingResult | AlgorithmFailure, void> {
  const check = isBipartite(graph)
  if (!check.bipartite) {
    yield { kind: 'reject', note: '非二分图：二分匹配（匈牙利算法）要求图可二着色' }
    return { error: '非二分图：无法进行二分匹配（请先检测二分性）' }
  }
  const view = graphView(graph)
  const g = view.g
  const color = check.colors
  const left = graph.nodes.filter((node) => color[node.id] === 0).map((node) => node.id)
  const matchRight = new Map<string, string>()
  const matchLeft = new Map<string, string>()
  yield {
    kind: 'note',
    note: `左部 ${left.length} 个顶点、右部 ${graph.nodes.length - left.length} 个；逐个左点寻找增广路`,
  }

  function* tryAugment(u: string, visited: Set<string>): Generator<AlgorithmStep, boolean, void> {
    for (const v of g.neighbors(u)) {
      if (color[v] === 0) continue // 仅沿 左 → 右
      if (visited.has(v)) continue
      visited.add(v)
      yield {
        kind: 'inspect',
        node: u,
        edge: { source: u, target: v },
        note: `检查 ${view.label(u)} ↔ ${view.label(v)}`,
      }
      const current = matchRight.get(v)
      if (current === undefined || (yield* tryAugment(current, visited))) {
        matchRight.set(v, u)
        matchLeft.set(u, v)
        yield {
          kind: 'select',
          edge: { source: u, target: v },
          note: `匹配 ${view.label(u)} ↔ ${view.label(v)}（增广成功）`,
        }
        return true
      }
    }
    return false
  }

  for (const u of left) {
    yield { kind: 'visit', node: u, note: `为 ${view.label(u)} 寻找增广路` }
    const ok = yield* tryAugment(u, new Set())
    if (!ok) {
      yield {
        kind: 'reject',
        node: u,
        note: `${view.label(u)} 未能匹配（其邻域已被占用且无法增广）`,
      }
    }
  }
  const pairs = [...matchRight.entries()].map(([right, leftId]) => ({ left: leftId, right }))
  yield { kind: 'note', note: `最大匹配：${pairs.length} 对` }
  return { pairs, size: pairs.length }
}
