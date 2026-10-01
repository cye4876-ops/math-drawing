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
| v0.3 2D 绘图核心 | 未开始 | — | — |
| v0.4 交互分析 | 未开始 | — | **验收节点 A：可日常使用的函数绘图器** |
| v0.5 图论 | 未开始 | — | **验收节点 B：两大核心诉求齐备** |
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

**病态函数基准测试集**（v0.3 之前完成）—— 用客观图像对照代替"我觉得画得对"。详见 [docs/versions/v0.3-2d-plotting-core.md](docs/versions/v0.3-2d-plotting-core.md) 的验收部分。
