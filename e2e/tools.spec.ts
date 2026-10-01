import { expect, test, type Page } from '@playwright/test'

/** 读取读数面板所有 entry 值（顺序与面板一致） */
async function readoutValues(page: Page): Promise<string[]> {
  return page.getByTestId('tool-readout-value').allTextContents()
}

/** 统计画布上切线的青绿色（#0d9488 = rgb(13,148,136)）像素数 */
async function countTealPixels(page: Page): Promise<number> {
  return page.getByTestId('stage-canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const ctx = canvas.getContext('2d')
    if (!ctx) return -1
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0
      if (Math.abs(r - 13) < 40 && Math.abs(g - 148) < 50 && Math.abs(b - 136) < 50) count++
    }
    return count
  })
}

/** 激活工具并等待读数面板出现 */
async function activateTool(page: Page, tool: string): Promise<void> {
  await page.getByTestId(`tool-${tool}`).click()
  await expect(page.getByTestId('tools-readout')).toBeVisible()
}

/** 拖动两下让追踪游标命中 sin(x) 曲线（画布尺寸与视口无关，做纵向扫描） */
async function hoverUntilSinHit(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('stage-canvas').boundingBox()
  expect(box).not.toBeNull()
  const cx = box!.x + box!.width * 0.5
  for (let i = 0; i <= 20; i++) {
    const py = box!.y + box!.height * (0.15 + 0.03 * i)
    await page.mouse.move(cx, py)
    const values = await readoutValues(page)
    if (values[0] === 'sin(x)') {
      return { x: Number(values[1]), y: Number(values[2]) }
    }
  }
  throw new Error('未能在画布上命中 sin(x) 曲线')
}

test.describe('v0.4 交互分析工具', () => {
  test('追踪游标：读数 y ≈ sin(x) 且导数为 cos(x)', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await activateTool(page, 'trace')
    await expect(page.getByTestId('tool-readout-title')).toContainText('追踪游标')

    const hit = await hoverUntilSinHit(page)
    expect(Math.abs(hit.y - Math.sin(hit.x))).toBeLessThan(0.02)

    const values = await readoutValues(page)
    // [曲线, x, y, f′(x), f″(x), ρ]
    expect(values[0]).toBe('sin(x)')
    const d1 = Number(values[3])
    expect(Math.abs(d1 - Math.cos(hit.x))).toBeLessThan(0.02)
  })

  test('切线：点击曲线后给出切点与切线方程', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await activateTool(page, 'tangent')

    const box = await page.getByTestId('stage-canvas').boundingBox()
    expect(box).not.toBeNull()
    // 在曲线上多点尝试，命中后切点行出现（拖动工具是「点一下设置切点」语义）
    let placed = false
    for (let i = 0; i <= 20 && !placed; i++) {
      const py = box!.y + box!.height * (0.15 + 0.03 * i)
      await page.mouse.click(box!.x + box!.width * 0.5, py)
      const title = await page.getByTestId('tool-readout-title').textContent()
      const values = await readoutValues(page)
      if (title?.includes('切线') && values.length >= 4) {
        expect(values[3]).toContain('y = ')
        placed = true
      }
    }
    expect(placed).toBe(true)
  })

  test('零点：x³−x 找到三个根 −1、0、1', async ({ page }) => {
    await page.goto('/?curves=x^3-x')
    await activateTool(page, 'roots')
    await expect(page.getByTestId('tool-readout-title')).toContainText('共 3 个')
    const values = await readoutValues(page)
    expect(values[0]).toBe('-1，0，1')
  })

  test('交点：sin(x) 与 x³−x 交于 0 与 ±1.317', async ({ page }) => {
    await page.goto('/?curves=sin(x);x^3-x')
    await activateTool(page, 'intersection')
    await expect(page.getByTestId('tool-readout-title')).toContainText('共 3 个')
    const values = await readoutValues(page)
    expect(values[0]).toContain('(0, 0)')
    expect(values[0]).toContain('1.3172')
  })

  test('定积分：∫x²dx 与解析值一致（端点对称区间）', async ({ page }) => {
    await page.goto('/?curves=x^2')
    await activateTool(page, 'integral')
    await expect(page.getByTestId('tool-readout-title')).toContainText('定积分')

    const values = await readoutValues(page)
    const interval = values[1] ?? ''
    const match = interval.match(/\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]/)
    expect(match).not.toBeNull()
    const a = Number(match![1])
    const b = Number(match![2])
    const value = Number(values[2])
    // 区间由画布内容宽度决定（相对视口比例固定），用解析值校验 Simpson 结果
    // （读数为格式化后的有效数字串，容差覆盖显示截断误差）
    const exact = (b ** 3 - a ** 3) / 3
    expect(Math.abs(value - exact)).toBeLessThan(1e-3)
  })

  test('黎曼和：单步推进 n、播放动画自动增长、重置回 1', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await activateTool(page, 'riemann')

    // 单步：n 4 → 5 → 6（values 顺序：曲线/区间/模式/n/近似值/参考值/误差）
    // 真实鼠标点击（非 DOM .click()）：回归防护——面板按钮点击曾被画布 pointer capture 截获
    const nValue = page.getByTestId('tool-readout-value').nth(3)
    await page.getByTestId('tool-action-step').click()
    await page.getByTestId('tool-action-step').click()
    await expect(nValue).toHaveText('6')

    // 播放：按钮变「暂停」，n 随时间增长
    await page.getByTestId('tool-action-toggle').click()
    await expect(page.getByTestId('tool-action-toggle')).toHaveText('暂停')
    await expect
      .poll(async () => Number(await nValue.textContent()), { timeout: 5000 })
      .toBeGreaterThan(10)

    // 暂停后继续次数不再变化
    await page.getByTestId('tool-action-toggle').click()
    await expect(page.getByTestId('tool-action-toggle')).toHaveText('播放')
    const paused = Number(await nValue.textContent())
    await page.waitForTimeout(400)
    expect(Number(await nValue.textContent())).toBe(paused)

    // 重置：n = 1
    await page.getByTestId('tool-action-reset').click()
    await expect(nValue).toHaveText('1')
  })

  test('泰勒展开：阶数推进后展开式包含对应幂次项', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await activateTool(page, 'taylor')

    // 点击画布非原点处设置展开点（原点处 sin 的偶次项系数为 0，会被正确省略）
    const box = await page.getByTestId('stage-canvas').boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.click(box!.x + box!.width * 0.6, box!.y + box!.height * 0.45)

    await page.getByTestId('tool-action-step').click()
    await page.getByTestId('tool-action-step').click()
    const values = await readoutValues(page)
    // [曲线, 展开点, 阶数, 展开式, 最大偏差]
    expect(values[2]).toBe('3')
    expect(values[3]).toContain('(x−')
    expect(values[3]).toContain('^2')
    expect(values[3]).toContain('^3')
  })

  test('Escape 清除激活工具并回到选择模式', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await activateTool(page, 'roots')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('tools-readout')).toHaveCount(0)
    await expect(page.getByTestId('tool-none')).toHaveClass(/active/)
  })

  test('工具操作不写入撤销栈：撤销直接撤回曲线', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('curve-expr-input').fill('sin(x)')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(1)

    // 工具激活 + 若干次状态操作（均不得进入撤销栈）
    await activateTool(page, 'riemann')
    const nValue = page.getByTestId('tool-readout-value').nth(3)
    await page.getByTestId('tool-action-step').click()
    await page.getByTestId('tool-action-step').click()
    await expect(nValue).toHaveText('6')

    // 第一次撤销应直接删除曲线（若工具操作入栈，这里会先被工具操作消耗）
    await page.getByTestId('undo').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(0)
    // 工具面板仍保持激活（工具状态独立于文档历史）
    await expect(page.getByTestId('tools-readout')).toBeVisible()
  })

  test('快速反复切换工具 80 次无异常且最终状态正确', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/?curves=sin(x);x^3-x')
    const tools = [
      'trace',
      'tangent',
      'roots',
      'intersection',
      'integral',
      'riemann',
      'taylor',
      'none',
    ]
    for (let i = 0; i < 80; i++) {
      await page.getByTestId(`tool-${tools[i % tools.length]}`).click()
    }
    await expect(page.getByTestId('tools-readout')).toHaveCount(0)
    await expect(page.getByTestId('tool-none')).toHaveClass(/active/)

    await activateTool(page, 'roots')
    await expect(page.getByTestId('tool-readout-title')).toContainText('共 6 个')
    expect(errors).toEqual([])
  })

  test('切线：输入 x 坐标直接生成切线（支持 pi 常量表达式）', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await activateTool(page, 'tangent')

    const input = page.getByTestId('tool-control-x')
    await input.fill('pi/2')
    await input.press('Enter')

    const values = await readoutValues(page)
    // [曲线, 切点, 斜率 k, 切线方程]
    expect(values[0]).toBe('sin(x)')
    expect(values[1]).toBe('(1.5708, 1)')
    expect(Number(values[2])).toBeCloseTo(0, 4) // cos(π/2) ≈ 0
    expect(values[3]).toContain('y = ')

    // 非法输入：面板提示且保留上次切点
    await input.fill('abc')
    await input.press('Enter')
    await expect(page.getByTestId('tools-readout')).toContainText('无法解析')

    // 快捷符号：点击 0 → 切点回到 (0, 0)
    await page.getByTestId('tool-chip-x-0').click()
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('(0, 0)')
  })

  test('泰勒：输入展开点坐标直接生成展开式', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await activateTool(page, 'taylor')

    const input = page.getByTestId('tool-control-x0')
    await input.fill('1')
    await input.press('Enter')

    const values = await readoutValues(page)
    // [曲线, 展开点, 阶数, 展开式, 最大偏差]
    expect(values[1]).toBe('1')
    expect(values[3]).toContain('0.540302') // cos(1)
    expect(values[3]).toContain('(x−1)')

    // 快捷符号：点击 π → 展开点 3.14159
    await page.getByTestId('tool-chip-x0-pi').click()
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('3.14159')
  })

  test('对数坐标下切线正常绘制（回归：越过 y≤0 断开而非整条消失）', async ({ page }) => {
    await page.goto('/?curves=log(x)')
    await page.getByLabel('坐标').selectOption('log')
    await activateTool(page, 'tangent')

    const input = page.getByTestId('tool-control-x')
    await input.fill('2')
    await input.press('Enter')
    const values = await readoutValues(page)
    expect(values[1]).toContain('(2,')

    // 画布上应出现切线颜色像素（修复前 log 模式下整条不绘制）
    await expect.poll(() => countTealPixels(page)).toBeGreaterThan(100)
  })

  test('定积分：快捷符号与输入框设置区间', async ({ page }) => {
    await page.goto('/?curves=x^2')
    await activateTool(page, 'integral')

    // 快捷符号：下限 0、上限 π → ∫₀^π x² dx = π³/3
    await page.getByTestId('tool-chip-a-0').click()
    await page.getByTestId('tool-chip-b-pi').click()
    const values = await readoutValues(page)
    expect(values[1]).toBe('[0, 3.14159]')
    expect(Number(values[2])).toBeCloseTo(Math.PI ** 3 / 3, 6)

    // 手动输入上限 pi/2
    const bInput = page.getByTestId('tool-control-b')
    await bInput.fill('pi/2')
    await bInput.press('Enter')
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('[0, 1.5708]')

    // 非法输入：提示且保留上次区间
    await bInput.fill('?')
    await bInput.press('Enter')
    await expect(page.getByTestId('tools-readout')).toContainText('无法解析')
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('[0, 1.5708]')
  })

  test('工具面板显示在右侧栏（不遮挡画布）', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await activateTool(page, 'tangent')

    const viewport = page.viewportSize()
    const vw = viewport?.width ?? 0
    const box = await page.getByTestId('tools-readout').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThan(vw / 2)
    // 面板右缘不超出视口（侧栏内容不被裁切）
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw + 1)
    // 输入框也在面板内（右侧）
    const inputBox = await page.getByTestId('tool-control-x').boundingBox()
    expect(inputBox).not.toBeNull()
    expect(inputBox!.x).toBeGreaterThan(vw / 2)
    expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(vw + 1)
    // 曲线列表输入框同样完整可见
    const curveInput = await page.getByTestId('curve-expr-input').boundingBox()
    expect(curveInput).not.toBeNull()
    expect(curveInput!.x + curveInput!.width).toBeLessThanOrEqual(vw + 1)
  })
})
