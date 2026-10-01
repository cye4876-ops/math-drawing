/**
 * 符号化简（v0.9）：常数折叠 + 代数恒等式 + 三角恒等式（sin²+cos² = 1 等）。
 * 规则重写带次数上限（超时保护，规格要求 1 秒内返回）。
 */
import {
  evaluate,
  makeBinary,
  makeNumber,
  makeUnary,
  type BinaryNode,
  type CallNode,
  type ConstantNode,
  type Expr,
  type NumberNode,
  type UnaryNode,
  type VariableNode,
  type PiecewiseNode,
  type AssignmentNode,
  type FactorialNode,
} from '../expr'

export interface SimplifyOptions {
  maxRounds?: number
  maxRewrites?: number
}

const DEFAULT_ROUNDS = 20
const DEFAULT_REWRITES = 500

/** 结构相等（数值按 1e-12 容差） */
export function exprEqual(a: Expr, b: Expr): boolean {
  if (a.type !== b.type) return false
  switch (a.type) {
    case 'number':
      return Math.abs(a.value - (b as NumberNode).value) < 1e-12
    case 'constant':
      return a.name === (b as ConstantNode).name
    case 'variable':
      return a.name === (b as VariableNode).name
    case 'unary': {
      const other = b as UnaryNode
      return a.op === other.op && exprEqual(a.operand, other.operand)
    }
    case 'binary': {
      const other = b as BinaryNode
      return a.op === other.op && exprEqual(a.left, other.left) && exprEqual(a.right, other.right)
    }
    case 'call': {
      const other = b as CallNode
      return (
        a.name === other.name &&
        a.args.length === other.args.length &&
        a.args.every((argument, index) => exprEqual(argument, other.args[index]!))
      )
    }
    case 'factorial':
      return exprEqual(a.operand, (b as FactorialNode).operand)
    case 'piecewise': {
      const other = b as PiecewiseNode
      return (
        a.cases.length === other.cases.length &&
        a.cases.every(
          (item, index) =>
            exprEqual(item.condition, other.cases[index]!.condition) &&
            exprEqual(item.value, other.cases[index]!.value),
        )
      )
    }
    case 'assignment':
      return (
        a.name === (b as AssignmentNode).name && exprEqual(a.value, (b as AssignmentNode).value)
      )
  }
}

/** 表达式是否与变量 varName 无关 */
export function freeOf(expr: Expr, varName: string): boolean {
  switch (expr.type) {
    case 'number':
    case 'constant':
      return true
    case 'variable':
      return expr.name !== varName
    case 'unary':
      return freeOf(expr.operand, varName)
    case 'binary':
      return freeOf(expr.left, varName) && freeOf(expr.right, varName)
    case 'call':
      return expr.args.every((argument) => freeOf(argument, varName))
    case 'factorial':
      return freeOf(expr.operand, varName)
    case 'piecewise':
      return expr.cases.every(
        (item) => freeOf(item.condition, varName) && freeOf(item.value, varName),
      )
    case 'assignment':
      return expr.name !== varName && freeOf(expr.value, varName)
  }
}

function isNumber(node: Expr): node is NumberNode {
  return node.type === 'number'
}

function negate(node: Expr): Expr {
  return makeUnary('-', node)
}

/** 折叠二元数值运算（保护非有限结果） */
function foldBinary(op: BinaryNode['op'], left: number, right: number): number | null {
  let value: number
  switch (op) {
    case '+':
      value = left + right
      break
    case '-':
      value = left - right
      break
    case '*':
      value = left * right
      break
    case '/':
      if (right === 0) return null
      value = left / right
      break
    case '^': {
      const isIntegerExponent = Math.abs(right - Math.round(right)) < 1e-12
      if (isIntegerExponent && Math.abs(right) <= 64) {
        value = left ** Math.round(right)
      } else {
        if (left <= 0) return null
        value = left ** right
      }
      break
    }
    case '%':
      if (right === 0) return null
      value = left - Math.floor(left / right) * right
      break
    default:
      return null
  }
  return Number.isFinite(value) ? value : null
}

/** 平方项识别：u² 或 u·u */
function squareOf(node: Expr): Expr | null {
  if (node.type === 'binary' && node.op === '^' && isNumber(node.right)) {
    if (Math.abs(node.right.value - 2) < 1e-12) return node.left
  }
  if (node.type === 'binary' && node.op === '*') {
    if (exprEqual(node.left, node.right)) return node.left
  }
  return null
}

function trigPair(term: Expr): { kind: 'sin' | 'cos'; argument: Expr } | null {
  const squared = squareOf(term)
  if (!squared || squared.type !== 'call') return null
  if ((squared.name === 'sin' || squared.name === 'cos') && squared.args.length === 1) {
    return { kind: squared.name, argument: squared.args[0]! }
  }
  return null
}

function flattenSum(node: Expr, out: Expr[]): void {
  if (node.type === 'binary' && node.op === '+') {
    flattenSum(node.left, out)
    flattenSum(node.right, out)
  } else {
    out.push(node)
  }
}

function rebuildSum(terms: Expr[]): Expr {
  let result: Expr | null = null
  for (const term of terms) {
    result = result === null ? term : makeBinary('+', result, term)
  }
  return result ?? makeNumber(0)
}

/** sin²(u) + cos²(u) → 1（在加法项集合内合并） */
function absorbPythagorean(terms: Expr[]): { terms: Expr[]; changed: boolean } {
  for (let i = 0; i < terms.length; i++) {
    const first = trigPair(terms[i]!)
    if (!first) continue
    for (let j = 0; j < terms.length; j++) {
      if (i === j) continue
      const second = trigPair(terms[j]!)
      if (!second) continue
      if (first.kind !== second.kind && exprEqual(first.argument, second.argument)) {
        const rest = terms.filter((_, index) => index !== i && index !== j)
        return { terms: [makeNumber(1), ...rest], changed: true }
      }
    }
  }
  return { terms, changed: false }
}

/** 单轮后序重写；返回改写次数 */
function rewriteOnce(node: Expr, counter: { count: number }): Expr {
  // 先重写子节点
  switch (node.type) {
    case 'unary':
      node = { ...node, operand: rewriteOnce(node.operand, counter) }
      break
    case 'binary':
      node = {
        ...node,
        left: rewriteOnce(node.left, counter),
        right: rewriteOnce(node.right, counter),
      }
      break
    case 'call':
      node = { ...node, args: node.args.map((argument) => rewriteOnce(argument, counter)) }
      break
    case 'factorial':
      node = { ...node, operand: rewriteOnce(node.operand, counter) }
      break
    default:
      break
  }
  const bump = (): void => {
    counter.count++
  }
  switch (node.type) {
    case 'unary': {
      if (node.op !== '-') return node.operand
      const operand = node.operand
      if (isNumber(operand)) {
        bump()
        return makeNumber(-operand.value)
      }
      if (operand.type === 'unary' && operand.op === '-') {
        bump()
        return operand.operand
      }
      return node
    }
    case 'binary': {
      const { op, left, right } = node
      if (isNumber(left) && isNumber(right)) {
        const value = foldBinary(op, left.value, right.value)
        if (value !== null) {
          bump()
          return makeNumber(value)
        }
        return node
      }
      switch (op) {
        case '+':
          if (isNumber(left) && left.value === 0) {
            bump()
            return right
          }
          if (isNumber(right) && right.value === 0) {
            bump()
            return left
          }
          if (exprEqual(left, right)) {
            bump()
            return makeBinary('*', makeNumber(2), left)
          }
          {
            const terms: Expr[] = []
            flattenSum(node, terms)
            if (terms.length >= 2) {
              const absorbed = absorbPythagorean(terms)
              if (absorbed.changed) {
                bump()
                return rebuildSum(absorbed.terms)
              }
            }
          }
          return node
        case '-':
          if (isNumber(right) && right.value === 0) {
            bump()
            return left
          }
          if (exprEqual(left, right)) {
            bump()
            return makeNumber(0)
          }
          return node
        case '*':
          if ((isNumber(left) && left.value === 0) || (isNumber(right) && right.value === 0)) {
            bump()
            return makeNumber(0)
          }
          if (isNumber(left) && left.value === 1) {
            bump()
            return right
          }
          if (isNumber(right) && right.value === 1) {
            bump()
            return left
          }
          if (isNumber(left) && left.value === -1) {
            bump()
            return negate(right)
          }
          if (isNumber(right) && right.value === -1) {
            bump()
            return negate(left)
          }
          return node
        case '/':
          if (isNumber(right) && right.value === 1) {
            bump()
            return left
          }
          if (isNumber(left) && left.value === 0) {
            bump()
            return makeNumber(0)
          }
          if (exprEqual(left, right)) {
            bump()
            return makeNumber(1)
          }
          return node
        case '^':
          if (isNumber(right) && right.value === 1) {
            bump()
            return left
          }
          if (isNumber(right) && right.value === 0) {
            bump()
            return makeNumber(1)
          }
          if (isNumber(left) && left.value === 1) {
            bump()
            return makeNumber(1)
          }
          return node
        default:
          return node
      }
    }
    case 'call': {
      if (node.name === 'ln' && node.args.length === 1) {
        const argument = node.args[0]!
        if (argument.type === 'constant' && argument.name === 'e') {
          bump()
          return makeNumber(1)
        }
      }
      if (node.name === 'sqrt' && node.args.length === 1) {
        const argument = node.args[0]!
        if (argument.type === 'binary' && argument.op === '^' && isNumber(argument.right)) {
          if (Math.abs(argument.right.value - 2) < 1e-12) {
            bump()
            // √(u²) = |u|（保守：不假设符号）
            return node
          }
        }
        // √(u)·√(u) 之类不在单节点处理
      }
      return node
    }
    default:
      return node
  }
}

/** 迭代化简直到稳定或达到上限 */
export function simplify(expr: Expr, options: SimplifyOptions = {}): Expr {
  const maxRounds = options.maxRounds ?? DEFAULT_ROUNDS
  const maxRewrites = options.maxRewrites ?? DEFAULT_REWRITES
  let current = expr
  let total = 0
  for (let round = 0; round < maxRounds; round++) {
    const counter = { count: 0 }
    const next = rewriteOnce(current, counter)
    total += counter.count
    if (counter.count === 0 || exprEqual(next, current)) break
    current = next
    if (total >= maxRewrites) break
  }
  return current
}

/** 数值求值（化简后对照用；默认变量取常用近似值） */
export function numericValue(expr: Expr, scope: Record<string, number> = {}): number {
  return evaluate(expr, scope)
}
