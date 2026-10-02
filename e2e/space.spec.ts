import { expect, test, type Page } from '@playwright/test'

/** 3D 画布非背景像素计数（背景 #f7f9fc；WebGL 需 preserveDrawingBuffer，已启用） */
async function countScenePixels(page: Page): Promise<number> {
  return page.getByTestId('space-canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return -1
    const width = canvas.width
    const height = canvas.height
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    let count = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] ?? 0
      const g = pixels[i + 1] ?? 0
      const b = pixels[i + 2] ?? 0
      if (Math.abs(r - 247) > 14 || Math.abs(g - 249) > 14 || Math.abs(b - 252) > 14) count++
    }
    return count
  })
}

/** WebGL 不可用（软件渲染被禁用）时跳过像素级断言 */
async function webglAvailable(page: Page): Promise<boolean> {
  return (await page.getByTestId('space-unavailable').count()) === 0
}

test.describe('v0.8 3D 与场（第四模式）', () => {
  test('?mode=space 直达：3D 面板与画布可见、模式标签选中', async ({ page }) => {
    await page.goto('/?mode=space')
    await expect(page.getByTestId('mode-space')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('space-panel')).toBeVisible()
    await expect(page.getByTestId('space-canvas')).toBeVisible()
    await expect(page.getByTestId('space-empty')).toBeVisible()
    // 2D 面板不可见
    await expect(page.getByTestId('curve-kind-select')).toHaveCount(0)
    await expect(page.getByTestId('graph-panel')).toHaveCount(0)
  })

  test('添加 sin(x)·cos(y) 曲面：场景渲染（非背景像素 > 1000）', async ({ page }) => {
    await page.goto('/?mode=space')
    test.skip(!(await webglAvailable(page)), 'WebGL 不可用')
    await page.getByTestId('space-add').click()
    await expect(page.getByTestId('space-object-list')).toBeVisible()
    await expect.poll(() => countScenePixels(page), { timeout: 15000 }).toBeGreaterThan(1000)
  })

  test('视图选项：相机/着色/色图/等高线切换不报错且画面保持', async ({ page }) => {
    await page.goto('/?mode=space')
    test.skip(!(await webglAvailable(page)), 'WebGL 不可用')
    const errors: Error[] = []
    page.on('pageerror', (error) => errors.push(error))

    await page.getByTestId('space-add').click()
    await expect.poll(() => countScenePixels(page), { timeout: 15000 }).toBeGreaterThan(1000)

    await page.getByTestId('space-camera').selectOption('ortho')
    await page.getByTestId('space-shading').selectOption('normal')
    await page.getByTestId('space-colormap').selectOption('plasma')
    await page.getByTestId('space-contours').evaluate((element, value) => {
      const input = element as HTMLInputElement
      input.value = String(value)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, 6)
    await page.getByTestId('space-shading').selectOption('solid')
    await expect.poll(() => countScenePixels(page), { timeout: 15000 }).toBeGreaterThan(1000)
    expect(errors).toEqual([])
  })

  test('切平面：勾选后读数显示偏导（sin·cos 在 (0,0) 处 ∂f/∂x = 1、∂f/∂y = 0）', async ({
    page,
  }) => {
    await page.goto('/?mode=space')
    await page.getByTestId('space-add').click()
    await page.getByTestId('space-tangent').check()
    await expect(page.getByTestId('tangent-readout')).toBeVisible()
    await expect(page.getByTestId('tangent-dx')).toContainText('1.0000')
    await expect(page.getByTestId('tangent-dy')).toContainText('0.0000')
    await expect(page.getByTestId('space-tangent-hint')).toBeVisible()
  })

  test('对象删除：回到空状态提示', async ({ page }) => {
    await page.goto('/?mode=space')
    await page.getByTestId('space-add').click()
    await expect(page.getByTestId('space-object-0')).toBeVisible()
    await page.getByTestId('space-remove-0').click()
    await expect(page.getByTestId('space-empty')).toBeVisible()
  })

  test('预设添加：洛伦兹曲线 / 旋转场 / ODE 解', async ({ page }) => {
    await page.goto('/?mode=space')
    test.skip(!(await webglAvailable(page)), 'WebGL 不可用')
    // 曲线：洛伦兹
    await page.getByTestId('space-add-kind').selectOption('curve')
    await page.getByTestId('space-add-preset').selectOption('lorenz')
    await page.getByTestId('space-add').click()
    // 场：旋转场（旋度着色）
    await page.getByTestId('space-add-kind').selectOption('field')
    await page.getByTestId('space-add-preset').selectOption('rotation')
    await page.getByTestId('space-add').click()
    // ODE
    await page.getByTestId('space-add-kind').selectOption('ode')
    await page.getByTestId('space-add-preset').selectOption('exp')
    await page.getByTestId('space-add').click()
    await expect.poll(() => countScenePixels(page), { timeout: 20000 }).toBeGreaterThan(1000)
    await expect(page.getByTestId('space-object-0')).toBeVisible()
    await expect(page.getByTestId('space-object-1')).toBeVisible()
    await expect(page.getByTestId('space-object-2')).toBeVisible()
  })

  test('空间曲线参数编辑：表达式/步数可修改', async ({ page }) => {
    await page.goto('/?mode=space')
    await page.getByTestId('space-add-kind').selectOption('curve')
    await page.getByTestId('space-add-preset').selectOption('helix')
    await page.getByTestId('space-add').click()
    await page.getByTestId('space-curve-expr').fill('t/3')
    await page.getByTestId('space-curve-expr').blur()
    await expect(page.getByTestId('space-curve-expr')).toHaveValue('t/3')
  })

  test('参数化预设：平面/椭球系数滑块联动表达式，拖动一步撤销', async ({ page }) => {
    await page.goto('/?mode=space')
    // 平面：默认表达式与参数滑块
    await page.getByTestId('space-add-preset').selectOption('plane')
    await page.getByTestId('space-add').click()
    await expect(page.getByTestId('space-expr')).toHaveValue('0.5*x + 0.3*y + 1')
    const aSlider = page.getByTestId('space-param-a')
    await expect(aSlider).toBeVisible()
    await aSlider.evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '2'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByTestId('space-expr')).toHaveValue('2*x + 0.3*y + 1')
    // 一步撤销回到默认系数
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('space-expr')).toHaveValue('0.5*x + 0.3*y + 1')

    // 椭球：半轴 c 调整联动 expr3 与名称
    await page.getByTestId('space-add-preset').selectOption('ellipsoid')
    await page.getByTestId('space-add').click()
    await expect(page.getByTestId('space-expr')).toHaveValue('2*sin(u)*cos(v)')
    await page.getByTestId('space-param-c').evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '3'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByTestId('space-expr3')).toHaveValue('3*cos(u)')
    await expect(page.getByTestId('space-object-0')).toContainText('c=3')
  })

  test('参数化预设：洛伦兹 σ/ρ/β 滑块存在且可调', async ({ page }) => {
    await page.goto('/?mode=space')
    await page.getByTestId('space-add-kind').selectOption('curve')
    await page.getByTestId('space-add-preset').selectOption('lorenz')
    await page.getByTestId('space-add').click()
    await expect(page.getByTestId('space-param-sigma')).toBeVisible()
    await page.getByTestId('space-param-rho').evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '40'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(page.getByTestId('space-object-0')).toContainText('ρ=40')
  })

  test('截图导出：PNG 下载成功', async ({ page }) => {
    await page.goto('/?mode=space')
    test.skip(!(await webglAvailable(page)), 'WebGL 不可用')
    await page.getByTestId('space-add').click()
    await expect.poll(() => countScenePixels(page), { timeout: 15000 }).toBeGreaterThan(1000)
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.getByTestId('space-export-png').click(),
    ])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const buffer = Buffer.concat(chunks)
    expect(buffer.length).toBeGreaterThan(1000)
    // PNG 魔术字节
    expect(buffer[0]).toBe(0x89)
    expect(buffer[1]).toBe(0x50)
  })

  test('旋转 GIF：帧数/速度可调；一次点击仅一个下载（回归：不再无限重复导出）', async ({
    page,
  }) => {
    await page.goto('/?mode=space')
    test.skip(!(await webglAvailable(page)), 'WebGL 不可用')
    await page.getByTestId('space-add').click()
    await expect.poll(() => countScenePixels(page), { timeout: 15000 }).toBeGreaterThan(1000)

    // 参数可调：帧数调小、速度调快（缩短测试时间）
    await page.getByTestId('space-gif-frames').evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '12'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.getByTestId('space-gif-fps').evaluate((element) => {
      const input = element as HTMLInputElement
      input.value = '20'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    let downloads = 0
    page.on('download', () => {
      downloads += 1
    })
    await page.getByTestId('space-export-gif').click()
    // 导出中：遮罩可见、按钮禁用（文案切换）
    await expect(page.getByTestId('space-exporting')).toBeVisible()
    await expect(page.getByTestId('space-export-gif')).toBeDisabled()
    // 完成后按钮恢复
    await expect(page.getByTestId('space-export-gif')).toBeEnabled({ timeout: 60000 })
    // 等待旧 bug 的“第二轮导出”窗口，确认没有重复下载
    await page.waitForTimeout(2500)
    expect(downloads).toBe(1)
  })

  test('与 2D 共享文档：plot 曲线与 3D 对象互不干扰、切换不丢状态', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    // 2D 曲线在
    await expect(page.getByTestId('curve-expr')).toHaveValue('sin(x)')
    // 切到 3D 加曲面
    await page.getByTestId('mode-space').click()
    await page.getByTestId('space-add').click()
    await expect(page.getByTestId('space-object-0')).toBeVisible()
    // 切回 plot：曲线还在
    await page.getByTestId('mode-plot').click()
    await expect(page.getByTestId('curve-expr')).toHaveValue('sin(x)')
    // 再回 3D：曲面还在
    await page.getByTestId('mode-space').click()
    await expect(page.getByTestId('space-object-0')).toBeVisible()
    // 撤销：移除曲面（一步）
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('space-empty')).toBeVisible()
  })

  test('二重积分：∬(x²+y²) 在 [-1,1]² 上计算（≈8/3）并显示区域与采样数', async ({ page }) => {
    await page.goto('/?mode=space')
    await page.getByTestId('integral-f').fill('x^2 + y^2')
    await page.getByTestId('integral-run').click()
    const result = page.getByTestId('integral-result')
    await expect(result).toBeVisible()
    await expect(result).toContainText('2.6667')
    await expect(result).toContainText('x∈[-1, 1]')
    await expect(result).toContainText('y∈[-1, 1]')
    await expect(result).toContainText('16641 采样')
    // 清除区域与读数
    await page.getByTestId('integral-clear').click()
    await expect(result).toHaveCount(0)
    // 非法范围（x₀ ≥ x₁）：错误提示且不出结果
    await page.getByTestId('integral-x0').fill('2')
    await page.getByTestId('integral-run').click()
    await expect(page.getByTestId('integral-error')).toBeVisible()
    await expect(result).toHaveCount(0)
  })
})
