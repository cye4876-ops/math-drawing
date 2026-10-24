/**
 * 极值搜索的宿主图结构约束（v3.7）：
 * 连通 / 二部 / 平面 / 三角形-free / 最大度上限。
 * 平面性复用 v3.1 的 LR 检验（src/lab/planarity），不是只查 K5/K3,3 直接子图。
 */
import { isPlanar } from '../lab/planarity'
import type { SimpleGraph } from './containment'

export interface HostFilters {
  connected: boolean
  bipartite: boolean
  planar: boolean
  triangleFree: boolean
  /** 0 = 不限 */
  maxDegree: number
}

export const DEFAULT_HOST_FILTERS: HostFilters = {
  connected: false,
  bipartite: false,
  planar: false,
  triangleFree: false,
  maxDegree: 0,
}

export function hasActiveHostFilters(filters: HostFilters): boolean {
  return (
    filters.connected ||
    filters.bipartite ||
    filters.planar ||
    filters.triangleFree ||
    filters.maxDegree > 0
  )
}

export function describeHostFilters(filters: HostFilters): string {
  const parts: string[] = []
  if (filters.connected) parts.push('连通')
  if (filters.bipartite) parts.push('二部')
  if (filters.planar) parts.push('平面')
  if (filters.triangleFree) parts.push('无三角形')
  if (filters.maxDegree > 0) parts.push(`Δ ≤ ${filters.maxDegree}`)
  return parts.length > 0 ? parts.join('、') : '无'
}

function isConnected(graph: SimpleGraph): boolean {
  if (graph.n <= 1) return true
  const seen = new Uint8Array(graph.n)
  const stack = [0]
  seen[0] = 1
  let count = 1
  while (stack.length > 0) {
    const vertex = stack.pop()!
    let mask = graph.adj[vertex]!
    while (mask !== 0) {
      const bit = mask & -mask
      const next = 31 - Math.clz32(bit)
      mask ^= bit
      if (!seen[next]) {
        seen[next] = 1
        count++
        stack.push(next)
      }
    }
  }
  return count === graph.n
}

function isBipartite(graph: SimpleGraph): boolean {
  const color = new Int8Array(graph.n).fill(-1)
  for (let start = 0; start < graph.n; start++) {
    if (color[start] !== -1) continue
    color[start] = 0
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      const vertex = queue[head]!
      let mask = graph.adj[vertex]!
      while (mask !== 0) {
        const bit = mask & -mask
        const next = 31 - Math.clz32(bit)
        mask ^= bit
        if (color[next] === -1) {
          color[next] = color[vertex] === 0 ? 1 : 0
          queue.push(next)
        } else if (color[next] === color[vertex]) {
          return false
        }
      }
    }
  }
  return true
}

function isTriangleFree(graph: SimpleGraph): boolean {
  for (let a = 0; a < graph.n; a++) {
    const neighbors = graph.adj[a]!
    for (let b = a + 1; b < graph.n; b++) {
      if ((neighbors >> b) & 1) {
        if ((graph.adj[a]! & graph.adj[b]!) !== 0) return false
      }
    }
  }
  return true
}

function maxDegreeOf(graph: SimpleGraph): number {
  let best = 0
  for (const mask of graph.adj) {
    let value = mask
    let count = 0
    while (value !== 0) {
      value &= value - 1
      count++
    }
    if (count > best) best = count
  }
  return best
}

export function passesHostFilters(graph: SimpleGraph, filters: HostFilters): boolean {
  if (filters.maxDegree > 0 && maxDegreeOf(graph) > filters.maxDegree) return false
  if (filters.connected && !isConnected(graph)) return false
  if (filters.bipartite && !isBipartite(graph)) return false
  if (filters.triangleFree && !isTriangleFree(graph)) return false
  if (filters.planar && !isPlanar(graph)) return false
  return true
}
