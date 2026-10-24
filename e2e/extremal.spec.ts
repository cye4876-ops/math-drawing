import { expect, test } from '@playwright/test'

async function openExtremal(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?mode=hyper')
  await page.getByTestId('hyper-tab-extremal').click()
  await expect(
    page.getByTestId('extremal-result').or(page.getByTestId('extremal-run')),
  ).toBeVisible()
}

test.describe('v3.6 极值计算台', () => {
  test('极值标签页直达、默认 T₂(6) 预览与画布', async ({ page }) => {
    await page.goto('/?mode=hyper')
    await expect(page.getByTestId('hyper-tab-extremal')).toBeVisible()
    await page.getByTestId('hyper-tab-extremal').click()
    await expect(page.getByTestId('extremal-n')).toHaveValue('6')
    await expect(page.getByTestId('extremal-pattern')).toHaveValue('K3')
    await expect(page.getByTestId('extremal-turan-r')).toHaveValue('2')
    const pixels = await page.getByTestId('hyper-canvas').evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return -1
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0
        const g = data[i + 1] ?? 0
        const b = data[i + 2] ?? 0
        if (Math.abs(r - 11) > 12 || Math.abs(g - 14) > 12 || Math.abs(b - 20) > 12) count++
      }
      return count
    })
    expect(pixels).toBeGreaterThan(500)
  })

  test('ex(6,K₃)=9 与 Mantel 公式；诱导模式 ex_ind(6,C₄)=15', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 9')
    await expect(page.getByTestId('extremal-result')).toContainText('扫描 156')
    await expect(page.getByTestId('extremal-formula')).toContainText('Mantel')
    await expect(page.getByTestId('extremal-graph-0')).toBeVisible()
    await page.getByTestId('extremal-graph-0').click()
    await expect(page.getByTestId('hyper-canvas')).toBeVisible()

    await page.getByTestId('extremal-pattern').selectOption('C4')
    await page.getByTestId('extremal-mode').selectOption('induced')
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-result')).toContainText('= 15')
    await expect(page.getByTestId('extremal-formula')).toHaveCount(0)
  })

  test('自定义禁图解析错误与 P₃ 极值', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-pattern').selectOption('custom')
    await page.getByTestId('extremal-custom').fill('0-0, 1-2')
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-error')).toContainText('自环')

    await page.getByTestId('extremal-custom').fill('0-1, 1-2')
    await page.getByTestId('extremal-run').click()
    await expect(page.getByTestId('extremal-error')).toHaveCount(0)
    await expect(page.getByTestId('extremal-result')).toContainText('= 3')
    await expect(page.getByTestId('extremal-result')).toContainText('自定义禁图')
  })

  test('Turán 构造 T₃(6)=12 与精确搜索对照', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('extremal-turan-r').fill('3')
    await page.getByTestId('extremal-turan').click()
    await expect(page.getByTestId('extremal-turan-result')).toContainText('12')
    await expect(page.getByTestId('extremal-turan-result')).toContainText('K4')
  })

  test('Ramsey R(3,3)：K₅ 见证载入彩虹、K₆ 不存在', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('ramsey-run').click()
    await expect(page.getByTestId('ramsey-result')).toContainText('存在')
    await expect(page.getByTestId('ramsey-result')).toContainText('6 个')
    await page.getByTestId('ramsey-load').click()
    await expect(page.getByTestId('rainbow-result')).toContainText('C₃')
    await expect(page.getByTestId('hyper-canvas')).toBeVisible()

    await page.getByTestId('hyper-tab-extremal').click()
    await page.getByTestId('ramsey-n').fill('6')
    await page.getByTestId('ramsey-run').click()
    await expect(page.getByTestId('ramsey-result')).toContainText('不存在')
    await expect(page.getByTestId('ramsey-load')).toBeDisabled()
  })

  test('3-一致超图：n=6 禁 K₄³ 得 14，载入超图实验室', async ({ page }) => {
    await page.goto('/?mode=hyper')
    await page.getByTestId('hyper-tab-extremal').click()
    await page.getByTestId('hyperex-run').click()
    await expect(page.getByTestId('hyperex-result')).toContainText('= 14')
    await expect(page.getByTestId('hyperex-result')).toContainText('禁例 15 个')
    await page.getByTestId('hyperex-load').click()
    await expect(page.getByTestId('hyper-summary')).toContainText('6')
    await expect(page.getByTestId('hyper-summary')).toContainText('14')
  })

  test('3-一致超图：n=6 禁松三角形得 10', async ({ page }) => {
    await openExtremal(page)
    await page.getByTestId('hyperex-pattern').selectOption('loose_triangle')
    await page.getByTestId('hyperex-run').click()
    await expect(page.getByTestId('hyperex-result')).toContainText('= 10')
    await expect(page.getByTestId('hyperex-result')).toContainText('禁例 120 个')
  })
})
