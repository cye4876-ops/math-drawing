/**
 * 符号求导：对 AST 递归求导，返回新的 AST（数值可验证，不做激进简化）。
 *
 * - 幂法则 / 乘积法则 / 商法则 / 链式法则；
 * - 初等函数导数表（见下方 dCall）；
 * - 保守整理：常数折叠、1*f → f、f+0 → f 等（不改变 NaN/Infinity 传播语义的规则）。
 *
 * 求导结果供 v0.4 切线动画直接使用。
 */
import {
  containsVariable,
  makeBinary,
  makeCall,
  makeFactorial,
  makeNumber,
  makePiecewise,
  makeUnary,
  type BinaryNode,
  type CallNode,
  type Expr,
} from './ast'
import { ExprEvaluationError } from './errors'
import { applyBinary } from './evaluate'
import { FUNCTIONS, factorial as factorialFn } from './functions'

const TWO_OVER_SQRT_PI = 2 / Math.sqrt(Math.PI)

/** 对表达式关于 variable 求导 */
export function differentiate(expr: Expr, variable = 'x'): Expr {
  return simplify(dNode(expr, variable))
}

/** 保守化简（深度优先，可用于任意 AST） */
export function simplify(expr: Expr): Expr {
  switch (expr.type) {
    case 'number':
    case 'constant':
    case 'variable':
      return expr
    case 'unary':
      return shallow(makeUnary(expr.op, simplify(expr.operand)))
    case 'binary':
      return shallow(makeBinary(expr.op, simplify(expr.left), simplify(expr.right)))
    case 'call':
      return shallow(makeCall(expr.name, expr.args.map(simplify)))
    case 'piecewise':
      return makePiecewise(
        expr.cases.map((branch) => ({
          condition: simplify(branch.condition),
          value: simplify(branch.value),
        })),
      )
    case 'factorial':
      return shallow(makeFactorial(simplify(expr.operand)))
    case 'assignment':
      return expr
  }
}

// ---------- 构造器（构造时做浅化简，保证求导结果保持精炼） ----------

function num(value: number): Expr {
  return makeNumber(value)
}

function add(a: Expr, b: Expr): Expr {
  return shallow(makeBinary('+', a, b))
}

function sub(a: Expr, b: Expr): Expr {
  return shallow(makeBinary('-', a, b))
}

function mul(a: Expr, b: Expr): Expr {
  return shallow(makeBinary('*', a, b))
}

function div(a: Expr, b: Expr): Expr {
  return shallow(makeBinary('/', a, b))
}

function pow(a: Expr, b: Expr): Expr {
  return shallow(makeBinary('^', a, b))
}

function call(name: string, args: Expr[]): Expr {
  return shallow(makeCall(name, args))
}

function neg(a: Expr): Expr {
  return shallow(makeUnary('-', a))
}

/** 浅化简：假设子节点已化简；只做局部规则与常数折叠 */
function shallow(node: Expr): Expr {
  switch (node.type) {
    case 'number':
    case 'constant':
    case 'variable':
      return node

    case 'unary': {
      const { op, operand } = node
      if (op === '+') return operand
      if (operand.type === 'number') return num(-operand.value)
      if (operand.type === 'unary' && operand.op === '-') return operand.operand
      return node
    }

    case 'binary': {
      const { op, left, right } = node
      if (op === '+') {
        if (isZero(left)) return right
        if (isZero(right)) return left
      } else if (op === '-') {
        if (isZero(right)) return left
      } else if (op === '*') {
        if (isZero(left) || isZero(right)) return num(0)
        if (isOne(left)) return right
        if (isOne(right)) return left
      } else if (op === '/') {
        if (isOne(right)) return left
      } else if (op === '^') {
        if (isOne(right)) return left
        if (isZero(right)) return num(1)
      }
      if (left.type === 'number' && right.type === 'number') {
        return num(applyBinary(op, left.value, right.value))
      }
      return node
    }

    case 'call': {
      const values: number[] = []
      for (const arg of node.args) {
        if (arg.type !== 'number') return node
        values.push(arg.value)
      }
      const def = FUNCTIONS[node.name]
      if (def === undefined) return node
      return num(def.fn(...values))
    }

    case 'factorial':
      if (node.operand.type === 'number') return num(factorialFn(node.operand.value))
      return node

    default:
      return node
  }
}

function isZero(expr: Expr): boolean {
  return expr.type === 'number' && expr.value === 0
}

function isOne(expr: Expr): boolean {
  return expr.type === 'number' && expr.value === 1
}

// ---------- 求导实现 ----------

function dNode(expr: Expr, v: string): Expr {
  switch (expr.type) {
    case 'number':
    case 'constant':
      return num(0)
    case 'variable':
      return num(expr.name === v ? 1 : 0)
    case 'unary': {
      const d = dNode(expr.operand, v)
      return expr.op === '-' ? neg(d) : d
    }
    case 'binary':
      return dBin(expr, v)
    case 'call':
      return dCall(expr, v)
    case 'piecewise':
      return makePiecewise(
        expr.cases.map((branch) => ({
          condition: branch.condition,
          value: dNode(branch.value, v),
        })),
      )
    case 'factorial':
      throw notDifferentiable('阶乘运算暂不支持符号求导', '可先用其他方法展开，如 x·x! 的数值求导')
    case 'assignment':
      throw notDifferentiable('赋值语句不可求导', '请对右侧表达式单独求导')
  }
}

function dBin(expr: BinaryNode, v: string): Expr {
  const { op, left, right } = expr
  switch (op) {
    case '+':
      return add(dNode(left, v), dNode(right, v))
    case '-':
      return sub(dNode(left, v), dNode(right, v))
    case '*': {
      // 乘积法则：u'v + uv'（对含变量的一侧才展开）
      const dl = dNode(left, v)
      const dr = dNode(right, v)
      const t1 = isZero(dl) ? null : mul(dl, right)
      const t2 = isZero(dr) ? null : mul(left, dr)
      if (t1 !== null && t2 !== null) return add(t1, t2)
      if (t1 !== null) return t1
      if (t2 !== null) return t2
      return num(0)
    }
    case '/':
      // 商法则：(u/v)' = (u'v − uv') / v²
      return div(sub(mul(dNode(left, v), right), mul(left, dNode(right, v))), pow(right, num(2)))
    case '^':
      return dPower(left, right, v)
    case '%':
      throw notDifferentiable("取模运算 '%' 暂不支持符号求导")
    case '=':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      throw notDifferentiable('比较运算不可求导')
  }
}

function dPower(base: Expr, exponent: Expr, v: string): Expr {
  const baseHasVariable = containsVariable(base, v)
  const exponentHasVariable = containsVariable(exponent, v)
  if (!baseHasVariable && !exponentHasVariable) return num(0)

  if (!exponentHasVariable) {
    // 幂法则：e · b^(e−1) · b'
    return mul(mul(exponent, pow(base, sub(exponent, num(1)))), dNode(base, v))
  }
  if (!baseHasVariable) {
    // 指数法则：a^u · ln(a) · u'
    return mul(mul(pow(base, exponent), call('ln', [base])), dNode(exponent, v))
  }
  // 一般式：u^v · (v'·ln(u) + v·u'/u)
  return mul(
    pow(base, exponent),
    add(mul(dNode(exponent, v), call('ln', [base])), mul(exponent, div(dNode(base, v), base))),
  )
}

function dCall(expr: CallNode, v: string): Expr {
  const def = FUNCTIONS[expr.name]
  if (def === undefined) {
    throw new ExprEvaluationError({ message: `未知函数 '${expr.name}'`, hint: '请检查函数名拼写' })
  }

  const arg0 = expr.args[0]
  if (arg0 === undefined) {
    throw notDifferentiable(`函数 ${expr.name} 缺少参数`)
  }
  if (!def.differentiable) {
    throw notDifferentiable(`函数 ${expr.name} 暂不支持符号求导`, `用法：${def.signature}`)
  }

  const d0 = dNode(arg0, v)
  switch (expr.name) {
    case 'sin':
      return mul(call('cos', [arg0]), d0)
    case 'cos':
      return neg(mul(call('sin', [arg0]), d0))
    case 'tan':
      return div(d0, pow(call('cos', [arg0]), num(2)))
    case 'asin':
      return div(d0, call('sqrt', [sub(num(1), pow(arg0, num(2)))]))
    case 'acos':
      return neg(div(d0, call('sqrt', [sub(num(1), pow(arg0, num(2)))])))
    case 'atan':
      return div(d0, add(num(1), pow(arg0, num(2))))
    case 'sinh':
      return mul(call('cosh', [arg0]), d0)
    case 'cosh':
      return mul(call('sinh', [arg0]), d0)
    case 'tanh':
      return div(d0, pow(call('cosh', [arg0]), num(2)))
    case 'asinh':
      return div(d0, call('sqrt', [add(pow(arg0, num(2)), num(1))]))
    case 'acosh':
      return div(d0, call('sqrt', [sub(pow(arg0, num(2)), num(1))]))
    case 'atanh':
      return div(d0, sub(num(1), pow(arg0, num(2))))
    case 'exp':
      return mul(call('exp', [arg0]), d0)
    case 'ln':
      return div(d0, arg0)
    case 'log': {
      if (expr.args.length === 1) return div(d0, arg0)
      const base = expr.args[1]!
      if (!containsVariable(base, v)) {
        return div(d0, mul(arg0, call('ln', [base])))
      }
      // (ln u / ln b)' = (u'/u·ln b − ln u·b'/b) / (ln b)²
      return div(
        sub(
          mul(div(d0, arg0), call('ln', [base])),
          mul(call('ln', [arg0]), div(dNode(base, v), base)),
        ),
        pow(call('ln', [base]), num(2)),
      )
    }
    case 'log2':
      return div(d0, mul(arg0, num(Math.LN2)))
    case 'log10':
      return div(d0, mul(arg0, num(Math.LN10)))
    case 'sqrt':
      return div(d0, mul(num(2), call('sqrt', [arg0])))
    case 'cbrt':
      return div(d0, mul(num(3), pow(call('cbrt', [arg0]), num(2))))
    case 'pow': {
      const exponent = expr.args[1]
      if (exponent === undefined) throw notDifferentiable('函数 pow 缺少参数')
      return dPower(arg0, exponent, v)
    }
    case 'abs':
      return mul(call('sign', [arg0]), d0)
    case 'erf':
      return mul(mul(num(TWO_OVER_SQRT_PI), call('exp', [neg(pow(arg0, num(2)))])), d0)
    default:
      throw notDifferentiable(`函数 ${expr.name} 暂不支持符号求导`, `用法：${def.signature}`)
  }
}

function notDifferentiable(reason: string, hint?: string): ExprEvaluationError {
  return new ExprEvaluationError({
    message: `不可求导：${reason}`,
    ...(hint !== undefined ? { hint } : {}),
  })
}
