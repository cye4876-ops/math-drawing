import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARAMS,
  FAMILIES,
  createFamily,
  specToDoc,
  validateFamilyParams,
  type FamilySpec,
} from './families'
import { toGraphology } from './model'

describe('graph/families: 结构与规模', () => {
  it('完全图 K5：5 点 10 边', () => {
    const spec = createFamily('complete', { n: 5 })
    expect(spec.labels).toHaveLength(5)
    expect(spec.edges).toHaveLength(10)
  })

  it('二分图 K3,3：6 点 9 边（无同侧边）', () => {
    const spec = createFamily('complete-bipartite', { m: 3, n: 3 })
    expect(spec.labels).toHaveLength(6)
    expect(spec.edges).toHaveLength(9)
    for (const edge of spec.edges) {
      expect(edge.source.startsWith('a')).toBe(true)
      expect(edge.target.startsWith('b')).toBe(true)
    }
  })

  it('环 C6：6 点 6 边', () => {
    const spec = createFamily('cycle', { n: 6 })
    expect(spec.labels).toHaveLength(6)
    expect(spec.edges).toHaveLength(6)
  })

  it('路 P5：5 点 4 边', () => {
    const spec = createFamily('path', { n: 5 })
    expect(spec.labels).toHaveLength(5)
    expect(spec.edges).toHaveLength(4)
  })

  it('完全二叉树 n=7：7 点 6 边', () => {
    const spec = createFamily('tree', { n: 7 })
    expect(spec.labels).toHaveLength(7)
    expect(spec.edges).toHaveLength(6)
    // 1 为根：2、3 与 1 相连
    expect(spec.edges[0]).toEqual({ source: '1', target: '2' })
    expect(spec.edges[1]).toEqual({ source: '1', target: '3' })
  })

  it('Petersen 图：10 点 15 边', () => {
    const spec = createFamily('petersen')
    expect(spec.labels).toHaveLength(10)
    expect(spec.edges).toHaveLength(15)
  })

  it('超立方体 Q3：8 点 12 边', () => {
    const spec = createFamily('hypercube', { n: 3 })
    expect(spec.labels).toHaveLength(8)
    expect(spec.edges).toHaveLength(12)
    expect(spec.labels).toContain('000')
    expect(spec.labels).toContain('111')
  })

  it('网格 3×4：12 点 17 边', () => {
    const spec = createFamily('grid', { rows: 3, cols: 4 })
    expect(spec.labels).toHaveLength(12)
    expect(spec.edges).toHaveLength(17)
  })

  it('参数钳制：hypercube n=10 → Q6（64 点）；K n=1 → K2', () => {
    expect(createFamily('hypercube', { n: 10 }).labels).toHaveLength(64)
    expect(createFamily('complete', { n: 1 }).edges).toHaveLength(1)
  })
})

describe('graph/families: specToDoc 与派生图', () => {
  it('specToDoc 生成环形初始坐标与正确连接', () => {
    const doc = specToDoc(createFamily('cycle', { n: 4 }))
    expect(doc.nodes).toHaveLength(4)
    expect(doc.edges).toHaveLength(4)
    // 第一个顶点位于 (radius, 0)
    expect(doc.nodes[0]!.x).toBeCloseTo(3, 9)
    expect(doc.nodes[0]!.y).toBeCloseTo(0, 9)
    // 每个顶点都有颜色
    for (const node of doc.nodes) expect(node.color).toMatch(/^#/)
  })

  it('Petersen 为 3-正则图（每点度 3）', () => {
    const doc = specToDoc(createFamily('petersen'))
    const graph = toGraphology(doc)
    expect(graph.order).toBe(10)
    graph.forEachNode((key) => expect(graph.degree(key)).toBe(3))
  })

  it('Q3 为 3-正则、K5 为 4-正则', () => {
    const cube = toGraphology(specToDoc(createFamily('hypercube', { n: 3 })))
    cube.forEachNode((key) => expect(cube.degree(key)).toBe(3))
    const complete = toGraphology(specToDoc(createFamily('complete', { n: 5 })))
    complete.forEachNode((key) => expect(complete.degree(key)).toBe(4))
  })
})

describe('graph/families: 新增图族（星/轮/梯/棱柱/风车/八面体）', () => {
  const degreeOf = (spec: FamilySpec, label: string): number =>
    spec.edges.filter((edge) => edge.source === label || edge.target === label).length

  it('星图 K_1,n：n+1 点、n 边、中心度 n', () => {
    const spec = createFamily('star', { n: 4 })
    expect(spec.labels).toHaveLength(5)
    expect(spec.edges).toHaveLength(4)
    expect(degreeOf(spec, '1')).toBe(4)
    expect(degreeOf(spec, '3')).toBe(1)
  })

  it('轮图 W_n：n+1 点、2n 边；中心度 n', () => {
    const spec = createFamily('wheel', { n: 5 })
    expect(spec.labels).toHaveLength(6)
    expect(spec.edges).toHaveLength(10)
    expect(degreeOf(spec, '6')).toBe(5)
  })

  it('梯子图 2×n：2n 点、3n−2 边', () => {
    const spec = createFamily('ladder', { n: 4 })
    expect(spec.labels).toHaveLength(8)
    expect(spec.edges).toHaveLength(10)
  })

  it('棱柱图：2n 点、3n 边、每点度 3', () => {
    const spec = createFamily('prism', { n: 5 })
    expect(spec.labels).toHaveLength(10)
    expect(spec.edges).toHaveLength(15)
    for (const label of spec.labels) expect(degreeOf(spec, label)).toBe(3)
  })

  it('风车图：2n+1 点、3n 边、中心度 2n', () => {
    const spec = createFamily('windmill', { n: 3 })
    expect(spec.labels).toHaveLength(7)
    expect(spec.edges).toHaveLength(9)
    expect(degreeOf(spec, '1')).toBe(6)
  })

  it('八面体图：6 点 12 边、每点度 4', () => {
    const spec = createFamily('octahedron', {})
    expect(spec.labels).toHaveLength(6)
    expect(spec.edges).toHaveLength(12)
    for (const label of spec.labels) expect(degreeOf(spec, label)).toBe(4)
  })
})

describe('graph/families: 禁用条件校验（validateFamilyParams）', () => {
  it('越界参数返回提示，合法参数通过', () => {
    expect(validateFamilyParams('complete', { n: 100 })).toContain('64')
    expect(validateFamilyParams('complete', { n: 5 })).toBeNull()
    expect(validateFamilyParams('wheel', { n: 2 })).toContain('3 ~ 64')
    expect(validateFamilyParams('hypercube', { n: 8 })).toContain('1 ~ 6')
    expect(validateFamilyParams('star', { n: 0 })).not.toBeNull()
    expect(validateFamilyParams('petersen', {})).toBeNull()
  })

  it('组合限制：网格顶点上限 200、二分图边数 m×n ≤ 400', () => {
    expect(validateFamilyParams('grid', { rows: 20, cols: 11 })).toContain('200')
    expect(validateFamilyParams('grid', { rows: 20, cols: 10 })).toBeNull()
    expect(validateFamilyParams('complete-bipartite', { m: 25, n: 20 })).toContain('400')
    expect(validateFamilyParams('complete-bipartite', { m: 20, n: 20 })).toBeNull()
    expect(validateFamilyParams('complete-bipartite', { m: 3, n: 3 })).toBeNull()
  })

  it('FAMILIES 清单 14 项：均可生成且默认参数合法', () => {
    expect(FAMILIES).toHaveLength(14)
    for (const info of FAMILIES) {
      const spec = createFamily(info.kind, {})
      expect(spec.labels.length).toBeGreaterThan(0)
      expect(validateFamilyParams(info.kind, { ...DEFAULT_PARAMS })).toBeNull()
    }
  })
})
