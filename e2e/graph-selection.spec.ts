import { expect, test } from '@playwright/test'

test.describe('v0.5 点击选中编辑（画布 → 图面板卡片）', () => {
  async function setup(page: import('@playwright/test').Page) {
    await page.goto('/?graph=' + encodeURIComponent('A-B:3'))
    await page.getByTestId('tool-graph').click()
    const box = await page.getByTestId('stage-canvas').boundingBox()
    expect(box).not.toBeNull()
    // 环形布局 2 点：A 在 (3,0)、B 在 (-3,0)，scale 80 → 屏幕 cx±240
    return {
      cx: box!.x + box!.width / 2,
      cy: box!.y + box!.height / 2,
    }
  }

  test('单击边 → 赋权 → 清除权重 → 删除边', async ({ page }) => {
    const { cx, cy } = await setup(page)

    // 单击边中点
    await page.mouse.click(cx, cy)
    await expect(page.getByTestId('selection-card')).toBeVisible()
    await expect(page.getByTestId('selection-label')).toContainText('—')

    // 赋权 5 → DSL 回写 :5
    const weightInput = page.getByTestId('selection-weight')
    await weightInput.fill('5')
    await weightInput.press('Enter')
    await expect(page.getByTestId('graph-dsl')).toHaveValue(/(A-B|B-A):5/, { timeout: 5000 })

    // 清除权重 → DSL 回到无权重形式
    await page.getByTestId('selection-clear-weight').click()
    await expect(page.getByTestId('graph-dsl')).toHaveValue(/^(A-B|B-A)$/m, { timeout: 5000 })

    // 删除边
    await page.getByTestId('selection-delete').click()
    await expect(page.getByTestId('selection-card')).toBeHidden()
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('0')

    // 撤销恢复边
    await page.getByTestId('undo').click()
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('1')
  })

  test('单击节点 → 删除节点（连同关联边）→ 卡片消失', async ({ page }) => {
    const { cx, cy } = await setup(page)

    await page.mouse.click(cx + 240, cy)
    await expect(page.getByTestId('selection-card')).toBeVisible()
    await expect(page.getByTestId('selection-label')).toHaveText('A')
    await expect(page.getByTestId('selection-card')).toContainText('1 条边')

    await page.getByTestId('selection-delete').click()
    await expect(page.getByTestId('selection-card')).toBeHidden()
    await expect(page.getByTestId('tool-readout-value').nth(0)).toHaveText('1')
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('0')
  })

  test('点击空白清除选中并新建顶点；取消选择按钮', async ({ page }) => {
    const { cx, cy } = await setup(page)

    // 单击边 → 卡片出现；点击空白 → 卡片消失 + 顶点 +1
    await page.mouse.click(cx, cy)
    await expect(page.getByTestId('selection-card')).toBeVisible()
    await page.mouse.click(cx, cy + 200)
    await expect(page.getByTestId('selection-card')).toBeHidden()
    await expect(page.getByTestId('tool-readout-value').nth(0)).toHaveText('3')

    // 再选边 → 取消选择按钮
    await page.mouse.click(cx, cy)
    await expect(page.getByTestId('selection-card')).toBeVisible()
    await page.getByTestId('selection-clear').click()
    await expect(page.getByTestId('selection-card')).toBeHidden()
  })
})
