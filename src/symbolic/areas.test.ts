/**
 * 围成面积测试（v2.8）：交点吸附、分段积分、精确与回退策略。
 */
import { describe, expect, it } from 'vitest'
import { areasBetween, findCrossings } from './areas'
import { formatExact, snapNumber } from './exact'

function total(f: string, g: string, lo: string, hi: string): string {
  const { result, reason } = areasBetween(f, g, lo, hi)
  if (!result) throw new Error(`未得到结果：${reason}`)
  return result.total.display
}

describe('交点吸附', () => {
  it.each([
    [1.0000000000000002, '1'],
    [0, '0'],
    [-2.0000000000000004, '−2'],
    [Math.PI / 4, 'π/4'],
    [Math.PI, 'π'],
    [Math.PI / 3 + 1e-16, 'π/3'],
  ])('snap(%s) → %s', (value, expected) => {
    const snapped = snapNumber(value)
    expect(snapped).not.toBeNull()
    expect(formatExact(snapped!)).toBe(expected)
  })

  it('非简单值返回 null', () => {
    expect(snapNumber(0.1234567890123)).toBeNull()
    // 大分母有理逼近不得误命中（sin(x)=x³−x 的交点 ≈1.3171905…）
    expect(snapNumber(1.3171905423)).toBeNull()
  })

  it('分母上限参数：75/32 在严限下拒绝、在宽限下接受', () => {
    expect(snapNumber(2.34375, 8n)).toBeNull()
    expect(formatExact(snapNumber(2.34375)!)).toBe('75/32')
  })
})

describe('交点数值求解', () => {
  it('x² 与 x 在 (0,1) 内无内部交点', () => {
    const roots = findCrossings(
      (x) => x * x,
      (x) => x,
      0,
      1,
    )
    expect(roots).toHaveLength(0)
  })

  it('sin 与 cos 在 (0, π/2) 内有交点 π/4', () => {
    const roots = findCrossings(Math.sin, Math.cos, 0, Math.PI / 2)
    expect(roots).toHaveLength(1)
    expect(roots[0]!).toBeCloseTo(Math.PI / 4, 12)
  })

  it('多次相交：x³ 与 0.1x 在 [−1,1] 内有三个交点', () => {
    const roots = findCrossings(
      (x) => x ** 3,
      (x) => 0.1 * x,
      -1,
      1,
    )
    expect(roots.length).toBeGreaterThanOrEqual(3)
  })
})

describe('围成面积：精确结果', () => {
  it.each([
    ['x', 'x^2', '0', '1', '1/6'],
    ['x^2', 'x', '0', '1', '1/6'],
    ['sin(x)', '0', '0', 'pi', '2'],
    ['x^3', '0', '-1', '1', '1/2'],
    ['sin(x)', 'cos(x)', '0', 'pi/2', '2√2 − 2'],
    ['x', '2', '0', '1', '3/2'],
    ['x^2', '0', '-1', '1', '2/3'],
    ['sqrt(x)', 'x', '0', '1', '1/6'],
  ])('%s 与 %s 在 [%s, %s] 上面积 = %s', (f, g, lo, hi, expected) => {
    expect(total(f, g, lo, hi)).toBe(expected)
  })

  it('分段与交点信息可用', () => {
    const { result } = areasBetween('sin(x)', 'cos(x)', '0', 'pi/2')
    expect(result).not.toBeNull()
    expect(result!.segments).toHaveLength(2)
    expect(result!.crossings).toHaveLength(1)
    expect(result!.segments[0]!.display).toBe('√2 − 1')
    expect(result!.segments[1]!.display).toBe('√2 − 1')
    expect(result!.total.exact).toBe(true)
  })
})

describe('围成面积：回退策略', () => {
  it('交点非精确（sin(x)=x/2）→ 数值总面积', () => {
    const { result, reason } = areasBetween('sin(x)', 'x/2', '0.1', '2')
    if (!result) throw new Error(reason)
    expect(result.total.exact).toBe(false)
    expect(result.total.display.startsWith('≈')).toBe(true)
  })

  it('端点无法解析 → 返回原因', () => {
    const { result, reason } = areasBetween('x', 'x^2', '0', 'abc')
    expect(result).toBeNull()
    expect(reason).toContain('端点')
  })

  it('拖动端点（exactEndpoints=false）不产生大分母伪精确', () => {
    const { result } = areasBetween('x', 'x^2', '0', '2.34375', undefined, {
      exactEndpoints: false,
    })
    if (!result) throw new Error('应得结果')
    expect(result.total.exact).toBe(false)
    expect(result.total.display.startsWith('≈')).toBe(true)
  })

  it('参数代入', () => {
    const { result } = areasBetween('a*x', 'x^2', '0', '1', { a: 2 })
    if (!result) throw new Error('应得结果')
    expect(result.total.display).toBe('2/3')
  })
})
