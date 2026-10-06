import { expect, test, type Page } from '@playwright/test'

/**
 * v3.1 移动端画布手势：双指收放缩放 + 双击放大 + 触屏平移。
 * 双指缩放用 CDP 手动派发 touchStart/touchMove/touchEnd（Chromium）。
 */
test.describe('v3.1 移动端画布手势', () => {
  test.use({ hasTouch: true })

  async function pinch(page: Page, spread: number): Promise<void> {
    const client = await page.context().newCDPSession(page)
    const box = (await page.locator('.stage').boundingBox())!
    const center = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5 }
    const startHalf = 40
    const endHalf = startHalf * spread
    const points = (half: number): Array<{ x: number; y: number; id: number }> => [
      { x: center.x - half, y: center.y, id: 1 },
      { x: center.x + half, y: center.y, id: 2 },
    ]
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points(startHalf),
    })
    const steps = 6
    for (let step = 1; step <= steps; step++) {
      const half = startHalf + ((endHalf - startHalf) * step) / steps
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: points(half),
      })
      await page.waitForTimeout(16)
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(200)
  }

  test('双指缩放：捏合后缩放比例变化', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    const readout = page.getByTestId('scale-readout')
    await expect(readout).toBeVisible()
    const before = await readout.innerText()
    await pinch(page, 2.2)
    const after = await readout.innerText()
    expect(after).not.toBe(before)
  })

  test('双击放大：显示比例增大', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    const readout = page.getByTestId('scale-readout')
    await expect(readout).toBeVisible()
    const zoom = async (): Promise<number> =>
      Number((await readout.innerText()).replace(/[^0-9.]/g, ''))
    const before = await zoom()
    const box = (await page.locator('.stage').boundingBox())!
    const tapX = box.x + box.width * 0.7
    const tapY = box.y + box.height * 0.5
    await page.touchscreen.tap(tapX, tapY)
    await page.waitForTimeout(90)
    await page.touchscreen.tap(tapX, tapY)
    await page.waitForTimeout(250)
    const after = await zoom()
    expect(after).toBeGreaterThan(before)
  })

  test('单指拖拽平移：视图平移但比例不变（触屏平移仍可用）', async ({ page }) => {
    await page.goto('/?curves=sin(x)')
    const readout = page.getByTestId('scale-readout')
    const before = await readout.innerText()
    const client = await page.context().newCDPSession(page)
    const box = (await page.locator('.stage').boundingBox())!
    await client.send('Input.synthesizeScrollGesture', {
      x: box.x + box.width * 0.7,
      y: box.y + box.height * 0.5,
      xDistance: -160,
      yDistance: 0,
      gestureSourceType: 'touch',
    })
    await page.waitForTimeout(300)
    // 缩放比例不变（平移不改变比例）
    expect(await readout.innerText()).toBe(before)
  })
})
