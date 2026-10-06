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

  test('自定义方程：粘贴方程自动识别四种类型并添加（v3.1-B）', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('curve-kind-select').selectOption('custom')
    // 自定义模式不显示第二个表达式输入框（参数方程在单框内用分号书写）
    await expect(page.getByTestId('curve-expr2-input')).toHaveCount(0)

    // 隐函数：x^2 + y^2 = 4 → F = (x^2 + y^2) - (4)
    await page.getByTestId('curve-expr-input').fill('x^2 + y^2 = 4')
    await expect(page.getByTestId('draft-ok')).toContainText('识别为隐函数')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(1)
    await expect(page.getByTestId('curve-expr')).toHaveValue('(x^2 + y^2) - (4)')

    // 显函数：y = 2*sin(x) + a（参数 a 实时提示）
    await page.getByTestId('curve-expr-input').fill('y = 2*sin(x) + a')
    await expect(page.getByTestId('draft-ok')).toContainText('识别为显函数')
    await expect(page.getByTestId('draft-ok')).toContainText('参数 a')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(2)

    // 极坐标：r = 2*cos(3*theta)
    await page.getByTestId('curve-expr-input').fill('r = 2*cos(3*theta)')
    await expect(page.getByTestId('draft-ok')).toContainText('识别为极坐标')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(3)

    // 参数方程：x = cos(t); y = sin(t)
    await page.getByTestId('curve-expr-input').fill('x = cos(t); y = sin(t)')
    await expect(page.getByTestId('draft-ok')).toContainText('识别为参数方程')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(4)
    await expect(page.getByTestId('curve-expr2')).toHaveValue('sin(t)')
    await expect(page.getByTestId('curve-error')).toHaveCount(0)

    // 非法输入：给出错误反馈且不添加
    await page.getByTestId('curve-expr-input').fill('x = 1 = 2')
    await expect(page.getByTestId('draft-error')).toContainText('最多包含一个等号')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(4)
  })

  test('表达式错误提示，不产生曲线段', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('curve-expr-input').fill('sin(')
    await page.getByTestId('curve-add').click()
    await expect(page.getByTestId('curve-item')).toHaveCount(1)
    await expect(page.getByTestId('curve-error')).toBeVisible()
    expect(await countRedPixels(page)).toBeLessThan(20)
  })

  test('滚轮缩放以视图中心为锚点：中心数学坐标保持不变', async ({ page }) => {
    await page.goto('/')
    const canvas = await page.getByTestId('stage-canvas').boundingBox()
    expect(canvas).not.toBeNull()
    const cx = canvas!.x + canvas!.width / 2
    const cy = canvas!.y + canvas!.height / 2

    // 记录画布中心（视图中心）的数学坐标
    await page.mouse.move(cx, cy)
    const centerBefore = await readCursor(page)
    expect(centerBefore).not.toBeNull()

    // 在偏离中心的位置滚轮缩放（旧实现以光标为锚点，会改变中心坐标）
    // 坐标取画布右侧空闲区（避开左侧浮动编辑卡片）
    await page.mouse.move(canvas!.x + canvas!.width * 0.72, canvas!.y + canvas!.height * 0.35)
    await page.mouse.wheel(0, -500)
    await page.mouse.move(cx, cy)
    const centerAfter = await readCursor(page)
    expect(centerAfter).not.toBeNull()

    // 中心坐标保持不动（缩放围绕视图中心）
    expect(Math.abs(centerAfter!.x - centerBefore!.x)).toBeLessThan(0.001)
    expect(Math.abs(centerAfter!.y - centerBefore!.y)).toBeLessThan(0.001)

    // 缩放确实生效：比例读数变大
    const scaleText = await page.getByTestId('scale-readout').textContent()
    const scale = Number(scaleText?.match(/([\d.]+)/)?.[1] ?? '0')
    expect(scale).toBeGreaterThan(80)
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

test.describe('v0.4 坐标与输入增强', () => {
  test('对数坐标：切换后中心归一化为 (1,1)、状态栏单位正确', async ({ page }) => {
    await page.goto('/?curves=log(x)')
    await page.getByLabel('坐标').selectOption('log')
    await expect(page.getByTestId('scale-readout')).toContainText('px/十倍程')

    // 回归：切换后视图中心必须在合理的量级（曾因 center=0 → log10(0) 跑到 1e-300）
    const box = await page.getByTestId('stage-canvas').boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect
      .poll(async () => {
        const text = await page.getByTestId('cursor-pos').textContent()
        const match = text?.match(/\(([^,]+),\s*([^)]+)\)/)
        return match ? [Number(match[1]), Number(match[2])] : null
      })
      .toEqual([1, 1])

    // 切回直角：居中值保持（1,1），单位文案恢复
    await page.getByLabel('坐标').selectOption('rect')
    await expect(page.getByTestId('scale-readout')).toContainText('px/单位')
  })

  test('曲线输入快捷函数按钮：点击 sin() 插入后直接输入参数', async ({ page }) => {
    await page.goto('/')
    const input = page.getByTestId('curve-expr-input')
    await input.click()

    await page.getByTestId('fn-chip-sin').click()
    await expect(input).toHaveValue('sin()')
    // 光标应位于括号内：直接键入 x 即得 sin(x)
    await page.keyboard.type('x')
    await expect(input).toHaveValue('sin(x)')

    await input.press('Enter')
    await expect(page.getByTestId('curve-item')).toHaveCount(1)

    // 清空后连续插入：^2 与 π 片段
    await input.fill('')
    await page.getByTestId('fn-chip-pow2').click()
    await page.keyboard.type('x')
    await page.getByTestId('fn-chip-pi').click()
    await expect(input).toHaveValue('^2xpi')
  })
})
