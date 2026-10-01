/**
 * 求值器。
 *
 * - evaluate(expr, scope?)：结构化求值。未知变量/函数、参数个数错误会抛出 ExprEvaluationError；
 * - compile(expr)：把 AST 编译为可复用闭包（热路径，绘图采样用）。缺变量返回 NaN，不抛错。
 *
 * 语义约定（见 docs/expr-syntax.md）：
 * - 比较运算返回 1（真）/ 0（假）；涉及 NaN 的比较为 0；
 * - 分段函数条件值非 0 且非 NaN 即取该分支；无分支命中返回 NaN；
 * - `%` 与 mod() 均为数学取模；`^` 为实数幂（0^0 = 1，负底非整数指数为 NaN）。
 */
import { CONSTANTS, type BinaryOperator, type Expr } from './ast'
import { ExprEvaluationError } from './errors'
import {
  FUNCTION_NAMES,
  FUNCTIONS,
  describeArity,
  factorial,
  modulo,
  type FunctionDefinition,
} from './functions'

/** 变量作用域：变量名 → 数值。赋值的求值会写回该对象 */
export type Scope = Record<string, number>

/** 编译后的闭包：单点求值 */
export type CompiledExpression = (scope: Scope) => number

/** 二元运算的统一语义（求值器与常数折叠共用） */
export function applyBinary(op: BinaryOperator, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return a / b
    case '%':
      return modulo(a, b)
    case '^':
      return Math.pow(a, b)
    case '=':
      return a === b ? 1 : 0
    case '!=':
      return a !== b ? 1 : 0
    case '<':
      return a < b ? 1 : 0
    case '<=':
      return a <= b ? 1 : 0
    case '>':
      return a > b ? 1 : 0
    case '>=':
      return a >= b ? 1 : 0
  }
}

/** 结构化求值 */
export function evaluate(expr: Expr, scope: Scope = {}): number {
  switch (expr.type) {
    case 'number':
      return expr.value
    case 'constant':
      return CONSTANTS[expr.name]
    case 'variable': {
      const value = scope[expr.name]
      if (value === undefined) {
        throw new ExprEvaluationError({
          message: `未定义的变量或参数 '${expr.name}'`,
          hint: `请在作用域中提供其数值，例如 { ${expr.name}: 1 }`,
        })
      }
      return value
    }
    case 'unary': {
      const value = evaluate(expr.operand, scope)
      return expr.op === '-' ? -value : value
    }
    case 'binary':
      return applyBinary(expr.op, evaluate(expr.left, scope), evaluate(expr.right, scope))
    case 'call': {
      const def = FUNCTIONS[expr.name]
      if (def === undefined) throw unknownFunctionError(expr.name)
      checkArity(def, expr.args.length)
      const args = expr.args.map((arg) => evaluate(arg, scope))
      return def.fn(...args)
    }
    case 'factorial':
      return factorial(evaluate(expr.operand, scope))
    case 'piecewise': {
      for (const branch of expr.cases) {
        const condition = evaluate(branch.condition, scope)
        if (condition !== 0 && !Number.isNaN(condition)) return evaluate(branch.value, scope)
      }
      return NaN
    }
    case 'assignment': {
      const value = evaluate(expr.value, scope)
      scope[expr.name] = value
      return value
    }
  }
}

/**
 * 编译为可复用闭包（性能路径）：
 * - 逐节点编译，运算符在编译期分派（运行期无 switch）；
 * - 未知函数 / 参数个数错误在编译期抛出；
 * - 缺变量返回 NaN 而非抛错（供采样器连续绘制）。
 */
export function compile(expr: Expr): CompiledExpression {
  switch (expr.type) {
    case 'number': {
      const value = expr.value
      return () => value
    }
    case 'constant': {
      const value = CONSTANTS[expr.name]
      return () => value
    }
    case 'variable': {
      const name = expr.name
      return (scope) => scope[name] ?? NaN
    }
    case 'unary': {
      const operand = compile(expr.operand)
      if (expr.op === '-') return (scope) => -operand(scope)
      return operand
    }
    case 'binary':
      return compileBinary(expr.op, compile(expr.left), compile(expr.right))
    case 'call': {
      const def = FUNCTIONS[expr.name]
      if (def === undefined) throw unknownFunctionError(expr.name)
      checkArity(def, expr.args.length)
      const args = expr.args.map(compile)
      const fn = def.fn
      const a0 = args[0]
      const a1 = args[1]
      const a2 = args[2]
      if (args.length === 1 && a0 !== undefined) return (scope) => fn(a0(scope))
      if (args.length === 2 && a0 !== undefined && a1 !== undefined) {
        return (scope) => fn(a0(scope), a1(scope))
      }
      if (args.length === 3 && a0 !== undefined && a1 !== undefined && a2 !== undefined) {
        return (scope) => fn(a0(scope), a1(scope), a2(scope))
      }
      return (scope) => {
        const values = args.map((arg) => arg(scope))
        return fn(...values)
      }
    }
    case 'factorial': {
      const operand = compile(expr.operand)
      return (scope) => factorial(operand(scope))
    }
    case 'piecewise': {
      const branches = expr.cases.map((branch) => ({
        condition: compile(branch.condition),
        value: compile(branch.value),
      }))
      return (scope) => {
        for (const branch of branches) {
          const condition = branch.condition(scope)
          if (condition !== 0 && !Number.isNaN(condition)) return branch.value(scope)
        }
        return NaN
      }
    }
    case 'assignment': {
      const name = expr.name
      const value = compile(expr.value)
      return (scope) => {
        const v = value(scope)
        scope[name] = v
        return v
      }
    }
  }
}

function compileBinary(
  op: BinaryOperator,
  left: CompiledExpression,
  right: CompiledExpression,
): CompiledExpression {
  switch (op) {
    case '+':
      return (scope) => left(scope) + right(scope)
    case '-':
      return (scope) => left(scope) - right(scope)
    case '*':
      return (scope) => left(scope) * right(scope)
    case '/':
      return (scope) => left(scope) / right(scope)
    case '%':
      return (scope) => modulo(left(scope), right(scope))
    case '^':
      return (scope) => Math.pow(left(scope), right(scope))
    case '=':
      return (scope) => (left(scope) === right(scope) ? 1 : 0)
    case '!=':
      return (scope) => (left(scope) !== right(scope) ? 1 : 0)
    case '<':
      return (scope) => (left(scope) < right(scope) ? 1 : 0)
    case '<=':
      return (scope) => (left(scope) <= right(scope) ? 1 : 0)
    case '>':
      return (scope) => (left(scope) > right(scope) ? 1 : 0)
    case '>=':
      return (scope) => (left(scope) >= right(scope) ? 1 : 0)
  }
}

function checkArity(def: FunctionDefinition, count: number): void {
  if (count < def.minArgs || count > def.maxArgs) {
    throw new ExprEvaluationError({
      message: `函数 ${def.name} 需要 ${describeArity(def)}，实际提供了 ${count} 个`,
      hint: `用法：${def.signature}`,
    })
  }
}

function unknownFunctionError(name: string): ExprEvaluationError {
  const suggestion = closestFunctionName(name)
  return new ExprEvaluationError({
    message: `未知函数 '${name}'`,
    hint: suggestion !== null ? `是否想用 '${suggestion}'？` : '请检查函数名拼写',
  })
}

/** 在已知函数名中找编辑距离最小者（≤2 才给建议） */
function closestFunctionName(name: string): string | null {
  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of FUNCTION_NAMES) {
    const distance = editDistance(name, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best !== null && bestDistance <= 2 ? best : null
}

function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  let previous = Array.from({ length: n + 1 }, (_, i) => i)
  let current = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    current[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const del = (previous[j] ?? 0) + 1
      const ins = (current[j - 1] ?? 0) + 1
      const sub = (previous[j - 1] ?? 0) + cost
      current[j] = Math.min(del, ins, sub)
    }
    const swap = previous
    previous = current
    current = swap
  }
  return previous[n] ?? 0
}
