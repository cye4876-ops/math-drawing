# 数学绘图工具（暂定名）

一个开源的数学可视化工具，覆盖**函数绘图**、**图论**，并向统计、3D 曲面、向量场、复变函数、数论、符号计算、交互 Notebook 延伸。

形态：**网页应用**（TypeScript + 自研 Canvas 渲染器，纯静态部署，无后端）。

---

## 文档导航

| 文档 | 内容 |
|---|---|
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
| v0.5 图论 | 进行中 | — | **验收节点 B：两大核心诉求齐备**。已完成：阶段 1 数据与解析层、阶段 2 元素注册制重构（零回归）、阶段 3 图编辑工具、**阶段 4 双模式界面 + 图面板**（图族/DSL 双向同步/布局·WebWorker/缩放以视图中心为锚点）、**阶段 5 算法层**（**14 算法**生成器 + 规格关键正确性测试全绿：遍历/最短路/BF/Floyd/拓扑/MST/着色/二分/**强连通/匹配/最大流**）、**邻接矩阵与谱**（Jacobi 全谱 / Perron 向量 / 拉普拉斯）、**算法播放器**（累积轨迹、**着色上画布**、结果摘要）、**边赋权**（边列表编辑权重，算法全适配）、**禁图检测**（平面性与 K5/K3,3 禁用子图，证据高亮）、**图的性质**（连通/二分/欧拉）、14 图族与禁用条件、**4 种布局（含分层）**、两模式视图/内容独立 |
| v0.6 导出与分享 | 未开始 | — | — |
| v0.7 统计与数据 | 未开始 | — | — |
| v0.8 3D 与场 | 未开始 | — | — |
| v0.9 复变·数论·符号 | 未开始 | — | — |
| v1.0 Notebook 与教学 | 未开始 | — | 收官，非终点 |

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
