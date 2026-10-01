import { expect, test } from '@playwright/test'

test.describe('标记点：输入坐标、列表滚动与删除', () => {
  test('输入坐标添加标记点，显示在列表与画布', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('marker-x-input').fill('pi/2')
    await page.getByTestId('marker-y-input').fill('1')
    await page.getByTestId('marker-add').click()

    await expect(page.getByTestId('marker-item')).toHaveCount(1)
    await expect(page.getByTestId('marker-item')).toContainText('(1.5708, 1)')
    // 画布上出现标记点
    await expect(page.getByTestId('marker')).toHaveCount(1)
  })

  test('非法输入提示且不添加', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('marker-x-input').fill('abc')
    await page.getByTestId('marker-y-input').fill('1')
    await page.getByTestId('marker-add').click()

    await expect(page.getByTestId('marker-error')).toBeVisible()
    await expect(page.getByTestId('marker-item')).toHaveCount(0)
    await expect(page.getByTestId('marker')).toHaveCount(0)
  })

  test('多个标记点时列表可上下滚动；删除按钮移除并可撤销', async ({ page }) => {
    await page.goto('/')
    for (let i = 0; i < 12; i++) {
      await page.getByTestId('marker-x-input').fill(String(i))
      await page.getByTestId('marker-y-input').fill('0')
      await page.getByTestId('marker-add').click()
    }
    await expect(page.getByTestId('marker-item')).toHaveCount(12)

    // 列表区域受限且可滚动（上下滚动）
    const scroll = await page.getByTestId('marker-items').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }))
    expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)

    // 删除第一个
    await page.getByTestId('marker-remove').first().click()
    await expect(page.getByTestId('marker-item')).toHaveCount(11)

    // 撤销恢复
    await page.getByTestId('undo').click()
    await expect(page.getByTestId('marker-item')).toHaveCount(12)
  })

  test('工具条「添加标记点」按钮仍可用（居中快捷添加）', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('add-marker').click()
    await expect(page.getByTestId('marker-item')).toHaveCount(1)
  })

  test('坐标轴固定不可拖动：轴交叉点处拖动为平移', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('add-marker').click()
    const before = await page.getByTestId('marker').boundingBox()
    const canvas = await page.getByTestId('stage-canvas').boundingBox()
    expect(before).not.toBeNull()
    expect(canvas).not.toBeNull()

    // 直接从画布中心（轴交叉点）开始拖动
    const cx = canvas!.x + canvas!.width / 2
    const cy = canvas!.y + canvas!.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx - 80, cy - 50, { steps: 4 })
    await page.mouse.up()

    // 标记点跟随指针移动 → 发生的是平移而非移动坐标轴
    const after = await page.getByTestId('marker').boundingBox()
    expect(after).not.toBeNull()
    expect(after!.x - before!.x).toBeCloseTo(-80, 0)
    expect(after!.y - before!.y).toBeCloseTo(-50, 0)
  })
})
