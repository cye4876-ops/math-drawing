import { expect, test } from '@playwright/test'

test.describe('v0.5 双模式界面与图面板（阶段 4）', () => {
  test('默认函数绘图模式：曲线面板可见、图编辑按钮与图面板隐藏', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mode-plot')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('curve-kind-select')).toBeVisible()
    await expect(page.getByTestId('graph-panel')).toHaveCount(0)
    await expect(page.getByTestId('tool-graph')).toHaveCount(0)
  })

  test('切到图论绘图：工具条出现图编辑、侧栏换成图面板', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('tool-tangent').click()
    await expect(page.getByTestId('tool-readout-title')).toContainText('切线')

    await page.getByTestId('mode-graph').click()
    await expect(page.getByTestId('mode-graph')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('tool-graph')).toBeVisible()
    await expect(page.getByTestId('tool-tangent')).toHaveCount(0)
    await expect(page.getByTestId('graph-panel')).toBeVisible()
    await expect(page.getByTestId('curve-kind-select')).toHaveCount(0)
  })

  test('?mode=graph 直达图论模式；切回函数绘图恢复曲线面板', async ({ page }) => {
    await page.goto('/?mode=graph')
    await expect(page.getByTestId('graph-panel')).toBeVisible()
    await page.getByTestId('mode-plot').click()
    await expect(page.getByTestId('curve-kind-select')).toBeVisible()
    await expect(page.getByTestId('graph-panel')).toHaveCount(0)
  })

  test('图族生成（K5：顶点 5 / 边 10）；DSL 输入防抖应用', async ({ page }) => {
    await page.goto('/?mode=graph')
    await page.getByTestId('family-generate').click()
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 5')
    await expect(page.getByTestId('graph-stats')).toContainText('边 10')

    await page.getByTestId('graph-dsl').fill('A-B:3, B-C, C->A')
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 3')
    await expect(page.getByTestId('graph-stats')).toContainText('边 3')
  })

  test('DSL 解析错误：显示行号提示、不改画布；修正后应用', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B'))
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 2')

    await page.getByTestId('graph-dsl').fill('A-B, ???')
    await expect(page.getByTestId('graph-dsl-error')).toBeVisible()
    await expect(page.getByTestId('graph-dsl-error')).toContainText('第 1 行')
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 2')

    await page.getByTestId('graph-dsl').fill('A-B, B-C')
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 3')
    await expect(page.getByTestId('graph-dsl-error')).toHaveCount(0)
  })

  test('画布 → DSL 反向同步：图编辑建点后文本框更新', async ({ page }) => {
    await page.goto('/?mode=graph')
    await page.getByTestId('family-generate').click()
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 5')
    // 生成后文本已回写（K5 含边 1-2）
    await expect(page.getByTestId('graph-dsl')).toHaveValue(/1-2/)

    // 图编辑：点击空白建第 6 个点（标签 1..5 后会分配 A）
    await page.getByTestId('tool-graph').click()
    const box = await page.getByTestId('stage-canvas').boundingBox()
    expect(box).not.toBeNull()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2
    await page.mouse.click(cx + 220, cy + 170)
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 6')
    await expect(page.getByTestId('graph-dsl')).toHaveValue(/(^|\n)A(\n|$)/)
  })

  test('布局：网格后坐标改变；力导向（WebWorker）完成且无错误', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 1-3, 2-3, 3-4'))
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 4')

    await page.getByTestId('layout-grid').click()
    await page.getByTestId('layout-force').click()
    // worker 完成后按钮恢复（期间为 disabled + “布局中…”）
    await expect(page.getByTestId('layout-force')).toBeEnabled({ timeout: 15000 })
    await expect(page.getByTestId('layout-error')).toHaveCount(0)

    // 导出验证：布局后不再是初始环形（半径 3 圆上的点减少）
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
      objects: { type: string; nodes: { x: number; y: number }[] }[]
    }
    const graph = parsed.objects.find((object) => object.type === 'graph')
    expect(graph).toBeDefined()
    const onCircle = graph!.nodes.filter((node) => Math.abs(Math.hypot(node.x, node.y) - 3) < 0.01)
    expect(onCircle.length).toBeLessThan(graph!.nodes.length)
  })

  test('删除此图按钮：清空图面板统计', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B'))
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 2')
    await page.getByTestId('graph-delete').click()
    await expect(page.getByTestId('graph-stats')).toContainText('暂无图')
  })
})
