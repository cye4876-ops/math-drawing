/**
 * 表达式 → 多参数函数的适配（v0.8）。
 * v0.2 的 `compile` 返回 `(scope) => number`；3D 层统一使用 `(x, y[, z]) => number` 形态。
 * 编译失败（语法错误）返回 null，由调用方决定降级行为。
 */
import { compile, parse } from '../expr'
import type { Scope } from '../expr/evaluate'
import { differentiate } from '../expr/differentiate'
import type { Expr } from '../expr/ast'

function bind(expr: Expr, vars: readonly string[]): (...args: number[]) => number {
  const fn = compile(expr)
  return (...args: number[]): number => {
    const scope: Scope = {}
    for (let i = 0; i < vars.length; i++) scope[vars[i]!] = args[i] ?? 0
    return fn(scope)
  }
}

/** 源码字符串 → 多参数函数；解析/编译失败返回 null */
export function compileExpr(
  source: string,
  vars: readonly string[],
): ((...args: number[]) => number) | null {
  try {
    return bind(parse(source), vars)
  } catch {
    return null
  }
}

/** 源码字符串 → 对 variable 符号求导后的多参数函数；失败返回 null */
export function compileDerivative(
  source: string,
  variable: string,
  vars: readonly string[],
): ((...args: number[]) => number) | null {
  try {
    return bind(differentiate(parse(source), variable), vars)
  } catch {
    return null
  }
}
