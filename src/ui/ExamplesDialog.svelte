<script lang="ts">
  /**
   * 示例项目对话框（v2.5，评审方案 04：加入示例项目——新用户可从示例开始）。
   * 列出教学示例库；点击即应用并进入可编辑状态（含模式切换由调用方处理）。
   */
  import { TEACHING_EXAMPLES, type TeachingExample } from '../teaching/examples'

  const MODE_LABELS: Record<TeachingExample['mode'], string> = {
    plot: '函数绘图',
    graph: '图论绘图',
    stats: '统计与数据',
    space: '3D 与场',
    advanced: '数学专题',
    notebook: '笔记本',
    matrix: '矩阵',
  }

  let {
    open,
    onClose,
    onApply,
  }: {
    open: boolean
    onClose: () => void
    onApply: (example: TeachingExample) => void
  } = $props()
</script>

{#if open}
  <div class="dialog-backdrop">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="示例项目"
      data-testid="examples-dialog"
    >
      <header class="dialog-header">
        <strong>示例项目</strong>
        <span class="dialog-sub">选择任一示例，立即进入可编辑状态</span>
        <button type="button" class="dialog-close" data-testid="examples-close" onclick={onClose}
          >✕</button
        >
      </header>
      <div class="dialog-body">
        {#each TEACHING_EXAMPLES as example (example.id)}
          <button
            type="button"
            class="example-item"
            data-testid={`example-${example.id}`}
            onclick={() => onApply(example)}
          >
            <span class="example-title">{example.title}</span>
            <span class="example-mode">{MODE_LABELS[example.mode]}</span>
            <span class="example-desc">{example.description}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}
