/** 色图测试（v0.8）：端点色、亮度单调性（viridis）、夹取与通道范围。 */
import { describe, expect, it } from 'vitest'
import { COLORMAP_NAMES, luminance, sampleColormap } from './colormaps'

describe('v0.8 色图', () => {
  it('viridis 端点色与定义一致', () => {
    const start = sampleColormap('viridis', 0)
    expect(start[0]).toBeCloseTo(0x44 / 255, 6)
    expect(start[1]).toBeCloseTo(0x01 / 255, 6)
    expect(start[2]).toBeCloseTo(0x54 / 255, 6)
    const end = sampleColormap('viridis', 1)
    expect(end[0]).toBeCloseTo(0xfd / 255, 6)
    expect(end[1]).toBeCloseTo(0xe7 / 255, 6)
    expect(end[2]).toBeCloseTo(0x25 / 255, 6)
  })

  it('viridis 亮度随 t 递增（感知均匀色图的核心性质）', () => {
    let previous = -1
    for (let i = 0; i <= 40; i++) {
      const lum = luminance(sampleColormap('viridis', i / 40))
      expect(lum).toBeGreaterThan(previous - 0.01)
      previous = lum
    }
  })

  it('越界夹取；NaN 按 0 处理；通道在 [0, 1]', () => {
    expect(sampleColormap('plasma', -1)).toEqual(sampleColormap('plasma', 0))
    expect(sampleColormap('plasma', 2)).toEqual(sampleColormap('plasma', 1))
    expect(sampleColormap('plasma', Number.NaN)).toEqual(sampleColormap('plasma', 0))
    for (const name of COLORMAP_NAMES) {
      for (let i = 0; i <= 10; i++) {
        for (const channel of sampleColormap(name, i / 10)) {
          expect(channel).toBeGreaterThanOrEqual(0)
          expect(channel).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('gray 从白到黑；coolwarm 中点近中灰', () => {
    const white = sampleColormap('gray', 0)
    expect(Math.min(...white)).toBeGreaterThan(0.99)
    const black = sampleColormap('gray', 1)
    expect(Math.max(...black)).toBeLessThan(0.01)
    const middle = sampleColormap('coolwarm', 0.5)
    expect(Math.min(...middle)).toBeGreaterThan(0.6)
    expect(Math.max(...middle)).toBeLessThan(1)
  })
})
