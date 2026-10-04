/**
 * 精确表达式文本（v2.8）：把 AST 转成"人读"文本，用于工具读数面板（如原函数展示）。
 * 与 latex.ts 的分工：latex 面向公式渲染，本模块面向纯文本行。
 */
import type { Expr } from '../expr'

const CONSTANT_TEXT: Record<string, string> = { pi: 'π', e: 'e', phi: 'φ', tau: 'τ' }

const PRECEDENCE: Record<string, number> = {
  '=': 1,
  '!=': 1,
  '<': 1,
  '<=': 1,
  '>': 1,
  '>=': 1,
  '+': 2,
  '-': 2,
  '*': 3,
  '/': 3,
  '%': 3,
  '^': 5,
}

export function exprText(expr: Expr): string {
  return render(expr, 0)
}

function render(expr: Expr, parentPrecedence: number): string {
  const text = renderNode(expr)
  const precedence = precedenceOf(expr)
  if (precedence < parentPrecedence) return `(${text})`
  return text
}

function precedenceOf(expr: Expr): number {
  switch (expr.type) {
    case 'binary':
      return PRECEDENCE[expr.op] ?? 1
    case 'unary':
      return 4
    case 'assignment':
      return 0
    case 'piecewise':
      return 0
    default:
      return 6
  }
}

function renderNode(expr: Expr): string {
  switch (expr.type) {
    case 'number':
      return String(expr.value)
    case 'constant':
      return CONSTANT_TEXT[expr.name] ?? expr.name
    case 'variable':
      return expr.name
    case 'unary':
      return `${expr.op === '-' ? '−' : ''}${render(expr.operand, 4)}`
    case 'binary': {
      const precedence = PRECEDENCE[expr.op] ?? 1
      // 减法/除法的右结合括注：a − (b − c)、a / (b · c) 需要括号时由优先级判断
      const left = render(expr.left, precedence)
      const right = render(expr.right, precedence + 1)
      const symbol = expr.op === '*' ? '·' : expr.op === '-' ? '−' : expr.op
      return `${left} ${symbol} ${right}`
    }
    case 'call':
      return `${expr.name}(${expr.args.map((arg) => exprText(arg)).join(', ')})`
    case 'factorial':
      return `${render(expr.operand, 6)}!`
    case 'piecewise':
      return `分段（${expr.cases
        .map((item) => `${exprText(item.value)} if ${exprText(item.condition)}`)
        .join('；')}）`
    case 'assignment':
      return `${expr.name} = ${exprText(expr.value)}`
    default:
      return '?'
  }
}
