/**
 * 导出共享层（v0.6）：范围解析 + 单帧渲染。
 * PNG（离屏画布）、动画帧（GIF/视频）共用；SVG/TikZ 另走矢量管线。
 */
import { drawGrid } from '../render/grid-renderer'
import { createSceneRenderer } from '../render/scene'
import { mathToScreen } from '../core/transform'
import type { SceneHighlight } from '../render/element-registry'
import type { DocState, SceneObject, Size, ViewTransform } from '../state/types'

/** 导出范围：当前视窗 / 自动包含全部内容 / 指定数学区域 */
export type ExportRange =
  | { kind: 'view' }
  | { kind: 'content' }
  | { kind: 'region'; xMin: number; xMax: number; yMin: number; yMax: number }

/** 导出层共用的场景渲染器（曲线采样缓存在模块级，跨帧复用） */
const exportScene = createSceneRenderer()

/** v0.8：仅在 3D 视图渲染的对象类型（2D 导出与画布不参与） */
export const SPACE_OBJECT_TYPES = ['surface3d', 'curve3d', 'field3d', 'ode2d'] as const

/** 按模式过滤画布对象（与 App 的可见性规则一致） */
export function objectsOfMode(
  doc: DocState,
  mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced',
): SceneObject[] {
  if (mode === 'space' || mode === 'advanced') return []
  return doc.objects.filter((object) => {
    if (mode === 'graph') return object.type === 'graph'
    if (mode === 'stats') return object.type === 'dataset'
    return (
      object.type !== 'graph' &&
      object.type !== 'dataset' &&
      !(SPACE_OBJECT_TYPES as readonly string[]).includes(object.type)
    )
  })
}

/**
 * 解析导出视图：
 * - view：当前视窗；
 * - content：标记点与图节点的包围盒（含 15% 边距；无内容时回落当前视窗）；
 * - region：指定数学区域精确铺满（非等比，与「视图设置」语义一致）。
 */
export function resolveView(
  range: ExportRange,
  base: ViewTransform,
  size: Size,
  objects: SceneObject[],
): ViewTransform {
  if (range.kind === 'view') return base
  if (range.kind === 'region') {
    const { xMin, xMax, yMin, yMax } = range
    const spanX = Math.max(1e-9, xMax - xMin)
    const spanY = Math.max(1e-9, yMax - yMin)
    return {
      ...base,
      centerX: (xMin + xMax) / 2,
      centerY: (yMin + yMax) / 2,
      scaleX: size.width / spanX,
      scaleY: size.height / spanY,
      equalAspect: false,
    }
  }
  const xs: number[] = []
  const ys: number[] = []
  for (const object of objects) {
    if (object.type === 'marker') {
      xs.push(object.x)
      ys.push(object.y)
    } else if (object.type === 'graph') {
      for (const node of object.nodes) {
        xs.push(node.x)
        ys.push(node.y)
      }
    }
  }
  if (xs.length === 0) return base
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const padX = Math.max(0.5, (maxX - minX) * 0.15)
  const padY = Math.max(0.5, (maxY - minY) * 0.15)
  const width = maxX - minX + 2 * padX
  const height = maxY - minY + 2 * padY
  const scale = Math.min(size.width / width, size.height / height)
  return {
    ...base,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scaleX: scale,
    scaleY: scale,
    equalAspect: true,
  }
}

export interface FrameRenderOptions {
  /** 是否绘制网格与坐标轴（plot 模式；透明背景导出时通常关闭） */
  withGrid: boolean
  /** 图层高亮（动画帧：算法步骤 / 选中元素） */
  highlight?: SceneHighlight
}

/**
 * 单帧渲染（调用方负责清屏/背景与坐标变换；此处按 CSS 尺寸绘制）。
 * 覆盖：网格（可选）→ 曲线/图 → 标记点（画布版近似 DOM 层样式）。
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  doc: DocState,
  mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced',
  view: ViewTransform,
  size: Size,
  options: FrameRenderOptions,
): void {
  const objects = objectsOfMode(doc, mode)
  if (mode !== 'graph' && options.withGrid) drawGrid(ctx, view, size, 1)
  exportScene.draw(ctx, objects, { view, size }, options.highlight)
  drawMarkers(ctx, objects, view, size)
}

/** 标记点的画布渲染（与 DOM 层 MarkerLayer 视觉近似：红点 + 坐标标签） */
function drawMarkers(
  ctx: CanvasRenderingContext2D,
  objects: SceneObject[],
  view: ViewTransform,
  size: Size,
): void {
  let fontReady = false
  for (const object of objects) {
    if (object.type !== 'marker') continue
    const p = mathToScreen(view, size, object)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(220, 38, 38, 0.15)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#dc2626'
    ctx.stroke()
    if (!fontReady) {
      ctx.font = '12px system-ui, "Segoe UI", "Microsoft YaHei", sans-serif'
      fontReady = true
    }
    ctx.fillStyle = '#b91c1c'
    ctx.fillText(`(${object.x}, ${object.y})`, p.x + 8, p.y + 4)
  }
}
