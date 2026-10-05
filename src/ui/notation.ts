/**
 * 数学记号排版（v3.0.1）：把数据/模板里的下划线记法（`n_p`、`n_{10}`、`C_G`、`P_1`）
 * 拆分为普通文本段与下标段，交由 Svelte 以 <sub> 呈现——界面上显示真下标而非下划线。
 *
 * 约定：正则 `_` 后的 `{...}` 或连续的字母/数字即下标内容；
 * 其余文本原样保留（内容与顺序不变，仅用于分段渲染）。
 */
export interface NotationPart {
  text: string
  sub: boolean
}

const SUBSCRIPT_PATTERN = /_\{([^}]+)\}|_([A-Za-z0-9]+)/g

export function notation(text: string): NotationPart[] {
  const parts: NotationPart[] = []
  let last = 0
  for (const match of text.matchAll(SUBSCRIPT_PATTERN)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: text.slice(last, index), sub: false })
    parts.push({ text: match[1] ?? match[2] ?? '', sub: true })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), sub: false })
  if (parts.length === 0) parts.push({ text, sub: false })
  return parts
}
