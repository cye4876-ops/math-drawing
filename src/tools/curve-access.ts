/**
 * 曲线访问助手：符号导数闭包缓存 + 采样折线获取。
 * 追踪游标/切线用**符号求导**（v0.2 differentiate），而非数值差分（规格明确要求）。
 */
import { compile, differentiate, parse, simplify, type Expr } from '../expr'
import type { Curve } from '../state/types'
import { getCurveSample } from '../render/curve-renderer'

type CompiledFn = (scope: Record<string, number>) => number

const derivativeCache = new Map<string, ((v: number) => number) | null>()
const derivativeAstCache = new Map<string, Expr | null>()

/**
 * 第 order 阶符号导数的 AST（缓存；供精确值引擎在指定点精确求值）。
 * 导数不支持（floor 等）或求导失败返回 null。
 */
export function getDerivativeAst(expr: string, variable: string, order: number): Expr | null {
  if (order < 0 || !Number.isInteger(order)) return null
  const key = `${variable}|${order}|${expr}`
  const cached = derivativeAstCache.get(key)
  if (cached !== undefined) return cached
  let out: Expr | null
  try {
    let node: Expr = parse(expr)
    for (let k = 0; k < order; k++) node = simplify(differentiate(node, variable))
    out = node
  } catch {
    out = null
  }
  derivativeAstCache.set(key, out)
  return out
}

/**
 * 第 order 阶符号导数闭包（对变量 variable 求导）。
 * order=0 即原函数；表达式不支持求导（floor 等）或求导失败返回 null。
 */
export function getDerivativeFn(
  expr: string,
  variable: string,
  order: number,
): ((v: number) => number) | null {
  if (order < 0 || !Number.isInteger(order)) return null
  const key = `${variable}|${order}|${expr}`
  const cached = derivativeCache.get(key)
  if (cached !== undefined) return cached

  let out: ((v: number) => number) | null
  try {
    let node: Expr = parse(expr)
    for (let k = 0; k < order; k++) {
      node = simplify(differentiate(node, variable))
    }
    const compiled: CompiledFn = compile(node)
    const scope: Record<string, number> = { [variable]: 0 }
    out = (v: number): number => {
      scope[variable] = v
      return compiled(scope)
    }
    // 只保留可用的结果；编译成功但处处 NaN（如未知函数）同样视作不可用
    const probe = out(0.123456)
    const probe2 = out(-0.654321)
    if (Number.isNaN(probe) && Number.isNaN(probe2)) out = null
  } catch {
    out = null
  }
  derivativeCache.set(key, out)
  return out
}

/** 曲线采样折线（带视图缓存，来自渲染器） */
export { getCurveSample }

/** 显函数曲线的求值闭包（等价于 0 阶导数） */
export function getExplicitFn(curve: Curve): ((x: number) => number) | null {
  if (curve.kind !== 'explicit') return null
  return getDerivativeFn(curve.expr, 'x', 0)
}

/** 清空导数缓存（测试用） */
export function clearDerivativeCache(): void {
  derivativeCache.clear()
  derivativeAstCache.clear()
}
