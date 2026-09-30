# 贡献指南

## 环境要求

- **Node.js** ≥ 22.12（当前开发环境为 24.x）
- **pnpm**：版本以 `package.json` 的 `packageManager` 字段为准
- **Git**

## 开发命令

| 命令 | 说明 |
|---|---|
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动开发服务器（http://localhost:5173） |
| `pnpm build` | 生产构建（输出到 `dist/`） |
| `pnpm preview` | 本地预览生产构建 |
| `pnpm typecheck` | 类型检查（svelte-check + tsc，strict 模式） |
| `pnpm lint` | ESLint 检查 |
| `pnpm format` | Prettier 格式化 |
| `pnpm test` | 单元测试（Vitest） |
| `pnpm test:e2e` | 端到端测试（Playwright；默认使用内置 Chromium，首次需 `pnpm exec playwright install chromium`；网络受限时可用系统浏览器：设置环境变量 `PW_CHANNEL=chrome` 或 `msedge`） |
| `pnpm check:licenses` | 许可证扫描（拒绝 GPL/AGPL/SSPL 系依赖） |

## 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <描述>
```

- 常用 type：`feat`、`fix`、`docs`、`test`、`chore`、`refactor`、`perf`、`ci`
- 示例：`feat(core): 实现坐标变换往返一致性`、`docs: 更新 v0.1 进度表`
- 每次提交应能通过 `pnpm typecheck && pnpm lint && pnpm test`
- pre-commit 钩子（simple-git-hooks + lint-staged）会自动对暂存文件执行 ESLint 与 Prettier

## 分支与流程

- 主分支为 `main`，推送与 PR 均会触发 GitHub Actions（类型检查 / lint / 测试 / 构建 / e2e / 许可证扫描）
- 较大改动建议走独立分支 + Pull Request，CI 通过后合并

## 项目约定

- **文档与代码同源**：版本规格变更时同步更新 `README.md` 进度表；实现偏离规格时，先改文档再改代码
- **渲染分层**：大批量图形走 Canvas 层；需要独立鼠标事件的元素走 DOM 覆盖层（见 `docs/TECH-STACK.md` 第二节）
- **依赖红线**：不引入 GPL/AGPL 依赖；运行时依赖保持极简（见 `docs/TECH-STACK.md`）
- 界面文案使用中文（v0.1 起暂不引入国际化框架）
