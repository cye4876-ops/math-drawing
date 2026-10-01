/**
 * 分形测试（v0.9）：Mandelbrot/Julia 逃逸判定、渲染与着色。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MANDELBROT_VIEW,
  colorizeFractal,
  juliaEscape,
  mandelbrotEscape,
  renderFractal,
} from './mandelbrot'

describe('v0.9 分形：逃逸迭代', () => {
  it('Mandelbrot：0 与 −1 在集内（返回 maxIter），2 逃逸', () => {
    expect(mandelbrotEscape(0, 0, 100)).toBe(100)
    expect(mandelbrotEscape(-1, 0, 100)).toBe(100)
    const escape = mandelbrotEscape(2, 0, 100)
    expect(escape).toBeLessThan(4)
    expect(mandelbrotEscape(1, 1, 100)).toBeLessThan(5)
  })

  it('平滑迭代：逃逸值连续（相邻点差异小）', () => {
    const a = mandelbrotEscape(-0.75, 0.1, 200)
    const b = mandelbrotEscape(-0.7501, 0.1, 200)
    expect(Math.abs(a - b)).toBeLessThan(1)
  })

  it('Julia：c=−1 时 z0=0 有界；c=0 时 z0=10 立刻逃逸', () => {
    expect(juliaEscape(0, 0, -1, 0, 100)).toBe(100)
    expect(juliaEscape(10, 10, 0, 0, 100)).toBeLessThan(3)
  })
})

describe('v0.9 分形：渲染与着色', () => {
  it('renderFractal 尺寸正确、集合特征在位', () => {
    const view = { ...DEFAULT_MANDELBROT_VIEW, maxIter: 60 }
    const width = 48
    const height = 32
    const iters = renderFractal(view, width, height)
    expect(iters.length).toBe(width * height)
    // 视窗 center −0.6：中心像素接近集内
    const centerIndex = Math.floor(height / 2) * width + Math.floor(width / 2)
    expect(iters[centerIndex]!).toBe(60)
    // 左上角（≈ −2.2 + 1.06i）逃逸
    expect(iters[0]!).toBeLessThan(10)
  })

  it('colorizeFractal：集内深色、外部有色彩、alpha=255', () => {
    const view = { ...DEFAULT_MANDELBROT_VIEW, maxIter: 60 }
    const iters = renderFractal(view, 32, 32)
    const data = colorizeFractal(iters, 60)
    expect(data.length).toBe(32 * 32 * 4)
    const centerIndex = 16 * 32 + 16
    const offset = centerIndex * 4
    expect(data[offset]!).toBeLessThan(20)
    let colorful = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! > 60 || data[i + 1]! > 60 || data[i + 2]! > 60) colorful++
    }
    expect(colorful).toBeGreaterThan(100)
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255)
  })

  it('julia 渲染可直接出图（c = −0.8 + 0.156i）', () => {
    const iters = renderFractal(
      { centerRe: 0, centerIm: 0, span: 3, maxIter: 30 },
      24,
      24,
      'julia',
      { re: -0.8, im: 0.156 },
    )
    expect(iters.length).toBe(24 * 24)
    expect(iters.some((value) => value >= 30)).toBe(true)
  })
})
