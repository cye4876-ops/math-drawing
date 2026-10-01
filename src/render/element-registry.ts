/**
 * 图形元素注册制（v0.5 架构重构，v0.8/v1.0 复用）。
 *
 * 各类元素（曲线、图、未来的 3D 对象 / Notebook 元素）自报「如何绘制」与「如何命中」，
 * 渲染管线按注册表分发，不再堆 `if` 分支。标记点（marker）是 DOM 层元素，不走 canvas 管线
 * （注册表显式跳过；其坐标换算已由 MarkerLayer 组件负责）。
 */
import type { Point2, SceneObject, Size, ViewTransform } from '../state/types'

/** 渲染视口（视图变换 + 画布 CSS 尺寸） */
export interface SceneViewport {
  view: ViewTransform
  size: Size
}

/** 命中结果 */
export interface ElementHit {
  /** 命中所在场景对象 id */
  elementId: string
  /** 元素内部部件（图：'node' | 'edge'；曲线：'curve'） */
  part: string
  /** 部件目标 id（图：节点/边 id；曲线：其自身 id） */
  targetId: string
  /** 命中点到屏幕坐标的距离（像素） */
  distancePx: number
}

/** 渲染高亮（如矩阵↔图联动、算法步骤）：当前步骤 + 累积轨迹两档样式 + 节点填充覆盖 */
export interface SceneHighlight {
  nodes?: string[]
  /** 边按图内节点 id；无向边方向不敏感 */
  edges?: { source: string; target: string }[]
  /** 累积轨迹节点（已访问/已到达，次级强调） */
  trailNodes?: string[]
  /** 累积轨迹边（已走过/已选中，次级强调；无向边方向不敏感） */
  trailEdges?: { source: string; target: string }[]
  /** 节点填充色覆盖（如着色结果直接上色：节点 id → 颜色） */
  fills?: Record<string, string>
}

export interface ElementRenderer<E extends SceneObject> {
  type: E['type']
  draw(
    ctx: CanvasRenderingContext2D,
    element: E,
    viewport: SceneViewport,
    highlight?: SceneHighlight,
  ): void
  /** 命中检测；距离超过 maxDistancePx 视为未命中（未注册 = 不可命中） */
  hitTest?(
    element: E,
    screen: Point2,
    viewport: SceneViewport,
    maxDistancePx: number,
  ): ElementHit | null
}

/** 类型擦除存储（注册时校验，分发时按 type 取回） */
type AnyRenderer = ElementRenderer<SceneObject>

export class ElementRegistry {
  private readonly renderers = new Map<string, AnyRenderer>()

  register<E extends SceneObject>(renderer: ElementRenderer<E>): this {
    this.renderers.set(renderer.type, renderer as unknown as AnyRenderer)
    return this
  }

  has(type: string): boolean {
    return this.renderers.has(type)
  }

  /** 按文档顺序绘制（未注册类型与 DOM 层元素跳过）；highlight 供元素叠加高亮 */
  draw(
    ctx: CanvasRenderingContext2D,
    objects: SceneObject[],
    viewport: SceneViewport,
    highlight?: SceneHighlight,
  ): void {
    for (const object of objects) {
      if (object.type === 'marker') continue
      this.renderers.get(object.type)?.draw(ctx, object, viewport, highlight)
    }
  }

  /** 全场景命中：返回最近命中的元素（无则 null） */
  hitTest(
    objects: SceneObject[],
    screen: Point2,
    viewport: SceneViewport,
    maxDistancePx = 16,
  ): ElementHit | null {
    let best: ElementHit | null = null
    for (const object of objects) {
      if (object.type === 'marker') continue
      const hit = this.renderers
        .get(object.type)
        ?.hitTest?.(object, screen, viewport, maxDistancePx)
      if (hit && (best === null || hit.distancePx < best.distancePx)) best = hit
    }
    return best
  }
}
