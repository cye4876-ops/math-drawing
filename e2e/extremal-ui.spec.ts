import { expect, test } from '@playwright/test'

async function openExtremal(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?mode=hyper')
  await page.getByTestId('hyper-tab-extremal').click()
  await expect(page.getByTestId('extremal-run')).toBeVisible()
}

test.describe('v3.9 极值性能与工程优化', () => {
  test('ex 总表热力图：生成、单元格运行与 CSV/JSON 导出', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-table-build').click()
    await expect(page.getByTestId('extremal-table')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('extremal-table-cell-6-K3')).toHaveText('9')
    await page.getByTestId('extremal-table-cell-6-C4').click()
    await expect(page.getByTestId('extremal-result')).toContainText('ex(6, C₄（4 圈）) = 7')

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('extremal-table-csv').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('extremal-table.csv')

    const jsonDownloadPromise = page.waitForEvent('download')
    await page.getByTestId('extremal-table-json').click()
    const jsonDownload = await jsonDownloadPromise
    expect(jsonDownload.suggestedFilename()).toBe('extremal-table.json')
  })

  test('全量极图画廊分页、graph6/不变量信息与载入图论画布', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-n').fill('7')
    await page.getByTestId('extremal-pattern').selectOption('custom')
    await page.getByTestId('extremal-custom-format').selectOption('graph6')
    await page.getByTestId('extremal-custom').fill('D]w')
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 12')
    await expect(page.getByTestId('extremal-gallery-prev')).toBeDisabled()
    await expect(page.getByText(/第 1 \/ 2 页/)).toBeVisible()

    await page.getByTestId('extremal-gallery-next').click()
    await expect(page.getByText(/第 2 \/ 2 页/)).toBeVisible()
    await page.getByTestId('extremal-graph-6').click()
    await expect(page.getByTestId('extremal-graph-info')).toContainText('graph6')
    await expect(page.getByTestId('extremal-graph-info')).toContainText('χ =')
    await page.getByTestId('extremal-load-graph').click()
    await expect(page.getByTestId('mode-graph')).toHaveAttribute('aria-selected', 'true')
  })

  test('历史记录、对比与深链接恢复', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-certificate')).toContainText('证书卡片')
    await expect(page.getByTestId('extremal-certificate')).toContainText('Mantel')
    await expect(page.getByTestId('extremal-graph-info')).toContainText('ω =')
    await page.getByTestId('extremal-pattern').selectOption('C4')
    await page.getByTestId('extremal-run').click()
    await expect(page.locator('[data-testid^="extremal-history-"]')).toHaveCount(4)

    await page.locator('[data-testid^="extremal-history-compare-"]').first().click()
    await expect(page.getByTestId('extremal-compare')).toBeVisible()

    await page.goto('/?mode=hyper&extremal=6&pattern=K3&semantics=subgraph')
    await expect(page.getByTestId('hyper-tab-extremal')).toHaveClass(/active/)
    await expect(page.getByTestId('extremal-result')).toContainText('= 9')
    await expect(page.getByTestId('extremal-share-url')).toHaveValue(/extremal=6/)
  })

  test('n=8 按需图集与 Worker：ex(8,K₃)=16', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-n').fill('8')
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 16', { timeout: 20_000 })
    await expect(page.getByTestId('extremal-result')).toContainText('12346')
  })

  test('n>8 启发式下界与自定义 3-一致超图', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-heuristic-n').fill('9')
    await page.getByTestId('extremal-heuristic-run').click()
    await expect(page.getByTestId('extremal-heuristic-result')).toContainText('≥ 20')

    await page.getByTestId('hyperex-custom-run').click()
    await expect(page.getByTestId('hyperex-result')).toContainText('= 10')
    await expect(page.getByTestId('hyperex-result')).toContainText('禁例 120 个')
  })

  test('Ramsey 任意小禁图：选择 K₄ 仍给出证书/不存在结论', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('ramsey-n').fill('6')
    await page.getByTestId('ramsey-pattern').selectOption('K4')
    await page.getByTestId('ramsey-run').click()
    await expect(page.getByTestId('ramsey-result')).toContainText('K6')
    await expect(page.getByTestId('ramsey-known')).toContainText('R(3,3)=6')
  })

  test('画布顶点点击信息与 2-截面预览', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-run').click()
    const canvas = page.getByTestId('hyper-canvas')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      const radius = Math.max(80, Math.min(box.width, box.height) * 0.32)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 6 - radius)
    }
    await expect(page.getByTestId('extremal-canvas-selection')).toContainText('顶点 0')

    await page.getByTestId('hyperex-run').click()
    await page.getByTestId('hyperex-preview-section').click()
    await expect(page.getByTestId('extremal-preview-title')).toContainText('2-截面')
    await expect(canvas).toBeVisible()
  })
})
