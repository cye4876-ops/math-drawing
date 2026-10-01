import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/** 统计画布上的节点蓝（#2563eb = rgb(37,99,235)）像素数 */
async function countNodePixels(page: Page): Promise<number> {
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
      if (Math.abs(r - 37) < 40 && Math.abs(g - 99) < 40 && Math.abs(b - 235) < 40) count++
    }
    return count
  })
}

/** 统计曲线红（#c32222 = rgb(195,34,34)）像素数（严格阈值，避开节点调色板的 #dc2626 红） */
async function countRedPixels(page: Page): Promise<number> {
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

test.describe('v0.5 图渲染（元素注册制）', () => {
  test('URL 预载 DSL 图：节点与边绘制，导出 JSON 含完整图对象', async ({ page }) => {
    await page.goto('/?graph=' + encodeURIComponent('A-B:3, B-C:2, C->A'))

    // 画布出现节点（默认蓝）绘制像素
    await expect.poll(() => countNodePixels(page)).toBeGreaterThan(500)

    // 导出 JSON：图对象的顶点/边/方向/权重结构完整
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-json').click(),
    ])
    const parsed = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8')) as {
      objects: {
        type: string
        nodes: unknown[]
        edges: { directed: boolean; weight: number | null }[]
      }[]
    }
    const graph = parsed.objects.find((object) => object.type === 'graph')
    expect(graph).toBeDefined()
    expect(graph!.nodes).toHaveLength(3)
    expect(graph!.edges).toHaveLength(3)
    expect(graph!.edges.filter((edge) => edge.directed)).toHaveLength(1)
    expect(graph!.edges.map((edge) => edge.weight)).toContain(3)
  })

  test('模式互斥显示：图模式下不显示曲线；函数模式下不显示图', async ({ page }) => {
    await page.goto('/?curves=sin(x)&graph=' + encodeURIComponent('A-B, C->A'))
    // ?graph= 自动进入图论模式：节点显示、曲线隐藏
    await expect.poll(() => countNodePixels(page)).toBeGreaterThan(500)
    expect(await countRedPixels(page)).toBeLessThan(20)

    // 切到函数绘图：曲线显示、图隐藏
    await page.getByTestId('mode-plot').click()
    await expect.poll(() => countRedPixels(page)).toBeGreaterThan(50)
    expect(await countNodePixels(page)).toBeLessThan(50)
  })

  test('撤销可移除图对象（图编辑入撤销历史）', async ({ page }) => {
    await page.goto('/?graph=' + encodeURIComponent('A-B, B-C, C-A, A->C'))
    await expect.poll(() => countNodePixels(page)).toBeGreaterThan(500)

    await page.getByTestId('undo').click()
    await expect.poll(() => countNodePixels(page)).toBeLessThan(100)
    await expect(page.getByTestId('undo')).toBeDisabled()
  })

  test('无 graph 参数的旧文档不受影响（v0.3/v0.4 冒烟）', async ({ page }) => {
    await page.goto('/?curves=x^2')
    await expect.poll(() => countRedPixels(page)).toBeGreaterThan(50)
    expect(await countNodePixels(page)).toBeLessThan(50)
  })
})
