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

/** 统计累积轨迹玫红色（#db2777 = rgb(219,39,119)）像素数 */
async function countTrailPixels(page: Page): Promise<number> {
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
      if (Math.abs(r - 219) < 35 && Math.abs(g - 39) < 35 && Math.abs(b - 119) < 35) count++
    }
    return count
  })
}

/** 统计曲线/节点严格红（#c32222 = rgb(195,34,34)，避开原节点红 #dc2626）像素数 */
async function countStrictRed(page: Page): Promise<number> {
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
      if (Math.abs(r - 195) < 10 && Math.abs(g - 34) < 10 && Math.abs(b - 34) < 10) count++
    }
    return count
  })
}

test.describe('v0.5 算法 UI 播放器（阶段 5b）', () => {
  test('BFS：运行 → 首步高亮与 note → 单步 → 到末尾显示访问顺序', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await expect(page.getByTestId('algorithm-panel')).toBeVisible()

    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-progress')).toContainText('1 /')
    await expect(page.getByTestId('algorithm-note')).toContainText('入队')
    await expect.poll(() => countHighlightPixels(page)).toBeGreaterThan(30)

    await page.getByTestId('algorithm-step').click()
    await expect(page.getByTestId('algorithm-progress')).toContainText('2 /')

    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toBeVisible()
    await expect(page.getByTestId('algorithm-result')).toContainText('访问顺序')
  })

  test('Dijkstra：距离表（D：4）与最远可达路径', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B:2, A-C:5, B-C:1, B-D:4, C-D:1'))
    await page.getByTestId('algorithm-select').selectOption('dijkstra')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('最短距离')
    await expect(page.getByTestId('algorithm-result')).toContainText('D：4')
    await expect(page.getByTestId('algorithm-result')).toContainText('路径')
  })

  test('负权 Dijkstra：拒绝执行并显示错误', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A->B:-1, B->C:2'))
    await page.getByTestId('algorithm-select').selectOption('dijkstra')
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('负权')
  })

  test('Kruskal：播放可暂停 / 到末尾显示总权重', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B:1, B-C:2, A-C:3'))
    await page.getByTestId('algorithm-select').selectOption('kruskal')
    await page.getByTestId('algorithm-run').click()

    await page.getByTestId('algorithm-play').click()
    await expect(page.getByTestId('algorithm-play')).toContainText('暂停')
    await page.getByTestId('algorithm-play').click()
    await expect(page.getByTestId('algorithm-play')).toContainText('播放')

    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('总权重 3')
  })

  test('着色（DSATUR）：无步骤算法运行即显示色数结果', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await page.getByTestId('algorithm-select').selectOption('dsatur-color')
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('3 色')
  })

  test('重置：清空进度与结果；结构变化自动重置', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3'))
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-progress')).toBeVisible()
    await page.getByTestId('algorithm-reset').click()
    await expect(page.getByTestId('algorithm-progress')).toHaveCount(0)

    // 运行后修改 DSL 结构 → 自动重置
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-progress')).toBeVisible()
    await page.getByTestId('graph-dsl').fill('1-2, 2-3, 3-4')
    await expect(page.getByTestId('algorithm-progress')).toHaveCount(0)
  })

  test('单步累积标记：BFS 走过的边逐步累积（玫红轨迹），重置清空', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-4'))
    await page.getByTestId('algorithm-run').click()

    // 步进到首条树边（push 携带发现边）出现
    for (let i = 0; i < 5; i++) await page.getByTestId('algorithm-step').click()
    await expect.poll(() => countTrailPixels(page)).toBeGreaterThan(10)
    const mid = await countTrailPixels(page)

    // 到末尾：轨迹增长（三条树边齐全；poll 等待渲染完成，修复 CI 上时序差异导致的波动）
    await page.getByTestId('algorithm-end').click()
    await expect.poll(() => countTrailPixels(page)).toBeGreaterThan(mid)

    // 重置：轨迹清空
    await page.getByTestId('algorithm-reset').click()
    await expect.poll(() => countTrailPixels(page)).toBeLessThan(5)
  })

  test('Prim：选中边累积标记（生成树逐步长出）', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B:1, B-C:2, A-C:3'))
    await page.getByTestId('algorithm-select').selectOption('prim')
    await page.getByTestId('algorithm-run').click()
    const first = await countTrailPixels(page)
    await page.getByTestId('algorithm-step').click()
    await expect.poll(() => countTrailPixels(page)).toBeGreaterThan(first)
    await page.getByTestId('algorithm-end').click()
    const end = await countTrailPixels(page)
    expect(end).toBeGreaterThan(first)
  })

  test('强连通分量：两环夹一桥得 2 个分量', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A->B, B->A, B->C, C->D, D->C'))
    await page.getByTestId('algorithm-select').selectOption('scc')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('强连通分量（2 个）')
  })

  test('二分匹配：K3,3 得 3 对；非二分图拒绝执行', async ({ page }) => {
    const K33 = '1-4, 1-5, 1-6, 2-4, 2-5, 2-6, 3-4, 3-5, 3-6'
    await page.goto('/?mode=graph&graph=' + encodeURIComponent(K33))
    await page.getByTestId('algorithm-select').selectOption('matching')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('最大匹配（3 对）')

    // 换成三角形（非二分）→ 拒绝并提示
    await page.getByTestId('graph-dsl').fill('1-2, 2-3, 3-1')
    await page.getByTestId('algorithm-select').selectOption('matching')
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('非二分')
  })

  test('最大流：汇点选择控件 + 经典网络得 5 与流量表', async ({ page }) => {
    await page.goto(
      '/?mode=graph&graph=' + encodeURIComponent('A->B:3, A->C:2, B->C:1, B->D:2, C->D:3'),
    )
    await page.getByTestId('algorithm-select').selectOption('max-flow')
    await expect(page.getByTestId('algorithm-end-select')).toBeVisible()
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('最大流 = 5')
    await expect(page.getByTestId('algorithm-result')).toContainText('B → D：2 / 2')
  })

  test('Floyd-Warshall：结果全对最短路矩阵', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B:2, B-C:3, A-C:10'))
    await page.getByTestId('algorithm-select').selectOption('floyd')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('全对最短路矩阵')
    await expect(page.getByTestId('algorithm-result')).toContainText('A：0　2　5')
  })

  test('割点与桥：路径图给出割点与桥；三角形无割点无桥', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B, B-C, C-D'))
    await page.getByTestId('algorithm-select').selectOption('articulation')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('割点 2 个 / 桥 3 条')
    await expect(page.getByTestId('algorithm-result')).toContainText('B—C')

    // 换成三角形：无割点无桥（先等 DSL 防抖应用）
    await page.getByTestId('graph-dsl').fill('1-2, 2-3, 3-1')
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 3')
    await page.getByTestId('algorithm-select').selectOption('articulation')
    await page.getByTestId('algorithm-run').click()
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('割点 0 个 / 桥 0 条')
  })

  test('欧拉路：三角形回路可播放；星形图报告不存在', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('A-B, B-C, C-A'))
    await page.getByTestId('algorithm-select').selectOption('euler')
    await page.getByTestId('algorithm-run').click()
    // 走边动画（有步骤且能播放）
    await expect(page.getByTestId('algorithm-progress')).toContainText('/')
    await page.getByTestId('algorithm-play').click()
    await expect(page.getByTestId('algorithm-play')).toContainText('暂停')
    await page.getByTestId('algorithm-end').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('欧拉回路')
    await expect(page.getByTestId('algorithm-result')).toContainText('→')

    // 星形 K1,3（4 个奇度顶点）→ 不存在，原因含奇度说明（先等 DSL 防抖应用）
    await page.getByTestId('graph-dsl').fill('C-A, C-B, C-D')
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 4')
    await page.getByTestId('algorithm-select').selectOption('euler')
    await page.getByTestId('algorithm-run').click()
    await expect(page.getByTestId('algorithm-result')).toContainText('不存在欧拉路')
    await expect(page.getByTestId('algorithm-result')).toContainText('4 个奇度顶点')
  })

  test('着色结果直接上画布（节点换用色板）；重置恢复原色', async ({ page }) => {
    await page.goto('/?mode=graph&graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    expect(await countStrictRed(page)).toBeLessThan(20)
    await page.getByTestId('algorithm-select').selectOption('dsatur-color')
    await page.getByTestId('algorithm-run').click()
    await expect.poll(() => countStrictRed(page)).toBeGreaterThan(50)
    await page.getByTestId('algorithm-reset').click()
    await expect.poll(() => countStrictRed(page)).toBeLessThan(20)
  })
})
