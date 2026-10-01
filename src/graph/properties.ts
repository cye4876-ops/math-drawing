/**
 * 图的基本性质（v0.5）：连通性 / 二分性 / 欧拉路与回路 / 平面性（禁用子图）。
 * 语义统一为「无向化」直觉：忽略方向统计（自环计 2 度；欧拉判据对多重图成立）。
 * 纯函数模块（内部可用 Set/Map，供 .svelte 面板薄壳调用与单元测试）。
 */
import { toGraphology, type GraphObject } from './model'
import { isBipartite } from './algorithms/coloring'
import { detectPlanarity, type PlanarityResult } from './planarity'

export interface GraphProperties {
  nodeCount: number
  edgeCount: number
  /** 连通分量数（含孤立顶点） */
  components: number
  connected: boolean
  bipartite: boolean
  /** 欧拉：回路 / 路径 / 不存在（无向化判据；忽略孤立点） */
  euler: 'circuit' | 'path' | 'none'
  planar: PlanarityResult
}

export function computeProperties(graph: GraphObject): GraphProperties {
  const g = toGraphology(graph)
  const n = graph.nodes.length
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]))

  // 度数（无向化；自环计 2；多重边分别计数——欧拉判据对多重图成立）
  const degree = new Array<number>(n).fill(0)
  for (const edge of graph.edges) {
    const i = index.get(edge.source)
    const j = index.get(edge.target)
    if (i === undefined || j === undefined) continue
    if (i === j) degree[i]! += 2
    else {
      degree[i]! += 1
      degree[j]! += 1
    }
  }

  // 连通分量（全图，无向化）
  const seen = new Set<string>()
  let components = 0
  g.forEachNode((id) => {
    if (seen.has(id)) return
    components += 1
    const stack = [id]
    seen.add(id)
    while (stack.length > 0) {
      const u = stack.pop()!
      for (const v of g.neighbors(u)) {
        if (!seen.has(v)) {
          seen.add(v)
          stack.push(v)
        }
      }
    }
  })

  // 非孤立子图的连通性（欧拉判据用）
  const active = graph.nodes
    .filter((node) => (degree[index.get(node.id)!] ?? 0) > 0)
    .map((node) => node.id)
  const seenActive = new Set<string>()
  let activeComponents = 0
  for (const start of active) {
    if (seenActive.has(start)) continue
    activeComponents += 1
    const stack = [start]
    seenActive.add(start)
    while (stack.length > 0) {
      const u = stack.pop()!
      for (const v of g.neighbors(u)) {
        if (!seenActive.has(v) && (degree[index.get(v)!] ?? 0) > 0) {
          seenActive.add(v)
          stack.push(v)
        }
      }
    }
  }

  const oddCount = degree.filter((value) => value % 2 === 1).length
  let euler: 'circuit' | 'path' | 'none'
  if (active.length === 0)
    euler = 'circuit' // 空图/全孤立：平凡欧拉回路
  else if (activeComponents > 1) euler = 'none'
  else if (oddCount === 0) euler = 'circuit'
  else if (oddCount === 2) euler = 'path'
  else euler = 'none'

  return {
    nodeCount: n,
    edgeCount: graph.edges.length,
    components,
    connected: n === 0 || components <= 1,
    bipartite: isBipartite(graph).bipartite,
    euler,
    planar: detectPlanarity(graph),
  }
}
