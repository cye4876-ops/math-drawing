# 用户手册（v1.0）

数学绘图工具是纯静态的网页应用：覆盖函数绘图、图论、统计、3D 与场、进阶分析（复变/数论/符号）与教学 Notebook。
本手册汇总各模块的入口与用法；算法原理与细节分别见对应的专题文档（见文末索引）。

---

## 1. 快速开始

打开应用即进入**函数绘图**模式。在右侧「曲线」区输入表达式（如 `sin(x)`）→「添加曲线」。

- 画布操作：滚轮缩放（以光标为中心）、拖拽平移、右上角「视图设置」调整范围/精度；
- 输入语法：见 [expr-syntax.md](expr-syntax.md)（常用函数即时提示；`sin()`、`π`、`x²` 等有快捷插入）；
- 输入错误会就地提示（含位置与修法），不影响其他内容。

**界面模式**（工具条左侧标签）：

| 模式 | 用途 |
|---|---|
| 函数绘图 | 显/隐函数、参数方程、极坐标曲线 + 分析工具 |
| 图论绘图 | 顶点/边编辑、图算法演示、谱分析 |
| 统计与数据 | CSV 数据、直方图、回归、分布与模拟 |
| 3D 与场 | 曲面、隐式曲面、向量场、ODE 轨迹 |
| 进阶 | 复变域着色、数论图形、自动机、符号计算 |
| Notebook | 教学文档：文本/图形/计算/数据格 + 导出与教学工具 |

---

## 2. 函数绘图与分析工具（v0.3 / v0.4）

**四种曲线**（曲线区下拉切换）：

- 显函数 `y = f(x)`；隐函数 `F(x, y) = 0`（如 `x^2+y^2-25`）；
- 参数方程 `(x(t), y(t))`；极坐标 `r(θ)`。

**分析工具**（工具条，选择后在画布上操作）：

| 工具 | 用法 |
|---|---|
| 追踪游标 | 沿曲线移动读取坐标；方向键微调 |
| 切线 | 在曲线附近点击，显示切线与斜率（即导数值） |
| 零点 | 自动标出当前视窗内全部零点（牛顿法） |
| 交点 | 点击两条曲线交点附近，标出交点 |
| 定积分 | 拖动区间，显示 ∫f(x)dx 数值（自适应 Simpson） |
| 黎曼和 | 拖动 n，矩形和实时逼近积分 |
| 泰勒 | 选定阶数，在点附近叠加泰勒多项式逼近 |

工具用法细节与数值算法说明见 [tools.md](tools.md) 与 [numeric-methods.md](numeric-methods.md)。

---

## 3. 图论（v0.5）

- **建图**：画布上直接点选「顶点/边」工具编辑；或用左侧「文本 DSL」（如 `a-b; b-c:2`，语法见 [graph-dsl.md](graph-dsl.md)）；
- **布局**：力导向 / 环形 / 网格 / 层次，可拖动微调；
- **算法演示**：Dijkstra、BFS/DFS、连通分量、欧拉回路、最小生成树、最大流、着色、二部化、支配集、割点等，逐步播放（每步的文字解释）；
- **谱分析**：邻接矩阵、特征值、谱半径、Perron 向量，矩阵与图联动高亮。

算法清单与正确性测试见 [graph-algorithms.md](graph-algorithms.md)、[graph-spectrum.md](graph-spectrum.md)。

---

## 4. 统计与数据（v0.7）

- **数据输入**：CSV 粘贴/文件导入（容错解析：注释、空行、分隔符自动识别）；
- **描述统计**：均值/中位数/方差/分位数等；
- **图表**：直方图（可调组距）、箱线图、散点图；
- **回归**：线性 / 多项式 / 指数 / 对数 / 幂 / Logistic，显示 R² 与残差；
- **分布与模拟**：正态/t/卡方/F 分布曲线与分位点；蒙特卡洛模拟（如 π 估算、中心极限定理）。

详见 [statistics.md](statistics.md)。

---

## 5. 3D 与场（v0.8）

- **曲面**：`z = f(x, y)`（可加参数动画 `t`）；**隐式曲面** `F(x,y,z)=0`（Marching Cubes）；
- **向量场**：平面/空间箭头场与流线；**ODE**：`dy/dx = f(x,y)` 轨迹与方向场；
- 相机：轨道/自由视角；着色：平面/法线/高度；色图可选；
- 导出：当前 3D 视图进入 PNG/SVG 导出流程。

详见 [3d.md](3d.md)。

---

## 6. 进阶分析（v0.9）

四个标签页（右侧面板）：

- **复变**：域着色（相位色轮/等模网格线）、Möbius 变换、分支示意（黎曼面）、围道积分演示；
- **数论**：Ulam 螺旋、Sacks 螺旋、模运算网络、素数计数 π(x)、Collatz 轨道、生命游戏、分形（Mandelbrot/Julia）；
- **自动机**：规则 110 等细胞自动机演化；
- **符号**：化简、展开、解方程/不等式、积分、极限（**支持与不支持清单见 [symbolic.md](symbolic.md)**；超时有保护）。

[complex.md](complex.md)、[numbertheory.md](numbertheory.md)。

---

## 7. Notebook 与教学（v1.0）

**文档结构**：一个 Notebook = 标题 + 单元格序列。

| 单元格 | 内容 |
|---|---|
| 文本格 | Markdown + `$公式$`（KaTeX 即时渲染） |
| 图形格 | 「捕获当前视图」把任意模式的画布快照为内嵌交互图；「打开」恢复到画布继续编辑 |
| 计算格 | 表达式求值 / 定义变量 / 化简、展开、解方程、积分、极限、不等式、LaTeX 源码 |
| 数据格 | 粘贴表格/CSV，实时预览；可被后续格引用 |
| 插件格 | 由插件扩展的单元格类型（示例：logistic 表格） |

**跨格变量**：计算格里 `a = 2` 定义变量，后续格可直接用 `a`（如 `a * sin(0) + 1`）；
修改定义后**全部依赖格自动级联更新**；依赖关系自动分析（拓扑执行、循环依赖报错、未定义变量提示）。

**单元格操作**：↑/↓ 或拖拽排序、折叠、复制、删除；「全部运行」一键执行全簿。

**导出**（右侧「导出」区）：

| 格式 | 说明 |
|---|---|
| HTML | 单文件自包含；图形**保持可交互**（缩放/平移）；双击即可打开 |
| 打印 / PDF | 打印视图 → 浏览器「另存为 PDF」 |
| Markdown | zip 包（`notebook.md` + `images/`），适合 GitHub |
| LaTeX | 完整 `.tex`（article + pgfplots/TikZ，中文用 `xelatex` 编译） |
| JSON | 保存/载入可复现的 Notebook 快照 |

**教学工具**：

- **示例库**：10 个常用教学场景一键载入（正弦入门、导数几何意义、黎曼和、隐函数圆、玫瑰线、阻尼振动、Dijkstra、复变域着色、Ulam 螺旋、生命游戏）；
- **题目模式**：5 道内置题目（画正弦、求根标注、圆、参数方程、连通图）；容差可调；「检查」给出通过/未通过与差异说明；
- **演示模式**：全屏、隐藏编辑 UI、放大字号（Esc 或按钮退出）；
- **参数动画**：指定参数（默认 `a`）按帧区间渲染导出 GIF（曲线中如 `a*sin(x)`）。

**自动保存**：Notebook 持续保存到浏览器 localStorage（键 `math-drawing-notebook-v1`），刷新即恢复；「新建」清空。

---

## 8. 导出与分享（v0.6 / v1.0）

- **PNG**：视窗范围 / 自动包含全部内容 / 指定数学区域；1×–4× 分辨率；透明背景可选；
- **SVG**：矢量曲线（含渐近线断开、虚线样式）；
- **TikZ**：直接生成 PGFPlots 代码（[tikz-export.md](tikz-export.md)）；
- **动画**：参数扫描导出（GIF/WebM，取决于浏览器支持）；
- **分享链接**：把当前文档编码进 URL 的 `?share=` 参数（不依赖后端）；
- **插件导出器**：加载插件后出现在导出面板（如示例 CSV 采样）。

导出细节见 [export.md](export.md)。

---

## 9. 安装为应用（PWA）

生产构建（`pnpm build` 后由任意静态服务器托管）支持：

- **安装**：浏览器地址栏「安装」图标 → 桌面/开始菜单启动，独立窗口；
- **离线**：应用外壳与静态资源被 Service Worker 缓存，断网可打开并继续使用（数据在本地）；
- 更新：更新部署后自动获取新版本（导航请求 network-first）。

---

## 10. 插件

扩展点共 6 类（函数、元素、工具、视图、导出器、单元格类型）。
开发文档与 API 参考：[plugin-api.md](plugin-api.md)；示例：`examples/plugins/example-logistic.js`
（应用内「Notebook → 插件」区可一键加载体验）。

---

## 11. 快捷键

| 按键 | 功能 |
|---|---|
| `Ctrl/Cmd + Z` / `Shift + Ctrl/Cmd + Z` | 撤销 / 重做 |
| `Esc` | 取消当前工具（或退出演示模式） |
| 方向键 | 追踪游标微调 |

---

## 12. 文档索引

表达式 [expr-syntax.md](expr-syntax.md) · 曲线 [curve-input-guide.md](curve-input-guide.md) ·
采样 [sampling-algorithms.md](sampling-algorithms.md) · 工具 [tools.md](tools.md) ·
数值 [numeric-methods.md](numeric-methods.md) · 图 DSL [graph-dsl.md](graph-dsl.md) ·
图算法 [graph-algorithms.md](graph-algorithms.md) · 谱 [graph-spectrum.md](graph-spectrum.md) ·
元素注册 [element-registry.md](element-registry.md) · 导出 [export.md](export.md) ·
统计 [statistics.md](statistics.md) · 3D [3d.md](3d.md) · 复变 [complex.md](complex.md) ·
数论 [numbertheory.md](numbertheory.md) · 符号 [symbolic.md](symbolic.md) ·
TikZ [tikz-export.md](tikz-export.md) · 插件 [plugin-api.md](plugin-api.md) ·
限制 [limitations.md](limitations.md)。
