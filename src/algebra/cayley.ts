/**
 * Cayley 图（v3.3）：以群元素为顶点、右乘生成元为着色边的生成图。
 * - 边 x → x·g（g 取自 minimalGenerators），使用穷举表 mult 计算，忠实反映乘法表；
 * - 顶点布局：单生成元（循环群）用圆环；多生成元用 BFS 层次行；
 * - 坐标归一化到 [-1, 1]²，供 UI 做画布缩放；纯函数、确定性。
 */
import { labelOf, mult, type FiniteGroup } from './groups'
import { minimalGenerators } from './subgroups'

export interface CayleyNode {
  /** 群元素索引 */
  element: number
  label: string
  /** 归一化坐标 [-1, 1] */
  x: number
  y: number
  level: number
}

export interface CayleyEdge {
  from: number
  to: number
  /** 生成元在 generators 中的下标（决定颜色） */
  generator: number
  generatorLabel: string
}

export interface CayleyGraph {
  nodes: CayleyNode[]
  edges: CayleyEdge[]
  generators: number[]
  generatorLabels: string[]
}

/** 生成元配色环（与社区配色区分，暖色系更醒目） */
export const CAYLEY_COLORS = ['#e11d48', '#0ea5e9', '#f59e0b', '#8b5cf6', '#10b981', '#64748b']

export function buildCayleyGraph(group: FiniteGroup): CayleyGraph {
  const n = group.order
  const identity = group.identity
  const generators = minimalGenerators(group).filter((g) => g !== identity)
  const generatorLabels = generators.map((g) => labelOf(group, g))

  // 边（右乘）：x·g；同一条有向边可能被不同生成元重复覆盖时保留首个（颜色稳定）
  const seenEdge = new Set<string>()
  const edges: CayleyEdge[] = []
  for (let g = 0; g < generators.length; g++) {
    const generator = generators[g]!
    for (let x = 0; x < n; x++) {
      const y = mult(group, x, generator)
      if (y === x) continue
      const key = `${x}:${y}`
      if (seenEdge.has(key)) continue
      seenEdge.add(key)
      edges.push({ from: x, to: y, generator: g, generatorLabel: generatorLabels[g]! })
    }
  }

  // BFS 层次（无向视角，保证连通分量都能取到）
  const neighbors = Array.from({ length: n }, () => new Set<number>())
  for (const edge of edges) {
    neighbors[edge.from]!.add(edge.to)
    neighbors[edge.to]!.add(edge.from)
  }
  const level = new Array<number>(n).fill(-1)
  const order: number[] = []
  const queue: number[] = [identity]
  level[identity] = 0
  while (queue.length > 0) {
    const u = queue.shift()!
    order.push(u)
    for (const v of neighbors[u]!) {
      if (level[v] === -1) {
        level[v] = level[u]! + 1
        queue.push(v)
      }
    }
  }
  // 理论上生成元生成整个群；兜底处理不可达元素（防御）
  for (let i = 0; i < n; i++) {
    if (level[i] === -1) {
      level[i] = 0
      order.push(i)
    }
  }

  const positions = new Map<number, { x: number; y: number }>()
  if (generators.length === 1) {
    // 循环群：按生成元幂次排圆环（从 identity 出发沿生成方向）
    const radius = 1
    const byPower: number[] = []
    let current = identity
    for (let k = 0; k < n; k++) {
      byPower.push(current)
      current = mult(group, current, generators[0]!)
    }
    byPower.forEach((element, k) => {
      const angle = -Math.PI / 2 + (k / n) * Math.PI * 2
      positions.set(element, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
    })
  } else {
    // 多生成元：按 BFS 层分行，层内均布后再按层号整体居中
    const maxLevel = Math.max(...level)
    const rows = new Map<number, number[]>()
    for (const element of order) {
      const list = rows.get(level[element]!)
      if (list) list.push(element)
      else rows.set(level[element]!, [element])
    }
    for (const [depth, members] of rows) {
      const width = members.length > 1 ? 1.8 : 0
      members.forEach((element, k) => {
        const x = members.length > 1 ? (k / (members.length - 1)) * width - width / 2 : 0
        const y = maxLevel > 0 ? 0.9 - (depth / maxLevel) * 1.8 : 0
        positions.set(element, { x, y })
      })
    }
  }

  const nodes: CayleyNode[] = Array.from({ length: n }, (_, element) => {
    const position = positions.get(element) ?? { x: 0, y: 0 }
    return {
      element,
      label: labelOf(group, element),
      x: position.x,
      y: position.y,
      level: level[element]!,
    }
  })

  return { nodes, edges, generators, generatorLabels }
}
