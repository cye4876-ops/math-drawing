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

  test('参数滑块：探索参数变化后可直接调值（预览→提交→一步撤销）', async ({ page }) => {
    await page.goto('/?mode=plot')
    await page.getByTestId('welcome-params').click()
    await expect(page.getByTestId('curve-param-a')).toBeVisible()
    await expect(page.getByTestId('curve-param-b')).toBeVisible()
    await expect(page.getByTestId('curve-param-value-a')).toHaveText('1.5')
    await expect(page.getByTestId('curve-param-value-b')).toHaveText('2')

    const slider = page.getByTestId('curve-param-a')
    await slider.evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '3'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await slider.evaluate((element) => {
      element.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByTestId('curve-param-value-a')).toHaveText('3')

    await page.getByTestId('undo').click()
    await expect(page.getByTestId('curve-param-value-a')).toHaveText('1.5')
    await expect(page.getByTestId('curve-error')).toHaveCount(0)
  })

  test('矩阵模式：画布可见且计算可出结果（防主区域空白回归）', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await expect(page.getByTestId('matrix-canvas')).toBeVisible()
    await page.getByTestId('matrix-run').click()
    await expect(page.getByTestId('matrix-results')).toBeVisible()
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

  test('主题：默认浅色，可切换深色并持久化', async ({ page }) => {
    await page.goto('/?mode=plot')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByTestId('toggle-theme').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('示例项目：工具栏打开画廊并一键应用', async ({ page }) => {
    await page.goto('/?mode=plot')
    await page.getByTestId('open-examples').click()
    await expect(page.getByTestId('examples-dialog')).toBeVisible()
    await page.getByTestId('example-sine').click()
    await expect(page.getByTestId('examples-dialog')).toHaveCount(0)
    await expect(page.getByTestId('curve-item')).toHaveCount(1)
  })

  test('快捷键提示：打开与关闭', async ({ page }) => {
    await page.goto('/?mode=plot')
    await page.getByTestId('shortcuts-help').click()
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible()
    await page.getByTestId('shortcuts-close').click()
    await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0)
  })

  test('保存状态：默认已保存 → 编辑转未保存 → 保存项目后恢复', async ({ page }) => {
    await page.goto('/?mode=plot')
    await expect(page.getByTestId('save-state')).toContainText('已保存')
    await page.getByTestId('welcome-draw').click()
    await expect(page.getByTestId('save-state')).toContainText('未保存')
    const download = page.waitForEvent('download')
    await page.getByTestId('export-json').click()
    await download
    await expect(page.getByTestId('save-state')).toContainText('已保存')
    await expect(page.getByTestId('save-state')).not.toContainText('未保存')
  })

  test('输入反馈：草稿表达式实时校验与参数提示', async ({ page }) => {
    await page.goto('/?mode=plot')
    await page.getByTestId('curve-expr-input').fill('a * sin(b * x)')
    await expect(page.getByTestId('draft-ok')).toContainText('参数 a、b')
    await page.getByTestId('curve-expr-input').fill('sin(')
    await expect(page.getByTestId('draft-error')).toBeVisible()
    await expect(page.getByTestId('draft-ok')).toHaveCount(0)
  })

  test('课堂演示模式：进入与 Esc 退出', async ({ page }) => {
    await page.goto('/?mode=plot')
    await page.getByTestId('enter-presentation').click()
    await expect(page.locator('body')).toHaveClass(/presentation-mode/)
    await expect(page.getByTestId('presentation-exit')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/)
  })
})
