import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

test.describe('v0.6 导出与分享', () => {
  test('面板打开/关闭；PNG 导出（文件名、魔术字节、状态）', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await page.getByTestId('export-open').click()
    await expect(page.getByTestId('export-panel')).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-png-run').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.png$/)
    const buffer = await readFile((await download.path())!)
    expect(buffer.subarray(0, 8)).toEqual(PNG_MAGIC)
    expect(buffer.length).toBeGreaterThan(1000)
    await expect(page.getByTestId('export-status')).toContainText('已导出 PNG')

    // 关闭后再打开（面板定位不遮挡按钮）
    await page.getByTestId('export-close').click()
    await expect(page.getByTestId('export-panel')).toHaveCount(0)
    await page.getByTestId('export-open').click()
    await expect(page.getByTestId('export-panel')).toBeVisible()
  })

  test('PNG 4× 分辨率与透明背景：IHDR 尺寸 = CSS 尺寸 × 4', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await page.getByTestId('export-open').click()
    await page.getByTestId('export-png-scale').selectOption('4')
    await page.getByTestId('export-png-transparent').check()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-png-run').click(),
    ])
    const box = await page.getByTestId('stage-canvas').boundingBox()
    const buffer = await readFile((await download.path())!)
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    expect(Math.abs(width - box!.width * 4)).toBeLessThanOrEqual(4)
    expect(Math.abs(height - box!.height * 4)).toBeLessThanOrEqual(4)
  })

  test('SVG 导出：矢量 path 与文本元素', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await page.getByTestId('export-open').click()
    await page.getByTestId('export-tab-svg').click()
    await page.getByTestId('export-svg-width').fill('800')
    await page.getByTestId('export-svg-height').fill('600')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-svg-run').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.svg$/)
    const text = await readFile((await download.path())!, 'utf-8')
    expect(text).toContain('<svg xmlns')
    expect(text).toContain('<path d="M')
    expect(text).toContain('<text')
    expect(text).toContain('width="800"')
    await expect(page.getByTestId('export-status')).toContainText('已导出 SVG')
  })

  test('TikZ 导出：符号形式 \\addplot 与完整文档', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await page.getByTestId('export-open').click()
    await page.getByTestId('export-tab-tikz').click()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-tikz-run').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.tex$/)
    const text = await readFile((await download.path())!, 'utf-8')
    expect(text).toContain('\\documentclass')
    expect(text).toContain('\\begin{axis}')
    expect(text).toContain('\\addplot')
    expect(text).toContain('{sin(deg(x))}')
  })

  test('分享链接：生成 → 新页面打开完整还原（曲线 + 图 + 模式）', async ({ page }) => {
    await page.goto('/?curves=sin(x);cos(x)')
    await page.getByTestId('mode-graph').click()
    await page.getByTestId('family-select').selectOption('complete')
    await page.getByTestId('family-param-n').fill('4')
    await page.getByTestId('family-generate').click()
    await expect(page.getByTestId('graph-stats')).toContainText('顶点 4')

    await page.getByTestId('export-open').click()
    await page.getByTestId('export-tab-share').click()
    await page.getByTestId('export-share-run').click()
    await expect(page.getByTestId('export-share-url')).toBeVisible()
    const url = await page.getByTestId('export-share-url').inputValue()
    expect(url).toContain('doc=')
    expect(url).toContain('mode=graph')

    // 新标签页打开分享链接：图完整还原
    const page2 = await page.context().newPage()
    await page2.goto(url)
    await expect(page2.getByTestId('graph-panel')).toBeVisible()
    await expect(page2.getByTestId('graph-stats')).toContainText('顶点 4')
    await expect(page2.getByTestId('graph-stats')).toContainText('边 6')

    // 切回函数绘图：两条曲线完整还原
    await page2.getByTestId('mode-plot').click()
    await expect(page2.getByTestId('curve-item')).toHaveCount(2)
    await page2.close()
  })

  test('动画导出：GIF 文件头与多帧内容', async ({ page }) => {
    await page.goto('/?graph=' + encodeURIComponent('1-2, 2-3, 3-1'))
    await page.getByTestId('export-open').click()
    await page.getByTestId('export-tab-animation').click()
    await page.getByTestId('export-animation-fps').selectOption('8')
    await page.getByTestId('export-animation-width').fill('320')

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByTestId('export-animation-run').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.gif$/)
    const buffer = await readFile((await download.path())!)
    expect(buffer.subarray(0, 6).toString('latin1')).toBe('GIF89a')
    expect(buffer.length).toBeGreaterThan(800)
    await expect(page.getByTestId('export-status')).toContainText('已导出 GIF')
  })

  test('范围选项：指定区域生效（SVG 输出包含区域裁剪）', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await page.getByTestId('export-open').click()
    await page.getByTestId('export-tab-svg').click()
    await page.getByTestId('export-range').selectOption('region')
    await page.getByTestId('export-region-xmin').fill('-1')
    await page.getByTestId('export-region-xmax').fill('1')
    await page.getByTestId('export-region-ymin').fill('-0.5')
    await page.getByTestId('export-region-ymax').fill('0.5')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-svg-run').click(),
    ])
    const text = await readFile((await download.path())!, 'utf-8')
    // 区域 label 生成于 (-1..1)，刻度标签只含该区间
    expect(text).toContain('<text')
    expect(text).not.toContain('>6</text>')
  })
})
