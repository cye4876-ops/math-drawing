import { expect, test } from '@playwright/test'

/** 画布非背景像素数（背景 #0b0e14） */
async function nonBackgroundPixels(page: import('@playwright/test').Page): Promise<number> {
  return page.getByTestId('hyper-canvas').evaluate((el) => {
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
}

test.describe('v3.4 / v3.5 超图与彩虹实验室', () => {
  test('?mode=hyper 直达：模式选中、画布与面板可见', async ({ page }) => {
    await page.goto('/?mode=hyper')
    await expect(page.getByTestId('mode-hyper')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('hyper-view')).toBeVisible()
    await expect(page.getByTestId('hyper-canvas')).toBeVisible()
    await expect(page.getByTestId('hyper-panel')).toBeVisible()
    await expect(page.getByTestId('hyper-summary')).toContainText('顶点 n')
    await expect.poll(() => nonBackgroundPixels(page)).toBeGreaterThan(1000)
  })

  test('超图默认 K₅³：结构、ν/τ/α 与 Property B', async ({ page }) => {
    await page.goto('/?mode=hyper')
    const summary = page.getByTestId('hyper-summary')
    await expect(summary).toContainText('5')
    await expect(summary).toContainText('10')
    await expect(summary).toContainText('3')
    await expect(summary).toContainText('否')
    await expect(page.getByTestId('hyper-matching-result')).toContainText('ν = 1')
    await expect(page.getByTestId('hyper-transversal-result')).toContainText('τ = 3')
    await expect(page.getByTestId('hyper-transversal-result')).toContainText('α = 2')
    await expect(page.getByTestId('hyper-propertyb-result')).toContainText('不可 2-着色')
    await page.getByTestId('hyper-matching').click()
    await expect(page.getByTestId('hyper-witness-label')).toContainText('最大匹配')
    await page.getByTestId('hyper-witness-clear').click()
    await expect(page.getByTestId('hyper-witness-label')).toHaveCount(0)
  })

  test('Fano 平面：线性正则、四视图切换、点击顶点联动、JSON 导入校验', async ({ page }) => {
    await page.goto('/?mode=hyper')
    await page.getByTestId('hyper-preset').selectOption('fano')
    await page.getByTestId('hyper-generate').click()
    const summary = page.getByTestId('hyper-summary')
    await expect(summary).toContainText('7')
    await expect(summary).toContainText('是')
    await expect(page.getByTestId('hyper-propertyb-result')).toContainText('不可 2-着色')

    for (const view of ['bipartite', 'section', 'line', 'set']) {
      await page.getByTestId(`hyper-view-${view}`).click()
      await expect.poll(() => nonBackgroundPixels(page)).toBeGreaterThan(500)
    }

    // 集合视图：沿顶点圆环逐个尝试点击（7 个 Fano 顶点）
    const canvas = page.getByTestId('hyper-canvas')
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      const radius = Math.min(box.width, box.height) * 0.33
      for (let index = 0; index < 7; index++) {
        const angle = -Math.PI / 2 + (2 * Math.PI * index) / 7
        await page.mouse.click(
          box.x + box.width / 2 + radius * Math.cos(angle),
          box.y + box.height / 2 + radius * Math.sin(angle),
        )
        if ((await page.getByTestId('hyper-selection').count()) > 0) break
      }
    }
    await expect(page.getByTestId('hyper-selection')).toContainText('顶点')

    await page.getByTestId('hyper-json').fill('{')
    await page.getByTestId('hyper-json-apply').click()
    await expect(page.getByTestId('hyper-json-error')).toBeVisible()
    await page.getByTestId('hyper-json').fill(
      JSON.stringify({
        name: '两条不交边',
        n: 6,
        edges: [
          [0, 1, 2],
          [3, 4, 5],
        ],
      }),
    )
    await page.getByTestId('hyper-json-apply').click()
    await expect(page.getByTestId('hyper-summary')).toContainText('6')
    await expect(page.getByTestId('hyper-summary')).toContainText('2')
    await expect(page.getByTestId('hyper-json-error')).toHaveCount(0)
  })

  test('彩虹子图：全不同色 K₅ 搜索、Gallai 检测、反拉姆齐与应用见证', async ({ page }) => {
    await page.goto('/?mode=hyper')
    await page.getByTestId('hyper-tab-rainbow').click()
    await expect(page.getByTestId('rainbow-result')).toContainText('C₃')
    await page.getByTestId('rainbow-run').click()
    await expect(page.getByTestId('rainbow-result')).not.toContainText('：0 个')
    await expect(page.getByTestId('rainbow-table')).toBeVisible()
    await page.getByTestId('rainbow-copy-0').click()
    await expect.poll(() => nonBackgroundPixels(page)).toBeGreaterThan(500)

    await page.getByTestId('rainbow-gallai').click()
    await expect(page.getByTestId('rainbow-gallai-result')).toContainText('含彩虹三角形')

    await page.getByTestId('rainbow-anti-run').click()
    await expect(page.getByTestId('rainbow-anti-result')).toContainText('= 4')
    await expect(page.getByTestId('rainbow-anti-result')).toContainText('ar(5, C₃)')
    await page.getByTestId('rainbow-anti-apply').click()
    await page.getByTestId('rainbow-gallai').click()
    await expect(page.getByTestId('rainbow-gallai-result')).toContainText('Gallai 着色')
  })

  test('超图彩虹匹配：两条不交异色超边 → 最大 2；目标 3 不存在', async ({ page }) => {
    await page.goto('/?mode=hyper')
    await page.getByTestId('hyper-json').fill(
      JSON.stringify({
        name: '两条不交边',
        n: 6,
        edges: [
          [0, 1, 2],
          [3, 4, 5],
        ],
      }),
    )
    await page.getByTestId('hyper-json-apply').click()
    await page.getByTestId('hyper-tab-rainbow').click()
    await page.getByTestId('rainbow-hyper-max').click()
    await expect(page.getByTestId('rainbow-hyper-result')).toContainText('大小 2')
    await page.getByTestId('rainbow-hyper-size').fill('3')
    await page.getByTestId('rainbow-hyper-run').click()
    await expect(page.getByTestId('rainbow-hyper-result')).toContainText('无大小')
  })
})
