<script lang="ts">
  import type { CoordType, Point2 } from '../state/types'
  import { saveState } from './save-state.svelte'

  let {
    cursor,
    scale,
    coordType = 'rect',
  }: { cursor: Point2 | null; scale: number; coordType?: CoordType } = $props()

  function format(value: number): string {
    if (value === 0) return '0'
    const abs = Math.abs(value)
    if (abs >= 1e7 || abs < 1e-4) return value.toExponential(3)
    return String(Number(value.toPrecision(6)))
  }
</script>

<footer class="status-bar">
  <span data-testid="cursor-pos">
    光标：{cursor ? `(${format(cursor.x)}, ${format(cursor.y)})` : '—'}
  </span>
  <span
    class="save-state"
    class:dirty={saveState.dirty}
    data-testid="save-state"
    title={saveState.dirty ? '保存项目后标记为已保存' : '与最近一次保存一致'}
    >{saveState.dirty ? '● 有未保存修改' : '✓ 已保存'}</span
  >
  <span data-testid="scale-readout"
    >缩放：{format(scale)} {coordType === 'log' ? 'px/十倍程' : 'px/单位'}</span
  >
</footer>

<style>
  .save-state {
    color: var(--text-dim);
  }

  .save-state.dirty {
    color: var(--warning);
    font-weight: 600;
  }
</style>
