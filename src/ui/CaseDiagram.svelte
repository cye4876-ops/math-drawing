<script lang="ts">
  /**
   * 示意图画布（v2.2）：单位根 / ℤ[√−5] 格点 / ℂ 有序域矛盾。
   * 自适应宽度（ResizeObserver），固定高度 320；深色主题在 diagrams.ts 内统一。
   */
  import { onMount } from 'svelte'
  import { drawAlgebraDiagram, type AlgebraDiagramKind } from '../algebra/diagrams'

  let { kind }: { kind: AlgebraDiagramKind } = $props()

  let canvasEl: HTMLCanvasElement

  function draw(): void {
    const canvas = canvasEl
    if (!canvas) return
    const width = Math.max(240, canvas.clientWidth)
    const height = 320
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawAlgebraDiagram(kind, context, width, height)
  }

  onMount(() => {
    draw()
    const observer = new ResizeObserver(() => draw())
    observer.observe(canvasEl)
    return () => observer.disconnect()
  })
</script>

<canvas bind:this={canvasEl} class="case-diagram" data-testid="alg-diagram" aria-label="反例示意图"
></canvas>

<style>
  .case-diagram {
    display: block;
    width: 100%;
    height: 320px;
    border: 1px solid #26324a;
    border-radius: 8px;
    background: #0b0e14;
  }
</style>
