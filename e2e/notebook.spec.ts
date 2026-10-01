import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

/**
 * v1.0 Notebook 与教学 e2e：
 * 单元格系统 / 跨格变量级联 / 导出 / 教学 / 插件六扩展点 / PWA 相关资源。
 */

test.describe('v1.0 Notebook：单元格与执行', () => {
  test('?mode=notebook 进入：画布、侧栏面板与默认格渲染', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await expect(page.getByTestId('mode-notebook')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('notebook-view')).toBeVisible()
    await expect(page.getByTestId('notebook-panel')).toBeVisible()
    await expect(page.getByTestId('nb-cell-0')).toBeVisible()
    // 默认示例：Markdown 公式被 KaTeX 渲染
    await expect(page.getByTestId('nb-preview-0').locator('.katex').first()).toBeVisible()
  })

  test('四种类型单元格可创建；计算格求值与数据格预览', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await page.getByTestId('notebook-add-markdown').click()
    await page.getByTestId('notebook-add-figure').click()
    await page.getByTestId('notebook-add-compute').click()
    await page.getByTestId('notebook-add-data').click()
    await expect(page.locator('[data-testid^="nb-cell-"]')).toHaveCount(6)

    // 计算格：求值显示数值
    await page.getByTestId('nb-compute-4').fill('1/4 + 1/4')
    await expect(page.getByTestId('nb-value-4')).toContainText('0.5')

    // 数据格：表格预览
    await page.getByTestId('nb-data-5').fill('x,y\n1,2\n3,4')
    await expect(page.getByTestId('nb-table-5')).toContainText('x')
    await expect(page.getByTestId('nb-table-5')).toContainText('3')
  })

  test('跨格变量：定义 → 引用 → 修改定义自动级联更新', async ({ page }) => {
    await page.goto('/?mode=notebook')
    // 默认格 2：a = 2
    await expect(page.getByTestId('nb-defined-1')).toContainText('a')
    await page.getByTestId('notebook-add-compute').click()
    await page.getByTestId('nb-compute-2').fill('a * 100 + 7')
    await expect(page.getByTestId('nb-value-2')).toContainText('207')

    // 修改定义 → 引用格自动级联
    await page.getByTestId('nb-compute-1').fill('a = 3')
    await expect(page.getByTestId('nb-value-2')).toContainText('307')

    // 变量区显示当前作用域
    await expect(page.getByTestId('notebook-variables')).toContainText('a = 3')
  })

  test('循环依赖：检测并报错（不进入死循环）', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await page.getByTestId('nb-compute-1').fill('b = p + 1')
    await page.getByTestId('notebook-add-compute').click()
    await page.getByTestId('nb-compute-2').fill('p = b + 1')
    await expect(page.getByTestId('nb-error-1')).toContainText('循环依赖')
    await expect(page.getByTestId('nb-error-2')).toContainText('循环依赖')
    // 主程序仍然可用
    await expect(page.getByTestId('notebook-panel')).toBeVisible()
  })

  test('常量名不可作变量名：给出明确报错', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await page.getByTestId('nb-compute-1').fill('e = 5')
    await expect(page.getByTestId('nb-error-1')).toBeVisible()
  })

  test('排序 / 折叠 / 复制 / 删除', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await expect(page.getByTestId('nb-cell-0')).toHaveAttribute('data-cell-type', 'markdown')

    // 下移按钮：文本格与计算格交换
    await page.getByTestId('nb-down-0').click()
    await expect(page.getByTestId('nb-cell-0')).toHaveAttribute('data-cell-type', 'compute')

    // 折叠/展开
    await page.getByTestId('nb-collapse-0').click()
    await expect(page.getByTestId('nb-cell-0')).toHaveClass(/collapsed/)
    await page.getByTestId('nb-collapse-0').click()
    await expect(page.getByTestId('nb-cell-0')).not.toHaveClass(/collapsed/)

    // 复制 → 格数 +1；类型一致
    await page.getByTestId('nb-duplicate-0').click()
    await expect(page.locator('[data-testid^="nb-cell-"]')).toHaveCount(3)
    await expect(page.getByTestId('nb-cell-1')).toHaveAttribute('data-cell-type', 'compute')

    // 删除 → 格数 -1
    await page.getByTestId('nb-remove-1').click()
    await expect(page.locator('[data-testid^="nb-cell-"]')).toHaveCount(2)
  })

  test('图形格：捕获当前视图（预载曲线）并可打开', async ({ page }) => {
    await page.goto('/?mode=notebook&curves=sin(x)')
    await page.getByTestId('notebook-add-figure').click()
    await page.getByTestId('nb-capture-2').click()
    await expect(page.getByTestId('nb-open-2')).toBeVisible()
    await expect(page.getByTestId('nb-figure-2')).toBeVisible()
  })

  test('演示模式：全屏投影状态切换（body 类）', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await page.getByTestId('toggle-presentation').click()
    await expect(page.locator('body')).toHaveClass(/presentation-mode/)
    // 浮动退出按钮可见且可用（侧栏已被隐藏）
    await expect(page.getByTestId('presentation-exit')).toBeVisible()
    await page.getByTestId('presentation-exit').click()
    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/)

    // Esc 也可退出（非全屏场景）
    await page.getByTestId('toggle-presentation').click()
    await expect(page.locator('body')).toHaveClass(/presentation-mode/)
    await page.keyboard.press('Escape')
    await expect(page.locator('body')).not.toHaveClass(/presentation-mode/)
  })

  test('Notebook 自动保存与刷新恢复（localStorage）', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await page.getByTestId('notebook-title').fill('单元测试标题')
    await page.waitForTimeout(900) // 保存防抖
    await page.reload()
    await expect(page.getByTestId('notebook-title')).toHaveValue('单元测试标题')
  })
})

test.describe('v1.0 Notebook：导出', () => {
  test('保存 JSON 与载入还原', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await page.getByTestId('notebook-add-data').click()
    await page.getByTestId('nb-data-2').fill('x,y\n1,2')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('notebook-save-json').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.json$/)
    const json = await readFile((await download.path())!, 'utf-8')
    const parsed = JSON.parse(json) as { cells: unknown[] }
    expect(parsed.cells.length).toBe(3)

    // 新建清空 → 载入还原
    await page.getByTestId('notebook-new').click()
    await expect(page.locator('[data-testid^="nb-cell-"]')).toHaveCount(2)
    await page.getByTestId('notebook-import-json').setInputFiles({
      name: 'notebook.json',
      mimeType: 'application/json',
      buffer: Buffer.from(json),
    })
    await expect(page.getByTestId('notebook-export-message')).toContainText('已载入')
    await expect(page.locator('[data-testid^="nb-cell-"]')).toHaveCount(3)
  })

  test('导出 HTML：单文件自包含（KaTeX 样式与图形数据内联）', async ({ page }) => {
    await page.goto('/?mode=notebook&curves=sin(x)')
    // 先捕获一个图形格（导出内容需含可交互图形）
    await page.getByTestId('notebook-add-figure').click()
    await page.getByTestId('nb-capture-2').click()
    await expect(page.getByTestId('nb-open-2')).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByTestId('notebook-export-html').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.html$/)
    const html = await readFile((await download.path())!, 'utf-8')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('katex') // 公式样式内联
    expect(html).toContain('<canvas') // 图形以画布 + 内嵌脚本渲染（保持交互）
    expect(html).toContain('mdCreateViewer') // 内嵌交互 viewer 脚本
  })

  test('导出 LaTeX 与 Markdown', async ({ page }) => {
    await page.goto('/?mode=notebook')
    const [texDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('notebook-export-latex').click(),
    ])
    expect(texDownload.suggestedFilename()).toMatch(/\.tex$/)
    const tex = await readFile((await texDownload.path())!, 'utf-8')
    expect(tex).toContain('\\documentclass')
    expect(tex).toContain('ctex')

    const [zipDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('notebook-export-markdown').click(),
    ])
    expect(zipDownload.suggestedFilename()).toMatch(/\.zip$/)
    await expect(page.getByTestId('notebook-export-message')).toContainText('已打包')
  })
})

test.describe('v1.0 教学辅助', () => {
  test('示例库：一键载入正弦示例（切入函数绘图模式）', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await page.getByTestId('example-sine').click()
    await expect(page.getByTestId('mode-plot')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('curve-kind-select')).toBeVisible()
  })

  test('题目模式：未达标 ✗ → 绘制后 ✓；容差可配置', async ({ page }) => {
    // 无曲线：检查应不通过
    await page.goto('/?mode=notebook')
    await page.getByTestId('problem-check').click()
    await expect(page.getByTestId('problem-result')).toContainText('✗')

    // 容差输入生效（改小再检查）
    await page.getByTestId('problem-tolerance').fill('0.000001')

    // 预载 sin(x) 后检查通过
    await page.goto('/?mode=notebook&curves=sin(x)')
    await page.getByTestId('problem-check').click()
    await expect(page.getByTestId('problem-result')).toContainText('✓')
  })

  test('参数动画：录制 GIF 并下载', async ({ page }) => {
    await page.goto('/?mode=notebook&curves=a*sin(x)')
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByTestId('anim-record').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.gif$/)
    await expect(page.getByTestId('anim-message')).toContainText('已导出 GIF')
  })
})

test.describe('v1.0 插件系统（示例插件六扩展点）', () => {
  test('加载成功：函数 / 视图 / 单元格 / 工具 / 导出器 / 元素全链路', async ({ page }) => {
    await page.goto('/?mode=notebook')

    // 加载示例插件
    await page.getByTestId('plugin-load').click()
    await expect(page.getByTestId('plugin-message')).toContainText('已加载 example-logistic')
    await expect(page.getByTestId('plugin-list')).toContainText('example-logistic')

    // ① 表达式函数：计算格求值 logistic(0) = 0.5（词法完整词优先，不被 log 前缀吞掉）
    await page.getByTestId('notebook-add-compute').click()
    await page.getByTestId('nb-compute-2').fill('logistic(0)')
    await expect(page.getByTestId('nb-value-2')).toContainText('0.5')

    // ④ 视图：插件面板按钮放置示例三角形（写入场景文档）
    await page.getByTestId('plugin-add-triangle').click()

    // ⑥ 单元格类型：添加插件格并渲染
    await page.getByTestId('plugin-cell-add-example-logistic-table').click()
    await expect(page.getByTestId('nb-plugin-3')).toBeVisible()
    await expect(page.getByTestId('nb-plugin-3')).toContainText('logistic')

    // ③ 工具：切到函数绘图模式，工具条出现「多边形」
    await page.getByTestId('mode-plot').click()
    await expect(page.getByTestId('tool-plugin-polygon')).toBeVisible()

    // ② 元素 + ⑤ 导出器随后验证（导出面板）
    await page.getByTestId('export-open').click()
    await expect(page.getByTestId('plugin-exporter-select')).toBeVisible()
    await expect(page.getByTestId('plugin-exporter-select')).toContainText('曲线采样 CSV')

    // ② 元素：导出的文档 JSON 含插件对象（polygon 三角形）
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-json').click(),
    ])
    const doc = await readFile((await download.path())!, 'utf-8')
    expect(doc).toContain('"pluginType"')
    expect(doc).toContain('polygon')
  })

  test('加载失败：结构化错误提示且主程序不受影响', async ({ page }) => {
    await page.goto('/?mode=notebook')
    await page.getByTestId('plugin-url').fill('/plugins/definitely-missing.js')
    await page.getByTestId('plugin-load').click()
    await expect(page.getByTestId('plugin-error')).toContainText('模块加载失败')

    // 主程序仍可正常操作
    await page.getByTestId('notebook-add-compute').click()
    await page.getByTestId('nb-compute-2').fill('2+2')
    await expect(page.getByTestId('nb-value-2')).toContainText('4')
  })

  test('插件卸载后（新页面）：插件格显示未注册提示而非报错', async ({ page }) => {
    // 从 localStorage 构造一个含插件格的 Notebook（不加载插件）
    await page.goto('/?mode=notebook')
    const doc = JSON.stringify({
      title: '插件格',
      cells: [
        {
          id: 'c1',
          type: 'plugin',
          pluginType: 'example-logistic-table',
          data: {},
          collapsed: false,
        },
      ],
    })
    await page.getByTestId('notebook-import-json').setInputFiles({
      name: 'nb.json',
      mimeType: 'application/json',
      buffer: Buffer.from(doc),
    })
    await expect(page.getByTestId('nb-plugin-missing-0')).toContainText('未注册')
  })
})

test.describe('v1.0 PWA 资源', () => {
  test('manifest 与图标可访问（dev 模式静态资源）', async ({ page, request }) => {
    await page.goto('/?mode=notebook')
    const manifest = await request.get('/manifest.webmanifest')
    expect(manifest.ok()).toBeTruthy()
    const body = await manifest.json()
    expect(body.name).toBe('数学绘图工具')
    expect(body.icons.length).toBeGreaterThanOrEqual(2)

    const icon = await request.get('/icon-512.png')
    expect(icon.ok()).toBeTruthy()
    const buffer = await icon.body()
    // PNG 魔术字节
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  })

  test('sw.js 可访问且声明版本', async ({ request }) => {
    const response = await request.get('/sw.js')
    expect(response.ok()).toBeTruthy()
    const body = await response.text()
    expect(body).toContain("const VERSION = '")
    expect(body).toContain('addEventListener')
  })
})
