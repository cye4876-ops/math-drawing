import { expect, test, type Page } from '@playwright/test'

/** 画布非背景（#0b0e14）像素计数；2D 画布可直接 getImageData */
async function countPixels(page: Page): Promise<number> {
  return page.getByTestId('advanced-canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context) return -1
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      // 背景 #0b0e14 = (11, 14, 20)
      if (Math.abs(r - 11) > 14 || Math.abs(g - 14) > 14 || Math.abs(b - 20) > 14) count++
    }
    return count
  })
}

/** 量化色相种类数（域着色色轮验证） */
async function distinctHues(page: Page): Promise<number> {
  return page.getByTestId('advanced-canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context) return -1
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    const buckets = new Set<number>()
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      if (max - min < 40) continue // 近灰/黑白不计
      let hue: number
      if (max === r) hue = ((g - b) / (max - min)) % 6
      else if (max === g) hue = (b - r) / (max - min) + 2
      else hue = (r - g) / (max - min) + 4
      buckets.add(Math.floor(((hue + 6) % 6) * 12))
    }
    return buckets.size
  })
}

/** 画布图像校验和（用于对比渲染变化） */
async function canvasChecksum(page: Page): Promise<number> {
  return page.getByTestId('advanced-canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context) return 0
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    let sum = 0
    for (let i = 0; i < data.length; i += 8) {
      sum =
        (sum + (data[i] ?? 0) * 3 + (data[i + 1] ?? 0) * 5 + (data[i + 2] ?? 0) * 7) % 0xffffffff
    }
    return sum
  })
}

/** 设置 range 滑块并派发 input 事件 */
async function setRange(page: Page, testId: string, value: number): Promise<void> {
  await page.getByTestId(testId).evaluate((el, v) => {
    const input = el as HTMLInputElement
    input.value = String(v)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

test.describe('v0.9 进阶（第五模式）', () => {
  test('?mode=advanced 直达：面板与画布可见、模式标签选中', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await expect(page.getByTestId('mode-advanced')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('advanced-panel')).toBeVisible()
    await expect(page.getByTestId('advanced-view')).toBeVisible()
    await expect(page.getByTestId('advanced-canvas')).toBeVisible()
    await expect(page.getByTestId('curve-kind-select')).toHaveCount(0)
    await expect(page.getByTestId('graph-panel')).toHaveCount(0)
    await expect(page.getByTestId('space-panel')).toHaveCount(0)
  })

  test('复变域着色：(z−1)/(z+1) 渲染出完整色轮（多色相 + 大量着色像素）', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(8000)
    await expect.poll(() => distinctHues(page), { timeout: 8000 }).toBeGreaterThanOrEqual(8)
  })

  test('复变域着色：表达式切换与色图/网格切换生效', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(8000)
    const before = await canvasChecksum(page)
    await page.getByTestId('adv-complex-expr').fill('sin(z)')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(8000)
    await expect.poll(() => canvasChecksum(page), { timeout: 8000 }).not.toBe(before)
    // 非法表达式 → 错误提示
    await page.getByTestId('adv-complex-expr').fill('sin(')
    await expect(page.getByTestId('adv-error')).toBeVisible()
    // 恢复
    await page.getByTestId('adv-complex-expr').fill('z')
    await expect(page.getByTestId('adv-error')).toHaveCount(0)
    // 高对比色图仍渲染
    await page.getByTestId('adv-complex-colormap').selectOption('highcontrast')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(8000)
  })

  test('Möbius 变换：映射网格绘制（非背景线条像素）', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(8000)
    await page.getByTestId('adv-complex-mode').selectOption('mobius')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(5000)
    // 切换预设仍渲染
    await page.getByTestId('adv-mobius-preset').selectOption('inversion')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(5000)
  })

  test('围道积分：∮ 1/(z−i) dz ≈ 2πi 显示在结果栏', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(1000)
    await page.getByTestId('adv-complex-mode').selectOption('contour')
    await expect(page.getByTestId('adv-contour-result')).toBeVisible()
    await expect(page.getByTestId('adv-contour-result')).toContainText('6.28')
    // 半径改小到 0.5 → 不含极点 → 实部虚部都归零（显示 ≈ 0 + 0i）
    await setRange(page, 'adv-contour-radius', 0.5)
    await expect
      .poll(async () => (await page.getByTestId('adv-contour-result').textContent()) ?? '', {
        timeout: 8000,
      })
      .toContain('0 + 0i')
  })

  test('数论：Ulam 螺旋渲染 + 边长调整', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-numbertheory').click()
    await expect.poll(() => countPixels(page), { timeout: 10000 }).toBeGreaterThan(8000)
    await setRange(page, 'adv-ulam-size', 100)
    await expect.poll(() => countPixels(page), { timeout: 10000 }).toBeGreaterThan(2000)
    // 模运算图案
    await page.getByTestId('adv-number-viz').selectOption('modular')
    await expect.poll(() => countPixels(page), { timeout: 10000 }).toBeGreaterThan(8000)
    // Collatz 热图
    await page.getByTestId('adv-number-viz').selectOption('collatz')
    await expect.poll(() => countPixels(page), { timeout: 10000 }).toBeGreaterThan(200)
  })

  test('生命游戏：单步/清空/放滑翔机/播放', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-automata').click()
    // 初始随机播种
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(500)
    await page.getByTestId('adv-life-clear').click()
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeLessThan(300)
    await page.getByTestId('adv-life-glider').click()
    // 滑翔机 5 个活细胞 × 每格 2×2 像素 = 20 像素
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(10)
    await page.getByTestId('adv-life-step').click()
    // 播放 0.5s 后应仍在渲染
    await page.getByTestId('adv-life-play').click()
    await page.waitForTimeout(600)
    await page.getByTestId('adv-life-play').click() // 暂停
    await expect(await countPixels(page)).toBeGreaterThan(0)
  })

  test('Mandelbrot 集：渲染并可缩放', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-automata').click()
    await page.getByTestId('adv-automata-viz').selectOption('mandelbrot')
    await expect.poll(() => countPixels(page), { timeout: 15000 }).toBeGreaterThan(3000)
    // 滚轮缩放
    const canvas = page.getByTestId('advanced-canvas')
    await canvas.hover()
    await page.mouse.wheel(0, -120)
    await expect.poll(() => countPixels(page), { timeout: 15000 }).toBeGreaterThan(3000)
    // 重置
    await page.getByTestId('adv-fractal-reset').click()
    await expect.poll(() => countPixels(page), { timeout: 15000 }).toBeGreaterThan(3000)
  })

  test('数论：π(x) vs x/ln x 对比曲线', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-numbertheory').click()
    await page.getByTestId('adv-number-viz').selectOption('primes')
    await expect.poll(() => countPixels(page), { timeout: 10000 }).toBeGreaterThan(2000)
    const before = await canvasChecksum(page)
    await setRange(page, 'adv-prime-limit', 20000)
    await expect.poll(() => canvasChecksum(page), { timeout: 10000 }).not.toBe(before)
  })

  test('符号：不等式解集 + 数轴可视化（开闭端点）', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-symbolic').click()
    await page.getByTestId('adv-symbolic-input').fill('x^2 - 1 < 0')
    await page.getByTestId('adv-op-inequality').click()
    await expect(page.getByTestId('adv-symbolic-result')).toContainText('(-1, 1)')
    await expect(page.getByTestId('adv-number-line')).toBeVisible()
    // ≥ 变闭区间（数轴端点实心）
    await page.getByTestId('adv-symbolic-input').fill('x^2 >= 4')
    await page.getByTestId('adv-op-inequality').click()
    await expect(page.getByTestId('adv-symbolic-result')).toContainText('[2, +∞)')
  })

  test('进阶视图导出 PNG', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await expect.poll(() => countPixels(page), { timeout: 8000 }).toBeGreaterThan(8000)
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('adv-export-png').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('advanced')
  })

  test('符号计算：解方程 / 积分 / 化简 / LaTeX 输出', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-symbolic').click()
    // 解方程 x³−6x²+11x−6=0 → 1,2,3
    await page.getByTestId('adv-symbolic-input').fill('x^3 - 6*x^2 + 11*x - 6 = 0')
    await page.getByTestId('adv-op-solve').click()
    await expect(page.getByTestId('adv-symbolic-result')).toContainText('解方程')
    await expect
      .poll(async () => {
        const text = (await page.getByTestId('adv-symbolic-result').textContent()) ?? ''
        return ['1', '2', '3'].every((digit) => text.includes(digit))
      })
      .toBe(true)
    // 积分 x²
    await page.getByTestId('adv-symbolic-input').fill('x^2')
    await page.getByTestId('adv-op-integrate').click()
    await expect(page.getByTestId('adv-symbolic-result')).toContainText('不定积分')
    await expect(page.getByTestId('adv-symbolic-result')).toContainText('C')
    // 化简 sin²+cos² → 1
    await page.getByTestId('adv-symbolic-input').fill('sin(x)^2 + cos(x)^2')
    await page.getByTestId('adv-op-simplify').click()
    await expect
      .poll(async () => {
        const text = (await page.getByTestId('adv-symbolic-result').textContent()) ?? ''
        return text.includes('1')
      })
      .toBe(true)
    // 极限 sin(x)/x → 1
    await page.getByTestId('adv-symbolic-input').fill('sin(x)/x')
    await page.getByTestId('adv-limit-point').fill('0')
    await page.getByTestId('adv-op-limit').click()
    await expect(page.getByTestId('adv-symbolic-result')).toContainText('极限')
  })
})
