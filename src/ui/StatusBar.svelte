<script lang="ts">
  import type { Point2 } from '../state/types'

  let { cursor, scale }: { cursor: Point2 | null; scale: number } = $props()

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
  <span data-testid="scale-readout">缩放：{format(scale)} px/单位</span>
</footer>
