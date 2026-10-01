import type { Curve, LineStyle, Point2, Size, ViewTransform } from '../state/types'
import { createProjector, viewBounds } from '../core/transform'
import { compile, parse } from '../expr'
import { sampleExplicit } from './samplers/adaptive'
import { sampleImplicit } from './samplers/implicit'
import { sampleParametric, samplePolar } from './samplers/parametric'
import { qualityToTuning, type SampledPolyline } from './samplers/types'

/** 曲线绘制坐标的钳制范围（防止极端值导致 canvas 精度问题） */
const MAX_COORD = 1e6

/** 参数方程 / 极坐标的默认参数范围 */
export const DEFAULT_T_RANGE: readonly [number, number] = [0, 2 * Math.PI]

function clampCoord(v: number): number {
  return v > MAX_COORD ? MAX_COORD : v < -MAX_COORD ? -MAX_COORD : v
}

/** 线型 → canvas 虚线样式 */
export function dashForStyle(style: LineStyle): number[] {
  switch (style) {
    case 'dashed':
      return [8, 5]
    case 'dotted':
      return [1.5, 3.5]
    default:
      return []
  }
}

type CompiledFn = (scope: Record<string, number>) => number

/** 解析并编译表达式；失败返回 null（UI 层负责展示错误） */
export function compileCurveExpr(expr: string): CompiledFn | null {
  try {
    return compile(parse(expr))
  } catch {
    return null
  }
}

interface CacheEntry {
  key: string
  polyline: SampledPolyline | null
}

const sampleCache = new Map<string, CacheEntry>()

function viewKey(view: ViewTransform, size: Size): string {
  return `${view.coordType}|${view.centerX}|${view.centerY}|${view.scaleX}|${view.scaleY}|${size.width}x${size.height}`
}

/** 清空采样缓存（测试与导入新文档时使用） */
export function clearSampleCache(): void {
  sampleCache.clear()
}

function computeSample(curve: Curve, view: ViewTransform, size: Size): SampledPolyline | null {
  const tuning = qualityToTuning(curve.quality)
  const bounds = viewBounds(view, size)
  const projector = createProjector(view, size)

  switch (curve.kind) {
    case 'explicit': {
      const fn = compileCurveExpr(curve.expr)
      if (!fn) return null
      const scope: Record<string, number> = { x: 0 }
      const f = (x: number): number => {
        scope['x'] = x
        return fn(scope)
      }
      return sampleExplicit(f, {
        ...tuning,
        xMin: bounds.minX,
        xMax: bounds.maxX,
        widthPx: size.width,
        heightPx: size.height,
        screenX: projector.screenX,
        screenY: projector.screenY,
        screenToMathX: projector.screenToMathX,
      })
    }
    case 'implicit': {
      const fn = compileCurveExpr(curve.expr)
      if (!fn) return null
      const scope: Record<string, number> = { x: 0, y: 0 }
      const F = (x: number, y: number): number => {
        scope['x'] = x
        scope['y'] = y
        return fn(scope)
      }
      return sampleImplicit(F, {
        xMin: bounds.minX,
        xMax: bounds.maxX,
        yMin: bounds.minY,
        yMax: bounds.maxY,
        widthPx: size.width,
        heightPx: size.height,
        quality: curve.quality,
      })
    }
    case 'parametric': {
      if (curve.expr2 === undefined) return null
      const fnX = compileCurveExpr(curve.expr)
      const fnY = compileCurveExpr(curve.expr2)
      if (!fnX || !fnY) return null
      const scope: Record<string, number> = { t: 0 }
      const fx = (t: number): number => {
        scope['t'] = t
        return fnX(scope)
      }
      const fy = (t: number): number => {
        scope['t'] = t
        return fnY(scope)
      }
      return sampleParametric(fx, fy, {
        ...tuning,
        tMin: DEFAULT_T_RANGE[0],
        tMax: DEFAULT_T_RANGE[1],
        project: projector.project,
      })
    }
    case 'polar': {
      const fn = compileCurveExpr(curve.expr)
      if (!fn) return null
      const scope: Record<string, number> = { theta: 0 }
      const r = (theta: number): number => {
        scope['theta'] = theta
        return fn(scope)
      }
      return samplePolar(r, {
        ...tuning,
        tMin: DEFAULT_T_RANGE[0],
        tMax: DEFAULT_T_RANGE[1],
        project: projector.project,
      })
    }
    default:
      return null
  }
}

/** 采样（带缓存：key 覆盖表达式/精度/视图/画布尺寸，视图不变则零开销） */
function sampleCurve(curve: Curve, view: ViewTransform, size: Size): SampledPolyline | null {
  const key = `${curve.kind}|${curve.expr}|${curve.expr2 ?? ''}|${curve.quality}|${viewKey(view, size)}`
  const cached = sampleCache.get(curve.id)
  if (cached && cached.key === key) return cached.polyline

  const polyline = computeSample(curve, view, size)
  sampleCache.set(curve.id, { key, polyline })
  return polyline
}

/** 绘制单条曲线（折线段 + 渐近线虚线） */
function strokeCurve(
  ctx: CanvasRenderingContext2D,
  polyline: SampledPolyline,
  curve: Curve,
  view: ViewTransform,
  size: Size,
): void {
  const projector = createProjector(view, size)
  ctx.save()
  ctx.strokeStyle = curve.color
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash(dashForStyle(curve.lineStyle))

  ctx.beginPath()
  for (const segment of polyline.segments) {
    let started = false
    for (const p of segment) {
      const sx = projector.screenX(p.x)
      const sy = projector.screenY(p.y)
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
        started = false
        continue
      }
      const fx = clampCoord(sx)
      const fy = clampCoord(sy)
      if (!started) {
        ctx.moveTo(fx, fy)
        started = true
      } else {
        ctx.lineTo(fx, fy)
      }
    }
  }
  ctx.stroke()

  // 渐近线：虚线竖线标注
  if (polyline.asymptoteXs.length > 0) {
    ctx.setLineDash([4, 4])
    ctx.globalAlpha = 0.45
    ctx.beginPath()
    for (const x of polyline.asymptoteXs) {
      const sx = projector.screenX(x)
      if (!Number.isFinite(sx) || sx < 0 || sx > size.width) continue
      ctx.moveTo(sx, 0)
      ctx.lineTo(sx, size.height)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * 绘制全部可见曲线（Canvas 层，网格之后调用）。
 * 解析失败的曲线跳过（错误由 UI 列表展示）；采样结果按视图缓存。
 */
export function drawCurves(
  ctx: CanvasRenderingContext2D,
  curves: Curve[],
  view: ViewTransform,
  size: Size,
): void {
  // 清理已删除曲线的缓存
  if (sampleCache.size > curves.length) {
    const alive = new Set(curves.map((curve) => curve.id))
    for (const id of sampleCache.keys()) {
      if (!alive.has(id)) sampleCache.delete(id)
    }
  }

  for (const curve of curves) {
    if (!curve.visible) continue
    const polyline = sampleCurve(curve, view, size)
    if (!polyline) continue
    strokeCurve(ctx, polyline, curve, view, size)
  }
}

/** 供测试/基准：对单条曲线采样一次（不绘制），返回该段折线与耗时信息 */
export function sampleCurveForTest(
  curve: Curve,
  view: ViewTransform,
  size: Size,
): SampledPolyline | null {
  return computeSample(curve, view, size)
}

/** 供渲染使用：曲线段转屏幕折线（测试断言用） */
export function toScreenSegments(
  polyline: SampledPolyline,
  view: ViewTransform,
  size: Size,
): Point2[][] {
  const projector = createProjector(view, size)
  return polyline.segments.map((segment) =>
    segment.map((p) => ({ x: projector.screenX(p.x), y: projector.screenY(p.y) })),
  )
}
