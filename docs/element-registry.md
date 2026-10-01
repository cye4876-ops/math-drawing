# 元素注册制（v0.5 架构重构）

> 本版是全套唯一的架构级重构，刻意排在中间：越晚做，需要改造的既有代码越多。
> 重构后的 v0.3/v0.4 全部功能与测试**零回归**（605 项单测 + 42 项 e2e 通过）。

## 为什么引入

v0.5 起画布上同时存在**连续曲线**与**离散图元素**（节点/边），两者在四个维度上完全不同：

| 维度 | 曲线 | 图元素 |
|---|---|---|
| 缩放语义 | 随视图缩放（数学意义） | 节点尺寸屏幕恒定 |
| 命中检测 | 沿路径的最近点 | 节点圆形 / 边的线段距离 |
| 撤销粒度 | 单条曲线增删 | 单节点/单边 |
| 数据模型 | 表达式 + 参数 | 顶点集 + 边集 |

若继续在渲染管线里堆 `if` 分支，每加一类元素都要改核心代码——v0.8 的 3D 对象、v1.0 的 Notebook 单元格会持续受苦。

## 接口定义（`src/render/element-registry.ts`）

```ts
interface ElementRenderer<E extends SceneObject> {
  type: E['type']
  draw(ctx: CanvasRenderingContext2D, element: E, viewport: SceneViewport): void
  hitTest?(element, screen, viewport, maxDistancePx): ElementHit | null
}

class ElementRegistry {
  register(renderer): this
  draw(ctx, objects, viewport): void      // 按文档顺序分发（未注册类型跳过）
  hitTest(objects, screen, viewport, maxDistancePx): ElementHit | null  // 最近命中
}
```

- `SceneViewport = { view, size }`：渲染所需的全部上下文；
- `ElementHit = { elementId, part, targetId, distancePx }`：`part` 用于区分元素内部部件（图：`node`/`edge`）；
- 装配层 `src/render/scene.ts`（`createSceneRenderer()`）：注册具体渲染器 + 曲线采样缓存裁剪。

## 与旧逻辑的对应关系

| 旧实现 | 新实现 | 说明 |
|---|---|---|
| `drawCurves(ctx, curves, view, size)` | `registry.draw(objects)` → `curveElementRenderer` | 同一绘制实现被拆为 `drawCurveElement`（单元素）；`drawCurves` 保留为兼容入口 |
| `drawCurves` 内的缓存清理 | `scene.draw` → `pruneSampleCache(aliveIds)` | 按存活曲线 id 裁剪采样缓存 |
| App 渲染回调固定调用 `drawCurves` | `scene.draw(ctx, state.doc.objects, viewport)` | **App 不再知道具体元素类型**；新增元素类型不改 App |
| `MarkerLayer`（DOM 层） | 保持不变 | 标记点不在 canvas 管线（注册表显式跳过）；DOM 层与 canvas 层共享 `mathToScreen`，坐标系天然一致 |
| 命中检测散落在工具层 | `scene.hitTest(...)` 统一入口 | 曲线：屏幕空间最近点；图：节点优先 + 边路径最近距离 |

## 图元素渲染要点（`graph-renderer.ts` + `graph-geometry.ts`）

- **节点屏幕恒定尺寸**：半径以像素计，缩放时不变（与曲线语义相反）；
- **几何与渲染分离**：`graph-geometry.ts` 为纯函数（节点屏幕位置、边路径、箭头、距离），渲染与命中**共享同一路径计算**（重边贝塞尔弯曲、自环圆环在命中时完全一致）；
- **平行边**：同端点对按层级对称弯曲（中间层为直线）；无向边按端点排序归一化分组，有向边按方向分组；
- **自环**：节点右上方的圆环；
- **有向箭头**：目标端三角；**权重**：边中点白底小字。

## 命中检测语义

- 图元素：**节点优先**（圆内或边缘 2px 内），否则取最近的边（距离 ≤ `maxDistancePx`，默认 16px）；
- 曲线：屏幕空间最近点（`nearestPointOnPolylines`，与 v0.4 工具吸附同一实现）；
- 全场景取距离最近者。

## 新元素类型接入清单（v0.8 3D / v1.0 Notebook 参考）

1. 在 `state/types.ts` 的 `SceneObject` 联合中加入新对象类型，并在 `serialize.ts` 增加解析；
2. 实现一个 `ElementRenderer`（`draw` + 可选 `hitTest`）；
3. 在 `scene.ts` 的装配处 `registry.register(...)`。

**渲染循环、撤销机制、序列化框架均无需改动。**

## 验证

- v0.3/v0.4 回归：605 项单测、42 项 e2e 全绿（重构硬指标）；
- 图渲染 e2e（`e2e/graph.spec.ts`）：URL 预载 DSL → 节点像素断言 / 导出 JSON 结构（含方向与权重）/ 与函数曲线同画布共存 / 撤销移除图对象；
- 命中检测单测：节点优先、边（含自环、平行边）命中与未命中边界。
