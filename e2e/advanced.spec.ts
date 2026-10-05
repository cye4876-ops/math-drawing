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

  test('代数·反例列举：Q₈ 全部子群正规但非交换（表高亮 + 子群报告）', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-algebra').click()
    await expect(page.getByTestId('adv-algebra-area')).toBeVisible()
    await expect(page.getByTestId('alg-case-title')).toContainText('正规')
    const table = page.getByTestId('alg-table-q8')
    await expect(table).toBeVisible()
    await expect(table.locator('td')).toHaveCount(64)
    await expect(table.locator('[data-noncommuting="true"]')).toHaveCount(2)
    await expect(page.getByTestId('alg-caption-q8')).toContainText('≠')
    await expect(page.getByTestId('alg-subgroups-q8')).toContainText('全部子群均正规')
    // 点击非交换单元格：说明栏显示具体乘积（先滚动到面板中部，避开吸附的案例列表）
    const cell = table.locator('[data-noncommuting="true"]').first()
    await cell.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }))
    await cell.click()
    await expect(page.getByTestId('alg-caption-q8')).toContainText('=')
  })

  test('代数·反例切换：A₄ 无 6 阶子群；C₄ 与 V₄ 同阶不同构（阶分布对比）', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-algebra').click()
    await page.getByTestId('adv-algebra-case-a4-lagrange-converse').click()
    await expect(page.getByTestId('alg-case-title')).toContainText('拉格朗日')
    await expect(page.getByTestId('alg-missing-a4')).toContainText('不存在 6 阶子群')
    await page.getByTestId('adv-algebra-case-c4-v4-same-order').click()
    await expect(page.getByTestId('alg-case-title')).toContainText('同阶')
    await expect(page.getByTestId('alg-table-c4')).toBeVisible()
    await expect(page.getByTestId('alg-table-v4')).toBeVisible()
    await expect(page.getByTestId('adv-algebra-area')).toContainText('4×2')
    await expect(page.getByTestId('adv-algebra-area')).toContainText('2×3')
  })

  test('代数·群结构探索：性质卡 + 子群格 + 点击元素显示生成子群', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-algebra').click()
    await page.getByTestId('adv-algebra-section-groups').click()
    await expect(page.getByTestId('alg-group-facts')).toContainText('非交换')
    await expect(page.getByTestId('alg-lattice')).toBeVisible()
    // 默认 S₃：点击 (12) 行单元格 → 显示阶 / 逆元 / 生成子群（先滚动到面板中部）
    const s3cell = page.getByTestId('alg-table-s3').locator('td').nth(6)
    await s3cell.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }))
    await s3cell.click()
    await expect(page.getByTestId('alg-element-info')).toContainText('阶')
    await expect(page.getByTestId('alg-element-info')).toContainText('⟨')
    // 切换 Q₈：性质卡与表格更新
    await page.getByTestId('adv-algebra-group-q8').click()
    await expect(page.getByTestId('alg-group-facts')).toContainText('Q₈')
    await expect(page.getByTestId('alg-table-q8')).toBeVisible()
  })

  test('代数·环与域：ℤ₆ 单位/零因子（红格 4 处）；切到 ℤ₇ 为域', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-algebra').click()
    await page.getByTestId('adv-algebra-section-rings').click()
    await expect(page.getByTestId('alg-ring-facts')).toContainText('1, 5')
    await expect(page.getByTestId('alg-ring-facts')).toContainText('2, 3, 4')
    await expect(page.getByTestId('alg-ring-mul').locator('.zero-product')).toHaveCount(4)
    // ℤ₇：素数是域、无零因子红格
    await page.getByTestId('adv-algebra-ring-n').selectOption('7')
    await expect(page.getByTestId('alg-ring-facts')).toContainText('是（n 为素数）')
    await expect(page.getByTestId('alg-ring-mul').locator('.zero-product')).toHaveCount(0)
  })

  test('代数·群作用（v3.0）：A₄ 的共轭类与轨道-稳定子联动', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-algebra').click()
    await page.getByTestId('adv-algebra-section-actions').click()
    // 默认 A₄、元素 (123)：共轭类大小 4、中心化子大小 3
    const view = page.getByTestId('alg-action-view')
    await expect(view).toBeVisible()
    await expect(page.getByTestId('alg-action-class')).toContainText('(123)')
    await expect(page.getByTestId('alg-action-stabilizer')).toContainText('12 / 3 = 4')
    await expect(page.getByTestId('alg-action-class-equation')).toContainText('= 12')
    await expect(page.getByTestId('alg-action-center')).toContainText('{e}')
    // H = ⟨(123)⟩：指数 4、不正规（左右陪集不同）
    await expect(page.getByTestId('alg-action-not-normal')).toBeVisible()
    // 切到 S₃ 的 (123)：H = A₃ 指数 2 正规 → 商群 C₂ 乘法表出现
    await page.getByTestId('adv-action-group-s3').click()
    await page.getByTestId('adv-action-element').selectOption('4')
    await expect(page.getByTestId('alg-action-quotient')).toBeVisible()
  })

  test('代数·群作用（v3.0）：Burnside 计数（D₄ 正方形着色 2 色 → 6、3 色 → 21）', async ({
    page,
  }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-algebra').click()
    await page.getByTestId('adv-algebra-section-actions').click()
    await page.getByTestId('adv-action-group-d4').click()
    await expect(page.getByTestId('alg-action-burnside')).toContainText('= 6')
    await page.getByTestId('alg-action-colors-3').click()
    await expect(page.getByTestId('alg-action-burnside')).toContainText('= 21')
  })

  test('代数·Sylow 工作台（v3.0）：A₄ n₂=1（V₄ 正规）、n₃=4；A₅ n₅=6', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-algebra').click()
    await page.getByTestId('adv-algebra-section-sylow').click()
    const view = page.getByTestId('alg-sylow-view')
    await expect(view).toBeVisible()
    // 默认 A₄、p=2：实际 1、允许 {1、3}、全部约束 ✓
    await expect(page.getByTestId('alg-sylow-count')).toContainText('n_2 = 1')
    await expect(page.getByTestId('alg-sylow-allowed')).toContainText('1、3')
    const checks = page.getByTestId('alg-sylow-checks')
    await expect(checks.locator('.sv-check')).toHaveCount(5)
    await expect(checks.locator('.sv-check.bad')).toHaveCount(0)
    await expect(page.getByTestId('alg-sylow-subgroup-0')).toContainText('正规 ✓')
    await expect(page.getByTestId('alg-sylow-subgroup-0')).toContainText('(12)(34)')
    // p=3：n₃ = 4（4 个 Sylow 3-子群，均非正规）
    await page.getByTestId('adv-sylow-prime-3').click()
    await expect(page.getByTestId('alg-sylow-count')).toContainText('n_3 = 4')
    await expect(page.getByTestId('alg-sylow-subgroup-1')).toContainText('x·P1·x⁻¹')
    // A₅：p=5 → n₅ = 6；p=2 → n₂ = 5
    await page.getByTestId('adv-sylow-group-a5').click()
    await page.getByTestId('adv-sylow-prime-5').click()
    await expect(page.getByTestId('alg-sylow-count')).toContainText('n_5 = 6')
    await page.getByTestId('adv-sylow-prime-2').click()
    await expect(page.getByTestId('alg-sylow-count')).toContainText('n_2 = 5')
    await page.getByTestId('adv-sylow-prime-3').click()
    await expect(page.getByTestId('alg-sylow-count')).toContainText('n_3 = 10')
  })

  test('代数·群结构：S₄/A₅ 不出现在子群扫描列表（防 2²⁴ 冻结）', async ({ page }) => {
    await page.goto('/?mode=advanced')
    await page.getByTestId('adv-tab-algebra').click()
    await page.getByTestId('adv-algebra-section-groups').click()
    await expect(page.getByTestId('adv-algebra-group-s3')).toBeVisible()
    await expect(page.getByTestId('adv-algebra-group-s4')).toHaveCount(0)
    await expect(page.getByTestId('adv-algebra-group-a5')).toHaveCount(0)
    // 群作用视图则提供 S₄/A₅
    await page.getByTestId('adv-algebra-section-actions').click()
    await expect(page.getByTestId('adv-action-group-s4')).toBeVisible()
    await expect(page.getByTestId('adv-action-group-a5')).toBeVisible()
  })
})
