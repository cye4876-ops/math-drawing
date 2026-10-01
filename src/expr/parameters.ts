/**
 * 参数系统：
 * - 从 AST 中自动识别自由变量，约定 x/y/t/theta 为自变量，其余为可调参数；
 * - 顶层赋值（a = 3）定义参数默认值；
 * - 参数集合可无损序列化为 JSON（供滑块、分享链接、Notebook 使用）。
 */
import { collectFreeVariables, type Expr } from './ast'
import { ExprFormatError } from './errors'
import { evaluate } from './evaluate'

export interface Parameter {
  name: string
  /** 当前值 / 默认值 */
  value: number
  min: number
  max: number
  step: number
}

/** 参数默认范围（滑块用） */
export const DEFAULT_PARAMETER_BOUNDS = { min: -10, max: 10, step: 0.1 } as const

/** 自变量（不作为滑块参数） */
export const INDEPENDENT_VARIABLES: readonly string[] = ['x', 'y', 't', 'theta']

/**
 * 从一组表达式（或单个表达式）中提取参数集合，按名称排序。
 * 顶层赋值定义默认值：`a = 3` → 参数 a 默认 3；其余参数默认 1。
 */
export function extractParameters(expressions: Expr | Expr[]): Parameter[] {
  const list = Array.isArray(expressions) ? expressions : [expressions]

  const defined = new Map<string, number>()
  for (const expr of list) {
    if (expr.type === 'assignment') {
      defined.set(expr.name, constantValueOf(expr.value))
    }
  }

  const names = new Set<string>()
  for (const expr of list) {
    for (const name of collectFreeVariables(expr)) {
      if (!INDEPENDENT_VARIABLES.includes(name)) names.add(name)
    }
  }
  // 赋值定义名也是参数（如 a = 3 → 参数 a 默认 3），但自变量名（x/y/t/theta）除外
  for (const name of defined.keys()) {
    if (!INDEPENDENT_VARIABLES.includes(name)) names.add(name)
  }

  return [...names].sort().map((name) => ({
    name,
    value: defined.get(name) ?? 1,
    min: DEFAULT_PARAMETER_BOUNDS.min,
    max: DEFAULT_PARAMETER_BOUNDS.max,
    step: DEFAULT_PARAMETER_BOUNDS.step,
  }))
}

/** 表达式是否可折叠为常数；能则返回其数值，否则返回 1 */
function constantValueOf(expr: Expr): number {
  if (collectFreeVariables(expr).length > 0) return 1
  try {
    return evaluate(expr)
  } catch {
    return 1
  }
}

export function serializeParameters(parameters: Parameter[]): string {
  return JSON.stringify(parameters)
}

export function deserializeParameters(json: string): Parameter[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (error) {
    throw new ExprFormatError(`参数集 JSON 解析失败：${(error as Error).message}`)
  }
  if (!Array.isArray(data)) throw new ExprFormatError('参数集必须是数组')

  return data.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new ExprFormatError(`参数集第 ${index} 项不是对象`)
    }
    const record = item as Record<string, unknown>
    const name = record['name']
    if (typeof name !== 'string' || name.length === 0) {
      throw new ExprFormatError(`参数集第 ${index} 项缺少有效的 name`)
    }
    return {
      name,
      value: requireNumber(record, 'value', index),
      min: requireNumber(record, 'min', index),
      max: requireNumber(record, 'max', index),
      step: requireNumber(record, 'step', index),
    }
  })
}

function requireNumber(record: Record<string, unknown>, key: string, index: number): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ExprFormatError(`参数集第 ${index} 项的 ${key} 必须为有限数`)
  }
  return value
}
