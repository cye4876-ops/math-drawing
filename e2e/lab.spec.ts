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

    // 结果条：范围穷举完成 + 已证最优（同构类完整）
    await expect(page.getByText('范围穷举完成', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('已证最优（同构类完整）')).toBeVisible()

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

  test('v3.0 对照样例：普通禁 C₄（最大 4 边）与诱导禁 C₄（可达 6 边）', async ({ page }) => {
    await openLab(page)
    // 普通包含：n = 4 → 最优 m = 4
    await page.getByTestId('lab-template-c4-ord').click()
    await expect(page.getByTestId('lab-graph-title')).toHaveValue(
      '对照·普通禁 C₄（n=4，最大 4 边）',
    )
    await page.getByTestId('lab-graph-run').click()
    await expect(page.getByText('范围穷举完成', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('lab-candidate').first()).toContainText('m = 4')
    // 诱导包含：n = 4 → 可达 m = 6（K₄）
    await page.getByTestId('lab-template-c4-ind').click()
    await page.getByTestId('lab-graph-run').click()
    await expect(page.getByText('范围穷举完成', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('lab-candidate').first()).toContainText('m = 6')
    // 对照说明常显
    await expect(page.getByTestId('lab-c4-compare-hint')).toContainText('诱导')
  })

  test('v3.0 目标定义与证据标签：选择新目标显示数学定义；结果条分离证据标注', async ({ page }) => {
    await openLab(page)
    // 目标下拉：新增 q(Q) 与 λ₂(L)，选中后展示定义
    await page
      .locator('select')
      .filter({ hasText: '最大代数连通度' })
      .selectOption('max_algebraic_connectivity')
    await expect(page.getByTestId('lab-objective-def')).toContainText('λ₂')
    await page
      .locator('select')
      .filter({ hasText: '最大无符号 Laplacian 谱半径' })
      .selectOption('max_signless_laplacian_radius')
    await expect(page.getByTestId('lab-objective-def')).toContainText('D + A')
    // 用普通禁 C₄ 小实验跑出结果：证据行同时标注结构枚举与谱比较
    await page.getByTestId('lab-template-c4-ord').click()
    await page.getByTestId('lab-graph-run').click()
    await expect(page.getByText('范围穷举完成', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('lab-evidence-line')).toContainText('结构枚举')
    await expect(page.getByTestId('lab-evidence-line')).toContainText('谱比较')
  })

  test('v3.0 结构条件：围长下限 + 色数上限输入并参与搜索（校验即时反馈）', async ({ page }) => {
    await openLab(page)
    await page.getByText('结构条件（围长 / 直径 / 色数）').click()
    await page.getByTestId('lab-graph-min-girth').fill('5')
    await page.getByTestId('lab-graph-max-chromatic').fill('3')
    // 计划预览仍可用（条件不改变生成期界）
    await expect(page.getByTestId('lab-graph-plan')).toBeVisible()
    // 非法值（围长 2）触发校验提示
    await page.getByTestId('lab-graph-min-girth').fill('2')
    await page.getByTestId('lab-graph-run').click()
    await expect(page.getByTestId('lab-panel')).toContainText('围长下限')
  })

  test('v3.1 续算与各阶汇总：预算耗尽 → 继续计算按钮 + 汇总表', async ({ page }) => {
    await openLab(page)
    // n = 8 无三角形 + 1 秒时间预算：必然未完成
    await page.getByText('8 阶无三角形', { exact: true }).click()
    await page.getByText('预算', { exact: true }).click()
    await page.getByTestId('lab-graph-time-limit').fill('1')
    await page.getByTestId('lab-graph-run').click()
    // 未完成：显示“不视为已证最优”与续算按钮
    await expect(page.getByTestId('lab-graph-resume')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('lab-view')).toContainText('不视为已证最优')
    // 各阶汇总表：n = 8 行（未完成）
    const summary = page.getByTestId('lab-summary-table')
    await expect(summary).toBeVisible()
    await expect(summary).toContainText('8')
    // 续算（沿用已完成阶）：返回未完成态后按钮再次可见
    await page.getByTestId('lab-graph-resume').click()
    await expect(page.getByTestId('lab-graph-resume')).toBeVisible({ timeout: 30_000 })
  })

  test('v3.1 平面性条件：无三角形 n=6 要求平面 → 最优 8 边（K₃,₃ 被排除）', async ({ page }) => {
    await openLab(page)
    await page.getByText('禁图与图性质').click()
    await page.getByTestId('lab-graph-planar').selectOption('yes')
    await page.getByTestId('lab-graph-run').click()
    await expect(page.getByText('范围穷举完成', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('lab-candidate').first()).toContainText('m = 8')
    // 汇总表结构标签注明“平面”
    await expect(page.getByTestId('lab-summary-table')).toContainText('平面')
  })
})
