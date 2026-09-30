#!/usr/bin/env node
/**
 * 许可证扫描（v0.1 质量门禁）。
 *
 * 数据源：`pnpm licenses list --json`，覆盖整棵依赖树。
 * 红线（见 docs/TECH-STACK.md 第八节）：不引入 GPL / AGPL / SSPL 系依赖；
 * LGPL 允许（作为库调用），因此匹配时必须排除 LGPL。
 */
import { execSync } from 'node:child_process'

/** 拒绝清单：GPL、AGPL、SSPL 家族（LGPL 除外） */
const DENIED = /^(?:A?GPL|SSPL)(?:-|$)/i

/** 拆分 SPDX 表达式为单个许可证标识（处理 AND / OR / WITH 与括号） */
function splitExpression(license) {
  return license
    .split(/\s+(?:AND|OR|WITH)\s+|[()]/i)
    .map((token) => token.trim())
    .filter(Boolean)
}

function main() {
  let raw
  try {
    raw = execSync('pnpm licenses list --json', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    console.error('无法执行 `pnpm licenses list --json`：', error.message)
    process.exit(2)
  }

  const byLicense = JSON.parse(raw)
  const violations = []

  for (const [license, packages] of Object.entries(byLicense)) {
    const denied = splitExpression(license).some((token) => DENIED.test(token))
    if (!denied) continue

    for (const pkg of packages) {
      const versions = Array.isArray(pkg.versions)
        ? pkg.versions.join(', ')
        : String(pkg.versions ?? '')
      violations.push(`${pkg.name}@${versions} — ${license}`)
    }
  }

  if (violations.length > 0) {
    console.error('发现 GPL/AGPL/SSPL 系依赖（违反许可证红线）：')
    for (const line of violations) console.error(`  - ${line}`)
    process.exit(1)
  }

  console.log('许可证扫描通过：未发现 GPL/AGPL/SSPL 系依赖。')
}

main()
