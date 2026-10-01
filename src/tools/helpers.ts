/**
 * 工具层共享助手：数值格式化、最近曲线吸附、符号导数分析（切线/曲率）。
 */
import { createProjector } from '../core/transform'
import { compile, differentiate, parse, simplify } from '../expr'
import type { Point2 } from '../state/types'
import { nearestPointOnPolylines, type NearestPoint } from '../math/numeric/nearest'
import { getCurveSample, getDerivativeFn } from './curve-access'
import type { ToolContext } from './tool-registry'
import type { Curve } from '../state/types'

/** 数值格式化：6 位有效数字；极端量级用指数；非有限显示符号 */
export function formatNum(v: number, digits = 6): string {
  if (Number.isNaN(v)) return '—'
  if (v === Number.POSITIVE_INFINITY) return '∞'
  if (v === Number.NEGATIVE_INFINITY) return '−∞'
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1e7 || abs < 1e-4) return v.toExponential(3).replace('e+', 'e')
  return String(Number(v.toPrecision(digits)))
}

export interface CurveHit extends NearestPoint {
  curve: Curve
}

/**
 * 解析坐标输入（工具面板的文本控件）：支持数字、常量与算术表达式的**无变量**求值，
 * 如 `1`、`1.5`、`pi/2`、`2*pi`、`e^2`。非法或非有限值返回 null。
 */
export function parseCoordinate(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    const compiled = compile(parse(trimmed))
    const value = compiled({})
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** 在全部可见曲线上找离屏幕点最近的吸附点 */
export function nearestCurveHit(
  ctx: ToolContext,
  screen: Point2,
  maxDistancePx = 48,
): CurveHit | null {
  const view = ctx.getView()
  const size = ctx.getSize()
  const projector = createProjector(view, size)
  let best: CurveHit | null = null
  for (const curve of ctx.store.getCurves()) {
    if (!curve.visible) continue
    const polyline = getCurveSample(curve, view, size)
    if (!polyline) continue
    const hit = nearestPointOnPolylines(polyline.segments, projector.project, screen, maxDistancePx)
    if (hit && (best === null || hit.distancePx < best.distancePx)) {
      best = { ...hit, curve }
    }
  }
  return best
}

export interface PointAnalysis {
  /** 一阶导（dy/dx）；竖直切线为 Infinity；无法求导为 null */
  slope: number | null
  /** 二阶导 d²y/dx²（参数/极坐标由公式换算）；不支持时为 null */
  second: number | null
  /** 带符号曲率 κs（用于曲率圆圆心定位）；null = 不可用 */
  signedCurvature: number | null
}

/**
 * 在吸附点处做符号导数分析（v0.2 differentiate，非数值差分）。
 * - explicit：f'(x)、f''(x)
 * - parametric：dy/dx = y'(t)/x'(t)；d²y/dx² = (x'y''−y'x'')/x'³
 * - polar：r(θ) → x=r cosθ, y=r sinθ 后同上
 * - implicit：由梯度 −Fx/Fy 得斜率（无二阶导/曲率）
 */
export function analyzeAt(curve: Curve, hit: NearestPoint): PointAnalysis {
  const none: PointAnalysis = { slope: null, second: null, signedCurvature: null }
  if (curve.kind === 'explicit') {
    const d1 = getDerivativeFn(curve.expr, 'x', 1)
    const d2 = getDerivativeFn(curve.expr, 'x', 2)
    if (!d1) return none
    const k = d1(hit.x)
    if (!Number.isFinite(k)) return none
    const k2 = d2 ? d2(hit.x) : Number.NaN
    const curvature = Number.isFinite(k2) ? k2 / (1 + k * k) ** 1.5 : null
    return {
      slope: k,
      second: Number.isFinite(k2) ? k2 : null,
      signedCurvature: curvature,
    }
  }

  if ((curve.kind === 'parametric' || curve.kind === 'polar') && hit.t !== null) {
    const t = hit.t
    let x1: number
    let y1: number
    let x2: number
    let y2: number
    if (curve.kind === 'parametric') {
      if (curve.expr2 === undefined) return none
      const fx1 = getDerivativeFn(curve.expr, 't', 1)
      const fx2 = getDerivativeFn(curve.expr, 't', 2)
      const fy1 = getDerivativeFn(curve.expr2, 't', 1)
      const fy2 = getDerivativeFn(curve.expr2, 't', 2)
      if (!fx1 || !fx2 || !fy1 || !fy2) return none
      x1 = fx1(t)
      x2 = fx2(t)
      y1 = fy1(t)
      y2 = fy2(t)
    } else {
      const r = getDerivativeFn(curve.expr, 'theta', 0)
      const r1 = getDerivativeFn(curve.expr, 'theta', 1)
      const r2 = getDerivativeFn(curve.expr, 'theta', 2)
      if (!r || !r1 || !r2) return none
      const cos = Math.cos(t)
      const sin = Math.sin(t)
      const rv = r(t)
      const rv1 = r1(t)
      const rv2 = r2(t)
      x1 = rv1 * cos - rv * sin
      x2 = rv2 * cos - rv * cos - 2 * rv1 * sin
      y1 = rv1 * sin + rv * cos
      y2 = rv2 * sin - rv * sin + 2 * rv1 * cos
    }
    if (![x1, y1, x2, y2].every(Number.isFinite)) return none
    const speed2 = x1 * x1 + y1 * y1
    if (speed2 === 0) return none
    const slope = Math.abs(x1) < 1e-12 ? Math.sign(y1) * Number.POSITIVE_INFINITY : y1 / x1
    const cross = x1 * y2 - y1 * x2
    const second = x1 === 0 ? null : cross / (x1 * x1 * x1)
    const signedCurvature = cross / Math.pow(speed2, 1.5)
    return { slope, second, signedCurvature }
  }

  if (curve.kind === 'implicit') {
    const fx = getPartialDerivative(curve.expr, 'x')
    const fy = getPartialDerivative(curve.expr, 'y')
    if (!fx || !fy) return none
    const gx = fx(hit.x, hit.y)
    const gy = fy(hit.x, hit.y)
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return none
    if (gy === 0) {
      return { slope: Number.POSITIVE_INFINITY, second: null, signedCurvature: null }
    }
    return { slope: -gx / gy, second: null, signedCurvature: null }
  }

  return none
}

const partialCache = new Map<string, ((x: number, y: number) => number) | null>()

/** 隐函数的偏导数闭包 ∂F/∂x 或 ∂F/∂y（双变量作用域） */
function getPartialDerivative(
  expr: string,
  variable: 'x' | 'y',
): ((x: number, y: number) => number) | null {
  const key = `${variable}|${expr}`
  const cached = partialCache.get(key)
  if (cached !== undefined) return cached
  let out: ((x: number, y: number) => number) | null
  try {
    const node = simplify(differentiate(parse(expr), variable))
    const compiled = compile(node)
    const scope: Record<string, number> = { x: 0, y: 0 }
    out = (x: number, y: number): number => {
      scope['x'] = x
      scope['y'] = y
      return compiled(scope)
    }
    const probe = out(0.345, -0.456)
    if (Number.isNaN(probe)) out = null
  } catch {
    out = null
  }
  partialCache.set(key, out)
  return out
}

/** 切线方程文本（点斜式/斜截式；纯文本——KaTeX 见 v0.6） */
export function tangentEquation(x0: number, y0: number, slope: number): string {
  if (!Number.isFinite(slope)) return `x = ${formatNum(x0)}`
  const b = y0 - slope * x0
  if (Math.abs(b) < 1e-12) return `y = ${formatNum(slope)}·x`
  const sign = b >= 0 ? '+' : '−'
  return `y = ${formatNum(slope)}·x ${sign} ${formatNum(Math.abs(b))}`
}

export interface ExplicitCurveFs {
  curve: Curve
  fn: (x: number) => number
  derivative: ((x: number) => number) | null
}

/** 收集可见显函数曲线的求值/导数闭包（零点、交点、积分、黎曼和、泰勒共用） */
export function getFs(ctx: ToolContext, maxCurves = 8): ExplicitCurveFs[] {
  const out: ExplicitCurveFs[] = []
  for (const curve of ctx.store.getCurves()) {
    if (!curve.visible || curve.kind !== 'explicit') continue
    const fn = getDerivativeFn(curve.expr, 'x', 0)
    if (!fn) continue
    out.push({ curve, fn, derivative: getDerivativeFn(curve.expr, 'x', 1) })
    if (out.length >= maxCurves) break
  }
  return out
}
