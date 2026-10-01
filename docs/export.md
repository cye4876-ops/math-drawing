# 导出与分享（v0.6）

工具条「导出…」按钮打开**导出面板**（五个标签页：PNG / SVG / TikZ / 动画 / 分享）。所有导出读取**当前文档快照**（曲线 + 标记点 + 图 + 视图），不修改文档、不产生撤销步骤。

---

## 各格式说明与适用场景

| 格式 | 场景 | 特点 | 入口 |
|---|---|---|---|
| **PNG** | 快速分享、贴图 | 位图；分辨率 1×/2×/4×；可选透明背景；导出分辨率 = 画布 CSS 尺寸 × 倍数（与屏幕 DPR 解耦，高分屏不模糊） | 面板「PNG」页 |
| **SVG** | 论文插图、网页 | **矢量**：曲线按导出尺寸独立高精度重采样（容差 ≤ 0.2px、种子加密 1.5×），放大无折角；网格/坐标轴/刻度为可选中的 `<text>` 元素 | 面板「SVG」页 |
| **TikZ** | LaTeX 论文（**核心**） | **符号形式**：曲线输出 `\addplot {sin(deg(x))};` 而非坐标点列表；图输出 `\node`/`\draw`；可选独立可编译文档 | 面板「TikZ」页 |
| **GIF / WebM** | 演示动画 | 三种帧源：**图算法步骤流**（当前步骤琥珀 + 累积轨迹玫红）/ **黎曼和**（n 递增的矩形加密）/ **泰勒展开**（逐阶叠加逼近）；GIF 逐帧量化、WebM 走 MediaRecorder 逐帧推流 | 面板「动画」页 |
| **分享链接** | 传递完整状态 | 完整文档（曲线 + 图 + 视图 + 模式）→ deflate + base64url 编码进 URL，**无后端**；打开即完整还原 | 面板「分享」页 |
| **JSON** | 存档、版本管理 | 工具条「导出 JSON / 导入 JSON」（v0.4 起）；严格校验、非法或高版本给出明确错误 | 工具条按钮 |

## 导出范围（PNG / SVG / TikZ 共用）

| 范围 | 语义 |
|---|---|
| **当前视窗** | 与屏幕所见一致（图论模式下导出当前视图内的图） |
| **自动包含全部内容** | 标记点与图节点的包围盒 + 15% 边距（等比）；无内容时回落当前视窗 |
| **指定数学区域** | x/y 区间精确铺满（非等比，与「视图设置」语义一致） |

## 动画导出

- **帧源（三种）**：
  - **图算法演示**：当前图 + 选定算法与起点（当前步骤琥珀、累积轨迹玫红）；
  - **黎曼和**：选定显函数曲线 + 区间 [a, b] + 模式（左/右/中点/梯形），帧为 **n = 1…N** 递增的矩形加密过程（与工具同款半透明蓝）；
  - **泰勒展开**：选定曲线 + 中心 x₀ + 最高阶，帧为 **T1…Tk** 逐阶叠加（与工具同色 #d97706，系数来自符号求导）；
- 选项：GIF / WebM；帧率 2/4/6/8；输出宽度（≤ 900px，GIF 建议 ≤ 640 控制体积）；
- 底部信息条显示帧标签（如「n = 12 · 黎曼和 ≈ 1.98」「T6(x)：展开至 6 阶」）、图算法帧显示步骤说明；
- GIF 编码为逐帧量化（每帧独立调色板），每帧间让出主线程（UI 不冻结）。

## 分享链接

- 编码：`JSON → deflate(level 9) → base64url`，参数名 `doc`；
- 打开 `?mode=graph&doc=…` 即还原完整文档（对象 + 视图 + 模式自动切换）；
- 长度提示：超过 6000 字符会提示「部分平台可能截断」；典型状态（3 曲线 + 图）**< 2000 字符**；
- 损坏/非法的分享参数**静默忽略**（回落其他预载参数），不白屏。

## JSON 保存/载入（既有能力，v0.6 复核）

- 版本字段 `version`（当前 1）：高于支持版本、结构缺失、坐标非法均抛出面向用户的 `DocFormatError`；
- 已知限制：导入不做历史合并（一次性替换文档，可一步撤销）。

## 已知限制

| 限制 | 说明 |
|---|---|
| 标记点文本样式 | PNG/SVG 中的标记点为红点 + `(x, y)` 文本（与界面 DOM 层样式近似，非像素级一致） |
| 极坐标 / 对数坐标网格 | SVG 与 TikZ 仅导出曲线（不导出 polar/log 网格；直角坐标网格完整） |
| 隐函数 TikZ | 以 **marching squares 采样折线坐标** 输出（PGFPlots 无隐式绘图）；无符号形式 |
| 动画源 | 三类帧源（图算法/黎曼和/泰勒）；更高阶富交互动画见后续版本 |
| WebM 尺寸 | 逐帧推流写入与真实输出受浏览器 MediaRecorder 支持影响（Chrome/Firefox 实测可用） |
| 大状态分享 | 200+ 顶点图或 5+ 曲线的链接可能较长（压缩后仍可复制；超长有提示） |

## 程序接口（开发者）

```ts
import { exportPngBlob } from '../export/png'                 // 离屏渲染 → Blob
import { buildSvg } from '../export/svg'                       // 矢量字符串
import { buildTikz } from '../export/tikz'                     // { tex, skipped }
import { exportAnimation, buildAlgorithmFrames } from '../export/animation'
import { encodeSharedState, decodeSharedState, buildShareUrl } from '../export/url-state'
import { downloadBlob, downloadText, timestampName } from '../export/download'
```

共享渲染层 `src/export/frame.ts`：`resolveView`（范围解析）与 `renderFrame`（网格/曲线/图/标记点的单帧渲染，PNG 与动画共用）。

## 验证

```bash
pnpm exec vitest run src/export          # 36 单测：TikZ 映射 / URL 往返 / SVG 结构 / 范围解析 / 动画帧构建
pnpm exec vitest run src/export/tikz-compile  # 实际 pdflatex 编译验证（无 LaTeX 自动跳过）
$env:PW_CHANNEL='chrome'; pnpm exec playwright test e2e/export.spec.ts
```
