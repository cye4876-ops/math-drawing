import { expect, test } from '@playwright/test'

test.describe('v0.5 边赋权（边列表）', () => {
  test('修改权重：DSL 回写 + Prim 总权重生效（5 + 1 = 6）', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B, B-C'))
    await expect(page.getByTestId('edge-panel')).toBeVisible()
    await expect(page.getByTestId('edge-weight-0')).toHaveValue('')

    await page.getByTestId('edge-weight-0').fill('5')
    await page.getByTestId('edge-weight-0').press('Enter')
    // 结构签名含权重 → DSL 文本回写 A-B:5
    await expect(page.getByTestId('graph-dsl')).toHaveValue(/A-B:5/)

    // Prim：A-B(5) + B-C(默认 1) = 6
    await page.getByTestId('algorithm-select').selectOption('prim')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('总权重 6')
  })

  test('清除权重回到无权（默认 1）；Dijkstra 结果随权重变化', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B:3, B-C:3, A-C:10'))
    await page.getByTestId('algorithm-select').selectOption('dijkstra')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    // A→B→C = 6 < A→C = 10
    await expect(page.getByTestId('algorithm-result')).toContainText('C：6')

    // 清除 A-B 权重 → 无权（=1）→ A→C = 4
    await page.getByTestId('edge-clear-0').click()
    await expect(page.getByTestId('graph-dsl')).toHaveValue(/A-B(?!:)/)
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('C：4')
  })

  test('有向边在列表中显示方向标记；支持负数权重', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A->B:2'))
    await expect(page.getByTestId('edge-item').first()).toContainText('→')
    // 负数权重（合法输入）→ 提交后 DSL 回写
    await page.getByTestId('edge-weight-0').fill('-3')
    await page.getByTestId('edge-weight-0').press('Enter')
    await expect(page.getByTestId('graph-dsl')).toHaveValue(/A->B:-3/)
  })
})
