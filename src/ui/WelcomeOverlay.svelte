<script lang="ts">
  /**
   * 首屏引导（v2.4 工作台改版）：函数绘图模式无曲线时显示三个入口
   * （画一个函数 / 探索参数变化 / 打开示例项目）。
   * 底部居中条状卡片：不遮挡画布中央的平移/缩放交互
   * （容器与卡片 pointer-events: none，仅按钮可点击）。
   */
  let {
    onDrawFunction,
    onParamDemo,
    onOpenExample,
  }: {
    onDrawFunction: () => void
    onParamDemo: () => void
    onOpenExample: () => void
  } = $props()
</script>

<div class="welcome" data-testid="welcome-overlay">
  <div class="welcome-card">
    <div class="welcome-lead">
      <strong>开始绘图</strong>
      <span>选择任一入口，立即得到可编辑的曲线</span>
    </div>
    <button type="button" class="btn-primary" data-testid="welcome-draw" onclick={onDrawFunction}>
      画一个函数<small>y = sin(x)</small>
    </button>
    <button type="button" data-testid="welcome-params" onclick={onParamDemo}>
      探索参数变化<small>y = a·sin(b·x) + 滑块</small>
    </button>
    <button type="button" data-testid="welcome-example" onclick={onOpenExample}>
      打开示例项目<small>正弦曲线入门</small>
    </button>
  </div>
</div>

<style>
  .welcome {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 128px;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 5;
  }

  /* 窄窗口：工具坞可能换行成两行，引导卡再上移 */
  @media (max-width: 920px) {
    .welcome {
      bottom: 176px;
    }
  }
  .welcome-card {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 14px;
    max-width: min(92%, 780px);
    background: var(--bg-panel);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 18%);
    pointer-events: none;
  }
  .welcome-lead {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-right: 6px;
  }
  .welcome-lead strong {
    font-size: 14px;
    color: var(--text);
  }
  .welcome-lead span {
    font-size: 12px;
    color: var(--text-dim);
  }
  .welcome-card button {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-elevated);
    color: var(--text);
    cursor: pointer;
    font-size: 13px;
  }
  .welcome-card button:hover {
    border-color: var(--accent);
  }
  .welcome-card button small {
    font-size: 11px;
    color: var(--text-dim);
    font-family: ui-monospace, Consolas, monospace;
  }
  .welcome-card button.btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  .welcome-card button.btn-primary small {
    color: rgb(255 255 255 / 85%);
  }
</style>
