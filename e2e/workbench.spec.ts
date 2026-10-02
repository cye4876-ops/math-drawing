import { expect, test } from '@playwright/test'

test.describe('v2.4 工作台改版（布局 / 首屏引导 / 命名）', () => {
  test('首屏引导：函数绘图空文档显示三个入口', async ({ page }) => {
    await page.goto('/?mode=plot')
    await expect(page.getByTestId('welcome-overlay')).toBeVisible()
    await expect(page.getByTestId('welcome-draw')).toBeVisible()
    await expect(page.getByTestId('welcome-params')).toBeVisible()
    await expect(page.getByTestId('welcome-example')).toBeVisible()
  })

  test('入口「画一个函数」：添加 sin(x) 曲线并自动关闭引导', async ({ page }) => {
    await page.goto('/?mode=plot')
    await page.getByTestId('welcome-draw').click()
    await expect(page.getByTestId('welcome-overlay')).toHaveCount(0)
    await expect(page.getByTestId('curve-item')).toHaveCount(1)
  })

  test('入口「探索参数变化」：添加含参数曲线', async ({ page }) => {
    await page.goto('/?mode=plot')
    await page.getByTestId('welcome-params').click()
    await expect(page.getByTestId('welcome-overlay')).toHaveCount(0)
    await expect(page.getByTestId('curve-expr').first()).toHaveValue('a * sin(b * x)')
  })

  test('入口「打开示例项目」：应用正弦曲线入门示例', async ({ page }) => {
    await page.goto('/?mode=plot')
    await page.getByTestId('welcome-example').click()
    await expect(page.getByTestId('welcome-overlay')).toHaveCount(0)
    await expect(page.getByTestId('curve-item')).toHaveCount(1)
  })

  test('侧栏收起/展开：隐藏与恢复编辑面板', async ({ page }) => {
    await page.goto('/?mode=plot')
    await expect(page.getByTestId('side-column')).toBeVisible()
    await page.getByTestId('toggle-sidebar').click()
    await expect(page.getByTestId('side-column')).toBeHidden()
    await page.getByTestId('toggle-sidebar').click()
    await expect(page.getByTestId('side-column')).toBeVisible()
  })

  test('命名更直观：保存/打开项目、数学专题、笔记本', async ({ page }) => {
    await page.goto('/?mode=plot')
    await expect(page.getByTestId('export-json')).toHaveText('保存项目')
    await expect(page.getByTestId('import-json-button')).toContainText('打开项目')
    await expect(page.getByTestId('mode-advanced')).toContainText('数学专题')
    await expect(page.getByTestId('mode-notebook')).toContainText('笔记本')
  })

  test('图论空态折叠：无图时收起性质/谱/算法面板，建图后恢复', async ({ page }) => {
    await page.goto('/?mode=graph')
    await expect(page.getByTestId('graph-stats')).toContainText('暂无图')
    await expect(page.getByTestId('property-panel')).toHaveCount(0)
    await expect(page.getByTestId('spectrum-panel')).toHaveCount(0)
    await expect(page.getByTestId('algorithm-select')).toHaveCount(0)

    await page.getByTestId('family-generate').click()
    await expect(page.getByTestId('property-panel')).toBeVisible()
    await expect(page.getByTestId('spectrum-panel')).toBeVisible()
    await expect(page.getByTestId('algorithm-select')).toBeVisible()
  })

  test('3D 面板分区：视图/分析/导出标题齐全', async ({ page }) => {
    await page.goto('/?mode=space')
    const side = page.getByTestId('side-column')
    await expect(side.getByText('分析', { exact: true }).first()).toBeVisible()
    await expect(side.getByText('导出', { exact: true }).first()).toBeVisible()
    await expect(page.getByTestId('space-reset-camera')).toBeVisible()
    await expect(page.getByTestId('space-tangent')).toBeVisible()
  })

  test('窄窗口布局：画布在上、编辑面板在下（纵向堆叠）', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 })
    await page.goto('/?mode=plot')
    const direction = await page
      .locator('.main')
      .evaluate((element) => getComputedStyle(element).flexDirection)
    expect(direction).toBe('column')
  })
})
