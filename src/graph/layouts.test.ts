import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import { layoutCircular, layoutForceAtlas, layoutGrid } from './layouts'
import type { GraphObject } from './model'

function makeGraph(dsl: string): GraphObject {
  const { graph } = graphObjectFromDsl(dsl)
  return graph!
}

const K5_DSL = 'A-B, A-C, A-D, A-E, B-C, B-D, B-E, C-D, C-E, D-E'

const emptyGraph: GraphObject = {
  id: 'empty',
  type: 'graph',
  name: '空图',
  nodes: [],
  edges: [],
  visible: true,
}

describe('graph/layouts: 环形布局', () => {
  it('n=4 均布于半径 3 的圆（首个在 +x 轴）', () => {
    const nodes = layoutCircular(makeGraph('A, B, C, D'))
    const expected: [number, number][] = [
      [3, 0],
      [0, 3],
      [-3, 0],
      [0, -3],
    ]
    expect(nodes).toHaveLength(4)
    nodes.forEach((node, index) => {
      expect(node.x).toBeCloseTo(expected[index]![0], 9)
      expect(node.y).toBeCloseTo(expected[index]![1], 9)
    })
  })

  it('不修改输入；空图返回空数组', () => {
    const graph = makeGraph('A, B')
    const before = graph.nodes.map((n) => [n.x, n.y])
    layoutCircular(graph)
    expect(graph.nodes.map((n) => [n.x, n.y])).toEqual(before)
    expect(layoutCircular(emptyGraph)).toEqual([])
  })
})

describe('graph/layouts: 网格布局', () => {
  it('n=9 为 3×3 居中网格（间距 1.6）', () => {
    const nodes = layoutGrid(makeGraph('A, B, C, D, E, F, G, H, I'))
    expect(nodes[4]).toMatchObject({ x: 0, y: 0 })
    expect(nodes[0]).toMatchObject({ x: -1.6, y: 1.6 })
    expect(nodes[2]).toMatchObject({ x: 1.6, y: 1.6 })
    expect(nodes[8]).toMatchObject({ x: 1.6, y: -1.6 })
  })

  it('n=2 为单行 2 列；n=5 为 3×2（第二行居中留空）', () => {
    const two = layoutGrid(makeGraph('A, B'))
    expect(two).toHaveLength(2)
    expect(two[0]).toMatchObject({ x: -0.8, y: 0 })
    expect(two[1]).toMatchObject({ x: 0.8, y: 0 })
    const five = layoutGrid(makeGraph('A, B, C, D, E'))
    expect(five[2]).toMatchObject({ x: 1.6, y: 0.8 })
    expect(five[4]).toMatchObject({ x: 0, y: -0.8 })
  })
})

describe('graph/layouts: 力导向（FA2）', () => {
  it('K5：坐标有限、顶点集合保持、结果确定（重复运行一致）', () => {
    const graph = makeGraph(K5_DSL)
    expect(graph.nodes).toHaveLength(5)
    expect(graph.edges).toHaveLength(10)
    const a = layoutForceAtlas(graph, 200)
    const b = layoutForceAtlas(graph, 200)
    expect(a).toHaveLength(5)
    for (const node of a) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
    expect(a).toEqual(b)
    // 图对象本身不被修改
    expect(graph.nodes[0]!.x).toBeCloseTo(3, 9)
  })

  it('含自环/多重边/有向边/孤立点的混合图：不抛异常、坐标有限', () => {
    const graph = makeGraph('A-A, A-B, A-B, B->C, C->A, 孤点')
    const nodes = layoutForceAtlas(graph, 100)
    expect(nodes).toHaveLength(4)
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
  })

  it('空图与单顶点安全', () => {
    expect(layoutForceAtlas(emptyGraph, 50)).toEqual([])
    const single = layoutForceAtlas(makeGraph('A'), 50)
    expect(single).toHaveLength(1)
    expect(Number.isFinite(single[0]!.x)).toBe(true)
  })

  it('大图冒烟：200 顶点 / 500 边 坐标有限（短迭代）', () => {
    // 网格 200 点 + 蛇形链 500 边（确定性构造）
    const rows = 10
    const cols = 20
    const labels: string[] = []
    const edges: string[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) labels.push(`n${r}_${c}`)
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) edges.push(`n${r}_${c}-n${r}_${c + 1}`)
      if (r < rows - 1) edges.push(`n${r}_${cols - 1}-n${r + 1}_${cols - 1}`)
    }
    // 再补足到 500 条（对角链）
    for (let i = 0; edges.length < 500; i++) {
      const r = i % (rows - 1)
      const c = i % (cols - 1)
      edges.push(`n${r}_${c}-n${r + 1}_${c + 1}`)
    }
    const graph = makeGraph([...labels, ...edges].join(', '))
    expect(graph.nodes).toHaveLength(200)
    expect(graph.edges).toHaveLength(500)
    const nodes = layoutForceAtlas(graph, 30)
    for (const node of nodes) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
  }, 15000)
})
