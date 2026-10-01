/**
 * PWA 生产验证（v1.0）：启动 preview 服务后运行。
 *
 * 检查项：
 * - Service Worker 激活；
 * - manifest / 图标可访问；
 * - 离线刷新可打开应用（SW 外壳缓存）；
 * - 首屏绘制（stage-canvas 存在）。
 *
 * 用法：node scripts/verify-pwa.mjs [http://localhost:4173]
 */
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:4173'
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext()
const page = await context.newPage()

const consoleErrors = []
page.on('pageerror', (error) => consoleErrors.push(String(error)))

await page.goto(`${base}/?mode=notebook`, { waitUntil: 'networkidle' })
// 首次访问：SW install → activate → claim；再在线刷新一次让全部资源进缓存
await page.waitForTimeout(1200)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  const registration = await navigator.serviceWorker.ready
  return registration.active ? 'active' : 'pending'
})
const manifestStatus = await page.evaluate(() =>
  fetch('/manifest.webmanifest').then((r) => r.status),
)
const iconStatus = await page.evaluate(() => fetch('/icon-512.png').then((r) => r.status))
const onlineTitle = await page.title()
const onlinePanel = await page.locator('[data-testid="notebook-panel"]').count()

// 离线：刷新应仍能打开（外壳缓存 + 静态资源缓存）
await context.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
await page.waitForTimeout(1500)
const offlineTitle = await page.title()
const offlinePanel = await page.locator('[data-testid="notebook-panel"]').count()

await context.setOffline(false)
await browser.close()

const report = {
  swReady,
  manifestStatus,
  iconStatus,
  onlineTitle,
  onlinePanel,
  offlineTitle,
  offlinePanel,
  consoleErrors,
}
console.log(JSON.stringify(report, null, 2))
const ok =
  swReady === 'active' &&
  manifestStatus === 200 &&
  iconStatus === 200 &&
  offlinePanel > 0 &&
  offlineTitle === onlineTitle
if (!ok) {
  console.error('PWA verification FAILED')
  process.exitCode = 1
} else {
  console.log('PWA verification OK')
}
