/**
 * Ramsey 小证书（v3.6）：Kₙ 的 2-边着色，禁止单色三角形。
 * 固定第一条边颜色为 0（颜色互换对称），穷举其余边；n ≤ 6。
 */
import { completeEdgePairs } from '../graph/rainbow'
import { containsPattern, simpleGraphFromEdges, type SimpleGraph } from './containment'

export interface RamseyResult {
  n: number
  patternLabel: string
  exists: boolean
  /** 每条 Kₙ 边（i<j 顺序）的颜色 0/1；不存在时为 null */
  colors: number[] | null
  /** 固定首边为 0 的等价类数量 */
  canonicalCount: number
  /** 颜色互换成对后的总数（n ≥ 3） */
  totalCount: number
  triangles: number
  complete: boolean
  note: string
}

function triangleIndices(n: number, pairIndex: Map<string, number>): number[][] {
  const triangles: number[][] = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        triangles.push([
          pairIndex.get(`${a},${b}`)!,
          pairIndex.get(`${a},${c}`)!,
          pairIndex.get(`${b},${c}`)!,
        ])
      }
    }
  }
  return triangles
}

/** 任意小禁图 H 的 2-色 Ramsey 证书：Kₙ 是否可 2-着色且无单色 H */
export function ramseyCertificate(
  n: number,
  pattern: SimpleGraph,
  patternLabel: string,
): RamseyResult {
  const size = Math.max(3, Math.min(6, Math.round(n)))
  const pairs = completeEdgePairs(size)
  const pairIndex = new Map(pairs.map(([u, v], index) => [`${u},${v}`, index]))
  const triangles = triangleIndices(size, pairIndex)
  const m = pairs.length
  let canonicalCount = 0
  let first: number[] | null = null
  const colors = new Array<number>(m).fill(0)
  const colorGraphs: SimpleGraph[] = [
    simpleGraphFromEdges(size, []),
    simpleGraphFromEdges(size, []),
  ]
  // 首边固定 0，其余 m−1 条任意
  for (let mask = 0; mask < 1 << (m - 1); mask++) {
    for (let edge = 1; edge < m; edge++) colors[edge] = (mask >> (edge - 1)) & 1
    const colorEdges: Array<Array<[number, number]>> = [[], []]
    pairs.forEach((pair, index) => {
      colorEdges[colors[index] ?? 0]!.push(pair)
    })
    colorGraphs[0] = simpleGraphFromEdges(size, colorEdges[0]!)
    colorGraphs[1] = simpleGraphFromEdges(size, colorEdges[1]!)
    const valid =
      !containsPattern(colorGraphs[0]!, pattern) && !containsPattern(colorGraphs[1]!, pattern)
    if (valid) {
      canonicalCount++
      if (!first) first = [...colors]
    }
  }
  return {
    n: size,
    patternLabel,
    exists: canonicalCount > 0,
    colors: first,
    canonicalCount,
    totalCount: canonicalCount * 2,
    triangles: triangles.length,
    complete: true,
    note:
      canonicalCount > 0
        ? `存在 ${canonicalCount} 个（颜色互换后共 ${canonicalCount * 2} 个）无单色 ${patternLabel} 的 2-着色；见证已选出。`
        : `穷举 2^${m - 1} = ${1 << (m - 1)} 个首边固定的着色，均含单色 ${patternLabel}。`,
  }
}

/** 兼容 v3.6：R(3,3) 三角形证书 */
export function triangleRamsey(n: number): RamseyResult {
  const k3 = simpleGraphFromEdges(3, [
    [0, 1],
    [1, 2],
    [0, 2],
  ])
  const result = ramseyCertificate(n, k3, 'K₃')
  return {
    ...result,
    note:
      result.canonicalCount > 0
        ? `存在 ${result.canonicalCount} 个（颜色互换后共 ${result.canonicalCount * 2} 个）无单色三角形的 2-着色；见证已选出。`
        : `穷举 2^${completeEdgePairs(result.n).length - 1} = ${1 << (completeEdgePairs(result.n).length - 1)} 个首边固定的着色，均含单色三角形；因此 R(3,3) ≤ ${result.n}。`,
  }
}
