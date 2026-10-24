import { expect, test } from '@playwright/test'

async function openExtremal(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?mode=hyper')
  await page.getByTestId('hyper-tab-extremal').click()
  await expect(page.getByTestId('extremal-run')).toBeVisible()
}

test.describe('v3.7 极值计算台增强', () => {
  test('多禁图 {K₃,C₄}：ex=6，饱和数 sat=5', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-extra-C4').click()
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 6')
    await expect(page.getByTestId('extremal-result')).toContainText('2 张禁图')
    await expect(page.getByTestId('extremal-result')).toContainText('{')
    await expect(page.getByTestId('extremal-saturation')).toContainText('5')
    await expect(page.getByTestId('extremal-formula')).toHaveCount(0)
    await page.getByTestId('extremal-extra-clear').click()
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('1 张禁图')
  })

  test('graph6 自定义禁图：Bw=K₃，多个 graph6 得到禁图集合', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-pattern').selectOption('custom')
    await page.getByTestId('extremal-custom-format').selectOption('graph6')
    await page.getByTestId('extremal-custom').fill('Bw')
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 9')
    await expect(page.getByTestId('extremal-formula')).toContainText('Mantel')
    await expect(page.getByTestId('extremal-error')).toHaveCount(0)

    await page.getByTestId('extremal-custom').fill('Bw; C~')
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('2 张禁图')
    await expect(page.getByTestId('extremal-result')).toContainText('= 9')
  })

  test('结构约束：连通、平面、最大度与筛选计数', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-filter-connected').check()
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 9')
    await expect(page.getByTestId('extremal-filter-result')).toContainText('筛去 44 个')
    await expect(page.getByTestId('extremal-formula')).toHaveCount(0)
    await expect(page.getByTestId('extremal-asymptotic')).toHaveCount(0)

    await page.getByTestId('extremal-filter-planar').check()
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 8')

    await page.getByTestId('extremal-filter-reset').click()
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-filter-result')).toContainText('筛去 0 个')
    await expect(page.getByTestId('extremal-formula')).toContainText('Mantel')
    await expect(page.getByTestId('extremal-asymptotic')).toBeVisible()

    await page.getByTestId('extremal-filter-max-degree').fill('2')
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 6')
  })

  test('极大性证书、稳定性与饱和图预览', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-maximality')).toContainText('通过')
    await expect(page.getByTestId('extremal-stability')).toContainText('同构')
    await expect(page.getByTestId('extremal-saturation')).toContainText('5')
    await page.getByTestId('extremal-sat-0').click()
    await expect(page.getByTestId('hyper-canvas')).toBeVisible()

    await page.getByTestId('extremal-pattern').selectOption('C4')
    await page.getByTestId('extremal-complement').check()
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 5')
    await expect(page.getByTestId('extremal-result')).toContainText('补图')
  })
})
