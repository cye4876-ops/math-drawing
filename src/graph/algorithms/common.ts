/**
 * 算法公共辅助（v0.5 阶段 5）：
 * - 图对象 → graphology 实例的遍历适配（沿「出方向」：有向边沿箭头、无向边双向）；
 * - 标签查询与统一权重读取（缺省 1）。
 *
 * 注意 graphology 0.26 的实际语义（已实测）：
 * - `outNeighbors` / `forEachOutEdge` **只含有向边**（无向边不计入）；
 * - `inDegree` 同样不含无向边；
 * - `neighbors` 为对称邻接（但方向语义不适用于遍历）。
 * 因此本模块用 `forEachOutEdge + forEachUndirectedEdge` 组合出统一的「出方向」语义，
 * 是「有向图 + 无向边混合」的直观教学语义：无向边两端可通行、有向边只沿箭头。
 */
import type Graph from 'graphology'
import { toGraphology, type GraphObject } from '../model'

export interface OutEdge {
  /** 对端节点 id */
  other: string
  /** 权重（缺省 1） */
  weight: number
}

export interface GraphView {
  g: Graph
  /** id → 标签（中文叙述用） */
  label: (id: string) => string
  /** 沿出方向的邻居（无向边双向；平行边可能重复） */
  neighbors: (id: string) => string[]
  /** 沿出方向的边（每条平行边一条记录，带权重） */
  outEdges: (id: string) => OutEdge[]
}

/** 构建算法视图（图对象为空/无节点时也能安全使用） */
export function graphView(graph: GraphObject): GraphView {
  const g = toGraphology(graph)
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]))
  return {
    g,
    label: (id) => labelById.get(id) ?? id,
    neighbors: (id) => {
      const result: string[] = []
      g.forEachOutEdge(id, (_key, _attributes, _source, target) => {
        result.push(target)
      })
      g.forEachUndirectedEdge(id, (_key, _attributes, source, target) => {
        result.push(source === id ? target : source)
      })
      return result
    },
    outEdges: (id) => {
      const result: OutEdge[] = []
      const push = (key: string, other: string): void => {
        const raw = g.getEdgeAttribute(key, 'weight') as number | null | undefined
        result.push({ other, weight: typeof raw === 'number' ? raw : 1 })
      }
      g.forEachOutEdge(id, (key, _attributes, _source, target) => {
        push(key, target)
      })
      g.forEachUndirectedEdge(id, (key, _attributes, source, target) => {
        push(key, source === id ? target : source)
      })
      return result
    },
  }
}

/** 解析起点：给定 id 合法则用之；否则取第一个节点；空图返回 null */
export function resolveStart(graph: GraphObject, startId?: string): string | null {
  if (graph.nodes.length === 0) return null
  if (startId && graph.nodes.some((node) => node.id === startId)) return startId
  return graph.nodes[0]!.id
}
