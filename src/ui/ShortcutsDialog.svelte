<script lang="ts">
  /**
   * 快捷键提示对话框（v2.5，评审方案 04）：集中展示全局快捷键与鼠标操作。
   * 快捷键以实际实现为准（interactions.ts / tools / presentation）。
   */
  const SHORTCUTS: { keys: string; desc: string }[] = [
    { keys: 'Ctrl + Z', desc: '撤销（编辑历史最多 100 步）' },
    { keys: 'Ctrl + Shift + Z / Ctrl + Y', desc: '重做' },
    { keys: 'Enter', desc: '表达式输入框内回车：添加曲线' },
    { keys: 'Esc', desc: '退出当前分析工具；演示模式下退出演示' },
    { keys: '空格', desc: '播放 / 暂停动画类工具（如黎曼和）' },
    { keys: '鼠标拖拽', desc: '平移画布（图论模式下拖动节点）' },
    { keys: '滚轮', desc: '缩放画布（以指针为中心）' },
    { keys: '双击曲线列表的表达式', desc: '直接编辑表达式，错误会紧贴显示' },
  ]

  let { open, onClose }: { open: boolean; onClose: () => void } = $props()
</script>

{#if open}
  <div class="dialog-backdrop">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label="快捷键提示"
      data-testid="shortcuts-dialog"
    >
      <header class="dialog-header">
        <strong>快捷键提示</strong>
        <span class="dialog-sub">常用操作一览</span>
        <button type="button" class="dialog-close" data-testid="shortcuts-close" onclick={onClose}
          >✕</button
        >
      </header>
      <div class="dialog-body">
        {#each SHORTCUTS as item (item.keys)}
          <div class="shortcut-row">
            <span class="shortcut-keys">{item.keys}</span>
            <span class="shortcut-desc">{item.desc}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
