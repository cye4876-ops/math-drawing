/**
 * v3.2 图分析 e2e：中心性 / 社区发现 / 连通度 / 围长直径 / 自同构 / 平面嵌入布局。
 */
import { expect, test } from '@playwright/test'

const pageFor = (dsl: string): string => '/?mode=graph&graph=' + encodeURIComponent(dsl)

test.describe('v3.2 图分析（NetworkX 对齐）', () => {
  test('中心性：星图度中心性中心 = 1（表格 + 说明 + 着色不报错）', async ({ page }) => {
    await page.goto(pageFor('H-A, H-B, H-C, H-D'))
    await page.getByTestId('analysis-metric').selectOption('degree')
    await page.getByTestId('analysis-run').click()
    const table = page.getByTestId('analysis-table')
    await expect(table).toContainText('H')
    await expect(table).toContainText('1.000')
    await expect(page.getByTestId('analysis-note')).toContainText('度中心性')
    await page.getByTestId('analysis-color').click()
    await page.getByTestId('analysis-clear').click()
  })

  test('社区发现：两个三角形 + 桥 → 2 社区，Q = 0.3571（networkx 核验）', async ({ page }) => {
    await page.goto(pageFor('1-2, 2-3, 3-1, 4-5, 5-6, 6-4, 3-4'))
    await page.getByTestId('community-run').click()
    await expect(page.getByTestId('community-info')).toContainText('社区数 2')
    await expect(page.getByTestId('community-info')).toContainText('0.3571')
    await page.getByTestId('community-color').click()
  })

  test('连通度：K4 κ = λ = 3；围长/直径：C4 围长 4、直径 2', async ({ page }) => {
    await page.goto(pageFor('A-B, A-C, A-D, B-C, B-D, C-D'))
    await page.getByTestId('connectivity-run').click()
    await expect(page.getByTestId('connectivity-result')).toContainText('κ = 3')
    await expect(page.getByTestId('connectivity-result')).toContainText('λ = 3')

    await page.goto(pageFor('A-B, B-C, C-D, D-A'))
    await page.getByTestId('invariants-run').click()
    await expect(page.getByTestId('invariants-result')).toContainText('围长 = 4')
    await expect(page.getByTestId('invariants-result')).toContainText('直径 = 2')
  })

  test('自同构：K4 |Aut(G)| = 24（预算是完整的）', async ({ page }) => {
    await page.goto(pageFor('A-B, A-C, A-D, B-C, B-D, C-D'))
    await page.getByTestId('automorphism-run').click()
    await expect(page.getByTestId('automorphism-count')).toContainText('24')
    await expect(page.getByTestId('automorphism-count')).not.toContainText('未完成')
  })

  test('平面嵌入布局：C4 成功重排；K5 明确报非平面', async ({ page }) => {
    await page.goto(pageFor('A-B, B-C, C-D, D-A'))
    const before = await page
      .getByTestId('stage-canvas')
      .evaluate((el) => (el as HTMLCanvasElement).width)
    expect(before).toBeGreaterThan(0)
    await page.getByTestId('layout-planar').click()
    await expect(page.getByTestId('layout-error')).toHaveCount(0)

    await page.goto(pageFor('1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5'))
    await page.getByTestId('layout-planar').click()
    await expect(page.getByTestId('layout-error')).toContainText('非平面')
  })
})
