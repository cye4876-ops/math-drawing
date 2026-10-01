# TikZ / PGFPlots 导出（v0.6）

> 本版外部杠杆最大的功能：让成果**能进论文**。核心是**符号形式**输出——利用表达式 AST（v0.2），
> 直接生成 `\addplot {sin(deg(x))};`，而非毫无意义的坐标点列表。

---

## 输出内容

| 图形 | 输出形式 |
|---|---|
| 显函数 | `\addplot[样式, domain=…] {符号表达式};` |
| 参数方程 `(x(t), y(t))` | `\addplot[parametric, domain=…] ({fx}, {fy});`（参数变量为 PGF 的 `x`） |
| 极坐标 `r(θ)` | 展开为 parametric：`({r*cos(deg(x))}, {r*sin(deg(x))})`（弧度为项目语义，用 `deg()` 桥接 PGF 的度数制） |
| 隐函数 `F(x,y)=0` | **marching squares 采样折线**：`\draw[…, line width=0.8pt] plot[smooth] coordinates {(x,y) (x,y) …};`（PGFPlots 无隐式绘图，以与屏幕一致的几何折线输出；范围内无分支时跳过并注明） |
| 图论 | `\node[circle, fill=…, label=below:…]` + `\draw[->, …] (a) -- node[auto] {权重} (b);`；自环用 `edge [loop above]` |

## 表达式 → PGFPlots 数学映射

| 项目语法 | 输出 | 说明 |
|---|---|---|
| `sin/cos/tan(u)` | `sin(deg(u))` 等 | PGFPlots 三角函数按**度**计算，`deg()` 桥接弧度语义 |
| `asin/acos/atan(u)` | `rad(asin(u))` 等 | 反函数返回度，`rad()` 转回弧度 |
| `sinh/cosh/tanh/exp/ln/sqrt/abs/floor/ceil/round/sign` | 同名 | 语义一致，直接透传 |
| `log(x)` | `ln(x)` | 项目的 log 为自然对数 |
| `log(x, b)` | `ln(x)/ln(b)` | 任意底 |
| `log2/log10` | `ln(x)/ln(2)`、`ln(x)/ln(10)` | 展开 |
| `pow(a, b)` / `a^b` | `(a)^(b)` / `a^b` | 幂（含括号保序） |
| `cbrt(x)` | `(x)^(1/3)` | 展开 |
| `mod(a, b)` / `a % b` | `mod(a, b)` | PGF 取模 |
| `min/max(a, b, …)` | 左折叠 `min(min(a, b), c)` | PGF 仅二元 |
| `clamp(x, lo, hi)` | `min(max(x, lo), hi)` | 展开 |
| `pi / e / tau / phi` | `pi` / `e` / `2*pi` / `(1+sqrt(5))/2` | PGF 内置常量 |
| `factorial / gamma / erf / gcd / lcm / binomial / atan2` | **跳过** | 无对应；文件头注释原因 |
| 分段 / 赋值 / 比较运算 | **跳过** | 非绘图表达式 |

> 其它字母变量（自定义参数）：原样保留输出，需在文档导言区自行定义
> （如 `\pgfmathsetmacro{\a}{2}` 后把 `a` 改为 `\a`）。

## 完整示例（可编译）

以下为导出的**独立文档**全文（视图默认范围、`sin(x)` 单曲线）——可直接 `pdflatex` 编译：

```latex
\documentclass[tikz,border=6pt]{standalone}
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
% 由「Math Drawing」导出（v0.6）
% 模式：函数绘图；范围：view
\begin{document}
  % ---- 函数曲线 ----
  \begin{tikzpicture}
    \begin{axis}[
      axis lines=middle,
      xlabel={$x$}, ylabel={$y$},
      xmin=-5, xmax=5,
      ymin=-3.75, ymax=3.75,
    ]
    % 曲线：sin(x)
    \addplot[color={rgb,255:red,37;green,99;blue,235}, line width=0.8pt, samples=200, domain=-5:5] {sin(deg(x))};
    \end{axis}
  \end{tikzpicture}
\end{document}
```

图（图论模式）示例（节点 id 为内部 id 清理形式，此处以 `n…` 示意）：

```latex
\documentclass[tikz,border=6pt]{standalone}
\usepackage{pgfplots}
\pgfplotsset{compat=1.18}
% 由「Math Drawing」导出（v0.6）
% 模式：图论；范围：view
\begin{document}
  % ---- 图 ----
  \begin{tikzpicture}
    % 节点
    \node[circle, fill={rgb,255:red,37;green,99;blue,235}, draw=white, line width=1pt, inner sep=0pt, minimum size=14pt, label={[font=\small]below:A}] (n1) at (0, 1) {};
    \node[circle, fill={rgb,255:red,220;green,38;blue,38}, draw=white, line width=1pt, inner sep=0pt, minimum size=14pt, label={[font=\small]below:B}] (n2) at (2, -1) {};
    % 边
    \draw[->, color={rgb,255:red,55;green,65;blue,81}, line width=0.8pt] (n1) -- node[midway, auto, font=\scriptsize, fill=white, inner sep=1pt] {3} (n2);
  \end{tikzpicture}
\end{document}
```

## 编译验证（自动化）

`src/export/tikz-compile.test.ts` 会真实调用 `pdflatex` 编译导出的文档（三组：显式/参数+极坐标/图，含自环与权重）：

```bash
pnpm exec vitest run src/export/tikz-compile
```

- 未安装 LaTeX（如 CI 环境）→ **自动跳过**；
- Windows 权限受限（MiKTeX elevated 安全检查）→ 自动尝试**降权模式**（`runas /trustlevel:0x20000`）执行；
- 依赖：使用 `standalone` 文档类 + `pgfplots`（`compat=1.18`）。

## 已知限制

| 限制 | 说明 |
|---|---|
| 隐函数 | 以折线坐标列输出（无符号形式；点列经抽稀，单段可读） |
| factorial/gamma/erf 等 | 无 PGFPlots 对应函数，逐条跳过并在文件头注明 |
| 平行边 | 导出为直线（TikZ 层可用 `bend left/bend right` 手工分离） |
| 节点 id | 输出为内部 id（字母数字形式）；重命名可读 id 属于后续优化 |
| 采样数 | 默认 200（面板可调 50~2000）；符号形式不受此影响，仅影响渲染平滑度 |
