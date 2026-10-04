<script lang="ts">
  /**
   * 超图关联二部图视图（v2.7）：左列为原顶点（圆点）、右列为超边（方块）。
   * 可选高亮：命中禁超图时按映射高亮顶点与超边。
   */
  interface Props {
    n: number
    edges: number[][]
    width?: number
    highlightVertices?: number[] | null
    highlightEdges?: number[] | null
    dark?: boolean
  }

  let {
    n,
    edges,
    width = 320,
    highlightVertices = null,
    highlightEdges = null,
    dark = false,
  }: Props = $props()

  const rows = $derived(Math.max(n, edges.length, 1))
  const rowGap = $derived(rows <= 8 ? 26 : rows <= 14 ? 20 : 15)
  const height = $derived(Math.max(120, rows * rowGap + 24))
  const leftX = 56
  const rightX = $derived(Math.max(leftX + 80, width - 60))

  function vertexY(index: number): number {
    const span = height - 24
    return n <= 1 ? height / 2 : 12 + (span * index) / (n - 1)
  }

  function edgeY(index: number): number {
    const span = height - 24
    return edges.length <= 1 ? height / 2 : 12 + (span * index) / (edges.length - 1)
  }
</script>

<svg
  class="hypergraph"
  viewBox={`0 0 ${width} ${height}`}
  {width}
  {height}
  role="img"
  aria-label={`超图：${n} 个顶点、${edges.length} 条超边`}
>
  {#each edges as edge, index (index)}
    {#each edge as vertex (vertex)}
      <line
        class="incidence"
        class:dark
        class:highlight={highlightEdges?.includes(index)}
        x1={leftX}
        y1={vertexY(vertex)}
        x2={rightX}
        y2={edgeY(index)}
      />
    {/each}
  {/each}
  {#each [...Array(n).keys()] as v (v)}
    <circle
      class="vertex"
      class:dark
      class:highlight={highlightVertices?.includes(v)}
      cx={leftX}
      cy={vertexY(v)}
      r="8"
    />
    <text class="label" class:dark x={leftX - 14} y={vertexY(v) + 3.5} text-anchor="end">{v}</text>
  {/each}
  {#each edges as edge, index (index)}
    <rect
      class="edge"
      class:dark
      class:highlight={highlightEdges?.includes(index)}
      x={rightX - 8}
      y={edgeY(index) - 8}
      width="16"
      height="16"
      rx="3"
    />
    <text class="label" class:dark x={rightX + 14} y={edgeY(index) + 3.5}>
      e{index + 1}（{edge.join(' ')}）
    </text>
  {/each}
</svg>

<style>
  .hypergraph {
    display: block;
    max-width: 100%;
  }
  .incidence {
    stroke: #94a3b8;
    stroke-width: 1;
  }
  .incidence.dark {
    stroke: #64748b;
  }
  .incidence.highlight {
    stroke: #dc2626;
    stroke-width: 2;
  }
  .vertex {
    fill: #2563eb;
    stroke: rgba(255, 255, 255, 0.85);
  }
  .vertex.dark {
    stroke: rgba(15, 23, 42, 0.9);
  }
  .vertex.highlight {
    fill: #dc2626;
  }
  .edge {
    fill: #f59e0b;
    stroke: rgba(255, 255, 255, 0.85);
  }
  .edge.dark {
    stroke: rgba(15, 23, 42, 0.9);
  }
  .edge.highlight {
    fill: #dc2626;
  }
  .label {
    fill: #64748b;
    font-size: 10px;
    font-family: var(--sans);
  }
  .label.dark {
    fill: #94a3b8;
  }
</style>
