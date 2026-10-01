/**
 * 构建产物体积核算（v1.0 验收 / CI 用）：
 * - 列出 Top 文件（未压缩 + gzip）；
 * - 统计 dist 总量与「首屏传输量」（入口 JS/CSS + 运行时 + 首屏公共 chunk 的 gzip 之和）。
 *
 * 用法：node scripts/bundle-size.mjs
 * 阈值（v1.0 验收）：dist gzip 总量 ≤ 2 MB；首屏传输 ≤ 250 KB（gzip）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const distRoot = fileURLToPath(new URL('../dist', import.meta.url))

/** 递归收集文件 */
function walk(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const info = statSync(full)
    if (info.isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

const files = walk(distRoot)
let totalRaw = 0
let totalGzip = 0
const rows = []
for (const file of files) {
  const buffer = readFileSync(file)
  const gzip = gzipSync(buffer, { level: 9 }).length
  totalRaw += buffer.length
  totalGzip += gzip
  rows.push({ file: relative(distRoot, file).replaceAll('\\', '/'), raw: buffer.length, gzip })
}

rows.sort((a, b) => b.gzip - a.gzip)

const kb = (n) => `${(n / 1024).toFixed(1)} kB`
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`

console.log('== 构建产物体积（gzip Top 15）==')
for (const row of rows.slice(0, 15)) {
  console.log(
    `  ${row.file.padEnd(52)} raw ${kb(row.raw).padStart(9)}  gzip ${kb(row.gzip).padStart(9)}`,
  )
}

// 首屏：入口 JS + 入口 CSS + 运行时 + 首屏公共 chunk（入口静态导入的）——按文件名约定近似
const firstPaint = rows.filter(
  (row) =>
    /^assets\/index-.*\.(js|css)$/.test(row.file) || /^assets\/rolldown-runtime-/.test(row.file),
)
const firstPaintGzip = firstPaint.reduce((sum, row) => sum + row.gzip, 0)

console.log('')
console.log(`dist 总量：  ${mb(totalRaw)}（gzip ${mb(totalGzip)}）`)
console.log(`首屏传输：  ${kb(firstPaintGzip)}（gzip；入口 JS+CSS+运行时）`)
for (const row of firstPaint) console.log(`  - ${row.file}: gzip ${kb(row.gzip)}`)

const LIMIT_DIST = 2 * 1024 * 1024
const LIMIT_FIRST = 250 * 1024
let failed = false
if (totalGzip > LIMIT_DIST) {
  console.error(`✗ dist gzip 总量超限：${mb(totalGzip)} > 2 MB`)
  failed = true
}
if (firstPaintGzip > LIMIT_FIRST) {
  console.error(`✗ 首屏传输超限：${kb(firstPaintGzip)} > 250 kB`)
  failed = true
}
console.log(failed ? 'FAILED' : 'OK')
process.exitCode = failed ? 1 : 0
