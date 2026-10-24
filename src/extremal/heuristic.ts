/**
 * n > 8 的启发式下界搜索（v3.9）：
 * 从 Turán 构造与随机边序出发做贪心增边，返回一个无禁图的见证图。
 * 结果明确是 **下界**，不宣称最优；用于 n 超出内嵌图集时继续探索。
 */
import {
  graphDegrees,
  preparePattern,
  containsPrepared,
  type SimpleGraph,
  type PreparedPattern,
} from './containment'
import { turanGraph } from './patterns'
import type { ExtremalPatternSpec } from './search'

export interface HeuristicOptions {
  n: number
  patterns: ExtremalPatternSpec[]
  /** 最大阶数（默认 12） */
  maxN?: number
  restarts?: number
  seed?: number
}

export interface HeuristicResult {
  n: number
  maxEdges: number
  edges: Array<[number, number]>
  restarts: number
  steps: number
  lowerBound: true
  complete: false
  note: string
}

function pairsOf(n: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let u = 0; u < n; u++) {
    for (let v = u + 1; v < n; v++) pairs.push([u, v])
  }
  return pairs
}

function addEdge(adj: number[], u: number, v: number): void {
  adj[u]! |= 1 << v
  adj[v]! |= 1 << u
}

function hasEdge(adj: number[], u: number, v: number): boolean {
  return ((adj[u]! >> v) & 1) === 1
}

function isFree(
  adj: number[],
  n: number,
  prepared: PreparedPattern[],
  steps: { value: number },
): boolean {
  const graph: SimpleGraph = { n, adj }
  const degrees = graphDegrees(graph)
  steps.value++
  return !prepared.some((pattern) => containsPrepared(graph, pattern, false, degrees))
}

export function heuristicLowerBound(options: HeuristicOptions): HeuristicResult {
  const n = Math.max(8, Math.min(options.maxN ?? 12, Math.round(options.n)))
  const patterns = options.patterns.map((item) => preparePattern(item.graph))
  const restarts = Math.max(1, Math.min(40, options.restarts ?? 16))
  const pairs = pairsOf(n)
  let seed = (options.seed ?? 20261024) >>> 0
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
  let bestEdges: Array<[number, number]> = []
  const stepCounter = { value: 0 }
  const attempt = (initial: Array<[number, number]>, greedy: boolean): void => {
    const adj = new Array<number>(n).fill(0)
    const accepted: Array<[number, number]> = []
    for (const [u, v] of initial) {
      addEdge(adj, u, v)
      accepted.push([u, v])
    }
    if (!isFree(adj, n, patterns, stepCounter)) return
    if (greedy) {
      const order = [...pairs]
      for (let index = order.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1))
        ;[order[index], order[swap]] = [order[swap]!, order[index]!]
      }
      for (const [u, v] of order) {
        if (hasEdge(adj, u, v)) continue
        addEdge(adj, u, v)
        if (isFree(adj, n, patterns, stepCounter)) accepted.push([u, v])
        else {
          adj[u]! &= ~(1 << v)
          adj[v]! &= ~(1 << u)
        }
      }
    }
    if (accepted.length > bestEdges.length) {
      bestEdges = accepted
    }
  }

  // Turán 构造作为强初始种子（对完全禁图往往直接达到下界）
  for (let parts = 2; parts <= Math.min(n, 5); parts++) {
    const turan = turanGraph(n, parts)
    attempt(turan.edges, true)
  }
  for (let restart = 0; restart < restarts; restart++) {
    attempt([], true)
  }
  return {
    n,
    maxEdges: bestEdges.length,
    edges: bestEdges,
    restarts,
    steps: stepCounter.value,
    lowerBound: true,
    complete: false,
    note: `启发式下界：${restarts} 次随机贪心 + Turán 种子，找到 ${bestEdges.length} 条边的无禁图见证（不保证最优）。`,
  }
}
