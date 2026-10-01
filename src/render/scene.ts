/**
 * 场景渲染装配（v0.5 元素注册制）：
 * 注册 canvas 元素渲染器（曲线、图）；标记点为 DOM 层元素不在 canvas 管线；
 * 曲线采样缓存按存活曲线裁剪（删除后释放）。
 */
import type { Point2, SceneObject } from '../state/types'
import {
  ElementRegistry,
  type ElementHit,
  type SceneHighlight,
  type SceneViewport,
} from './element-registry'
import { curveElementRenderer, pruneSampleCache } from './curve-renderer'
import { graphElementRenderer } from './graph-renderer'

export interface SceneRenderer {
  registry: ElementRegistry
  draw(
    ctx: CanvasRenderingContext2D,
    objects: SceneObject[],
    viewport: SceneViewport,
    highlight?: SceneHighlight,
  ): void
  hitTest(
    objects: SceneObject[],
    screen: Point2,
    viewport: SceneViewport,
    maxDistancePx?: number,
  ): ElementHit | null
}

/** 创建场景渲染器（App 每次挂载创建一个；元素类型在此集中注册） */
export function createSceneRenderer(): SceneRenderer {
  const registry = new ElementRegistry()
    .register(curveElementRenderer)
    .register(graphElementRenderer)

  return {
    registry,
    draw(ctx, objects, viewport, highlight) {
      const aliveCurveIds = new Set<string>()
      for (const object of objects) {
        if (object.type === 'curve') aliveCurveIds.add(object.id)
      }
      pruneSampleCache(aliveCurveIds)
      registry.draw(ctx, objects, viewport, highlight)
    },
    hitTest(objects, screen, viewport, maxDistancePx) {
      return registry.hitTest(objects, screen, viewport, maxDistancePx)
    },
  }
}
