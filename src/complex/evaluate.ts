/**
 * 复数表达式求值（v0.9）：把 v0.2 的 AST 编译为 z 的复函数闭包。
 * - 变量 `z` 为主变量；`i` 为虚数单位；支持常量 pi/e/phi/tau；
 * - 支持的函数：sin/cos/tan/sinh/cosh/tanh/exp/log/sqrt/abs/arg/conj/re/im/gamma/zeta；
 * - 整数幂走快速路径（域着色热点）；阶乘按 Γ(x+1) 连续化（实整数一致）；
 * - piecewise 条件按**实部**判断；无法支持的形式返回 NaN（调用方显示为白色）。
 */
import { parse } from '../expr/parser'
import type { Expr } from '../expr/ast'
import { CONSTANTS } from '../expr/ast'
import * as C from './complex'

export type ComplexFn = (z: C.Complex) => C.Complex

const NAN_VALUE: C.Complex = { re: Number.NaN, im: Number.NaN }
const NOT_SUPPORTED = (): C.Complex => NAN_VALUE

function integerExponent(expr: Expr): number | null {
  if (expr.type === 'number' && Number.isInteger(expr.value)) return expr.value
  if (
    expr.type === 'unary' &&
    expr.op === '-' &&
    expr.operand.type === 'number' &&
    Number.isInteger(expr.operand.value)
  ) {
    return -expr.operand.value
  }
  return null
}

export function compileComplexFn(expr: Expr): ComplexFn {
  switch (expr.type) {
    case 'number': {
      const value = expr.value
      return () => ({ re: value, im: 0 })
    }
    case 'constant': {
      const value = CONSTANTS[expr.name]
      return () => ({ re: value, im: 0 })
    }
    case 'variable': {
      if (expr.name === 'z') return (z) => z
      if (expr.name === 'i') return () => ({ re: 0, im: 1 })
      return NOT_SUPPORTED
    }
    case 'unary': {
      const operand = compileComplexFn(expr.operand)
      return expr.op === '-' ? (z) => C.cScale(operand(z), -1) : operand
    }
    case 'binary': {
      const left = compileComplexFn(expr.left)
      const right = compileComplexFn(expr.right)
      switch (expr.op) {
        case '+':
          return (z) => C.cAdd(left(z), right(z))
        case '-':
          return (z) => C.cSub(left(z), right(z))
        case '*':
          return (z) => C.cMul(left(z), right(z))
        case '/':
          return (z) => C.cDiv(left(z), right(z))
        case '^': {
          const exponent = integerExponent(expr.right)
          if (exponent !== null) return (z) => C.cIntPow(left(z), exponent)
          return (z) => C.cPow(left(z), right(z))
        }
        default:
          return NOT_SUPPORTED
      }
    }
    case 'call': {
      const args = expr.args.map((arg) => compileComplexFn(arg))
      const first = args[0] ?? NOT_SUPPORTED
      switch (expr.name) {
        case 'sin':
          return (z) => C.cSin(first(z))
        case 'cos':
          return (z) => C.cCos(first(z))
        case 'tan':
          return (z) => C.cTan(first(z))
        case 'sinh':
          return (z) => C.cSinh(first(z))
        case 'cosh':
          return (z) => C.cCosh(first(z))
        case 'tanh':
          return (z) => C.cTanh(first(z))
        case 'exp':
          return (z) => C.cExp(first(z))
        case 'log': {
          if (args.length >= 2) {
            const base = args[1]!
            return (z) => C.cDiv(C.cLog(first(z)), C.cLog(base(z)))
          }
          return (z) => C.cLog(first(z))
        }
        case 'sqrt':
          return (z) => C.cSqrt(first(z))
        case 'abs':
          return (z) => ({ re: C.cAbs(first(z)), im: 0 })
        case 'arg':
          return (z) => ({ re: C.cArg(first(z)), im: 0 })
        case 'conj':
          return (z) => C.cConj(first(z))
        case 're':
          return (z) => ({ re: first(z).re, im: 0 })
        case 'im':
          return (z) => ({ re: first(z).im, im: 0 })
        case 'gamma':
          return (z) => C.cGamma(first(z))
        case 'zeta':
          return (z) => C.cZeta(first(z))
        default:
          return NOT_SUPPORTED
      }
    }
    case 'factorial': {
      const operand = compileComplexFn(expr.operand)
      return (z) => C.cGamma(C.cAdd(operand(z), { re: 1, im: 0 }))
    }
    case 'piecewise': {
      const cases = expr.cases.map((branch) => ({
        condition: compileComplexFn(branch.condition),
        value: compileComplexFn(branch.value),
      }))
      return (z) => {
        for (const branch of cases) {
          const condition = branch.condition(z)
          if (Number.isFinite(condition.re) && condition.re > 0) return branch.value(z)
        }
        return NAN_VALUE
      }
    }
    case 'assignment':
      return compileComplexFn(expr.value)
  }
}

/** 源码字符串 → 复函数（解析失败返回错误信息） */
export function compileComplexExpression(source: string): { fn: ComplexFn } | { error: string } {
  let expr: Expr
  try {
    expr = parse(source)
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  return { fn: compileComplexFn(expr) }
}
