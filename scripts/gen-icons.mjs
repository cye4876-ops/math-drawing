/**
 * PWA 图标生成：把 public/icon.svg 渲染为 192/512 PNG（用本机 Chrome headless）。
 * 用法：node scripts/gen-icons.mjs
 */
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const svgUrl = new URL('../public/icon.svg', import.meta.url).href
const targets = [
  { size: 192, path: fileURLToPath(new URL('../public/icon-192.png', import.meta.url)) },
  { size: 512, path: fileURLToPath(new URL('../public/icon-512.png', import.meta.url)) },
]

const browser = await chromium.launch({ channel: 'chrome' })
for (const { size, path } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.goto(svgUrl)
  await page.waitForTimeout(300)
  await page.screenshot({ path })
  await page.close()
  console.log(`icon-${size}.png -> ${path}`)
}
await browser.close()
console.log('done')
