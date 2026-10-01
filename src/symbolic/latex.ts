/**
 * AST → LaTeX（v0.9）：供符号计算面板展示，输出可被 KaTeX 渲染。
 */
import type { Expr } from '../expr'

const BINARY_PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 }

function precedenceOf(node: Expr): number {
  switch (node.type) {
    case 'number':
      return node.value < 0 ? 1.5 : 4
    case 'variable':
    case 'constant':
    case 'call':
    case 'factorial':
    case 'piecewise':
      return 4
    case 'unary':
      return node.op === '-' ? 1.5 : 4
    case 'binary':
      return BINARY_PRECEDENCE[node.op] ?? 1
    case 'assignment':
      return 0
  }
}

export function formatNumberLatex(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const text = value.toPrecision(6)
  if (text.includes('e')) return text
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
}

function wrap(node: Expr, minPrecedence: number): string {
  const text = toLatexNode(node)
  return precedenceOf(node) < minPrecedence ? `\\left(${text}\\right)` : text
}

const COMPARISON: Record<string, string> = {
  '=': '=',
  '!=': '\\ne',
  '<': '<',
  '<=': '\\le',
  '>': '>',
  '>=': '\\ge',
}

const FUNCTION_LATEX: Record<string, string> = {
  sin: '\\sin',
  cos: '\\cos',
  tan: '\\tan',
  sinh: '\\sinh',
  cosh: '\\cosh',
  tanh: '\\tanh',
  asin: '\\arcsin',
  acos: '\\arccos',
  atan: '\\arctan',
  ln: '\\ln',
  log: '\\log',
  exp: '\\exp',
  gamma: '\\Gamma',
}

function toLatexNode(node: Expr): string {
  switch (node.type) {
    case 'number':
      return formatNumberLatex(node.value)
    case 'constant': {
      switch (node.name) {
        case 'pi':
          return '\\pi'
        case 'tau':
          return '\\tau'
        case 'phi':
          return '\\varphi'
        default:
          return 'e'
      }
    }
    case 'variable':
      return node.name === 'theta' ? '\\theta' : node.name
    case 'unary': {
      if (node.op === '+') return toLatexNode(node.operand)
      return `-${wrap(node.operand, 2)}`
    }
    case 'binary': {
      const { op, left, right } = node
      if (op === '/') {
        return `\\frac{${toLatexNode(left)}}{${toLatexNode(right)}}`
      }
      if (op === '^') {
        return `${wrap(left, 4)}^{${toLatexNode(right)}}`
      }
      if (op === '%') {
        return `${wrap(left, 2)} \\bmod ${wrap(right, 2)}`
      }
      if (COMPARISON[op]) {
        return `${wrap(left, 1)} ${COMPARISON[op]} ${wrap(right, 1)}`
      }
      const symbol = op === '*' ? ' \\cdot ' : ` ${op} `
      return `${wrap(left, op === '*' ? 2 : 1)}${symbol}${wrap(right, 2)}`
    }
    case 'call': {
      const args = node.args.map((argument) => toLatexNode(argument))
      switch (node.name) {
        case 'sqrt':
          return `\\sqrt{${args[0] ?? ''}}`
        case 'abs':
          return `\\left|${args[0] ?? ''}\\right|`
        case 'floor':
          return `\\lfloor ${args[0] ?? ''} \\rfloor`
        case 'ceil':
          return `\\lceil ${args[0] ?? ''} \\rceil`
        default: {
          const command = FUNCTION_LATEX[node.name] ?? `\\operatorname{${node.name}}`
          return `${command}\\left(${args.join(', ')}\\right)`
        }
      }
    }
    case 'factorial':
      return `${wrap(node.operand, 4)}!`
    case 'piecewise': {
      const rows = node.cases.map(
        (item) => `${toLatexNode(item.value)} & \\text{if } ${toLatexNode(item.condition)}`,
      )
      return `\\begin{cases}${rows.join(' \\\\ ')}\\end{cases}`
    }
    case 'assignment':
      return `${node.name} = ${toLatexNode(node.value)}`
  }
}

/** 表达式 → LaTeX 源码 */
export function toLatex(expr: Expr): string {
  return toLatexNode(expr)
}
