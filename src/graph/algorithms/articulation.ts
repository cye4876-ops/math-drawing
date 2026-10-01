/**
 * 割点与桥（v0.5 待办补全）：
 * - 无向语义：忽略边方向（有向边按无向处理）、自环忽略、平行边计重数（平行对不构成桥）；
 * - 割点：删去后连通分量数增加的顶点（Tarjan：根需 ≥ 2 棵 DFS 子树；非根存在孩子 low[v] ≥ dfn[u]）；
 * - 桥：删去后图不连通的边（树边且 low[v] > dfn[u]，且两点间仅此一条边）。
 * 步骤：`push` 进入顶点、`inspect` 检查邻接（树边/回边）、`select` 判定割点或桥、`note` 汇总。
 */
import type { GraphObject } from '../model'
import type { AlgorithmStep } from './types'

export interface CutResult {
  /** 割点（按发现顺序的节点 id） */
  articulation: string[]
  /** 桥（按发现顺序；方向为 DFS 树方向，语义为无向边） */
  bridges: { source: string; target: string }[]
  /** 连通分量数（含孤立点） */
  components: number
}

export function* cutVerticesSteps(graph: GraphObject): Generator<AlgorithmStep, CutResult, void> {
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]))
  const name = (id: string): string => labelById.get(id) ?? id

  // 无向多重邻接：adj.get(u)!.get(v) = u—v 之间边数（自环忽略）
  const adj = new Map<string, Map<string, number>>()
  for (const node of graph.nodes) adj.set(node.id, new Map())
  for (const edge of graph.edges) {
    if (edge.source === edge.target) continue
    const a = adj.get(edge.source)
    const b = adj.get(edge.target)
    if (!a || !b) continue
    a.set(edge.target, (a.get(edge.target) ?? 0) + 1)
    b.set(edge.source, (b.get(edge.source) ?? 0) + 1)
  }

  const dfn = new Map<string, number>()
  const low = new Map<string, number>()
  const articulation: string[] = []
  const articulationSet = new Set<string>()
  const bridges: { source: string; target: string }[] = []
  let counter = 0
  let components = 0

  function* visit(u: string, parent: string | null): Generator<AlgorithmStep, void, void> {
    dfn.set(u, counter)
    low.set(u, counter)
    counter += 1
    let childCount = 0
    yield { kind: 'push', node: u, note: `${name(u)} 进入 DFS（dfn=${dfn.get(u)}）` }
    const neighbors = adj.get(u)
    if (!neighbors) return
    for (const [v, count] of neighbors) {
      if (!dfn.has(v)) {
        childCount += 1
        yield {
          kind: 'inspect',
          edge: { source: u, target: v },
          note: `树边 ${name(u)}—${name(v)}：继续深入 ${name(v)}`,
        }
        yield* visit(v, u)
        low.set(u, Math.min(low.get(u)!, low.get(v)!))
        if (parent !== null && low.get(v)! >= dfn.get(u)! && !articulationSet.has(u)) {
          articulationSet.add(u)
          articulation.push(u)
          yield {
            kind: 'select',
            node: u,
            note: `${name(u)} 是割点：子树 ${name(v)} 一侧 low=${low.get(v)} ≥ dfn=${dfn.get(u)}`,
          }
        }
        if (count === 1 && low.get(v)! > dfn.get(u)!) {
          bridges.push({ source: u, target: v })
          yield {
            kind: 'select',
            edge: { source: u, target: v },
            note: `${name(u)}—${name(v)} 是桥：删去后图不连通（low=${low.get(v)} > dfn=${dfn.get(u)}）`,
          }
        }
      } else if (v !== parent || count > 1) {
        // 回边（或与父节点之间的平行树边）：用 dfn[v] 更新 low
        const updated = Math.min(low.get(u)!, dfn.get(v)!)
        if (updated < low.get(u)!) {
          low.set(u, updated)
          yield {
            kind: 'inspect',
            edge: { source: u, target: v },
            note: `回边 ${name(u)}—${name(v)}：low(${name(u)}) 更新为 ${updated}`,
          }
        }
      }
    }
    if (parent === null && childCount >= 2) {
      articulationSet.add(u)
      articulation.push(u)
      yield {
        kind: 'select',
        node: u,
        note: `${name(u)} 是割点：DFS 根有 ${childCount} 棵子树`,
      }
    }
  }

  for (const node of graph.nodes) {
    if (dfn.has(node.id)) continue
    components += 1
    yield* visit(node.id, null)
  }

  const bridgeCount = bridges.length
  yield {
    kind: 'note',
    note: `共 ${articulation.length} 个割点、${bridgeCount} 条桥（${components} 个连通分量）`,
  }
  return { articulation, bridges, components }
}
