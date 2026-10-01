/**
 * 文档示例自动验证：读取 docs/expr-syntax.md 中的代码块并逐行执行。
 *
 * - ```expr-verify 块：行格式 `表达式 [@ 变量=数值, ...] -> 期望值`，
 *   解析并求值，约定相对误差 < 1e-9（NaN / ±Infinity 精确比较）；
 * - ```expr-error 块：每行必须是"解析或求值报错"的非法表达式。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ExprEvaluationError, ExprSyntaxError } from './errors'
import { evaluate, type Scope } from './evaluate'
import { parse } from './parser'

const DOC_PATH = new URL('../../docs/expr-syntax.md', import.meta.url)
// 统一换行符，避免 CRLF 影响代码块提取
const markdown = readFileSync(DOC_PATH, 'utf8').replace(/\r\n/g, '\n')

function extractBlocks(tag: 'expr-verify' | 'expr-error'): string[] {
  const lines: string[] = []
  const pattern = new RegExp('```' + tag + '\\n([\\s\\S]*?)```', 'g')
  for (const match of markdown.matchAll(pattern)) {
    const body = match[1] ?? ''
    for (const raw of body.split('\n')) {
      const line = raw.trim()
      if (line.length > 0) lines.push(line)
    }
  }
  return lines
}

interface VerifyCase {
  source: string
  scope: Scope
  expected: number
  raw: string
}

function parseVerifyLine(line: string): VerifyCase {
  const arrowIndex = line.lastIndexOf('->')
  if (arrowIndex < 0) throw new Error(`缺少 '->'：${line}`)
  const left = line.slice(0, arrowIndex).trim()
  const expectedText = line.slice(arrowIndex + 2).trim()

  let source = left
  const scope: Scope = {}
  const atIndex = left.lastIndexOf('@')
  if (atIndex >= 0) {
    source = left.slice(0, atIndex).trim()
    const scopeText = left.slice(atIndex + 1).trim()
    for (const pair of scopeText.split(',')) {
      const [name, value] = pair.split('=')
      if (name === undefined || value === undefined) throw new Error(`非法作用域：${pair}`)
      scope[name.trim()] = Number(value.trim())
    }
  }

  let expected: number
  if (expectedText === 'NaN') expected = NaN
  else if (expectedText === 'Infinity') expected = Infinity
  else if (expectedText === '-Infinity') expected = -Infinity
  else {
    expected = Number(expectedText)
    if (Number.isNaN(expected)) throw new Error(`非法期望值：${expectedText}`)
  }
  return { source, scope, expected, raw: line }
}

function assertValue(actual: number, expected: number, raw: string): void {
  if (Number.isNaN(expected)) {
    expect(Number.isNaN(actual), `期望 NaN，实际 ${actual}：${raw}`).toBe(true)
  } else if (!Number.isFinite(expected)) {
    expect(actual, `期望 ${expected}：${raw}`).toBe(expected)
  } else {
    expect(
      Math.abs(actual - expected),
      `期望 ${expected}，实际 ${actual}：${raw}`,
    ).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected)))
  }
}

const verifyCases = extractBlocks('expr-verify').map(parseVerifyLine)
const errorCases = extractBlocks('expr-error')

describe('docs: expr-syntax.md 示例验证', () => {
  it('文档中至少包含 40 个可验证示例', () => {
    expect(verifyCases.length).toBeGreaterThanOrEqual(40)
  })

  it.each(verifyCases.map((c) => [c.raw, c] as const))('求值：%s', (_raw, testCase) => {
    const actual = evaluate(parse(testCase.source), { ...testCase.scope })
    assertValue(actual, testCase.expected, testCase.raw)
  })

  it.each(errorCases.map((line) => [line] as const))('报错：%s', (line) => {
    try {
      evaluate(parse(line), {})
      expect.unreachable(`应当报错：${line}`)
    } catch (error) {
      const structured = error instanceof ExprSyntaxError || error instanceof ExprEvaluationError
      expect(structured, `${line} 抛出了非结构化错误`).toBe(true)
    }
  })
})
