import { expect, test } from '@playwright/test'

test.describe('v0.5 图编辑工具', () => {
  test('全流程：点击建点 → 拖拽连边 → 拖动节点 → 逐步撤销', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('tool-graph').click()
    await expect(page.getByTestId('tool-readout-title')).toContainText('图编辑')

    const box = await page.getByTestId('stage-canvas').boundingBox()
    expect(box).not.toBeNull()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2
    const ax = { x: cx - 120, y: cy - 80 }
    const bx = { x: cx + 120, y: cy - 80 }

    // 建三个顶点
    await page.mouse.click(ax.x, ax.y)
    await page.mouse.click(bx.x, bx.y)
    await page.mouse.click(cx, cy + 100)
    await expect(page.getByTestId('tool-readout-value').nth(0)).toHaveText('3')

    // 连边模式：A → B
    await page.getByTestId('tool-control-mode-connect').click()
    await page.mouse.move(ax.x, ax.y)
    await page.mouse.down()
    await page.mouse.move(bx.x, bx.y, { steps: 5 })
    await page.mouse.up()
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('1')

    // 移动模式：拖动 A 到新位置（一步撤销）
    await page.getByTestId('tool-control-mode-move').click()
    await page.mouse.move(ax.x, ax.y)
    await page.mouse.down()
    await page.mouse.move(ax.x - 80, ax.y - 60, { steps: 5 })
    await page.mouse.up()

    // 撤销 4 次：拖动 1 + 连边 1 + 建点 2 → 剩 1 顶点 0 边
    for (let i = 0; i < 4; i++) await page.getByTestId('undo').click()
    await expect(page.getByTestId('tool-readout-value').nth(0)).toHaveText('1')
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('0')
  })

  test('右键删除节点（连带关联边）；删除模式点击节点/边', async ({ page }) => {
    // 预载 A-B（环形布局 2 点：A 在 (3,0)、B 在 (-3,0)，scale 80）
    await page.goto('/?graph=' + encodeURIComponent('A-B:3'))
    await page.getByTestId('tool-graph').click()

    const box = await page.getByTestId('stage-canvas').boundingBox()
    expect(box).not.toBeNull()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    // 右键删除 A（连带与其关联的边）
    await page.mouse.click(cx + 3 * 80, cy, { button: 'right' })
    await expect(page.getByTestId('tool-readout-value').nth(0)).toHaveText('1')
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('0')

    // 撤销恢复（读数随文档刷新）
    await page.getByTestId('undo').click()
    await expect(page.getByTestId('tool-readout-value').nth(0)).toHaveText('2')
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('1')

    // 删除模式：点击 B 删除
    await page.getByTestId('tool-control-mode-delete').click()
    await page.mouse.click(cx - 3 * 80, cy)
    await expect(page.getByTestId('tool-readout-value').nth(0)).toHaveText('1')
  })

  test('有向边类型生效（导出 JSON 验证）', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('tool-graph').click()
    const box = await page.getByTestId('stage-canvas').boundingBox()
    expect(box).not.toBeNull()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    await page.mouse.click(cx - 100, cy)
    await page.mouse.click(cx + 100, cy)
    await page.getByTestId('tool-control-mode-connect').click()
    await page.getByTestId('tool-control-edge-directed').click()
    await page.mouse.move(cx - 100, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 100, cy, { steps: 4 })
    await page.mouse.up()
    await expect(page.getByTestId('tool-readout-value').nth(1)).toHaveText('1')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-json').click(),
    ])
    const text = await (
      await download.createReadStream()
    )
      .toArray()
      .then((chunks) => Buffer.concat(chunks).toString('utf8'))
    const parsed = JSON.parse(text) as {
      objects: { type: string; edges: { directed: boolean }[] }[]
    }
    const graph = parsed.objects.find((object) => object.type === 'graph')
    expect(graph!.edges[0]!.directed).toBe(true)
  })
})
