import { expect, test, type Page } from '@playwright/test'

/** 统计画布上的高亮琥珀色（#f59e0b = rgb(245,158,11)）像素数 */
async function countHighlightPixels(page: Page): Promise<number> {
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
      if (Math.abs(r - 245) < 40 && Math.abs(g - 158) < 40 && Math.abs(b - 11) < 40) count++
    }
    return count
  })
}

test.describe('v0.5 算法 UI 播放器（阶段 5b）', () => {
  test('BFS：运行 → 首步高亮与 note → 单步 → 到末尾显示访问顺序', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await expect(page.getByTestId('algorithm-panel')).toBeVisible()

    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-progress')).toContainText('1 /')
    await expect(page.getByTestId('algorithm-note')).toContainText('入队')
    await expect.poll(() => countHighlightPixels(page)).toBeGreaterThan(30)

    await page.getByTestId('algorithm-step').click()
    await expect(page.getByTestId('algorithm-progress')).toContainText('2 /')

    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toBeVisible()
    await expect(page.getByTestId('algorithm-result')).toContainText('访问顺序')
  })

  test('Dijkstra：距离表（D：4）与最远可达路径', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B:2, A-C:5, B-C:1, B-D:4, C-D:1'))
    await page.getByTestId('algorithm-select').selectOption('dijkstra')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('最短距离')
    await expect(page.getByTestId('algorithm-result')).toContainText('D：4')
    await expect(page.getByTestId('algorithm-result')).toContainText('路径')
  })

  test('负权 Dijkstra：拒绝执行并显示错误', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A->B:-1, B->C:2'))
    await page.getByTestId('algorithm-select').selectOption('dijkstra')
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('负权')
  })

  test('Kruskal：播放可暂停 / 到末尾显示总权重', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B:1, B-C:2, A-C:3'))
    await page.getByTestId('algorithm-select').selectOption('kruskal')
    await page.getByTestId('algorithm-run').click()

    await page.getByTestId('algorithm-play').click()
    await expect(page.getByTestId('algorithm-play')).toContainText('暂停')
    await page.getByTestId('algorithm-play').click()
    await expect(page.getByTestId('algorithm-play')).toContainText('播放')

    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('总权重 3')
  })

  test('着色（DSATUR）：无步骤算法运行即显示色数结果', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await page.getByTestId('algorithm-select').selectOption('dsatur-color')
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('3 色')
  })

  test('重置：清空进度与结果；结构变化自动重置', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3'))
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-progress')).toBeVisible()
    await page.getByTestId('algorithm-reset').click()
    await expect(page.getByTestId('algorithm-progress')).toHaveCount(0)

    // 运行后修改 DSL 结构 → 自动重置
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-progress')).toBeVisible()
    await page.getByTestId('graph-dsl').fill('1-2, 2-3, 3-4')
    await expect(page.getByTestId('algorithm-progress')).toHaveCount(0)
  })
})
