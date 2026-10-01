/**
 * 算法注册与统一入口（v0.5 阶段 5）。
 * `runAlgorithm` 返回 { steps, result }——播放器（单步/播放/回退）只需消费步骤数组，
 * 测试可直接断言步骤序列与最终结果。
 */
import type { GraphObject } from '../model'
import { dsaturColoring, greedyColoring, isBipartite } from './coloring'
import { stronglyConnectedSteps, type SccResult } from './connectivity'
import { floydWarshallSteps, type AllPairsResult } from './floyd'
import { maxFlowSteps, type MaxFlowResult } from './flow'
import { bipartiteMatchingSteps, type MatchingResult } from './matching'
import { topologicalSteps } from './ordering'
import { bellmanFordSteps, dijkstraSteps } from './shortest-path'
import { kruskalSteps, primSteps, type MstResult } from './spanning-tree'
import { bfsSteps, dfsSteps } from './traversal'
import type {
  AlgorithmFailure,
  AlgorithmStep,
  BipartiteResult,
  ColoringResult,
  ShortestPathResult,
  TopologicalResult,
  TraversalResult,
} from './types'

export type { AlgorithmStep, StepKind } from './types'
export { collectSteps } from './types'
export { reconstructPath } from './shortest-path'
export type { MstEdge, MstResult } from './spanning-tree'
export type { SccResult } from './connectivity'
export type { MatchingResult } from './matching'
export type { FlowEdge, MaxFlowResult } from './flow'
export type { AllPairsResult } from './floyd'

export type AlgorithmResult =
  | TraversalResult
  | ShortestPathResult
  | TopologicalResult
  | ColoringResult
  | BipartiteResult
  | MstResult
  | SccResult
  | MatchingResult
  | MaxFlowResult
  | AllPairsResult
  | AlgorithmFailure

export interface AlgorithmInfo {
  id: string
  /** 中文名称（面板显示） */
  name: string
  /** 是否需要选择起点 */
  requiresStart: boolean
  /** 是否需要选择汇点（最大流） */
  requiresEnd?: boolean
  /** 一句话说明 */
  description: string
}

export const ALGORITHMS: AlgorithmInfo[] = [
  {
    id: 'bfs',
    name: 'BFS 广度优先',
    requiresStart: true,
    description: '逐层扩展，得到跳数最短路径',
  },
  { id: 'dfs', name: 'DFS 深度优先', requiresStart: true, description: '沿分支深入，回溯访问' },
  {
    id: 'dijkstra',
    name: 'Dijkstra 最短路',
    requiresStart: true,
    description: '非负权单源最短路（负权将拒绝执行）',
  },
  {
    id: 'bellman-ford',
    name: 'Bellman-Ford 最短路',
    requiresStart: true,
    description: '允许负权，可检测负环',
  },
  {
    id: 'topological',
    name: '拓扑排序（Kahn）',
    requiresStart: false,
    description: '有向无环图输出线性序；有环则报告',
  },
  {
    id: 'prim',
    name: 'Prim 最小生成树',
    requiresStart: true,
    description: '从起点生长：每轮选横跨切的最小权边',
  },
  {
    id: 'kruskal',
    name: 'Kruskal 最小生成树',
    requiresStart: false,
    description: '按权重升序选边，并查集判环',
  },
  {
    id: 'greedy-color',
    name: '贪心着色（度数降序）',
    requiresStart: false,
    description: '依次取最小可用色，得到色数上界',
  },
  {
    id: 'dsatur-color',
    name: 'DSATUR 着色',
    requiresStart: false,
    description: '饱和度贪心，小图通常给出最优色数',
  },
  {
    id: 'bipartite',
    name: '二分判定',
    requiresStart: false,
    description: '二着色判定，并给出冲突证据',
  },
  {
    id: 'scc',
    name: '强连通分量（Tarjan）',
    requiresStart: false,
    description: '有向图分解为强连通分量（无向图 = 连通分量）',
  },
  {
    id: 'matching',
    name: '二分匹配（匈牙利）',
    requiresStart: false,
    description: '在二分图上求最大匹配',
  },
  {
    id: 'max-flow',
    name: '最大流（Edmonds-Karp）',
    requiresStart: true,
    requiresEnd: true,
    description: '容量取边权重（缺省 1）；BFS 增广',
  },
  {
    id: 'floyd',
    name: 'Floyd-Warshall 全对最短路',
    requiresStart: false,
    description: '逐中间点迭代，给出完整距离矩阵；可报告负环',
  },
]

/** 运行算法：生成器算法收集全部步骤；判定/着色类返回结果（步骤为空数组） */
export function runAlgorithm(
  id: string,
  graph: GraphObject,
  startId?: string,
  endId?: string,
): { steps: AlgorithmStep[]; result: AlgorithmResult } {
  const collect = <T extends AlgorithmResult>(
    generator: Generator<AlgorithmStep, T, void>,
  ): { steps: AlgorithmStep[]; result: T } => {
    const steps: AlgorithmStep[] = []
    let next = generator.next()
    while (!next.done) {
      steps.push(next.value)
      next = generator.next()
    }
    return { steps, result: next.value }
  }
  switch (id) {
    case 'bfs':
      return collect(bfsSteps(graph, startId))
    case 'dfs':
      return collect(dfsSteps(graph, startId))
    case 'dijkstra':
      return collect(dijkstraSteps(graph, startId))
    case 'bellman-ford':
      return collect(bellmanFordSteps(graph, startId))
    case 'topological':
      return collect(topologicalSteps(graph))
    case 'prim':
      return collect(primSteps(graph, startId))
    case 'kruskal':
      return collect(kruskalSteps(graph))
    case 'greedy-color':
      return { steps: [], result: greedyColoring(graph) }
    case 'dsatur-color':
      return { steps: [], result: dsaturColoring(graph) }
    case 'bipartite':
      return { steps: [], result: isBipartite(graph) }
    case 'scc':
      return collect(stronglyConnectedSteps(graph))
    case 'matching':
      return collect(bipartiteMatchingSteps(graph))
    case 'max-flow':
      return collect(maxFlowSteps(graph, startId, endId))
    case 'floyd':
      return collect(floydWarshallSteps(graph))
    default:
      return { steps: [], result: { error: `未知算法：${id}` } }
  }
}
