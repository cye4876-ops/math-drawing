/**
 * v3.3 Cayley 图测试：C4 / V4 / S3 的顶点数、边数、生成元、环闭合与确定性。
 */
import { describe, expect, it } from 'vitest'
import { CAYLEY_COLORS, buildCayleyGraph } from './cayley'
import { GROUP_C4, GROUP_S3, GROUP_V4, elementOrder, mult } from './groups'

describe('v3.3 Cayley 图', () => {
  it('C4：单生成元圆环，边数 = |G|，沿生成元 |G| 步回到单位元', () => {
    const cayley = buildCayleyGraph(GROUP_C4)
    expect(cayley.nodes).toHaveLength(4)
    expect(cayley.generators).toHaveLength(1)
    expect(cayley.edges).toHaveLength(4)
    let current = GROUP_C4.identity
    for (let k = 0; k < 4; k++) current = mult(GROUP_C4, current, cayley.generators[0]!)
    expect(current).toBe(GROUP_C4.identity)
    // 圆环坐标：每个点都在单位圆上
    for (const node of cayley.nodes) {
      expect(Math.hypot(node.x, node.y)).toBeCloseTo(1, 9)
    }
  })

  it('V4：两个二阶生成元，每个元素 × 每个生成元都有边（无自环）', () => {
    const cayley = buildCayleyGraph(GROUP_V4)
    expect(cayley.nodes).toHaveLength(4)
    expect(cayley.generators).toHaveLength(2)
    expect(cayley.edges).toHaveLength(4 * 2)
    for (const generator of cayley.generators) {
      expect(elementOrder(GROUP_V4, generator)).toBe(2)
    }
    // 边必须与乘法表一致
    for (const edge of cayley.edges) {
      const generator = cayley.generators[edge.generator]!
      expect(mult(GROUP_V4, edge.from, generator)).toBe(edge.to)
    }
  })

  it('S3：边数 = |G| × 生成元数；生成元标签与配色一一对应', () => {
    const cayley = buildCayleyGraph(GROUP_S3)
    expect(cayley.nodes).toHaveLength(6)
    const expectedEdges = 6 * cayley.generators.length
    expect(cayley.edges).toHaveLength(expectedEdges)
    expect(cayley.generatorLabels).toHaveLength(cayley.generators.length)
    for (const edge of cayley.edges) {
      expect(cayley.generatorLabels[edge.generator]).toBe(edge.generatorLabel)
      expect(CAYLEY_COLORS[edge.generator % CAYLEY_COLORS.length]).toBeTruthy()
    }
  })

  it('确定性：两次构建的坐标与边完全一致；单位元在元层 0', () => {
    const a = buildCayleyGraph(GROUP_S3)
    const b = buildCayleyGraph(GROUP_S3)
    expect(a.nodes.map((node) => [node.element, node.x, node.y])).toEqual(
      b.nodes.map((node) => [node.element, node.x, node.y]),
    )
    expect(a.edges).toEqual(b.edges)
    const identity = a.nodes.find((node) => node.element === GROUP_S3.identity)!
    expect(identity.level).toBe(0)
  })
})
