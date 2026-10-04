import { expect, test, type Page } from '@playwright/test'

/**
 * v2.7 图论实验台 e2e：
 * 搜索 → 候选详情 → 送绘图；超图分析（Fano 基准）与搜索；档案保存与持久化。
 */

async function openLab(page: Page): Promise<void> {
  await page.goto('/?mode=lab')
  await expect(page.getByTestId('lab-panel')).toBeVisible()
}

test.describe('v2.7 图论实验台', () => {
  test('普通图搜索：默认无三角形 n=6 → 唯一候选 K₃,₃ 并可送入绘图', async ({ page }) => {
    await openLab(page)

    // 计划预览显示 Mantel 界（n = 6 → 边数 0…9）
    await expect(page.getByTestId('lab-graph-plan')).toContainText('边数 0 … 9')

    await page.getByTestId('lab-graph-run').click()

    // 结果条：范围穷举完成 + 有限极值（同构类完整）
    await expect(page.getByText('范围穷举完成', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('有限极值（同构类完整）')).toBeVisible()

    // 唯一候选：m = 9
    const candidate = page.getByTestId('lab-candidate').first()
    await expect(candidate).toBeVisible()
    await expect(candidate).toContainText('m = 9')

    // 详情：精确特征多项式 A = λ⁶ − 9λ⁴（系数 1 0 -9 0 0 0 0）
    await candidate.click()
    const detail = page.getByTestId('lab-detail')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('度序列：3 3 3 3 3 3')
    await expect(detail).toContainText('1  0  -9  0  0  0  0')
    // 复核明细：顶点数与禁图检查通过
    await expect(detail).toContainText('✓ 不含 K₃（三角形）')

    // 送入绘图模式：注入 6 顶点 9 边图对象
    await page.getByTestId('lab-open-graph').click()
    await expect(page.getByTestId('mode-graph')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('顶点 6 · 边 9')).toBeVisible()
  })

  test('超图分析：Fano 平面 ν=1、τ=3、α=4 与精确 BBᵀ 谱', async ({ page }) => {
    await openLab(page)
    await page.getByTestId('lab-tab-hyper').click()

    // 默认预填 Fano 超边；直接分析
    await page.getByTestId('lab-analysis-run').click()

    const view = page.getByTestId('lab-view')
    await expect(view).toContainText('超图分析')
    await expect(view).toContainText('3 一致')
    await expect(view).toContainText('匹配数 ν')
    await expect(view).toContainText('1（最大匹配：[0 1 2]）')
    await expect(view).toContainText('3（最小覆盖顶点')
    await expect(view).toContainText('4（最大弱独立集')
    // BBᵀ 精确整数系数（Sage 对照：1 -21 168 -700 1680 -2352 1792 -576）
    await expect(view).toContainText('1  -21  168  -700  1680  -2352  1792  -576')
    // 特征值 9 与六个 2（降序显示前 8 个）
    await expect(view).toContainText('9.000000，2.000000')
  })

  test('超图搜索：六点线性 3 一致极值 → m = 4 唯一候选', async ({ page }) => {
    await openLab(page)
    await page.getByTestId('lab-tab-hyper').click()
    await page.getByTestId('lab-hyper-run').click()

    await expect(page.getByText('范围穷举完成', { exact: true })).toBeVisible({ timeout: 15_000 })
    const candidate = page.getByTestId('lab-hyper-candidate').first()
    await expect(candidate).toBeVisible()
    await expect(candidate).toContainText('m = 4')
    await expect(candidate).toContainText('ν=1')
  })

  test('档案：保存搜索结果并跨刷新持久化', async ({ page }) => {
    await openLab(page)
    await page.getByTestId('lab-graph-run').click()
    await expect(page.getByText('范围穷举完成', { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('lab-graph-archive').click()

    await page.getByTestId('lab-tab-archive').click()
    await expect(page.getByTestId('lab-archive-notice')).toContainText('实验已保存到档案')
    const item = page.getByTestId('lab-archive-item').first()
    await expect(item).toBeVisible()
    await expect(item).toContainText('无三角形图的边数极值')
    await expect(item).toContainText('完整')

    // 刷新后仍存在（localStorage 持久化）
    await page.reload()
    await expect(page.getByTestId('lab-panel')).toBeVisible()
    await page.getByTestId('lab-tab-archive').click()
    await expect(page.getByTestId('lab-archive-item').first()).toContainText('无三角形图的边数极值')
  })
})
