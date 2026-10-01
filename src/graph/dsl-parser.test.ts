import { describe, expect, it } from 'vitest'
import { parseGraphDsl } from './dsl-parser'

describe('graph/dsl-parser: 基本语法', () => {
  it('规格示例：A-B:3, B-C:2, C->A 解析为 3 顶点 3 边（含一条有向边）', () => {
    const result = parseGraphDsl('A-B:3, B-C:2, C->A')
    expect(result.errors).toEqual([])
    expect(result.nodes).toEqual(['A', 'B', 'C'])
    expect(result.edges).toEqual([
      { source: 'A', target: 'B', directed: false, weight: 3 },
      { source: 'B', target: 'C', directed: false, weight: 2 },
      { source: 'C', target: 'A', directed: true, weight: null },
    ])
  })

  it('换行与分号分隔、-- 无向边、空格容错', () => {
    const result = parseGraphDsl('A\nB; C--A\n\nD -> B')
    expect(result.errors).toEqual([])
    expect(result.nodes).toEqual(['A', 'B', 'C', 'D'])
    expect(result.edges).toEqual([
      { source: 'C', target: 'A', directed: false, weight: null },
      { source: 'D', target: 'B', directed: true, weight: null },
    ])
  })

  it('顶点声明与 # 注释', () => {
    const result = parseGraphDsl('# 顶点表\nA, B  # 两个孤立点\nC-D # 一条边')
    expect(result.errors).toEqual([])
    expect(result.nodes).toEqual(['A', 'B', 'C', 'D'])
    expect(result.edges).toHaveLength(1)
  })

  it('自环与重边', () => {
    const result = parseGraphDsl('A-A, A-B, A-B, B->B')
    expect(result.errors).toEqual([])
    expect(result.edges).toHaveLength(4)
    expect(result.edges[0]).toMatchObject({ source: 'A', target: 'A', directed: false })
    expect(result.edges[3]).toMatchObject({ source: 'B', target: 'B', directed: true })
  })

  it('权重支持小数、负数与科学计数', () => {
    const result = parseGraphDsl('A-B:2.5, B-C:-1, C-D:1e3')
    expect(result.errors).toEqual([])
    expect(result.edges.map((e) => e.weight)).toEqual([2.5, -1, 1000])
  })

  it('汉字与数字标签', () => {
    const result = parseGraphDsl('甲-乙:1, 2->3')
    expect(result.errors).toEqual([])
    expect(result.nodes).toEqual(['甲', '乙', '2', '3'])
  })
})

describe('graph/dsl-parser: 错误处理（尽力解析）', () => {
  it('非法语句记入 errors 且不中断其他语句', () => {
    const result = parseGraphDsl('A-B\n->B\nC-D\n@@@')
    expect(result.nodes).toEqual(['A', 'B', 'C', 'D'])
    expect(result.edges).toHaveLength(2)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]!.line).toBe(2)
    expect(result.errors[1]!.line).toBe(4)
    expect(result.errors[1]!.message).toContain('无法解析')
  })

  it('非法权重报错且该边被跳过', () => {
    const result = parseGraphDsl('A-B:3, B-C:xx, C-D')
    expect(result.edges).toHaveLength(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.message).toContain('权重无法解析')
  })

  it('空输入返回空结果', () => {
    expect(parseGraphDsl('')).toEqual({ nodes: [], edges: [], errors: [] })
    expect(parseGraphDsl('  \n , ; ')).toEqual({ nodes: [], edges: [], errors: [] })
  })

  it('行内错误带列号（近似语句起点）', () => {
    const result = parseGraphDsl('A-B, ???, C-D')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.line).toBe(1)
    expect(result.errors[0]!.column).toBeGreaterThan(1)
  })
})
