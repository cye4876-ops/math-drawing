/**
 * v3.2 代数 e2e：智能子群格（S₄/A₅）+ |Aut| + 同态视图 + 立方体 Burnside + 全部 p-子群。
 */
import { expect, test } from '@playwright/test'

async function openAlgebra(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?mode=advanced')
  await page.getByTestId('adv-tab-algebra').click()
}

test.describe('v3.2 代数增强（Sage 核验）', () => {
  test('子群格与自同构：S₄ 30 个子群、|Aut| = 24；A₅ 59 个子群、|Aut| = 120', async ({ page }) => {
    await openAlgebra(page)
    await page.getByTestId('adv-algebra-section-groups').click()
    await expect(page.getByTestId('adv-algebra-group-s4')).toBeVisible()
    await page.getByTestId('adv-algebra-group-s4').click()
    const facts = page.getByTestId('alg-group-facts')
    await expect(facts).toContainText('30 个')
    await expect(facts).toContainText('|Aut| = 24')

    await page.getByTestId('adv-algebra-group-a5').click()
    await expect(page.getByTestId('alg-group-a5')).toBeVisible()
    await expect(facts).toContainText('59 个')
    await expect(facts).toContainText('|Aut| = 120')
  })

  test('同态视图：S₃ → S₃ 共 10 个（含同构标记）；C₄ → V₄ 共 4 个', async ({ page }) => {
    await openAlgebra(page)
    await page.getByTestId('adv-algebra-section-morph').click()
    await page.getByTestId('adv-morph-source').selectOption('s3')
    await page.getByTestId('adv-morph-target').selectOption('s3')
    await expect(page.getByTestId('alg-morph-summary')).toContainText('10')
    await expect(page.getByTestId('alg-morph-table').locator('tbody tr')).toHaveCount(10)
    await expect(page.getByTestId('alg-morph-table')).toContainText('同构')

    await page.getByTestId('adv-morph-source').selectOption('c4')
    await page.getByTestId('adv-morph-target').selectOption('v4')
    await expect(page.getByTestId('alg-morph-summary')).toContainText('4')
  })

  test('立方体旋转群 Burnside：面 2 色 = 10、3 色 = 57；顶点 3 色 = 333', async ({ page }) => {
    await openAlgebra(page)
    await page.getByTestId('adv-algebra-section-actions').click()
    await expect(page.getByTestId('alg-poly-burnside')).toContainText('10')
    await page.getByTestId('alg-poly-colors-3').click()
    await expect(page.getByTestId('alg-poly-burnside')).toContainText('57')
    await page.getByTestId('alg-poly-target-vertices').click()
    await expect(page.getByTestId('alg-poly-burnside')).toContainText('333')
  })

  test('Sylow 工作台：A₄ 的全部 2-子群 5 个（平凡 1 + 3 个 C₂ + V₄）', async ({ page }) => {
    await openAlgebra(page)
    await page.getByTestId('adv-algebra-section-sylow').click()
    const list = page.locator('[data-testid^="alg-sylow-p-"]')
    await expect(list).toHaveCount(5)
    await expect(page.getByTestId('alg-sylow-all-p')).toContainText('|H| = 4')
  })
})
