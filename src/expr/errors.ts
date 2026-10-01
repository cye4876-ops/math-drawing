/**
 * 表达式引擎的结构化错误。
 *
 * - 词法/语法错误（ExprSyntaxError）携带源码位置，可渲染出带指示符的报错文本；
 * - 求值/求导等运行时错误（ExprEvaluationError）不携带位置，但提供修复提示；
 * - JSON 反序列化错误（ExprFormatError）用于 AST / 参数集的加载校验。
 */

/** 源码位置：offset 为 0-based 字符偏移；行、列为 1-based */
export interface SourcePosition {
  offset: number
  line: number
  column: number
}

export interface SyntaxErrorDetails {
  /** 简短描述 */
  message: string
  /** 错误起始位置 */
  start: SourcePosition
  /** 错误结束位置（可选） */
  end?: SourcePosition
  /** 期望看到的内容（用于「期望…实际…」句式） */
  expected?: string
  /** 实际遇到的内容 */
  actual?: string
  /** 修复提示 */
  hint?: string
}

export interface RuntimeErrorDetails {
  message: string
  hint?: string
  expected?: string
  actual?: string
}

export class ExprSyntaxError extends Error {
  readonly details: SyntaxErrorDetails

  constructor(details: SyntaxErrorDetails) {
    super(details.message)
    this.name = 'ExprSyntaxError'
    this.details = details
  }
}

export class ExprEvaluationError extends Error {
  readonly details: RuntimeErrorDetails

  constructor(details: RuntimeErrorDetails) {
    super(details.message)
    this.name = 'ExprEvaluationError'
    this.details = details
  }
}

export class ExprFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExprFormatError'
  }
}

/** 计算某个偏移处的行列位置（1-based），用于把数字偏移转成人类可读位置 */
export function positionAt(source: string, offset: number): SourcePosition {
  let line = 1
  let column = 1
  const end = Math.min(offset, source.length)
  for (let i = 0; i < end; i++) {
    if (source[i] === '\n') {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { offset: end, line, column }
}

/**
 * 把错误渲染为带位置与指示符的多行文本，例如：
 *
 * 错误：第 1 行第 7 列
 *   sin(x)) + 1
 *         ^
 * 期望运算符或表达式结束，实际遇到 ')'
 * 提示：括号可能多余
 */
export function formatError(source: string, error: ExprSyntaxError | ExprEvaluationError): string {
  if (error instanceof ExprEvaluationError) {
    const lines = [`错误：${error.details.message}`]
    if (error.details.hint) lines.push(`提示：${error.details.hint}`)
    return lines.join('\n')
  }

  const d = error.details
  const sourceLine = source.split('\n')[d.start.line - 1] ?? ''
  const caret = `${' '.repeat(Math.max(0, d.start.column - 1))}^`
  const detail =
    d.expected !== undefined && d.actual !== undefined
      ? `期望${d.expected}，实际遇到 ${d.actual}`
      : d.message

  const lines = [
    `错误：第 ${d.start.line} 行第 ${d.start.column} 列`,
    `  ${sourceLine}`,
    `  ${caret}`,
    detail,
  ]
  if (d.hint) lines.push(`提示：${d.hint}`)
  return lines.join('\n')
}
