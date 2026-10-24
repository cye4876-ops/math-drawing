import { describe, expect, it } from 'vitest'
import { createEdge, createNode, type GraphObject } from './model'
import {
  antiRamsey,
  buildColoredComplete,
  coloredGraphFromGraph,
  completeEdgePairs,
  completeGraphWithColoring,
  findRainbowCopies,
  gallaiProbe,
  rainbowPatternLabel,
} from './rainbow'

function makeColoredGraph(labels: string[], edges: Array<[string, string, string]>): GraphObject {
  const nodes = labels.map((label, index) => createNode(label, index, 0, '#2563eb'))
  const byLabel = new Map(nodes.map((node) => [node.label, node]))
  return {
    id: 'g',
    type: 'graph',
    name: 'g',
    visible: true,
    nodes,
    edges: edges.map(([a, b, color]) =>
      createEdge(byLabel.get(a)!.id, byLabel.get(b)!.id, { color }),
    ),
  }
}

describe('v3.5 彩虹子图搜索', () => {
  it('P₃：异色存在、同色不存在', () => {
    const rainbow = coloredGraphFromGraph(
      makeColoredGraph(
        ['0', '1', '2'],
        [
          ['0', '1', '#ef4444'],
          ['1', '2', '#3b82f6'],
        ],
      ),
    )
    expect(findRainbowCopies(rainbow, { kind: 'path', size: 3 }).copies).toHaveLength(1)
    const mono = coloredGraphFromGraph(
      makeColoredGraph(
        ['0', '1', '2'],
        [
          ['0', '1', '#ef4444'],
          ['1', '2', '#ef4444'],
        ],
      ),
    )
    expect(findRainbowCopies(mono, { kind: 'path', size: 3 }).copies).toHaveLength(0)
  })

  it('K₄ 全不同色：P₄ 12 条、C₄ 3 个、2K₂ 3 个、K₃ 4 个', () => {
    const graph = buildColoredComplete(4, 'rainbow')
    expect(findRainbowCopies(graph, { kind: 'path', size: 4 }).copies).toHaveLength(12)
    expect(findRainbowCopies(graph, { kind: 'cycle', size: 4 }).copies).toHaveLength(3)
    expect(findRainbowCopies(graph, { kind: 'matching', size: 2 }).copies).toHaveLength(3)
    expect(findRainbowCopies(graph, { kind: 'clique', size: 3 }).copies).toHaveLength(4)
  })

  it('Gallai 着色无彩虹三角形；全不同色 K₅ 有 10 个彩虹三角形', () => {
    const gallai = buildColoredComplete(5, 'gallai')
    const probe = gallaiProbe(gallai)
    expect(probe.gallai).toBe(true)
    expect(probe.triangles).toHaveLength(0)

    const rainbow = buildColoredComplete(5, 'rainbow')
    const triangles = findRainbowCopies(rainbow, { kind: 'clique', size: 3 })
    expect(triangles.copies).toHaveLength(10)
    expect(gallaiProbe(rainbow).gallai).toBe(false)
  })

  it('着色构造与边下标顺序一致；模式标签可读', () => {
    const pairs = completeEdgePairs(4)
    const graph = completeGraphWithColoring(
      4,
      pairs.map((_, index) => index),
    )
    expect(graph.edges).toHaveLength(6)
    graph.edges.forEach((edge, index) => {
      expect([edge.u, edge.v]).toEqual(pairs[index])
    })
    expect(rainbowPatternLabel({ kind: 'cycle', size: 3 })).toBe('C₃')
    expect(rainbowPatternLabel({ kind: 'matching', size: 2 })).toBe('2K₂')
  })
})

/** 独立参考：K₄ 的 P₄ 彩虹检测（排列 + 受限增长串穷举） */
function bruteForceAntiRamseyPath4(): { value: number; partitions: number } {
  const pairs = completeEdgePairs(4)
  const pairIndex = new Map<string, number>()
  pairs.forEach(([u, v], index) => pairIndex.set(`${u},${v}`, index))
  const colors = new Array<number>(pairs.length).fill(0)
  let best = 0
  let count = 0
  const hasRainbowPath = (): boolean => {
    const permutations = (list: number[]): number[][] => {
      if (list.length === 0) return [[]]
      const result: number[][] = []
      list.forEach((value, index) => {
        const rest = [...list.slice(0, index), ...list.slice(index + 1)]
        for (const tail of permutations(rest)) result.push([value, ...tail])
      })
      return result
    }
    for (const order of permutations([0, 1, 2, 3])) {
      if (order[0]! >= order[3]!) continue
      const used = new Set<number>()
      let rainbow = true
      for (let i = 0; i + 1 < order.length; i++) {
        const a = order[i]!
        const b = order[i + 1]!
        const index = pairIndex.get(a < b ? `${a},${b}` : `${b},${a}`)!
        const color = colors[index]!
        if (used.has(color)) {
          rainbow = false
          break
        }
        used.add(color)
      }
      if (rainbow) return true
    }
    return false
  }
  const walk = (index: number, used: number): void => {
    if (index === colors.length) {
      count++
      if (!hasRainbowPath()) best = Math.max(best, used)
      return
    }
    for (let color = 0; color <= used; color++) {
      colors[index] = color
      walk(index + 1, color === used ? used + 1 : used)
    }
  }
  walk(1, 1)
  return { value: best, partitions: count }
}

describe('v3.5 反拉姆齐小 n', () => {
  it('ar(4, C₃) = 3（Gallai 定理）且见证着色无彩虹三角形', () => {
    const result = antiRamsey(4, { kind: 'clique', size: 3 })
    expect(result.value).toBe(3)
    expect(result.complete).toBe(true)
    const graph = completeGraphWithColoring(4, result.colors)
    expect(gallaiProbe(graph).gallai).toBe(true)
    expect(new Set(result.colors).size).toBe(3)
  })

  it('ar(5, C₃) = 4；与 Gallai 着色一致', () => {
    const result = antiRamsey(5, { kind: 'clique', size: 3 })
    expect(result.value).toBe(4)
    expect(result.complete).toBe(true)
    expect(gallaiProbe(completeGraphWithColoring(5, result.colors)).gallai).toBe(true)
  })

  it('n=6 上限：ar(6, C₃) = 5（Gallai 定理）', () => {
    const result = antiRamsey(6, { kind: 'clique', size: 3 })
    expect(result.value).toBe(5)
    expect(result.complete).toBe(true)
    expect(result.colors).toHaveLength(15)
    expect(gallaiProbe(completeGraphWithColoring(6, result.colors)).gallai).toBe(true)
  })

  it('P₄ 的 n=4 结果与独立暴力枚举一致', () => {
    const brute = bruteForceAntiRamseyPath4()
    const result = antiRamsey(4, { kind: 'path', size: 4 }, { maxNodes: 2_000_000, maxMs: 10_000 })
    expect(result.complete).toBe(true)
    expect(result.value).toBe(brute.value)
    expect(new Set(result.colors).size).toBe(result.value)
    expect(
      findRainbowCopies(completeGraphWithColoring(4, result.colors), { kind: 'path', size: 4 })
        .copies,
    ).toHaveLength(0)
    expect(brute.partitions).toBe(203)
  })

  it('与独立 Python 穷举一致（v34-oracles.json）：n=4/5 的 P₃/P₄/C₄/2K₂', () => {
    const cases: Array<{
      n: number
      pattern: { kind: 'path' | 'cycle' | 'matching' | 'clique'; size: number }
      expected: number
    }> = [
      { n: 4, pattern: { kind: 'path', size: 3 }, expected: 1 },
      { n: 4, pattern: { kind: 'path', size: 4 }, expected: 3 },
      { n: 4, pattern: { kind: 'cycle', size: 4 }, expected: 4 },
      { n: 4, pattern: { kind: 'matching', size: 2 }, expected: 3 },
      { n: 4, pattern: { kind: 'clique', size: 4 }, expected: 5 },
      { n: 5, pattern: { kind: 'path', size: 3 }, expected: 1 },
      { n: 5, pattern: { kind: 'path', size: 4 }, expected: 2 },
      { n: 5, pattern: { kind: 'cycle', size: 4 }, expected: 5 },
      { n: 5, pattern: { kind: 'matching', size: 2 }, expected: 1 },
      { n: 5, pattern: { kind: 'clique', size: 4 }, expected: 7 },
    ]
    for (const item of cases) {
      const result = antiRamsey(item.n, item.pattern, { maxNodes: 3_000_000, maxMs: 20_000 })
      expect(result.complete, `${item.n}/${item.pattern.kind}${item.pattern.size}`).toBe(true)
      expect(result.value, `${item.n}/${item.pattern.kind}${item.pattern.size}`).toBe(item.expected)
      expect(new Set(result.colors).size).toBe(item.expected)
      expect(
        findRainbowCopies(completeGraphWithColoring(item.n, result.colors), item.pattern).copies,
      ).toHaveLength(0)
    }
  })

  it('预算不足时返回下界并标记未完成', () => {
    const result = antiRamsey(6, { kind: 'cycle', size: 4 }, { maxNodes: 2, maxMs: 1000 })
    expect(result.complete).toBe(false)
    expect(result.note).toContain('下界')
    expect(result.colors).toHaveLength(15)
  })
})
