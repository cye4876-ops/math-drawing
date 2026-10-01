/**
 * Floyd-Warshall 全对最短路（v0.5）：生成器实现——每个中间点一步（共 n 步），
 * 步骤流保持简洁（结果给出完整距离矩阵）；结束后检测对角负值报告负环。
 * 语义：有向边沿箭头、无向边双向；平行边取最小；权重缺省 1。
 */
import type { GraphObject } from '../model'
import { graphView } from './common'
import type { AlgorithmStep } from './types'

export interface AllPairsResult {
  labels: { id: string; label: string }[]
  /** matrix[i][j]：顶点 i → j 的最短距离；不可达为 null */
  matrix: (number | null)[][]
  /** 对角线出现负值（负环） */
  negativeCycle: boolean
}

export function* floydWarshallSteps(
  graph: GraphObject,
): Generator<AlgorithmStep, AllPairsResult, void> {
  const view = graphView(graph)
  const nodes = graph.nodes
  const n = nodes.length
  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const label = (i: number): string => view.label(nodes[i]!.id)

  // 初始化：对角 0；边权（平行边取小）
  const dist: (number | null)[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : null)),
  )
  for (const edge of graph.edges) {
    const i = index.get(edge.source)
    const j = index.get(edge.target)
    if (i === undefined || j === undefined) continue
    const weight = edge.weight ?? 1
    const relax = (a: number, b: number): void => {
      if (dist[a]![b] === null || weight < dist[a]![b]!) dist[a]![b] = weight
    }
    relax(i, j)
    if (!edge.directed) relax(j, i)
  }
  yield { kind: 'note', note: `初始化邻接距离矩阵（${n} × ${n}），逐中间点迭代` }

  for (let k = 0; k < n; k++) {
    let updates = 0
    for (let i = 0; i < n; i++) {
      const viaK = dist[i]![k]
      if (viaK === null || viaK === undefined) continue
      for (let j = 0; j < n; j++) {
        const kj = dist[k]![j]
        if (kj === null || kj === undefined) continue
        const candidate = viaK + kj
        if (dist[i]![j] === null || candidate < dist[i]![j]!) {
          dist[i]![j] = candidate
          updates += 1
        }
      }
    }
    yield {
      kind: 'visit',
      node: nodes[k]!.id,
      note: `以 ${label(k)} 为中间点：更新 ${updates} 个距离`,
    }
  }

  let negativeCycle = false
  for (let i = 0; i < n; i++) {
    const diagonal = dist[i]![i]
    if (diagonal !== null && diagonal !== undefined && diagonal < 0) {
      negativeCycle = true
      yield {
        kind: 'reject',
        node: nodes[i]!.id,
        note: `${label(i)} 到自身距离为负（${diagonal}）：检测到负环`,
      }
      break
    }
  }
  yield {
    kind: 'note',
    note: negativeCycle ? '完成（存在负环：部分距离无意义）' : '完成：全对最短距离已收敛',
  }
  return {
    labels: nodes.map((node) => ({ id: node.id, label: node.label })),
    matrix: dist,
    negativeCycle,
  }
}
