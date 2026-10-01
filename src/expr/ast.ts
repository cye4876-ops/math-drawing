/**
 * AST（抽象语法树）：表达式引擎的核心数据结构。
 *
 * 设计约束（见 docs/versions/v0.2-expression-engine.md）：
 * - 覆盖 Number / Constant / Variable / UnaryOp / BinaryOp / FunctionCall / Piecewise / Assignment；
 * - 必须可无损序列化为 JSON 并反序列化（撤销栈、分享链接、Notebook 保存都依赖它）；
 * - 节点均为纯数据（无函数、无原型方法、无循环引用），JSON.stringify 即可序列化。
 */
import { ExprFormatError } from './errors'

// ---------- 节点类型 ----------

export interface NumberNode {
  type: 'number'
  value: number
}

export const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
  tau: 2 * Math.PI,
} as const

export type ConstantName = keyof typeof CONSTANTS

/** 判断字符串是否为内置常量名 */
export function isConstantName(name: string): name is ConstantName {
  return Object.prototype.hasOwnProperty.call(CONSTANTS, name)
}

/** 需要作为整体识别的多字母变量名（与词法分析的最长匹配规则配合） */
export const NAMED_VARIABLE_WORDS: readonly string[] = ['theta']

export interface ConstantNode {
  type: 'constant'
  name: ConstantName
}

export interface VariableNode {
  type: 'variable'
  name: string
}

export type UnaryOperator = '+' | '-'

export interface UnaryNode {
  type: 'unary'
  op: UnaryOperator
  operand: Expr
}

export type BinaryOperator =
  '+' | '-' | '*' | '/' | '%' | '^' | '=' | '!=' | '<' | '<=' | '>' | '>='

export interface BinaryNode {
  type: 'binary'
  op: BinaryOperator
  left: Expr
  right: Expr
}

export interface CallNode {
  type: 'call'
  name: string
  args: Expr[]
}

/** 后缀阶乘（x!），独立于 UnaryOp，因为它是后缀运算符 */
export interface FactorialNode {
  type: 'factorial'
  operand: Expr
}

export interface PiecewiseCase {
  condition: Expr
  value: Expr
}

export interface PiecewiseNode {
  type: 'piecewise'
  cases: PiecewiseCase[]
}

export interface AssignmentNode {
  type: 'assignment'
  name: string
  value: Expr
}

export type Expr =
  | NumberNode
  | ConstantNode
  | VariableNode
  | UnaryNode
  | BinaryNode
  | CallNode
  | FactorialNode
  | PiecewiseNode
  | AssignmentNode

// ---------- 构造器（供解析器与程序化构建使用） ----------

export function makeNumber(value: number): NumberNode {
  return { type: 'number', value }
}

export function makeConstant(name: ConstantName): ConstantNode {
  return { type: 'constant', name }
}

export function makeVariable(name: string): VariableNode {
  return { type: 'variable', name }
}

export function makeUnary(op: UnaryOperator, operand: Expr): UnaryNode {
  return { type: 'unary', op, operand }
}

export function makeBinary(op: BinaryOperator, left: Expr, right: Expr): BinaryNode {
  return { type: 'binary', op, left, right }
}

export function makeCall(name: string, args: Expr[]): CallNode {
  return { type: 'call', name, args }
}

export function makeFactorial(operand: Expr): FactorialNode {
  return { type: 'factorial', operand }
}

export function makePiecewise(cases: PiecewiseCase[]): PiecewiseNode {
  return { type: 'piecewise', cases }
}

export function makeAssignment(name: string, value: Expr): AssignmentNode {
  return { type: 'assignment', name, value }
}

// ---------- 序列化 / 反序列化 ----------

export function serializeExpr(expr: Expr): string {
  return JSON.stringify(expr)
}

export function deserializeExpr(json: string): Expr {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (error) {
    throw new ExprFormatError(`AST JSON 解析失败：${(error as Error).message}`)
  }
  return validateExpr(data, '$')
}

const CONSTANT_NAME_SET = new Set<string>(Object.keys(CONSTANTS))
const UNARY_OPS = new Set<string>(['+', '-'])
const BINARY_OPS = new Set<string>(['+', '-', '*', '/', '%', '^', '=', '!=', '<', '<=', '>', '>='])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, reason: string): never {
  throw new ExprFormatError(`无效的 AST（${path}）：${reason}`)
}

function validateExpr(value: unknown, path: string): Expr {
  if (!isRecord(value)) fail(path, '节点必须是对象')
  const type = value['type']
  switch (type) {
    case 'number': {
      const v = value['value']
      if (typeof v !== 'number' || !Number.isFinite(v))
        fail(path, 'number 节点的 value 必须为有限数')
      return { type: 'number', value: v }
    }
    case 'constant': {
      const name = value['name']
      if (typeof name !== 'string' || !CONSTANT_NAME_SET.has(name))
        fail(path, `未知常量 '${String(name)}'`)
      return { type: 'constant', name: name as ConstantName }
    }
    case 'variable': {
      const name = value['name']
      if (typeof name !== 'string' || name.length === 0) fail(path, 'variable 节点缺少 name')
      return { type: 'variable', name }
    }
    case 'unary': {
      const op = value['op']
      if (typeof op !== 'string' || !UNARY_OPS.has(op)) fail(path, `未知一元运算符 '${String(op)}'`)
      return {
        type: 'unary',
        op: op as UnaryOperator,
        operand: validateExpr(value['operand'], `${path}.operand`),
      }
    }
    case 'binary': {
      const op = value['op']
      if (typeof op !== 'string' || !BINARY_OPS.has(op))
        fail(path, `未知二元运算符 '${String(op)}'`)
      return {
        type: 'binary',
        op: op as BinaryOperator,
        left: validateExpr(value['left'], `${path}.left`),
        right: validateExpr(value['right'], `${path}.right`),
      }
    }
    case 'call': {
      const name = value['name']
      if (typeof name !== 'string' || name.length === 0) fail(path, 'call 节点缺少 name')
      const args = value['args']
      if (!Array.isArray(args)) fail(path, 'call 节点的 args 必须是数组')
      return {
        type: 'call',
        name,
        args: args.map((arg, i) => validateExpr(arg, `${path}.args[${i}]`)),
      }
    }
    case 'factorial': {
      return { type: 'factorial', operand: validateExpr(value['operand'], `${path}.operand`) }
    }
    case 'piecewise': {
      const cases = value['cases']
      if (!Array.isArray(cases) || cases.length === 0) fail(path, 'piecewise 节点至少需要一个分支')
      return {
        type: 'piecewise',
        cases: cases.map((c, i) => {
          if (!isRecord(c)) fail(`${path}.cases[${i}]`, '分支必须是对象')
          return {
            condition: validateExpr(c['condition'], `${path}.cases[${i}].condition`),
            value: validateExpr(c['value'], `${path}.cases[${i}].value`),
          }
        }),
      }
    }
    case 'assignment': {
      const name = value['name']
      if (typeof name !== 'string' || name.length === 0) fail(path, 'assignment 节点缺少 name')
      return { type: 'assignment', name, value: validateExpr(value['value'], `${path}.value`) }
    }
    default:
      fail(path, `未知节点类型 '${String(type)}'`)
  }
}

// ---------- 遍历工具 ----------

/**
 * 收集表达式中的自由变量名（不含常量名与函数名；赋值左侧的定义名不算自由变量）。
 * 返回按字典序排序、去重的数组。
 */
export function collectFreeVariables(expr: Expr): string[] {
  const found = new Set<string>()
  walk(expr, found)
  return [...found].sort()
}

function walk(expr: Expr, out: Set<string>): void {
  switch (expr.type) {
    case 'number':
    case 'constant':
      return
    case 'variable':
      out.add(expr.name)
      return
    case 'unary':
      walk(expr.operand, out)
      return
    case 'binary':
      walk(expr.left, out)
      walk(expr.right, out)
      return
    case 'call':
      for (const arg of expr.args) walk(arg, out)
      return
    case 'factorial':
      walk(expr.operand, out)
      return
    case 'piecewise':
      for (const c of expr.cases) {
        walk(c.condition, out)
        walk(c.value, out)
      }
      return
    case 'assignment':
      walk(expr.value, out)
      return
  }
}

/** 判断表达式是否引用了某个变量（含赋值定义名之外的引用） */
export function containsVariable(expr: Expr, name: string): boolean {
  switch (expr.type) {
    case 'number':
    case 'constant':
      return false
    case 'variable':
      return expr.name === name
    case 'unary':
      return containsVariable(expr.operand, name)
    case 'binary':
      return containsVariable(expr.left, name) || containsVariable(expr.right, name)
    case 'call':
      return expr.args.some((arg) => containsVariable(arg, name))
    case 'factorial':
      return containsVariable(expr.operand, name)
    case 'piecewise':
      return expr.cases.some(
        (c) => containsVariable(c.condition, name) || containsVariable(c.value, name),
      )
    case 'assignment':
      return containsVariable(expr.value, name)
  }
}
