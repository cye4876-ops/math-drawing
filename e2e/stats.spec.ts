import { expect, test, type Page } from '@playwright/test'

/** 接近 y = 2x 的 5 点数据 */
const CSV = 'x,y\n1,2.1\n2,3.9\n3,6.2\n4,7.8\n5,10.1'

async function importCsv(page: Page): Promise<void> {
  await page.getByTestId('stats-paste').fill(CSV)
  await page.getByTestId('stats-import-paste').click()
  await expect(page.getByTestId('dataset-size')).toContainText('5 行 × 2 列')
}

/** 画布中心附近的屏幕坐标 */
async function stageCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('stage-canvas').boundingBox()
  expect(box).not.toBeNull()
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

test.describe('v0.7 统计与数据（第三模式）', () => {
  test('?mode=stats 直达：统计面板可见、绘图/图论面板隐藏', async ({ page }) => {
    await page.goto('/?mode=stats')
    await expect(page.getByTestId('mode-stats')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('stats-panel')).toBeVisible()
    await expect(page.getByTestId('curve-kind-select')).toHaveCount(0)
    await expect(page.getByTestId('graph-panel')).toHaveCount(0)
    await expect(page.getByTestId('tool-graph')).toHaveCount(0)
  })

  test('粘贴导入 CSV：数据集大小、散点回归方程与 R²', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    // 默认散点图 + 线性回归
    await expect(page.getByTestId('scatter-result')).toContainText('n = 5')
    await expect(page.getByTestId('regression-equation')).toBeVisible()
    await expect(page.getByTestId('regression-equation')).toContainText('y =')
    await expect(page.getByTestId('scatter-result')).toContainText('R² = 0.99')
  })

  test('残差模式切换：勾选后方程仍在、无页面错误', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    const errors: Error[] = []
    page.on('pageerror', (error) => errors.push(error))

    await page.getByTestId('scatter-residuals').check()
    await expect(page.getByTestId('regression-equation')).toBeVisible()
    await page.getByTestId('scatter-residuals').uncheck()
    await expect(errors).toEqual([])
  })

  test('回归方法切换（多项式 3 阶）与病态数据提示', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('scatter-regression').selectOption('polynomial')
    await page.getByTestId('scatter-degree').fill('3')
    await expect(page.getByTestId('regression-equation')).toBeVisible()
  })

  test('分布图：画布拖动探针改变 P(X ≤ x) 读数', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('stats-chart-kind').selectOption('distribution')
    const probe = page.getByTestId('distribution-probe')
    await expect(probe).toContainText('P(X ≤')
    const before = await probe.textContent()

    const center = await stageCenter(page)
    await page.mouse.move(center.x - 120, center.y)
    await page.mouse.down()
    await page.mouse.move(center.x + 120, center.y, { steps: 8 })
    await page.mouse.up()
    await expect(probe).not.toHaveText(before ?? '')

    // 一步撤销回到拖动前
    await page.keyboard.press('Control+z')
    await expect(probe).toHaveText(before ?? '')
  })

  test('分布参数滑块（σ）改变 CDF 读数', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('stats-chart-kind').selectOption('distribution')
    const probe = page.getByTestId('distribution-probe')
    const before = await probe.textContent()
    const sigma = page.getByTestId('dist-param-sigma')
    await sigma.evaluate((element, value) => {
      const input = element as HTMLInputElement
      input.value = String(value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, 2.5)
    await expect(probe).not.toHaveText(before ?? '')
  })

  test('分布切换与第二分布对比', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('stats-chart-kind').selectOption('distribution')
    await page.getByTestId('distribution-select').selectOption('student-t')
    await expect(page.getByTestId('distribution-probe')).toContainText('P(X ≤')
    await page.getByTestId('distribution-compare').check()
    await expect(page.getByTestId('distribution-compare-select')).toBeVisible()
    await expect(page.getByTestId('dist-compare-param-mu')).toBeVisible()
  })

  test('直方图：手动分箱与 KDE 开关', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('stats-chart-kind').selectOption('histogram')
    await page.getByTestId('histogram-bins').selectOption('manual')
    await expect(page.getByTestId('histogram-bins-manual')).toBeVisible()
    await page.getByTestId('histogram-kde').uncheck()
    await page.getByTestId('histogram-kde').check()
    await page.getByTestId('histogram-kernel').selectOption('epanechnikov')
  })

  test('模拟动画：播放 → 暂停 → 重置', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('stats-chart-kind').selectOption('simulation')
    const toggle = page.getByTestId('simulation-toggle')
    await expect(toggle).toHaveText('播放')
    await toggle.click()
    await expect(toggle).toHaveText('暂停')
    await toggle.click()
    await expect(toggle).toHaveText('播放')
    await page.getByTestId('simulation-reset').click()
    await expect(toggle).toHaveText('播放')
    // 切换演示类型不报错
    await page.getByTestId('simulation-select').selectOption('montecarlo-pi')
    await page.getByTestId('simulation-select').selectOption('bootstrap')
  })

  test('描述统计：均值/标准差与箱线数据', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('describe-column').selectOption('0')
    const stats = page.getByTestId('describe-stats')
    await expect(stats).toContainText('均值')
    await expect(stats).toContainText('3')
    await expect(page.getByTestId('describe-boxplot')).toBeVisible()
  })

  test('表达式生成数据：y = x^2 生成默认 200 行', async ({ page }) => {
    await page.goto('/?mode=stats')
    await page.getByTestId('stats-gen-expr').fill('x^2')
    await page.getByTestId('stats-generate').click()
    await expect(page.getByTestId('dataset-size')).toContainText('200 行')
  })

  test('模式互斥切换：stats → plot → 回 stats 面板恢复', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('mode-plot').click()
    await expect(page.getByTestId('curve-kind-select')).toBeVisible()
    await expect(page.getByTestId('stats-panel')).toHaveCount(0)
    await page.getByTestId('mode-stats').click()
    await expect(page.getByTestId('stats-panel')).toBeVisible()
    // 数据集仍在（文档状态共享）
    await expect(page.getByTestId('dataset-size')).toContainText('5 行')
    await expect(page.getByTestId('tool-stats-probe')).toBeVisible()
  })

  test('URL 分享往返：携带数据集与统计模式', async ({ page }) => {
    await page.goto('/?mode=stats')
    await importCsv(page)
    await page.getByTestId('export-open').click()
    await page.getByTestId('export-tab-share').click()
    await page.getByTestId('export-share-run').click()
    await expect(page.getByTestId('export-share-url')).toBeVisible()
    const shareUrl = await page.getByTestId('export-share-url').inputValue()
    expect(shareUrl).toContain('mode=stats')

    await page.goto(shareUrl)
    await expect(page.getByTestId('stats-panel')).toBeVisible()
    await expect(page.getByTestId('dataset-size')).toContainText('5 行 × 2 列')
    await expect(page.getByTestId('regression-equation')).toBeVisible()
  })
})
