/**
 * 欧拉路（v0.5 待办补全，Hierholzer 栈式构造）：
 * - 无向语义：忽略边方向（有向边按无向处理）、自环消耗 2 度、平行边分别计数；
 * - 判定：含边部分连通，且奇度顶点数 0（欧拉回路）或 2（欧拉通路）；否则报告原因；
 * - 构造：维护显式栈——只要栈顶还有可行边就沿边前进，否则回退拼接进路径尾部；
 *   逐步 yield 走边（`select` 供画布轨迹累积）与回退（`note`），最终给出顶点序列。
 */
import type { GraphObject } from '../model'
import type { AlgorithmStep } from './types'

export interface EulerResult {
  exists: boolean
  /** circuit = 欧拉回路；path = 欧拉通路；none = 不存在 */
  kind: 'circuit' | 'path' | 'none'
  /** 欧拉路顶点序列（id）；不存在为 null；无边图为空数组 */
  path: string[] | null
  /** 不存在时的原因（中文叙述） */
  reason: string | null
}

export function* eulerTrailSteps(graph: GraphObject): Generator<AlgorithmStep, EulerResult, void> {
  const labelById = new Map(graph.nodes.map((node) => [node.id, node.label]))
  const name = (id: string): string => labelById.get(id) ?? id

  // 无向多重邻接与度数（自环：邻接记一次、度数 +2）
  const adj = new Map<string, Map<string, number>>()
  const degree = new Map<string, number>()
  for (const node of graph.nodes) {
    adj.set(node.id, new Map())
    degree.set(node.id, 0)
  }
  let edgeCount = 0
  for (const edge of graph.edges) {
    const a = adj.get(edge.source)
    const b = adj.get(edge.target)
    if (!a || !b) continue
    edgeCount += 1
    a.set(edge.target, (a.get(edge.target) ?? 0) + 1)
    if (edge.source === edge.target) {
      degree.set(edge.source, degree.get(edge.source)! + 2)
    } else {
      b.set(edge.source, (b.get(edge.source) ?? 0) + 1)
      degree.set(edge.source, degree.get(edge.source)! + 1)
      degree.set(edge.target, degree.get(edge.target)! + 1)
    }
  }

  const oddVertices = graph.nodes
    .filter((node) => (degree.get(node.id) ?? 0) % 2 === 1)
    .map((node) => node.id)

  // 含边部分连通性检查（孤立点不参与）
  const active = graph.nodes.filter((node) => (degree.get(node.id) ?? 0) > 0).map((n) => n.id)
  let connectedComponents = 0
  if (active.length > 0) {
    const seen = new Set<string>()
    for (const start of active) {
      if (seen.has(start)) continue
      connectedComponents += 1
      const stack = [start]
      seen.add(start)
      while (stack.length > 0) {
        const u = stack.pop()!
        for (const [v, count] of adj.get(u) ?? []) {
          if (count > 0 && !seen.has(v)) {
            seen.add(v)
            stack.push(v)
          }
        }
      }
    }
  }

  // 判定
  if (edgeCount === 0) {
    yield { kind: 'note', note: '图中没有边：平凡的欧拉回路（空路径）' }
    return { exists: true, kind: 'circuit', path: [], reason: null }
  }
  if (connectedComponents > 1) {
    const reason = `含边的部分不连通（${connectedComponents} 个分量）：无法一次走完全部边`
    yield { kind: 'note', note: `不存在欧拉路——${reason}` }
    return { exists: false, kind: 'none', path: null, reason }
  }
  if (oddVertices.length !== 0 && oddVertices.length !== 2) {
    const listed = oddVertices.slice(0, 8).map(name).join('、')
    const reason = `有 ${oddVertices.length} 个奇度顶点（${listed}${oddVertices.length > 8 ? ' 等' : ''}）：欧拉路要求 0 或 2 个`
    yield { kind: 'note', note: `不存在欧拉路——${reason}` }
    return { exists: false, kind: 'none', path: null, reason }
  }

  const isCircuit = oddVertices.length === 0
  let start: string
  if (isCircuit) {
    start = active[0]!
  } else {
    start = oddVertices[0]!
  }
  yield {
    kind: 'note',
    note: isCircuit
      ? `所有顶点为偶度：存在欧拉回路，从 ${name(start)} 出发`
      : `恰有 2 个奇度顶点（${oddVertices.map(name).join('、')}）：存在欧拉通路，从 ${name(start)} 出发`,
  }

  /** 取一条可行边（对端 id 序取最小，保证确定性） */
  function pickNext(u: string): string | null {
    const neighbors = adj.get(u)
    if (!neighbors) return null
    let best: string | null = null
    for (const [v, count] of neighbors) {
      if (count > 0 && (best === null || v < best)) best = v
    }
    return best
  }

  function consume(u: string, v: string): void {
    const a = adj.get(u)!
    a.set(v, (a.get(v) ?? 0) - 1)
    if (u !== v) {
      const b = adj.get(v)!
      b.set(u, (b.get(u) ?? 0) - 1)
    }
  }

  const stack: string[] = [start]
  const reversedPath: string[] = []
  while (stack.length > 0) {
    const u = stack[stack.length - 1]!
    const next = pickNext(u)
    if (next !== null) {
      consume(u, next)
      yield {
        kind: 'select',
        edge: { source: u, target: next },
        note: `沿边 ${name(u)}—${name(next)} 前进`,
      }
      // 自环时也重复压栈（路径序列中以重复顶点表达；消耗计数保证不死循环）
      stack.push(next)
      if (next !== u) {
        yield { kind: 'push', node: next, note: `${name(next)} 入栈` }
      }
    } else {
      reversedPath.push(u)
      stack.pop()
      if (stack.length > 0) {
        yield { kind: 'note', note: `${name(u)} 无剩余边：回退并拼接进路径尾部` }
      }
    }
  }

  const path = reversedPath.reverse()
  yield {
    kind: 'note',
    note: `${isCircuit ? '欧拉回路' : '欧拉通路'}（${edgeCount} 条边）：${path.map(name).join(' → ')}`,
  }
  return { exists: true, kind: isCircuit ? 'circuit' : 'path', path, reason: null }
}
