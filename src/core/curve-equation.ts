/**
 * 自定义方程解析（v3.1）：把用户输入的“任意曲线方程”归一化为四种曲线类型。
 *
 * 支持的写法：
 * - `y = f(x)` 或直接 `f(x)`（显函数；含 y 的无等号表达式按隐函数处理）
 * - `F(x, y) = 0`：等号两端含 x、y（含 y 的表达式）
 * - `r = f(θ)`：极坐标（θ 可写作 theta 或 θ）
 * - `x = f(t); y = g(t)`：参数方程（支持中文分号；两段顺序任意）
 *
 * 解析结果直接对应 store.addCurve 的入参，UI 负责展示识别说明。
 */
import { expressionError, hasVariable, normalizeEquationText } from './equation-utils'

export type CurveSpecKind = 'explicit' | 'implicit' | 'polar' | 'parametric'

export interface CurveSpec {
  kind: CurveSpecKind
  expr: string
  expr2?: string
}

export type CurveEquationResult =
  { ok: true; spec: CurveSpec; note: string } | { ok: false; error: string }

function hasTheta(text: string): boolean {
  return text.includes('θ') || hasVariable(text, 'theta')
}

export function parseCurveEquation(input: string): CurveEquationResult {
  const raw = normalizeEquationText(input)
  if (!raw) return { ok: false, error: '请输入方程' }

  // —— 参数方程：分号分隔两段 ——
  if (raw.includes(';')) {
    const parts = raw
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
    if (parts.length !== 2) {
      return { ok: false, error: '参数方程需要两段：x = f(t); y = g(t)' }
    }
    const xPart = parts.find((part) => /^x\s*=/i.test(part))
    const yPart = parts.find((part) => /^y\s*=/i.test(part))
    if (!xPart || !yPart) {
      return { ok: false, error: '参数方程格式：x = f(t); y = g(t)' }
    }
    const expr = xPart.replace(/^x\s*=\s*/i, '').trim()
    const expr2 = yPart.replace(/^y\s*=\s*/i, '').trim()
    const error = expressionError(expr, 'x(t)') ?? expressionError(expr2, 'y(t)')
    if (error) return { ok: false, error }
    return {
      ok: true,
      spec: { kind: 'parametric', expr, expr2 },
      note: '识别为参数方程 (x(t), y(t))',
    }
  }

  const segments = raw.split('=')
  if (segments.length > 2) return { ok: false, error: '一个方程最多包含一个等号' }

  if (segments.length === 2) {
    const lhs = (segments[0] ?? '').trim()
    const rhs = (segments[1] ?? '').trim()
    if (!lhs || !rhs) return { ok: false, error: '等号两侧都要有内容' }

    // 显函数：y = f(x)（另一侧不含 y）
    if (lhs === 'y' && !hasVariable(rhs, 'y')) {
      const error = expressionError(rhs, 'f(x)')
      if (error) return { ok: false, error }
      return { ok: true, spec: { kind: 'explicit', expr: rhs }, note: '识别为显函数 y = f(x)' }
    }
    if (rhs === 'y' && !hasVariable(lhs, 'y')) {
      const error = expressionError(lhs, 'f(x)')
      if (error) return { ok: false, error }
      return { ok: true, spec: { kind: 'explicit', expr: lhs }, note: '识别为显函数 y = f(x)' }
    }

    // 极坐标：r = f(θ)
    if (lhs === 'r' && hasTheta(rhs)) {
      const error = expressionError(rhs, 'r(θ)')
      if (error) return { ok: false, error }
      return { ok: true, spec: { kind: 'polar', expr: rhs }, note: '识别为极坐标 r(θ)' }
    }
    if (rhs === 'r' && hasTheta(lhs)) {
      const error = expressionError(lhs, 'r(θ)')
      if (error) return { ok: false, error }
      return { ok: true, spec: { kind: 'polar', expr: lhs }, note: '识别为极坐标 r(θ)' }
    }

    // 其余含等号写法：隐函数 F = 左 − 右
    const expr = `(${lhs}) - (${rhs})`
    const error = expressionError(expr, 'F(x, y)')
    if (error) return { ok: false, error }
    return {
      ok: true,
      spec: { kind: 'implicit', expr },
      note: '识别为隐函数 F(x, y) = 0（F = 左 − 右）',
    }
  }

  // —— 无等号 ——
  if (hasVariable(raw, 'y')) {
    const error = expressionError(raw, 'F(x, y)')
    if (error) return { ok: false, error }
    return {
      ok: true,
      spec: { kind: 'implicit', expr: raw },
      note: '含 y 且无等号：按隐函数 F(x, y) = 0 处理',
    }
  }
  const error = expressionError(raw, 'f(x)')
  if (error) return { ok: false, error }
  return { ok: true, spec: { kind: 'explicit', expr: raw }, note: '识别为显函数 y = f(x)' }
}
