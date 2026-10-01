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
      if (Math.abs(r - 245) < 20 && Math.abs(g - 158) < 25 && Math.abs(b - 11) < 20) count++
    }
    return count
  })
}

const K5 = '1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5'
const K33 = '1-4, 1-5, 1-6, 2-4, 2-5, 2-6, 3-4, 3-5, 3-6'
const K4 = '1-2, 1-3, 1-4, 2-3, 2-4, 3-4'

test.describe('v0.5 禁图：平面性与图的性质', () => {
  test('K5 非平面并高亮禁用子图证据；K5 为欧拉回路', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent(K5))
    await expect(page.getByTestId('property-planar')).toContainText('确定非平面')
    await expect(page.getByTestId('property-planar-reason')).toContainText('K5')
    await expect(page.getByTestId('property-euler')).toContainText('欧拉回路')

    expect(await countHighlightPixels(page)).toBeLessThan(20)
    await page.getByTestId('property-highlight').click()
    await expect.poll(() => countHighlightPixels(page)).toBeGreaterThan(30)
    await page.getByTestId('property-highlight').click()
    await expect.poll(() => countHighlightPixels(page)).toBeLessThan(20)
  })

  test('K3,3 非平面（Kuratowski 禁用子图）；二分且连通', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent(K33))
    await expect(page.getByTestId('property-planar-reason')).toContainText('K3,3')
    await expect(page.getByTestId('property-bipartite')).toContainText('二分图')
    await expect(page.getByTestId('property-connected')).toContainText('连通')
  })

  test('K4：未发现冲突（可能平面）；无欧拉路（4 个奇度点）', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent(K4))
    await expect(page.getByTestId('property-planar')).toContainText('未发现冲突')
    await expect(page.getByTestId('property-euler')).toContainText('不存在')
    // 无证据 → 无高亮按钮
    await expect(page.getByTestId('property-highlight')).toHaveCount(0)
  })

  test('性质随结构自动更新（切图族后重新判定）', async ({ page }) => {
    await page.goto('/?mode=graph')
    await page.getByTestId('family-select').selectOption('complete')
    await page.getByTestId('family-param-n').fill('5')
    await page.getByTestId('family-generate').click()
    await expect(page.getByTestId('property-planar')).toContainText('确定非平面')

    await page.getByTestId('family-param-n').fill('4')
    await page.getByTestId('family-generate').click()
    await expect(page.getByTestId('property-planar')).toContainText('未发现冲突')
  })
})
