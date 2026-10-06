/**
 * 方程解析共享工具（v3.1.1）：2D 曲线方程与 3D 曲面/曲线方程解析的公共部分。
 */
import { parse } from '../expr'

/** 归一化：去首尾空白、全角分号/等号 → 半角 */
export function normalizeEquationText(input: string): string {
  return input.trim().replaceAll('；', ';').replaceAll('＝', '=')
}

/** 是否存在作为独立记号出现的变量名（避免匹配 x1、exp 里的 x 等） */
export function hasVariable(text: string, name: string): boolean {
  return new RegExp(`(^|[^0-9A-Za-z_])${name}([^0-9A-Za-z_]|$)`).test(text)
}

/** 检查表达式能否被引擎解析（不判断定义域） */
export function expressionError(expr: string, label: string): string | null {
  if (!expr.trim()) return `${label}为空`
  try {
    parse(expr)
    return null
  } catch (error) {
    return `${label}解析失败：${error instanceof Error ? error.message : String(error)}`
  }
}
