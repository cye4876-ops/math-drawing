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

test.describe('v0.5 邻接矩阵与谱（特征值 / Perron 向量）', () => {
  test('K3：矩阵 3×3、谱半径 2、特征值 [-1×2]、Perron 全 1', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 3')

    // 邻接矩阵：对角 0、相邻 1
    await expect(page.getByTestId('matrix-cell-0-0')).toHaveText('0')
    await expect(page.getByTestId('matrix-cell-0-1')).toHaveText('1')
    await expect(page.getByTestId('matrix-cell-0-2')).toHaveText('1')

    // 谱半径（K3 最大特征值 2）
    await expect(page.getByTestId('spectral-radius')).toContainText('ρ = 2')

    // 特征值聚合显示：2 与 -1×2
    await expect(page.getByTestId('eigenvalues')).toContainText('2')
    await expect(page.getByTestId('eigenvalues')).toContainText('-1×2')

    // Perron 向量：全 1（K3 点传递）
    await expect(page.getByTestId('perron-0')).toContainText('1')
    await expect(page.getByTestId('perron-1')).toContainText('1')
    await expect(page.getByTestId('perron-2')).toContainText('1')
  })

  test('带权图：矩阵取权重 {3, 1.500}；谱半径 √11.25 ≈ 3.354', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B:3, B-C:1.5'))
    await expect(page.getByTestId('matrix-cell-0-1')).toHaveText('3')
    await expect(page.getByTestId('matrix-cell-1-2')).toHaveText('1.500')
    await expect(page.getByTestId('spectral-radius')).toContainText('3.354')
  })

  test('矩阵点击联动：高亮边（琥珀像素）并可再次点击取消', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await expect(page.getByTestId('matrix-cell-0-1')).toBeVisible()
    expect(await countHighlightPixels(page)).toBeLessThan(20)

    await page.getByTestId('matrix-cell-0-1').click()
    await expect.poll(() => countHighlightPixels(page)).toBeGreaterThan(60)

    await page.getByTestId('matrix-cell-0-1').click()
    await expect.poll(() => countHighlightPixels(page)).toBeLessThan(20)
  })

  test('点击零格子不产生高亮（取消选择）', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await page.getByTestId('matrix-cell-0-1').click()
    await expect.poll(() => countHighlightPixels(page)).toBeGreaterThan(60)
    // (0,0) 为零且非对角（K3 无自环）→ 取消高亮
    await page.getByTestId('matrix-cell-0-0').click()
    await expect.poll(() => countHighlightPixels(page)).toBeLessThan(20)
  })

  test('有向图：复谱（特征值 chips + 复平面）、矩阵非对称、谱半径与 Perron 仍显示', async ({
    page,
  }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A->B:2, B->C:3'))
    // 幂零链：三个特征值全为 0（聚合显示 ×3）
    await expect(page.getByTestId('complex-eigenvalues')).toBeVisible()
    await expect(page.getByTestId('complex-eigenvalues')).toContainText('0×3')
    await expect(page.getByTestId('complex-spectrum')).toBeVisible()
    await expect(page.getByTestId('spectral-radius')).toBeVisible()
    // 矩阵非对称：A→B 为 2，B→A 为 0
    await expect(page.getByTestId('matrix-cell-0-1')).toHaveText('2')
    await expect(page.getByTestId('matrix-cell-1-0')).toHaveText('0')
    await expect(page.getByTestId('perron-0')).toBeVisible()
  })

  test('有向环：复谱给出三次单位根（含非实特征值）', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A->B, B->C, C->A'))
    const chips = page.getByTestId('complex-eigenvalues')
    await expect(chips).toContainText('0.866i')
    await expect(page.getByTestId('complex-spectrum')).toBeVisible()
  })

  test('矩阵视图切换：邻接 ⇄ 拉普拉斯（L = D − A）', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await expect(page.getByTestId('matrix-cell-0-1')).toHaveText('1')

    await page.getByTestId('matrix-kind-laplacian').click()
    // K3 拉普拉斯：对角 2、非对角 -1
    await expect(page.getByTestId('matrix-cell-0-0')).toHaveText('2')
    await expect(page.getByTestId('matrix-cell-0-1')).toHaveText('-1')

    await page.getByTestId('matrix-kind-adjacency').click()
    await expect(page.getByTestId('matrix-cell-0-0')).toHaveText('0')
  })

  test('无图时折叠面板；DSL 生成 K4 后自动更新（ρ=3、特征值 -1×3）', async ({ page }) => {
    await page.goto('/?mode=graph')
    await expect(page.getByTestId('graph-stats')).toContainText('暂无图')
    await expect(page.getByTestId('spectrum-panel')).toHaveCount(0)

    await page.getByTestId('graph-dsl').fill('1-2, 1-3, 1-4, 2-3, 2-4, 3-4')
    await expect(page.getByTestId('spectral-radius')).toContainText('ρ = 3')
    await expect(page.getByTestId('eigenvalues')).toContainText('-1×3')
  })

  test('拉普拉斯谱：L 谱、0 的重数（连通分量）与代数连通度 λ₂', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3'))
    await page.getByTestId('matrix-kind-laplacian').click()
    // P3：L 谱 [0, 1, 3]；0 重数 1；λ₂=1
    await expect(page.getByTestId('laplacian-eigenvalues')).toContainText('3')
    await expect(page.getByTestId('laplacian-eigenvalues')).toContainText('1')
    await expect(page.getByTestId('laplacian-connectivity')).toContainText('1')
    await expect(page.getByTestId('laplacian-connectivity')).toContainText('λ₂ = 1')

    // 不连通（两条独立边）：0 重数 2、λ₂=0
    await page.getByTestId('graph-dsl').fill('A-B, C-D')
    await expect(page.getByTestId('laplacian-connectivity')).toContainText('2')
    await expect(page.getByTestId('laplacian-connectivity')).toContainText('不连通')
  })

  test('Floyd 单步：矩阵行列焦点随中间点移动，结束清空', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await page.getByTestId('algorithm-select').selectOption('floyd')
    await page.getByTestId('algorithm-run').click()

    // 第 1 步为初始化说明（无中间点）→ 无焦点
    await expect(page.getByTestId('matrix-cell-1-1')).not.toHaveClass(/focused/)

    // 下一步：k = 顶点 1（索引 0）→ 第 0 行/列聚焦
    await page.getByTestId('algorithm-step').click()
    await expect(page.getByTestId('matrix-cell-0-1')).toHaveClass(/focused/)
    await expect(page.getByTestId('matrix-cell-1-1')).not.toHaveClass(/focused/)

    // 再一步：焦点移到索引 1
    await page.getByTestId('algorithm-step').click()
    await expect(page.getByTestId('matrix-cell-1-2')).toHaveClass(/focused/)
    await expect(page.getByTestId('matrix-cell-0-2')).not.toHaveClass(/focused/)

    // 跳到结尾（完成）：焦点清空
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('matrix-cell-1-2')).not.toHaveClass(/focused/)
  })
})
