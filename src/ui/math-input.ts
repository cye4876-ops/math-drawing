/**
 * 结构化数学输入辅助（v3.3）：插入片段 + 光标定位 + 实时预览 LaTeX。
 * 与界面解耦的纯函数，便于单测；插入语法用纯文本（sqrt()/^/pi…），与引擎 parser 一致。
 */
import { parse } from '../expr'
import { toLatex } from '../symbolic/latex'

export interface MathKey {
  id: string
  label: string
  /** `@` 标记插入后的光标位置（如 sqrt(@)）；无 @ 则光标在末尾 */
  insert: string
}

/** 快捷键盘（顺序即展示顺序） */
export const MATH_KEYS: MathKey[] = [
  { id: 'frac', label: 'a/b', insert: '/' },
  { id: 'pow2', label: 'x²', insert: '^2' },
  { id: 'pow', label: 'xⁿ', insert: '^@' },
  { id: 'sqrt', label: '√', insert: 'sqrt(@)' },
  { id: 'abs', label: '|x|', insert: 'abs(@)' },
  { id: 'sin', label: 'sin', insert: 'sin(@)' },
  { id: 'cos', label: 'cos', insert: 'cos(@)' },
  { id: 'tan', label: 'tan', insert: 'tan(@)' },
  { id: 'ln', label: 'ln', insert: 'ln(@)' },
  { id: 'exp', label: 'eˣ', insert: 'exp(@)' },
  { id: 'pi', label: 'π', insert: 'pi' },
  { id: 'lparen', label: '(', insert: '(' },
  { id: 'rparen', label: ')', insert: ')' },
  { id: 'eq', label: '=', insert: '=' },
  { id: 'le', label: '≤', insert: '<=' },
  { id: 'ge', label: '≥', insert: '>=' },
  { id: 'ne', label: '≠', insert: '!=' },
]

export interface InsertionResult {
  value: string
  caret: number
}

/** 把片段插入到 [start, end)，返回新文本与光标位置 */
export function insertMathSnippet(
  value: string,
  start: number,
  end: number,
  insert: string,
): InsertionResult {
  const safeStart = Math.max(0, Math.min(start, value.length))
  const safeEnd = Math.max(safeStart, Math.min(end, value.length))
  const marker = insert.indexOf('@')
  const text = marker >= 0 ? insert.replace('@', '') : insert
  const next = value.slice(0, safeStart) + text + value.slice(safeEnd)
  const caret = safeStart + (marker >= 0 ? marker : text.length)
  return { value: next, caret }
}

const COMPARATORS: Array<{ token: string; latex: string }> = [
  { token: '!=', latex: '\\ne' },
  { token: '<=', latex: '\\le' },
  { token: '>=', latex: '\\ge' },
  { token: '=', latex: '=' },
  { token: '<', latex: '<' },
  { token: '>', latex: '>' },
]

/**
 * 文本 → LaTeX 预览（失败返回 null）：
 * 支持比较式（= / ≤ / ≥ / ≠ / < / >）与普通表达式；两侧分别解析后拼接。
 */
export function previewLatex(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const comparator = COMPARATORS.find((item) => trimmed.includes(item.token))
  if (!comparator) {
    return renderSide(trimmed)
  }
  // “!=” 优先于 “=”
  const index = trimmed.indexOf(comparator.token)
  const left = trimmed.slice(0, index).trim()
  const right = trimmed.slice(index + comparator.token.length).trim()
  if (!left || !right) return null
  const leftLatex = renderSide(left)
  const rightLatex = renderSide(right)
  if (!leftLatex || !rightLatex) return null
  return `${leftLatex} ${comparator.latex} ${rightLatex}`
}

function renderSide(source: string): string | null {
  try {
    return toLatex(parse(source))
  } catch {
    return null
  }
}
