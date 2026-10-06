/**
 * v3.1.3 隐式曲面空判定测试（用户样例：sqrt(x²+y²+z²+1/(1+x²)) 恒 ≥ 1 → F = 0 无解）。
 */
import { describe, expect, it } from 'vitest'
import { probeImplicitSurface } from './implicit-probe'

const BOX = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, zMin: -5, zMax: 5 }

describe('v3.1.3 隐式曲面空判定', () => {
  it('有解：球面与双曲面', () => {
    expect(probeImplicitSurface('x^2 + y^2 + z^2 - 1', BOX).status).toBe('ok')
    expect(probeImplicitSurface('x^2 + y^2 - z^2 - 1', BOX).status).toBe('ok')
  })

  it('无解（恒正）：用户样例 sqrt(x²+y²+z²+1/(1+x²))', () => {
    const result = probeImplicitSurface('sqrt(x^2 + y^2 + z^2 + 1/(1 + x^2))', BOX)
    expect(result.status).toBe('empty')
    if (result.status === 'empty') {
      expect(result.min).toBeGreaterThan(0)
      expect(result.max).toBeGreaterThan(result.min)
    }
  })

  it('无解（恒负）：-x^2 - y^2 - z^2 - 1', () => {
    const result = probeImplicitSurface('-x^2 - y^2 - z^2 - 1', BOX)
    expect(result.status).toBe('empty')
    if (result.status === 'empty') expect(result.max).toBeLessThan(0)
  })

  it('无有限值：语法合法但恒为 NaN/Infinity 的表达式', () => {
    expect(probeImplicitSurface('1/(x - x)', BOX).status).toBe('invalid')
    expect(probeImplicitSurface('ln(-1 - x^2)', BOX).status).toBe('invalid')
  })

  it('全局恒正但小范围有解：探测随包围盒变化', () => {
    // x² + y² + z² − 0.5：大盒有解
    expect(probeImplicitSurface('x^2 + y^2 + z^2 - 0.5', BOX).status).toBe('ok')
    // 远离原点的小盒内恒正
    const far = { xMin: 4, xMax: 5, yMin: 4, yMax: 5, zMin: 4, zMax: 5 }
    expect(probeImplicitSurface('x^2 + y^2 + z^2 - 0.5', far).status).toBe('empty')
  })
})
