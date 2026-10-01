import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/** 采样画布像素，统计"曲线红"（#c32222）像素数量 */
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
      if (r > 150 && g < 100 && b < 100) count++
    }
    return count
  })
}

/** 解析状态栏光标读数 */
async function readCursor(page: Page): Promise<{ x: number; y: number } | null> {
  const text = await page.getByTestId('cursor-pos').textContent()
  const match = text?.match(/\(([^,]+),\s*([^)]+)\)/)
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

test.describe('v0.3 曲线绘制', () => {
  test('URL 预载四种曲线：列表 4 项、无解析错误、画布出现曲线像素', async ({ page }) => {
    await page.goto('/?curves=sin(x);i:x^2+y^2-4;p:cos(t):sin(t);r:1+cos(theta)')
    await expect(page.getByTestId('curve-item')).toHaveCount(4)
    await expect(page.getByTestId('curve-error')).toHaveCount(0)
    await expect(page.getByTestId('stage-canvas')).toBeVisible()

    // 画布上应有非背景像素（曲线被实际绘制）
    const painted = await page.getByTestId('stage-canvas').evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      const ctx = canvas.getContext('2d')
      if (!ctx) return 0
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0
        const g = data[i + 1] ?? 0
        const b = data[i + 2] ?? 0
        // 非白、非浅灰网格、非灰轴
        if (r < 220 || g < 220 || b < 220) count++
      }
      return count
    })
    expect(painted).toBeGreaterThan(500)
  })

  test('通过界面添加曲线并绘制', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('curve-item')).toHaveCount(0)

    await page.getByTestId('curve-expr-input').fill('sin(x)')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(1)

    // 曲线以第一色 #c32222 绘制（等待一帧重绘）
    await expect.poll(() => countRedPixels(page)).toBeGreaterThan(50)
  })

  test('表达式错误提示，不产生曲线段', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('curve-expr-input').fill('sin(')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(1)
    await expect(page.getByTestId('curve-error')).toBeVisible()
    expect(await countRedPixels(page)).toBeLessThan(20)
  })

  test('滚轮缩放以光标为锚点：光标下数学坐标保持不变', async ({ page }) => {
    await page.goto('/')
    const canvas = await page.getByTestId('stage-canvas').boundingBox()
    expect(canvas).not.toBeNull()
    const px = canvas!.x + canvas!.width * 0.35
    const py = canvas!.y + canvas!.height * 0.4

    await page.mouse.move(px, py)
    const before = await readCursor(page)
    expect(before).not.toBeNull()

    await page.mouse.wheel(0, -500)
    await page.mouse.move(px + 0.5, py) // 触发状态栏刷新
    const after = await readCursor(page)
    expect(after).not.toBeNull()

    // 0.5px 的指针偏移 → 数学坐标变化上界 0.5/40（缩放后 scale 约 80×e^0.75≈169）
    expect(Math.abs(after!.x - before!.x)).toBeLessThan(0.05)
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(0.05)
  })

  test('单条曲线显隐切换', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    await expect.poll(() => countRedPixels(page)).toBeGreaterThan(50)

    await page.getByTestId('curve-visible').click()
    await expect.poll(() => countRedPixels(page)).toBeLessThan(20)

    await page.getByTestId('curve-visible').click()
    await expect.poll(() => countRedPixels(page)).toBeGreaterThan(50)
  })

  test('等比模式：x²+y²=4 画出来是正圆', async ({ page }) => {
    await page.goto('/?curves=i:x^2+y^2-4')
    await expect.poll(() => countRedPixels(page)).toBeGreaterThan(200)

    const measure = await page.getByTestId('stage-canvas').evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const w = canvas.width
      const h = canvas.height
      const cx = Math.floor(w / 2)
      const cy = Math.floor(h / 2)
      const isRed = (x: number, y: number): boolean => {
        const d = ctx.getImageData(x, y, 1, 1).data
        return (d[0] ?? 0) > 150 && (d[1] ?? 0) < 100 && (d[2] ?? 0) < 100
      }
      const scan = (dx: number, dy: number): number => {
        for (let d = 4; d < Math.min(w, h) / 2; d++) {
          const x = cx + dx * d
          const y = cy + dy * d
          if (x < 0 || y < 0 || x >= w || y >= h) break
          if (isRed(x, y)) return d
        }
        return -1
      }
      return {
        right: scan(1, 0),
        left: scan(-1, 0),
        up: scan(0, -1),
        down: scan(0, 1),
      }
    })
    expect(measure).not.toBeNull()
    const { right, left, up, down } = measure as Record<string, number>
    for (const d of [right, left, up, down]) expect(d).toBeGreaterThan(10)
    // 四个方向半径一致（差 < 3 物理像素）→ 正圆
    const max = Math.max(right, left, up, down)
    const min = Math.min(right, left, up, down)
    expect(max - min).toBeLessThan(3)
  })

  test('精确视图输入生效', async ({ page }) => {
    await page.goto('/')
    const canvas = await page.getByTestId('stage-canvas').boundingBox()
    expect(canvas).not.toBeNull()

    await page.getByTestId('view-settings').click()
    await page.getByTestId('view-min-x').fill('-10')
    await page.getByTestId('view-max-x').fill('10')
    await page.getByTestId('view-min-y').fill('-5')
    await page.getByTestId('view-max-y').fill('5')
    await page.getByTestId('view-apply').click()

    // 等比开启：scale = 画布宽 / 20（x 范围 20 个单位）
    const readout = await page.getByTestId('scale-readout').textContent()
    const scale = Number(readout?.match(/([\d.]+)\s*px/)?.[1] ?? '0')
    expect(Math.abs(scale - canvas!.width / 20)).toBeLessThan(1)
  })

  test('文档导出 JSON 并完整还原（导入）', async ({ page }) => {
    await page.goto('/?curves=sin(x);i:x^2+y^2-4')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-json').click(),
    ])
    const exported = readFileSync((await download.path()) ?? '', 'utf8')
    const parsed = JSON.parse(exported) as { version: number; objects: unknown[] }
    expect(parsed.version).toBe(1)
    expect(parsed.objects).toHaveLength(2)

    // 修改为 3 条曲线后导入还原
    const modified = {
      ...(JSON.parse(exported) as Record<string, unknown>),
      objects: [
        ...(parsed.objects as Record<string, unknown>[]),
        {
          id: 'new-c',
          type: 'curve',
          kind: 'polar',
          name: '1+cos(theta)',
          expr: '1+cos(theta)',
          color: '#c32222',
          lineStyle: 'solid',
          quality: 3,
          visible: true,
        },
      ],
    }
    const file = join(tmpdir(), `drawing-doc-${Date.now()}.json`)
    writeFileSync(file, JSON.stringify(modified), 'utf8')

    await page.getByTestId('import-json').setInputFiles(file)
    await expect(page.getByTestId('curve-item')).toHaveCount(3)
    await expect(page.getByTestId('io-error')).toHaveCount(0)
  })

  test('性能：单曲线采样+绘制 < 16 ms，10 曲线 < 33 ms（浏览器内实测）', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const renderer = await import('/src/render/curve-renderer.ts')
      const transform = await import('/src/core/transform.ts')
      const view = transform.createView(0, 0, 80)
      const size = { width: 1280, height: 800 }
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const make = (expr: string, index: number): Record<string, unknown> => ({
        id: `c${index}`,
        type: 'curve',
        kind: 'explicit',
        name: expr,
        expr,
        color: '#336699',
        lineStyle: 'solid',
        quality: 3,
        visible: true,
      })
      const exprs = [
        'sin(x)',
        'cos(x)',
        'x^2',
        'tan(x)',
        'exp(-x^2)',
        'x*sin(1/x)',
        '1/(x^2-1)',
        'floor(x)',
        'abs(x)/x',
        'sin(2*x)',
      ]
      const one = [make('sin(x)', 0)]
      const ten = exprs.map((e, i) => make(e, i))

      // warmup + 测量（每次清空采样缓存，模拟视图变化的完整重绘）
      renderer.drawCurves(ctx, one, view, size)
      const t1 = performance.now()
      for (let k = 0; k < 5; k++) {
        renderer.clearSampleCache()
        renderer.drawCurves(ctx, one, view, size)
      }
      const single = (performance.now() - t1) / 5

      renderer.drawCurves(ctx, ten, view, size)
      const t2 = performance.now()
      for (let k = 0; k < 3; k++) {
        renderer.clearSampleCache()
        renderer.drawCurves(ctx, ten, view, size)
      }
      const tenMs = (performance.now() - t2) / 3
      return { single, tenMs }
    })

    expect(result).not.toBeNull()
    expect(result!.single).toBeLessThan(16)
    expect(result!.tenMs).toBeLessThan(33)
  })
})
