/**
 * 符号操作统一入口（v1.0）：进阶模式面板与 Notebook 计算格共用。
 * 行为与 v0.9 面板一致；错误以 { ok: false, text } 形式返回，不抛出。
 */
import { parse, type Expr } from '../expr'
import { astToPoly, polyToAst } from './poly'
import { simplify } from './simplify'
import { solveEquation, formatReal } from './solve'
import { integrate } from './integrate'
import { limit, type Approach } from './limit'
import { toLatex } from './latex'
import { formatSolutionSet, solveInequality, type Interval } from './inequality'

export type SymbolicOperation =
  'simplify' | 'expand' | 'solve' | 'integrate' | 'limit' | 'latex' | 'inequality'

export interface SymbolicOperationResult {
  title: string
  ok: boolean
  latex: string[]
  text: string[]
  /** 不等式解集（数轴可视化数据） */
  intervals?: Interval[]
}

/** 执行符号操作（输入表达式字符串；limitPoint 仅 'limit' 使用） */
export function runSymbolicOperation(
  input: string,
  operation: SymbolicOperation,
  limitPoint = '0',
): SymbolicOperationResult {
  const output: SymbolicOperationResult = { title: '', ok: true, latex: [], text: [] }
  try {
    const trimmed = input.trim()
    if (trimmed === '') throw new Error('请输入表达式')
    const expr: Expr = parse(trimmed)
    switch (operation) {
      case 'simplify': {
        const result = simplify(expr)
        output.title = '化简'
        output.latex = [toLatex(result)]
        break
      }
      case 'expand': {
        const poly = astToPoly(expr, 'x')
        if (!poly) throw new Error('当前仅支持关于 x 的多项式展开')
        output.title = '展开'
        output.latex = [toLatex(polyToAst(poly, 'x'))]
        break
      }
      case 'solve': {
        const result = solveEquation(trimmed)
        output.title = '解方程'
        if (result.ok && result.solutions.length > 0) {
          output.latex = result.solutions.map((item) => `x = ${item.text}`)
        } else if (result.ok) {
          output.text = [result.message ?? '无解']
        } else {
          output.ok = false
          output.text = [result.message ?? '无法求解']
        }
        break
      }
      case 'integrate': {
        const antiderivative = integrate(expr)
        if (!antiderivative) {
          throw new Error('该函数在当前规则集内无法积分（暂不支持 Risch 完整算法）')
        }
        output.title = '不定积分'
        output.latex = [`\\int ${toLatex(expr)}\\,dx = ${toLatex(antiderivative)} + C`]
        break
      }
      case 'limit': {
        const pointText = limitPoint.trim()
        let approach: Approach
        if (pointText === 'inf' || pointText === '+inf') approach = 'inf'
        else if (pointText === '-inf') approach = '-inf'
        else {
          const value = Number(pointText)
          if (!Number.isFinite(value)) throw new Error('极限点无效（输入数字或 inf / -inf）')
          approach = value
        }
        const result = limit(expr, 'x', approach)
        output.title = '极限'
        if (result.ok) {
          const target =
            typeof approach === 'number'
              ? formatReal(approach)
              : approach === 'inf'
                ? '+\\infty'
                : '-\\infty'
          const valueText =
            result.infinite !== 0
              ? result.infinite > 0
                ? '+\\infty'
                : '-\\infty'
              : result.value !== null
                ? formatReal(result.value)
                : '?'
          output.latex = [`\\lim_{x \\to ${target}} ${toLatex(expr)} = ${valueText}`]
          if (result.method === 'numeric') output.text = ['数值近似结果']
        } else {
          output.ok = false
          output.text = [result.message ?? '无法判定极限']
        }
        break
      }
      case 'latex': {
        output.title = 'LaTeX 源码'
        const latex = toLatex(expr)
        output.text = [latex]
        output.latex = [latex]
        break
      }
      case 'inequality': {
        const result = solveInequality(trimmed)
        output.title = '不等式解集'
        if (!result.ok) {
          output.ok = false
          output.text = [result.message ?? '无法求解']
        } else {
          output.text = [formatSolutionSet(result.intervals)]
          output.intervals = result.intervals
        }
        break
      }
    }
  } catch (error) {
    output.ok = false
    output.title = output.title || '错误'
    output.text = [(error as Error).message]
  }
  return output
}
