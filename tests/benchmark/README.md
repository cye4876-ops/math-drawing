# 基准图生成说明

对照产物：

- `pathological-functions.md` —— 病态函数逐条并排对照（v0.3 核心验收手段）
- `baselines/jsxgraph-<slug>.png` —— JSXGraph 1.13.3 基准（数值视口与本实现完全相同）
- `baselines/ours-<slug>.png` —— 本实现输出（同一 `range=` 视口）
- `jsxgraph-baseline.html` —— JSXGraph 对照页（从 `node_modules` 加载，仅生成时使用）

## 重新生成步骤

```bash
# 1. 临时安装对照库（它不作为项目依赖保留——见 docs/TECH-STACK.md 的"参考而非依赖"原则）
pnpm add -D jsxgraph@1.13.3

# 2. 启动开发服务器（生成 ours-* 需要）
pnpm dev

# 3. 生成 20 张对照图（另开终端）
node scripts/gen-baselines.mjs

# 4. 生成完毕即可移除临时依赖
pnpm remove jsxgraph
```

## 视口约定

- JSXGraph 页与我们的应用使用**同一数值视口**：脚本把 `range=minX,maxX,minY,maxY`
  （我们的 URL 预载语法）与 JXG `boundingbox`（`[minX, maxY, maxX, minY]`）设为同一组数字。
- 我们的 `range` 参数语义：拿到真实画布尺寸后按精确范围换算视图（非等比），
  与 JSXGraph `keepAspectRatio: false` 的 boundingBox 行为一致。
- 本机若网络受限：脚本遵循 `PW_CHANNEL` 环境变量（如 `chrome`）使用系统浏览器，同 e2e 测试。

## 已知限制（写入用户文档）

- 隐函数为**固定网格 Marching Squares**（v0.3 明确不做自适应细化）：
  小于网格步长（默认 8px/单元）的细结构会漏画。
- 参数方程 / 极坐标默认参数范围 t、θ ∈ [0, 2π]。
