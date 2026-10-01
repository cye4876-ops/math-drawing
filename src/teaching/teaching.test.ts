/**
 * 题目判定与参数动画的纯逻辑测试（v1.0）。
 */
import { describe, expect, it } from 'vitest'
import { numericEquivalent, numericProportional, TEACHING_PROBLEMS } from './problems'
import { paramValues } from './param-animation'
import type { DocState, ViewTransform } from '../state/types'

describe('v1.0 教学：数值等价判定', () => {
  it('相同与等价形式', () => {
    expect(numericEquivalent('sin(x)', 'sin(x)', 'x', 1e-9)).toBe(true)
    expect(numericEquivalent('2*sin(x)', 'sin(x)+sin(x)', 'x', 1e-9)).toBe(true)
    expect(numericEquivalent('x^2 - 1', '(x-1)*(x+1)', 'x', 1e-9)).toBe(true)
  })

  it('不同表达式与定义域差异', () => {
    expect(numericEquivalent('sin(x)', 'cos(x)', 'x', 1e-6)).toBe(false)
    expect(numericEquivalent('sqrt(x)', 'x', 'x', 1e-6)).toBe(false) // 负侧定义域不一致
    expect(numericEquivalent('sin(', 'sin(x)', 'x', 1e-6)).toBe(false)
  })

  it('容差生效', () => {
    expect(numericEquivalent('sin(x)', 'sin(x) + 0.1', 'x', 0.001)).toBe(false)
    expect(numericEquivalent('sin(x)', 'sin(x) + 0.1', 'x', 0.2)).toBe(true)
  })
})

describe('v1.0 教学：参数动画帧值', () => {
  it('端点包含与均匀分布', () => {
    expect(paramValues(0, 1, 5)).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(paramValues(-2, 2, 3)).toEqual([-2, 0, 2])
  })

  it('单帧取终点值；帧数取整', () => {
    expect(paramValues(1, 5, 1)).toEqual([5])
    expect(paramValues(0, 10, 2.4)).toHaveLength(2)
  })

  it('非有限输入安全兜底（NaN 帧数回退 24 帧，非有限端点取终点）', () => {
    expect(paramValues(0, 1, Number.NaN)).toHaveLength(24)
    expect(paramValues(Number.NaN, 3, 5)).toEqual([3])
    expect(paramValues(0, Number.POSITIVE_INFINITY, 5).every((v) => Number.isFinite(v))).toBe(false)
  })
})

describe('v1.0 教学：常数倍判定与题目边界', () => {
  it('恒 0 的曲线不能通过比例判定（k ≠ 0）', () => {
    expect(numericProportional('x^2 + y^2 - 25', '2*(x^2 + y^2 - 25)', 1e-6)).toBe(true)
    expect(numericProportional('0', 'x^2 + y^2 - 25', 1e-6)).toBe(false)
    expect(numericProportional('0*(x^2 + y^2 - 25)', 'x^2 + y^2 - 25', 1e-6)).toBe(false)
  })

  it('连通三角形题：重边凑数不通过，真实三角形通过', () => {
    const problem = TEACHING_PROBLEMS.find((item) => item.id === 'graph-connected')!
    const view = {} as ViewTransform

    const dupDoc = {
      objects: [
        {
          id: 'g1',
          type: 'graph',
          name: '重边',
          visible: true,
          nodes: [
            { id: 'a', x: 0, y: 0 },
            { id: 'b', x: 1, y: 0 },
            { id: 'c', x: 0, y: 1 },
          ],
          edges: [
            { source: 'a', target: 'b' },
            { source: 'a', target: 'b' },
            { source: 'a', target: 'c' },
          ],
        },
      ],
    } as unknown as DocState
    expect(problem.check({ doc: dupDoc, view, mode: 'graph' }, 0).pass).toBe(false)

    const triDoc = JSON.parse(JSON.stringify(dupDoc)) as DocState
    const graph = triDoc.objects[0] as unknown as { edges: { source: string; target: string }[] }
    graph.edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'a', target: 'c' },
    ]
    expect(problem.check({ doc: triDoc, view, mode: 'graph' }, 0).pass).toBe(true)
  })
})
