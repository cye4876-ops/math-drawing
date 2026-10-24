/**
 * 超图实验室分析（v3.4）：复用 src/lab/hypergraph.ts 的精确核验实现（度/线性/正则/匹配/横截），
 * 并补充 Property B（2-着色）、连通分量、2-截面、线图、对偶概览。
 */
import {
  hyperDegrees,
  hyperIsConnected,
  hyperIsLinear,
  hyperIsRegular,
  hyperMatchingNumber,
  hyperMaxCodegree,
  hyperRank,
  hyperUniformity,
  hyperWeakIndependence,
} from '../lab/hypergraph'
import { incidentEdgeIndices, memberIndices, type HypergraphDoc } from './model'

export interface PropertyBResult {
  colorable: boolean
  /** 顶点着色 0/1；不可着色时为 null */
  coloring: number[] | null
}

export interface HypergraphAnalysis {
  n: number
  m: number
  rank: number
  uniform: number | null
  linear: boolean
  regular: boolean
  connected: boolean
  degrees: number[]
  minDegree: number
  maxDegree: number
  maxCodegree: number
  matching: { value: number; witness: number[] }
  transversal: { value: number; witness: number[] }
  independence: { value: number; witness: number[] }
  propertyB: PropertyBResult
  components: number[][]
  twoSectionPairs: Array<[number, number]>
  lineGraphEdges: Array<[number, number]>
  dual: { n: number; m: number }
}

export function propertyBColoring(n: number, edges: number[][]): PropertyBResult {
  if (edges.length === 0) return { colorable: true, coloring: new Array<number>(n).fill(0) }
  const incident: number[][] = Array.from({ length: n }, () => [])
  edges.forEach((edge, edgeIndex) => {
    for (const vertex of edge) incident[vertex]!.push(edgeIndex)
  })
  const order = Array.from({ length: n }, (_, index) => index).sort(
    (a, b) => incident[b]!.length - incident[a]!.length || a - b,
  )
  const color = new Array<number>(n).fill(-1)
  const edgeIsValid = (edgeIndex: number): boolean => {
    const edge = edges[edgeIndex]!
    let first = -1
    for (const vertex of edge) {
      const value = color[vertex]!
      if (value < 0) return true
      if (first < 0) first = value
      else if (value !== first) return true
    }
    return false
  }
  const search = (position: number): boolean => {
    if (position === order.length) return true
    const vertex = order[position]!
    // 颜色对称性：首个顶点固定为 0
    const choices = position === 0 ? [0] : [0, 1]
    for (const value of choices) {
      color[vertex] = value
      let ok = true
      for (const edgeIndex of incident[vertex]!) {
        if (!edgeIsValid(edgeIndex)) {
          ok = false
          break
        }
      }
      if (ok && search(position + 1)) return true
      color[vertex] = -1
    }
    return false
  }
  return search(0)
    ? { colorable: true, coloring: [...color] }
    : { colorable: false, coloring: null }
}

/** 连通分量：同一超边内的顶点相连；孤立点各自成一分量（与 lab 的连通性语义一致） */
export function hypergraphComponents(n: number, edges: number[][]): number[][] {
  const parent = Array.from({ length: n }, (_, index) => index)
  const find = (value: number): number => {
    let root = value
    while (parent[root] !== root) root = parent[root]!
    let current = value
    while (parent[current] !== current) {
      const next = parent[current]!
      parent[current] = root
      current = next
    }
    return root
  }
  const union = (a: number, b: number): void => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }
  for (const edge of edges) {
    const first = edge[0]
    if (first === undefined) continue
    for (const vertex of edge) union(first, vertex)
  }
  const groups = new Map<number, number[]>()
  for (let vertex = 0; vertex < n; vertex++) {
    const root = find(vertex)
    const list = groups.get(root)
    if (list) list.push(vertex)
    else groups.set(root, [vertex])
  }
  return [...groups.values()].map((group) => group.sort((a, b) => a - b))
}

/** 2-截面：出现在同一超边中的无序顶点对（去重） */
export function twoSectionPairs(edges: number[][]): Array<[number, number]> {
  const seen = new Set<string>()
  const result: Array<[number, number]> = []
  for (const edge of edges) {
    for (let i = 0; i < edge.length; i++) {
      for (let j = i + 1; j < edge.length; j++) {
        const a = edge[i]!
        const b = edge[j]!
        const key = a < b ? `${a},${b}` : `${b},${a}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push([Math.min(a, b), Math.max(a, b)])
      }
    }
  }
  return result
}

/** 线图：超边为节点，相交即连边（返回超边索引对） */
export function lineGraphEdges(edges: number[][]): Array<[number, number]> {
  const sets = edges.map((edge) => new Set(edge))
  const result: Array<[number, number]> = []
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      let intersect = false
      for (const value of sets[i]!) {
        if (sets[j]!.has(value)) {
          intersect = true
          break
        }
      }
      if (intersect) result.push([i, j])
    }
  }
  return result
}

export function analyzeHypergraphDoc(doc: HypergraphDoc): HypergraphAnalysis {
  const n = doc.vertices.length
  const edges = memberIndices(doc)
  const lab = { n, edges }
  const degrees = hyperDegrees(lab)
  const matching = hyperMatchingNumber(lab)
  const weak = hyperWeakIndependence(lab)
  const propertyB = propertyBColoring(n, edges)
  const pairs = twoSectionPairs(edges)
  const linePairs = lineGraphEdges(edges)
  return {
    n,
    m: edges.length,
    rank: hyperRank(lab),
    uniform: hyperUniformity(lab),
    linear: hyperIsLinear(lab),
    regular: hyperIsRegular(lab),
    connected: hyperIsConnected(lab),
    degrees,
    minDegree: degrees.length > 0 ? Math.min(...degrees) : 0,
    maxDegree: degrees.length > 0 ? Math.max(...degrees) : 0,
    maxCodegree: hyperMaxCodegree(lab),
    matching: { value: matching.value, witness: matching.witness },
    transversal: { value: weak.tau, witness: weak.tauWitness },
    independence: { value: weak.alpha, witness: weak.alphaWitness },
    propertyB,
    components: hypergraphComponents(n, edges),
    twoSectionPairs: pairs,
    lineGraphEdges: linePairs,
    dual: {
      n: doc.edges.length,
      m: doc.vertices.filter((_, index) => incidentEdgeIndices(doc, index).length > 0).length,
    },
  }
}

/** 顶点在超图中的度（供面板显示；与 analysis.degrees 对齐） */
export function degreeOf(doc: HypergraphDoc, vertexIndex: number): number {
  return incidentEdgeIndices(doc, vertexIndex).length
}
