/**
 * 从 @lucide/svelte 提取图标为 <symbol> 定义（设计预览用）。
 * 用法：node design/build-lucide-defs.mjs
 * 输出：design/_lucide-defs.svg（内联片段）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// 需要的图标（用 | 分隔候选名，取第一个存在的）
const ICONS = [
  'function-square',
  'sparkles',
  'keyboard',
  'monitor-play',
  'moon',
  'panel-right',
  'undo-2',
  'redo-2',
  'save',
  'folder-open',
  'upload',
  'mouse-pointer-2',
  'crosshair',
  'pen-line',
  'circle-dot',
  'git-merge',
  'sigma',
  'chart-column|bar-chart-3',
  'waves',
  'settings-2',
  'ruler',
  'grid-2x2|layout-grid',
  'axes|move-diagonal',
  'minus',
  'plus',
  'maximize',
  'eye',
  'eye-off',
  'ellipsis|ellipsis-vertical',
  'x',
  'check',
  'chevron-up',
  'chevron-down',
  'pin',
  'trash2|trash-2',
]

function serialize([tag, attrs, children]) {
  const attrStr = Object.entries(attrs ?? {})
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  if (children && children.length > 0) {
    return `<${tag} ${attrStr}>${children.map(serialize).join('')}</${tag}>`
  }
  return `<${tag} ${attrStr}/>`
}

const symbols = []
for (const spec of ICONS) {
  let used = null
  let node = null
  for (const name of spec.split('|')) {
    const file = `node_modules/@lucide/svelte/dist/icons/${name}.svelte`
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    const match = text.match(/const iconData = (\{[\s\S]*?\});/)
    if (!match) continue
    node = JSON.parse(match[1]).node
    used = name
    break
  }
  if (!node) {
    console.error(`MISSING: ${spec}`)
    continue
  }
  symbols.push(
    `<symbol id="lu-${used}" viewBox="0 0 24 24">${node.map(serialize).join('')}</symbol>`,
  )
  console.log(`ok: ${used}`)
}

const out = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${symbols.join('')}</defs></svg>`
writeFileSync('design/_lucide-defs.svg', out)
console.log(`written: design/_lucide-defs.svg (${symbols.length} icons)`)
