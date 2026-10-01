/**
 * 生成病态函数基准图（v0.3 验收：与 JSXGraph 并排比对）。
 *
 * 用法：
 *   1. pnpm add -D jsxgraph@1.13.3   （临时依赖，生成后可移除）
 *   2. 启动开发服务器：pnpm dev
 *   3. node scripts/gen-baselines.mjs
 *
 * 输出：
 *   tests/benchmark/baselines/jsxgraph-<slug>.png （JSXGraph 1.13.3 基准）
 *   tests/benchmark/baselines/ours-<slug>.png     （本实现输出）
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(root, 'tests', 'benchmark', 'baselines')
mkdirSync(outDir, { recursive: true })

/** 病态函数用例（与 docs/versions/v0.3-2d-plotting-core.md 验收表一致） */
const CASES = [
  { slug: 'tan', our: 'tan(x)', jsx: 'Math.tan(x)', range: [-8, 8, -5, 5] },
  { slug: 'sin-1-over-x', our: 'sin(1/x)', jsx: 'Math.sin(1/x)', range: [-1, 1, -1.2, 1.2] },
  {
    slug: 'x-sin-1-over-x',
    our: 'x*sin(1/x)',
    jsx: 'x*Math.sin(1/x)',
    range: [-1, 1, -1.2, 1.2],
  },
  { slug: 'recip-x2-1', our: '1/(x^2-1)', jsx: '1/((x*x)-1)', range: [-5, 5, -10, 10] },
  { slug: 'sqrt', our: 'sqrt(x)', jsx: 'Math.sqrt(x)', range: [-3, 3, -3, 3] },
  { slug: 'ln', our: 'ln(x)', jsx: 'Math.log(x)', range: [-1, 6, -4, 4] },
  { slug: 'floor', our: 'floor(x)', jsx: 'Math.floor(x)', range: [-5, 5, -6, 6] },
  { slug: 'abs-over-x', our: 'abs(x)/x', jsx: 'Math.abs(x)/x', range: [-3, 3, -2, 2] },
  { slug: 'gauss', our: 'exp(-x^2)', jsx: 'Math.exp(-(x*x))', range: [-4, 4, -0.5, 1.3] },
  {
    slug: 'x2-extreme',
    our: 'x^2',
    jsx: 'x*x',
    // x∈[1e5, 1e5+10]，y 取 f(1e5+5)±1.1e6
    range: [100000, 100010, 10001000025 - 1100000, 10001000025 + 1100000],
  },
]

const channel = process.env.PW_CHANNEL || undefined
const browser = await chromium.launch(channel ? { channel } : {})
const page = await browser.newPage({ viewport: { width: 1120, height: 726 } })

const htmlUrl = pathToFileURL(join(root, 'tests', 'benchmark', 'jsxgraph-baseline.html')).href

for (const testCase of CASES) {
  const view = testCase.range.join(',')
  console.log(`[${testCase.slug}] JSXGraph…`)
  await page.goto(`${htmlUrl}?fn=${encodeURIComponent(testCase.jsx)}&view=${view}`)
  await page.waitForFunction(() => {
    // 该回调在浏览器上下文中执行
    // eslint-disable-next-line no-undef
    return document.title === 'ready'
  })
  await page.locator('#board').screenshot({ path: join(outDir, `jsxgraph-${testCase.slug}.png`) })

  console.log(`[${testCase.slug}] ours…`)
  const url = `http://127.0.0.1:5173/?curves=${encodeURIComponent(testCase.our)}&range=${view}`
  await page.goto(url)
  await page.getByTestId('curve-item').waitFor()
  await page.waitForTimeout(400) // 等一帧重绘
  await page
    .getByTestId('stage-canvas')
    .screenshot({ path: join(outDir, `ours-${testCase.slug}.png`) })
}

await browser.close()
console.log(`完成：${CASES.length * 2} 张基准图 → tests/benchmark/baselines/`)
