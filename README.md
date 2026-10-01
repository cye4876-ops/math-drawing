# 数学绘图工具

一个开源的数学可视化工具，覆盖**函数绘图**、**图论**，并向统计、3D 曲面、向量场、复变函数、数论、符号计算、交互 Notebook 延伸。

形态：**网页应用**（TypeScript + 自研 Canvas 渲染器，纯静态部署，无后端），支持 **PWA 安装与离线使用**。

---

## 快速开始

```bash
pnpm install     # 安装依赖（Node ≥ 22.12；pnpm 版本见 package.json）
pnpm dev         # 开发服务器 http://127.0.0.1:5173
pnpm build       # 生产构建（dist/，可部署到任意静态托管）
pnpm preview     # 本地预览生产构建
```

质量门禁：

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
pnpm check:licenses          # 许可证扫描（拒绝 GPL/AGPL）
node scripts/bundle-size.mjs # 产物体积核算（gzip）
```

> e2e 默认使用内置 Chromium（首次 `pnpm exec playwright install chromium`）；网络受限时用系统浏览器：`PW_CHANNEL=chrome pnpm test:e2e`。

**部署**：`pnpm build` 产物为纯静态文件（含 `manifest.webmanifest` 与 `sw.js`），任意静态服务器/对象存储/CDN 均可；用 HTTPS（或 localhost）访问即获得 PWA 安装与离线能力。

---

## 截图

> 各模式截图占位——欢迎在 PR 中补充（`docs/assets/` 目录）。

| 函数绘图 | Notebook 教学 |
|---|---|
| _待补充_ | _待补充_ |

---

## 文档导航

| 文档 | 内容 |
|---|---|
| [docs/guide.md](docs/guide.md) | **用户手册**（v1.0：全部模块功能汇总与用法） |
| [docs/plugin-api.md](docs/plugin-api.md) | **插件开发文档**（v1.0：6 类扩展点 API + 示例解析） |
| [docs/limitations.md](docs/limitations.md) | **已知限制汇总**（v1.0：诚实边界清单） |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志（v0.1 ~ v1.0） |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南（环境 / 命令 / 提交规范 / 项目约定） |
| [LICENSE](LICENSE) | MIT 许可证 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | **总路线图**：9 个版本的主题、架构断点、依赖关系、投入分布 |
| [docs/TECH-STACK.md](docs/TECH-STACK.md) | 技术选型与**开源生态清单**（含许可证、明确不用的东西及原因） |
| [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) | 待定问题与已决策记录 |
| [docs/versions/](docs/versions/) | **各版本详细规格与验收标准**（v0.1 ~ v1.0） |
| [docs/expr-syntax.md](docs/expr-syntax.md) | 表达式语法手册（示例可执行校验） |
| [docs/curve-input-guide.md](docs/curve-input-guide.md) | **曲线输入与使用指南**（v0.3） |
| [docs/sampling-algorithms.md](docs/sampling-algorithms.md) | 采样算法原理（v0.3） |
| [docs/tools.md](docs/tools.md) | **交互分析工具使用说明**（v0.4：追踪/切线/零点/交点/积分/黎曼和/泰勒） |
| [docs/numeric-methods.md](docs/numeric-methods.md) | 数值算法说明（v0.4：选型/收敛/回退策略） |
| [docs/graph-dsl.md](docs/graph-dsl.md) | 图文本 DSL 语法（v0.5） |
| [docs/graph-algorithms.md](docs/graph-algorithms.md) | 图算法（生成器架构 / 步骤类型 / 清单与正确性测试） |
| [docs/graph-spectrum.md](docs/graph-spectrum.md) | 邻接矩阵 / 特征值 / 谱半径与 Perron 向量（矩阵↔图联动） |
| [docs/element-registry.md](docs/element-registry.md) | **元素注册制架构说明**（v0.5 重构：接口/对应关系/接入清单） |
| [docs/export.md](docs/export.md) | 导出与分享（v0.6：PNG / SVG / TikZ / 动画 / 分享链接） |
| [docs/statistics.md](docs/statistics.md) | **统计与数据**（v0.7：CSV 容错 / 回归选型 / 分布与模拟 / 性能边界） |
| [docs/3d.md](docs/3d.md) | **3D 与场**（v0.8：WebGL 后端 / 曲面与 MC 取舍 / 向量场与 ODE / 导出 / 已知限制） |
| [docs/complex.md](docs/complex.md) | **复变可视化**（v0.9：域着色原理 / Möbius / 分支示意 / 围道积分 / 性能手段） |
| [docs/numbertheory.md](docs/numbertheory.md) | **数论与离散**（v0.9：Ulam / Sacks / 模运算 / π(x) / Collatz / 生命游戏 / 分形） |
| [docs/symbolic.md](docs/symbolic.md) | **符号计算**（v0.9：支持与不支持清单 / nerdamer 差分结果 / 超时保护） |
| [docs/tikz-export.md](docs/tikz-export.md) | **TikZ 导出专文**（表达式→PGFPlots 映射、可编译示例、编译验证） |
| [tests/benchmark/pathological-functions.md](tests/benchmark/pathological-functions.md) | **病态函数基准对照**（JSXGraph 并排图） |

### 各版本规格

| 版本 | 主题 | 规格文档 |
|---|---|---|
| v0.1 | 项目骨架 | [docs/versions/v0.1-skeleton.md](docs/versions/v0.1-skeleton.md) |
| v0.2 | 表达式引擎 | [docs/versions/v0.2-expression-engine.md](docs/versions/v0.2-expression-engine.md) |
| v0.3 | 2D 绘图核心 | [docs/versions/v0.3-2d-plotting-core.md](docs/versions/v0.3-2d-plotting-core.md) |
| v0.4 | 交互分析 | [docs/versions/v0.4-interactive-analysis.md](docs/versions/v0.4-interactive-analysis.md) |
| v0.5 | 图论 | [docs/versions/v0.5-graph-theory.md](docs/versions/v0.5-graph-theory.md) |
| v0.6 | 导出与分享 | [docs/versions/v0.6-export-share.md](docs/versions/v0.6-export-share.md) |
| v0.7 | 统计与数据 | [docs/versions/v0.7-statistics.md](docs/versions/v0.7-statistics.md) |
| v0.8 | 3D 与场 | [docs/versions/v0.8-3d-and-fields.md](docs/versions/v0.8-3d-and-fields.md) |
| v0.9 | 复变·数论·符号 | [docs/versions/v0.9-complex-number-theory-symbolic.md](docs/versions/v0.9-complex-number-theory-symbolic.md) |
| v1.0 | Notebook 与教学 | [docs/versions/v1.0-notebook-teaching.md](docs/versions/v1.0-notebook-teaching.md) |

---

## 进度状态

状态图例：`未开始` / `进行中` / `已完成` / `阻塞`

| 版本 | 状态 | 完成日期 | 备注 |
|---|---|---|---|
| v0.1 项目骨架 | 已完成 | 2026-09-30 | 本地验收全绿（typecheck / lint / test / e2e / 许可证扫描），CI 通过 |
| v0.2 表达式引擎 | 已完成 | 2026-10-01 | 词法/语法/AST/求值/符号求导/参数系统落地；381 项测试全绿，覆盖率 ≥91%；性能达标（解析+求值 <0.1 ms，编译闭包 <100 ns），CI 通过 |
| v0.3 2D 绘图核心 | 已完成 | 2026-10-01 | 四类曲线（显/隐/参数/极坐标）+ 自适应采样 + 渐近线断开虚线标注；病态函数基准与 JSXGraph 逐条一致（并排图存档）；单元测试 471 项 + e2e 16 项全绿，CI 通过 |
| v0.4 交互分析 | 已完成 | 2026-10-02 | **验收节点 A：可日常使用的函数绘图器**。7 个分析工具 + 工具抽象（单激活不变量）；数值库（安全牛顿求根/自适应 Simpson/黎曼和/屏幕空间最近点）；单测 540 项 + e2e 26 项全绿，CI 通过 |
| v0.5 图论 | 已完成 | 2026-10-02 | **验收节点 B：两大核心诉求齐备**。阶段 1 数据与解析层、阶段 2 元素注册制重构（零回归）、阶段 3 图编辑工具、**阶段 4 双模式界面 + 图面板**（图族/DSL 双向同步/布局·WebWorker/缩放以视图中心为锚点）、**阶段 5 算法层**（**14 算法**生成器 + 规格关键正确性测试全绿）、**邻接矩阵与谱**（Jacobi 全谱 / Perron / 拉普拉斯 / **拉普拉斯谱与代数连通度**）、**算法播放器**（累积轨迹、着色上画布、**Floyd 矩阵行列联动**）、**边赋权**、**画布点击选中编辑**（删点/删边/赋权卡片；图论模式自动激活图工具）、**禁图检测**（平面性/禁用子图）、**二分化 b(G)**、**色数 χ(G)** / **最小点覆盖 τ(G)** / **生成树计数**（精确/近似 + 高亮）、14 图族、4 布局 |
| v0.6 导出与分享 | 已完成 | 2026-10-02 | **验收节点 C：成果能拿出去用**。PNG（1×/2×/4×、透明背景、三种范围）、**SVG 矢量导出**（按导出尺寸高精度重采样、网格与刻度为 `<text>`）、**TikZ 导出**（AST → 符号形式 `\addplot {sin(deg(x))};`；隐函数以折线坐标输出；图 `\node`/`\draw`；**pdflatex 实际编译验证通过**）、**动画导出**（三类帧源：图算法 / 黎曼和 n 递增 / 泰勒逐阶 → GIF/WebM）、**URL 分享链接**（deflate+base64url，完整还原）、JSON 保存/载入、导出面板 UI；导出单测 36 项 + e2e 9 项全绿 |
| v0.7 统计与数据 | 已完成 | 2026-10-02 | **第三模式：统计与数据**。CSV/TSV 容错解析（分隔符/引号/BOM/千分位/缺失值，10 万行 < 3 s）、散点+**6 类回归**（最小二乘走 **QR 分解**，非线性 LM）与残差联动、**10 种分布**曲线（Lanczos/不完全 Γ·Β 数值实现，探针实时显示 $P(X\le x)$）、直方图（FD/Sturges）+ **KDE**（Silverman）、**5 类模拟动画**（LLN/CLT/蒙特卡洛/Bootstrap/随机游走，可复现）、描述统计+箱线、统计探针工具、URL 分享与 PNG 导出；stats 单测 65 项 + e2e 13 项，全量 865 单测 / 114 e2e 全绿 |
| v0.8 3D 与场 | 已完成 | 2026-10-02 | **第四模式：3D 与场**（唯一新增渲染后端，three.js WebGL 与 2D 并存、共享文档与撤销栈）。曲面（显式/参数/**隐式 Marching Cubes**/旋转体/正多面体）、空间曲线（**洛伦兹吸引子**、参数曲线）、**向量场**（箭头/流线/**散度·旋度着色**）、**ODE 三方法对比**（欧拉/改进/RK4 + 方向场 + 相图）；**可拖动切平面**（偏导 = 符号求导，误差 < 1e-6）、等高线投影、4 色图着色、**截图 PNG / 旋转 GIF 导出**、上下文丢失恢复与限帧降级；单测 56 项（含 MC 64³ < 2 s、RK4 精度、散度/旋度解析对照）+ e2e 9 项 |
| v0.9 复变·数论·符号 | 已完成 | 2026-10-03 | **第五模式：进阶**（复变 / 数论 / 自动机 / 符号四个子标签）。复变：**域着色**（1024² < 100 ms 实测达成、色相/条纹查表优化、零点黑·极点白、等相位·等模网格）、**Möbius 变换**（保角性 + 圆→圆）、**分支示意**（√z/ln z 分层）、**围道积分**；数论：**Ulam 螺旋**（1000²）、**Sacks 螺旋**、**模运算图案**（三模式）、**π(x) vs x/ln x**、**Collatz**（27→111）；自动机：**生命游戏**（1000² 单步 < 33 ms、滑翔机周期 4 位移 1）与 **Mandelbrot/Julia**（两阶段渐进渲染、滚轮缩放）；符号：化简（sin²+cos²=1）/ 展开 / 解方程（复根·高次 DKA·超越模式·数值兜底）/ **不等式 + 数轴** / 积分（有限规则集）/ 极限（标准模式 + 多项式比）/ **LaTeX（KaTeX 渲染）**，**nerdamer 差分 75/75 = 100%**；新增 99 单测 + 12 e2e（全量 1074 单测 / 141 e2e 全绿） |
| v1.0 Notebook 与教学 | 已完成 | 2026-10-03 | **收官，非终点**。Notebook 五类单元格（文本/图形/计算/数据/插件）+ 跨格变量拓扑级联 + 循环依赖诊断；导出（单文件交互 HTML / 打印 PDF / Markdown zip / LaTeX pgfplots / JSON）；教学（10 示例库、5 题判定、演示模式、参数动画 GIF）；**插件系统 6 类扩展点**（函数/元素/工具/视图/导出器/单元格，URL 与文件加载，错误隔离，`docs/plugin-api.md`）；**PWA**（可安装、离线可用）；性能：视图懒加载 + three/katex 分包，首屏 gzip ≈119KB（原 436KB），dist gzip ≈1.3MB；**全量 1126 单测 / 161 e2e 全绿**（含新增 notebook/teaching/plugin 模块与 20 项 Notebook e2e） |

---

## 两条铁律

1. **每版必须可独立交付。** 任何一版做完都应该是一个"能打开、能用、能演示"的状态，不允许出现"做完三版才能跑"的情况。
2. **文档与代码同源。** 规格文档变更时同步更新本 README 的进度表；实现偏离规格时，先改文档再改代码，不允许只改代码。

## 两份必须尽早建立的资产

这两样如果晚做，后面一定返工：

- **AST（v0.2）** —— 不能只做"字符串求值"。v0.6 的 TikZ 导出、v0.9 的符号计算都依赖真正的抽象语法树。
- **可序列化的参数系统（v0.2）** —— 参数滑块、动画录制、分享链接三件事全依赖它。

## 一份必须尽早建立的基准

**病态函数基准测试集**（v0.3 完成）—— 用客观图像对照代替"我觉得画得对"。
已落地：[tests/benchmark/pathological-functions.md](tests/benchmark/pathological-functions.md)
（10 个病态函数 × JSXGraph 1.13.3 基准图并排对照；该机制在 v0.3 当场捕获了一个大坐标视图缺陷）。

## 许可证

本项目以 [MIT 许可证](LICENSE) 开源。
第三方依赖的许可证审查见 [docs/TECH-STACK.md](docs/TECH-STACK.md)（运行时依赖仅 katex / fflate / gifenc / three，均为 MIT/兼容许可；每版 CI 均做许可证扫描）。
