# 插件开发文档（v1.0）

数学绘图工具的插件是**本地 ES 模块**（`.js`），通过 `activate(api)` 约定注册扩展点。
v1.0 提供 **6 类扩展点**：表达式函数、图形元素、交互工具、侧栏视图、导出格式、Notebook 单元格类型。

> 完整可运行的示例插件：`examples/plugins/example-logistic.js`
> （与 `public/plugins/example-logistic.js` 同步，可直接在应用内「Notebook → 插件」区加载）。

---

## 1. 快速上手

最小插件（保存为 `my-plugin.js`）：

```js
export const name = 'my-plugin'        // 可选：插件名（缺省取 URL/文件名）
export const version = '1.0.0'         // 可选：版本号

export function activate(api) {
  // 注册一个新函数：sin(πx)
  api.registerFunction({
    name: 'mysin',
    minArgs: 1,
    maxArgs: 1,
    signature: 'mysin(x)',
    differentiable: false,
    fn: (x) => Math.sin(Math.PI * x),
  })
  api.log('my-plugin 已激活')
}
```

加载方式（任选其一）：

1. **应用内 URL 加载**：「Notebook」模式右侧栏 →「插件」区，输入 URL（如 `/plugins/my-plugin.js`）→「加载」。
2. **应用内文件加载**：同区「从文件加载…」，选择本地 `.js` 文件（经 `blob:` URL 加载）。
3. **静态部署**：把文件放进 `public/plugins/` 目录即可以 `/plugins/xxx.js` 访问（开发与生产构建均可）。

加载结果会显示在插件区（成功消息 / 结构化错误），已加载插件以列表呈现。

---

## 2. API 参考

### `api`（PluginApi）

| 成员 | 说明 |
|---|---|
| `apiVersion: string` | 接口版本（当前 `'1'`）。加载器不强制校验，但请据此做兼容判断 |
| `registerFunction(def)` | 注册表达式函数（见 §2.1） |
| `registerElement(renderer)` | 注册图形元素渲染器（见 §2.2） |
| `registerTool(contribution)` | 注册交互工具（见 §2.3） |
| `registerView(contribution)` | 注册侧栏视图面板（见 §2.4） |
| `registerExporter(exporter)` | 注册导出格式（见 §2.5） |
| `registerCellType(def)` | 注册 Notebook 单元格类型（见 §2.6） |
| `evaluate(expression, variable, value)` | 用应用表达式引擎求值（单变量），失败返回 `null` |
| `log(message)` | 调试输出（收集在加载结果里展示） |

### 2.1 表达式函数

```ts
interface FunctionDefinition {
  name: string            // 函数名（大小写不敏感；注册后在整个应用的表达式里可用）
  minArgs: number
  maxArgs: number
  signature: string       // 参数提示（错误信息展示，如 'logistic(x)'）
  differentiable: boolean // 是否参与符号求导（false 时符号微分回退数值差分）
  fn: (...args: number[]) => number
}
```

注意：

- **函数名请避开内置函数前缀歧义**（如 `logistic` 不会被解析成 `log` + `istic`——词法器优先整体识别已注册的完整词；但**未注册**的形似名仍按内置词最长匹配拆分报错）。
- 定义域外返回 `NaN`（与内置函数约定一致）。
- 注册即对**所有表达式输入框**生效（曲线、计算格、图论边权等）——求值引擎共享同一函数表。

### 2.2 图形元素

插件对象以 `type: 'plugin'` + `pluginType` 存入场景文档；渲染器**以插件类型名注册**（如 `polygon`），由元素注册表按 `pluginType` 二级分发：

```ts
interface ElementRenderer<E> {
  type: string   // 插件类型名（对应对象里的 pluginType）
  draw(
    ctx: CanvasRenderingContext2D,
    element: E,               // 场景对象（含自定义 data 字段）
    viewport: { view: ViewTransform; size: { width: number; height: number } },
    highlight?: SceneHighlight,
  ): void
  hitTest?(element, screen, viewport, maxDistancePx): ElementHit | null
  // ElementHit: { elementId, part, targetId, distancePx }
}
```

数学坐标 ↔ 屏幕像素换算（与内置元素一致）：

```js
const x = size.width / 2 + (point.x - view.centerX) * view.scaleX
const y = size.height / 2 - (point.y - view.centerY) * view.scaleY
```

添加/删除场景对象（需通过工具或视图上下文中的 `store`）：

```js
store.addSceneObject({
  type: 'plugin',
  pluginType: 'polygon',       // 与注册的渲染器类型一致
  name: '示例多边形',
  data: { points: [{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 0, y: 2 }] },
  visible: true,
})
store.removeSceneObject(objectId)
```

插件对象**支持撤销/重做、JSON 导入导出与场景持久化**（序列化保留 `pluginType` 与 `data` 原样）。

### 2.3 交互工具

```ts
interface PluginToolContribution {
  id: string
  label: string
  create(ctx: ToolContext): Tool
}
```

`ToolContext` 提供：`store`（文档访问）、`getView()`、`getSize()`、`requestRender()`、
`notify()`、`hitTest(screen, maxDistancePx?)`。

`Tool` 接口（与内置工具一致，按需实现回调）：

```js
{
  id: 'plugin-polygon',
  name: '多边形',          // 工具条显示名
  group: 'plot',           // 'plot' | 'graph' | …（决定在哪些模式显示）
  activate() {},           // 选中时
  deactivate() {},         // 取消选中
  onPointerDown(event) {}, // event.math 为数学坐标；返回 true 表示消费事件
  onPointerMove(event) {},
  onPointerUp(event) {},
  onKeyDown(event) {},     // 如 Enter 提交（返回 true 消费）
  drawOverlay(ctx) {},     // 光标层叠加绘制（暂存点、预览线等）
}
```

工具由应用在**插件加载完成后**接入工具注册表（「Notebook → 插件」加载即生效，无需刷新）。

### 2.4 侧栏视图面板

```ts
interface PluginViewContribution {
  id: string
  title: string
  render(
    container: HTMLElement,
    context: { store: AppStore },   // 可直接操作文档
  ): (() => void) | void            // 可选：返回清理函数
}
```

- 渲染发生在「Notebook」模式右侧栏的「插件」区。
- **重建即清理**：重新加载插件后会清空容器并重新调用 `render`；返回的清理函数在重建时调用。请在清理函数里解绑事件、停止定时器。
- 面板渲染异常不会影响主程序（异常被捕获并显示在容器内）。

### 2.5 导出格式

```ts
interface PluginExporter {
  id: string
  label: string
  export(input: {
    doc: DocState                  // 当前文档（objects: 曲线/图/标记/插件对象…）
    view: ViewTransform            // 当前视窗
    size: { width: number; height: number }
  }): { filename: string; blob: Blob } | null
  // 返回 null 表示不支持当前内容（UI 会提示）
}
```

加载后出现在「导出与分享」面板的「插件导出器」下拉中。

### 2.6 Notebook 单元格类型

```ts
interface PluginCellTypeDef {
  id: string
  label: string
  createData(): unknown            // 新建单元格的初始 data
  render(
    container: HTMLElement,
    cell: PluginCell,              // { type:'plugin', pluginType, data, … }
    context: { rerun: () => void } // 请求重新执行 Notebook（如数据变化）
  ): (() => void) | void
}
```

- 加载插件后，Notebook 侧栏「插件」区出现「+ 插件格」按钮。
- 单元格渲染在 Notebook 画布区；`context.rerun()` 可触发全簿重新执行。
- 插件单元格未注册时（插件未加载）显示提示而非报错。

---

## 3. 示例插件解析

`example-logistic.js` 覆盖全部 6 类扩展点：

| 扩展点 | 示例内容 |
|---|---|
| 函数 | `logistic(x) = 1/(1+e^−x)`（可在任意曲线/计算格使用） |
| 元素 | `polygon`：按 `data.points`（数学坐标）绘制闭合多边形 + 包围盒命中 |
| 工具 | 「多边形」：单击加点、双击（`detail >= 2`）或 Enter 提交；`drawOverlay` 预览 |
| 视图 | 「示例插件面板」：按钮直接放置一个示例三角形 |
| 导出 | 「示例：曲线采样 CSV」：把显函数曲线采样导出 CSV |
| 单元格 | logistic 表格：读取 RunResult 中变量的表格渲染 |

关键片段（工具提交时写入场景）：

```js
api.registerTool({
  id: 'plugin-polygon',
  label: '多边形（示例插件）',
  create(context) {
    let pending = []
    return {
      id: 'plugin-polygon', name: '多边形', group: 'plot',
      deactivate() { pending = []; context.requestRender() },
      onPointerDown(event) {
        if (event.pointer.detail >= 2) { commit(); return true }
        pending.push({ x: event.math.x, y: event.math.y })
        context.requestRender()
        return true
      },
      onKeyDown(event) { return event.key === 'Enter' ? (commit(), true) : false },
      drawOverlay(ctx) { /* 绘制暂存点与预览线 */ },
    }
    function commit() {
      if (pending.length >= 3) {
        context.store.addSceneObject({
          type: 'plugin', pluginType: 'polygon',
          data: { points: pending }, visible: true,
        })
      }
      pending = []
      context.requestRender()
    }
  },
})
```

---

## 4. 加载与隔离

### 加载机制

- URL 加载：使用**原生动态 import**（不经打包器），支持站点相对路径（`/plugins/x.js`）、完整 URL 与 `blob:`；
- 文件加载：读为 `blob:` URL 后 import；
- 模块须导出 `activate(api)`；`name` / `version` / `default` 导出均可选（有 `default` 时优先取 `default` 上的导出）。

### 错误隔离

以下环节的异常都会被结构化捕获，不会中断主程序：

- **模块加载失败**（404、语法错误、非模块）→ 「模块加载失败：…」；
- **缺少 `activate`** → 「插件缺少 activate(api) 导出」；
- **`activate` 抛错** → 「activate 执行失败：…」（已注册的部分扩展点保留）；
- **视图/单元格渲染抛错** → 容器内显示错误文本；
- **插件工具注册抛错** → 控制台告警，忽略该工具。

### 安全边界（诚实说明）

- 插件代码**与应用同源、同一 JS 上下文**运行，**没有沙箱**；请只加载自己信任的代码；
- 插件可访问 `store` 读写文档、`fetch` 任意网络请求；
- Service Worker 对 `/plugins/` 目录**不做缓存**（插件随改随生效，走网络/浏览器 HTTP 缓存）；
- `apiVersion` 目前为 `'1'`：未来破坏性变更会提升版本并在加载时给出兼容提示（规划中）。

### 已知边界

- 插件注册的**表达式函数无法在运行时注销**（页面刷新即复位）；
- 重复加载同名插件会叠加注册（后注册的函数覆盖同名键）；
- 插件间扩展点**不做命名空间隔离**：请使用带前缀的 id/函数名降低冲突概率。
