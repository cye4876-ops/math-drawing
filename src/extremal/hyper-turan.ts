/**
 * 3-一致超图 Turán 小 n 精确极值（v3.6）：
 * - 禁 K₄³：每个 4-子集上的 4 条三元边全选中即禁止；
 * - 禁松三角形：三元松三角形（012, 234, 450）的任意顶点嵌入。
 * 分支定界 + 已选中实例计数；n=5/6 精确（与 2^C(n,3) 穷举独立核验）。
 */

export const HYPER_TURAN_PATTERNS = ['K4_3', 'loose_triangle'] as const
export type HyperTuranPattern = (typeof HYPER_TURAN_PATTERNS)[number]

export const HYPER_TURAN_LABELS: Record<HyperTuranPattern, string> = {
  K4_3: 'K₄³（4 点完全 3-一致）',
  loose_triangle: '3-一致松三角形（012, 234, 450）',
}

export interface HyperTuranResult {
  n: number
  pattern: HyperTuranPattern
  maxEdges: number
  /** 极值超边（顶点三元组，升序） */
  witness: number[][]
  instances: number
  nodes: number
  complete: boolean
  note: string
}

function triplesOf(n: number): number[][] {
  const triples: number[][] = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) triples.push([a, b, c])
    }
  }
  return triples
}

function forbiddenInstances(n: number, pattern: HyperTuranPattern): number[][] {
  const triples = triplesOf(n)
  const index = new Map<string, number>()
  triples.forEach((edge, position) => index.set(edge.join(','), position))
  const seen = new Set<string>()
  const instances: number[][] = []
  const push = (edges: number[][]): void => {
    const indices = edges.map((edge) => index.get([...edge].sort((a, b) => a - b).join(',')))
    if (indices.some((value) => value === undefined)) return
    const key = indices
      .map((value) => value!)
      .sort((a, b) => a - b)
      .join(',')
    if (seen.has(key)) return
    seen.add(key)
    instances.push(indices as number[])
  }
  if (pattern === 'K4_3') {
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        for (let c = b + 1; c < n; c++) {
          for (let d = c + 1; d < n; d++) {
            const set = [a, b, c, d]
            const edges: number[][] = []
            for (let i = 0; i < 4; i++) {
              for (let j = i + 1; j < 4; j++) {
                for (let k = j + 1; k < 4; k++) {
                  edges.push([set[i]!, set[j]!, set[k]!])
                }
              }
            }
            push(edges)
          }
        }
      }
    }
    return instances
  }
  if (n < 6) return []
  const patternEdges: Array<[number, number, number]> = [
    [0, 1, 2],
    [2, 3, 4],
    [4, 5, 0],
  ]
  const vertices = [0, 1, 2, 3, 4, 5]
  const permute = (current: number[], remaining: number[]): void => {
    if (remaining.length === 0) {
      push(patternEdges.map((edge) => edge.map((vertex) => current[vertex]!)))
      return
    }
    for (let index = 0; index < remaining.length; index++) {
      permute(
        [...current, remaining[index]!],
        [...remaining.slice(0, index), ...remaining.slice(index + 1)],
      )
    }
  }
  permute([], vertices)
  return instances
}

export function ex3Uniform(n: number, pattern: HyperTuranPattern): HyperTuranResult {
  const size = Math.max(1, Math.min(6, Math.round(n)))
  const triples = triplesOf(size)
  const m = triples.length
  const instances = forbiddenInstances(size, pattern)
  const byEdge: number[][] = Array.from({ length: m }, () => [])
  instances.forEach((instance, instanceIndex) => {
    for (const edge of instance) byEdge[edge]!.push(instanceIndex)
  })
  const counts = new Array<number>(instances.length).fill(0)
  const selected: number[] = []
  let best = 0
  let bestSelected: number[] = []
  let nodes = 0
  let complete = true
  const maxNodes = 5_000_000
  const search = (edge: number): void => {
    if (!complete) return
    nodes++
    if (nodes > maxNodes) {
      complete = false
      return
    }
    if (selected.length > best) {
      best = selected.length
      bestSelected = [...selected]
    }
    if (selected.length + (m - edge) <= best) return
    if (edge === m) return
    // 尝试选中 edge（若不会凑满任何禁实例）
    let canInclude = true
    for (const instanceIndex of byEdge[edge]!) {
      if (counts[instanceIndex]! === instances[instanceIndex]!.length - 1) {
        canInclude = false
        break
      }
    }
    if (canInclude) {
      for (const instanceIndex of byEdge[edge]!) counts[instanceIndex]!++
      selected.push(edge)
      search(edge + 1)
      selected.pop()
      for (const instanceIndex of byEdge[edge]!) counts[instanceIndex]!--
    }
    search(edge + 1)
  }
  search(0)
  const witness = bestSelected.map((index) => triples[index]!)
  return {
    n: size,
    pattern,
    maxEdges: best,
    witness,
    instances: instances.length,
    nodes,
    complete,
    note: complete
      ? `穷举分支定界（${nodes} 节点）：ex₃(${size}, ${HYPER_TURAN_LABELS[pattern].split('（')[0]}) = ${best}。`
      : `预算耗尽（${nodes} 节点）：${best} 为已找到下界。`,
  }
}

export function formatHyperWitness(witness: number[][]): string {
  return witness.map((edge) => `{${edge.join(',')}}`).join('、')
}
