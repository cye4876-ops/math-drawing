import { expect, test } from '@playwright/test'

test.describe('v2.3 矩阵分解（第七模式）', () => {
  test('?mode=matrix 直达：工具条标签选中、面板与画布可见', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await expect(page.getByTestId('mode-matrix')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('matrix-panel')).toBeVisible()
    await expect(page.getByTestId('matrix-view')).toBeVisible()
    await expect(page.getByTestId('matrix-canvas')).toBeVisible()
    await expect(page.getByTestId('graph-panel')).toHaveCount(0)
    await expect(page.getByTestId('space-panel')).toHaveCount(0)
    await expect(page.getByTestId('advanced-panel')).toHaveCount(0)
  })

  test('QR 分解：[[1,2],[3,4]] → R 对角 3.1623 / 0.6325、残差 ≈ 0', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await page.getByTestId('matrix-preset-general').click()
    await page.getByTestId('matrix-op-qr').click()
    await page.getByTestId('matrix-run').click()
    const results = page.getByTestId('matrix-results')
    await expect(results).toContainText('QR 分解')
    await expect(results).toContainText('3.1623')
    await expect(results).toContainText('0.6325')
    await expect(results).toContainText('机器精度')
  })

  test('相似对角化：对称矩阵 → 特征值 3 / 1、P·D·P⁻¹ 与残差', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await page.getByTestId('matrix-preset-symmetric').click()
    await page.getByTestId('matrix-op-eigen').click()
    await page.getByTestId('matrix-run').click()
    const results = page.getByTestId('matrix-results')
    await expect(results).toContainText('特征值')
    // 特征值 3 与 1（顺序不依赖）且特征向量含 0.7071（±1/√2）
    await expect
      .poll(async () => {
        const text = (await results.textContent()) ?? ''
        return text.includes('3') && text.includes('1') && text.includes('0.7071')
      })
      .toBe(true)
    await expect(results).toContainText('机器精度')
  })

  test('相似对角化：剪切矩阵不可对角化；旋转矩阵复特征值提示', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await page.getByTestId('matrix-preset-shear').click()
    await page.getByTestId('matrix-op-eigen').click()
    await page.getByTestId('matrix-run').click()
    await expect(page.getByTestId('matrix-results')).toContainText('不可对角化')

    await page.getByTestId('matrix-preset-rotation').click()
    await page.getByTestId('matrix-run').click()
    await expect(page.getByTestId('matrix-results')).toContainText('复特征值')
  })

  test('LU 与综合：det = -2 / rank = 2；逆矩阵输出', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await page.getByTestId('matrix-preset-general').click()
    await page.getByTestId('matrix-op-lu').click()
    await page.getByTestId('matrix-run').click()
    await expect(page.getByTestId('matrix-results')).toContainText('LU 分解')

    await page.getByTestId('matrix-op-summary').click()
    await page.getByTestId('matrix-run').click()
    const results = page.getByTestId('matrix-results')
    await expect(results).toContainText('det A = -2')
    await expect(results).toContainText('rank A = 2')
    await expect(results).toContainText('数值精度内')
  })

  test('n 阶参数：3 阶输入格生效、行列式 24', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await page.getByTestId('matrix-size-n').fill('3')
    await expect(page.getByTestId('matrix-cell-3-3')).toBeVisible()
    // 逐格填入对角矩阵 diag(2,3,4)（清掉 2×2 扩展残留的副对角 1）
    for (const [r, c, value] of [
      [1, 1, '2'],
      [1, 2, '0'],
      [1, 3, '0'],
      [2, 1, '0'],
      [2, 2, '3'],
      [2, 3, '0'],
      [3, 1, '0'],
      [3, 2, '0'],
      [3, 3, '4'],
    ] as const) {
      await page.getByTestId(`matrix-cell-${r}-${c}`).fill(value)
    }
    await page.getByTestId('matrix-op-summary').click()
    await page.getByTestId('matrix-run').click()
    await expect(page.getByTestId('matrix-results')).toContainText('det A = 24')
  })

  test('n 阶参数：6 阶单位矩阵（清零→单位→det 1 + QR 机器精度）', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await page.getByTestId('matrix-size-n').fill('6')
    await expect(page.getByTestId('matrix-cell-6-6')).toBeVisible()
    await page.getByTestId('matrix-clear').click()
    await page.getByTestId('matrix-identity').click()
    await page.getByTestId('matrix-op-summary').click()
    await page.getByTestId('matrix-run').click()
    await expect(page.getByTestId('matrix-results')).toContainText('det A = 1')
    await expect(page.getByTestId('matrix-results')).toContainText('rank A = 6')
    await page.getByTestId('matrix-op-qr').click()
    await page.getByTestId('matrix-run').click()
    await expect(page.getByTestId('matrix-results')).toContainText('机器精度')
  })

  test('预设：三对角 6 阶对角化（解析特征值 0.1981 / 3.8019）', async ({ page }) => {
    await page.goto('/?mode=matrix')
    await page.getByTestId('matrix-preset-tridiagonal6').click()
    await page.getByTestId('matrix-op-eigen').click()
    await page.getByTestId('matrix-run').click()
    const results = page.getByTestId('matrix-results')
    await expect(results).toContainText('特征值')
    await expect(results).toContainText('0.1981')
    await expect(results).toContainText('3.8019')
    await expect(results).toContainText('几何重数 1')
    await expect(results).toContainText('验证')
  })
})
