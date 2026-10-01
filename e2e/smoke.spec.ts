import { expect, test } from '@playwright/test'

test.describe('v0.1 冒烟测试', () => {
  test('页面加载后可见画布与工具条', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('stage-canvas')).toBeVisible()
    await expect(page.getByRole('toolbar')).toBeVisible()
  })

  test('添加标记 → 撤销 → 重做', async ({ page }) => {
    await page.goto('/')
    const markers = page.getByTestId('marker')
    await expect(markers).toHaveCount(0)

    await page.getByTestId('add-marker').click()
    await expect(markers).toHaveCount(1)

    await page.getByTestId('undo').click()
    await expect(markers).toHaveCount(0)

    await page.getByTestId('redo').click()
    await expect(markers).toHaveCount(1)
  })

  test('键盘快捷键：Ctrl+Z 撤销、Ctrl+Shift+Z 重做', async ({ page }) => {
    await page.goto('/')
    const markers = page.getByTestId('marker')

    await page.getByTestId('add-marker').click()
    await page.getByTestId('add-marker').click()
    await expect(markers).toHaveCount(2)

    await page.keyboard.press('Control+z')
    await expect(markers).toHaveCount(1)

    await page.keyboard.press('Control+Shift+z')
    await expect(markers).toHaveCount(2)
  })

  test('拖拽平移移动内容，且视图操作不入撤销历史', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('add-marker').click()

    const before = await page.getByTestId('marker').boundingBox()
    const canvas = await page.getByTestId('stage-canvas').boundingBox()
    expect(before).not.toBeNull()
    expect(canvas).not.toBeNull()

    // 从画布空白处开始拖动平移（坐标轴已固定不可拖动）
    const startX = canvas!.x + canvas!.width / 2 + 150
    const startY = canvas!.y + canvas!.height / 2 + 120
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - 100, startY - 60, { steps: 5 })
    await page.mouse.up()

    // 内容跟随指针移动
    const after = await page.getByTestId('marker').boundingBox()
    expect(after).not.toBeNull()
    expect(after!.x - before!.x).toBeCloseTo(-100, 0)
    expect(after!.y - before!.y).toBeCloseTo(-60, 0)

    // 撤销栈里应只有一次"添加"操作：撤销后不可再撤销（证明平移未入历史）
    await page.getByTestId('undo').click()
    await expect(page.getByTestId('marker')).toHaveCount(0)
    await expect(page.getByTestId('undo')).toBeDisabled()
  })

  test('标记点与坐标系对齐（DOM 覆盖层与 Canvas 层坐标系一致）', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('add-marker').click()

    const canvas = await page.getByTestId('stage-canvas').boundingBox()
    const marker = await page.getByTestId('marker').boundingBox()
    expect(canvas).not.toBeNull()
    expect(marker).not.toBeNull()

    // 标记添加在视图中心，应与画布中心重合
    const canvasCenter = { x: canvas!.x + canvas!.width / 2, y: canvas!.y + canvas!.height / 2 }
    const markerCenter = { x: marker!.x + marker!.width / 2, y: marker!.y + marker!.height / 2 }
    expect(Math.abs(markerCenter.x - canvasCenter.x)).toBeLessThan(2)
    expect(Math.abs(markerCenter.y - canvasCenter.y)).toBeLessThan(2)
  })

  test('滚轮缩放改变缩放级别', async ({ page }) => {
    await page.goto('/')
    const readout = page.getByTestId('scale-readout')
    const before = await readout.textContent()

    await page.mouse.move(400, 300)
    await page.mouse.wheel(0, -400)
    await expect(readout).not.toHaveText(before ?? '')
  })
})

test.describe('高分屏（devicePixelRatio=2）', () => {
  test.use({ deviceScaleFactor: 2 })

  test('画布物理像素为 CSS 尺寸的 2 倍', async ({ page }) => {
    await page.goto('/')
    const metrics = await page.getByTestId('stage-canvas').evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      return { width: canvas.width, clientWidth: canvas.clientWidth }
    })

    expect(metrics.width).toBeGreaterThan(0)
    expect(Math.abs(metrics.width - metrics.clientWidth * 2)).toBeLessThanOrEqual(2)
  })
})
