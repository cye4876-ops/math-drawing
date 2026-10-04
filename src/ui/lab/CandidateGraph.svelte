<script lang="ts">
  /**
   * 候选图预览（v2.7）：SVG 画布 + 顶点拖动。
   * 布局：auto（二部图 → 双列；否则圆环）/ circle / bipartite。
   */
  import { bipColoringOf } from './layout-helpers'

  interface Props {
    n: number
    edges: Array<[number, number]>
    size?: number
    labelSize?: number
    /** 顶点强调色（默认 accent） */
    color?: string
    /** 超图/图论联动的高亮顶点（可选） */
    highlight?: number[] | null
    layout?: 'auto' | 'circle' | 'bipartite'
    draggable?: boolean
    dark?: boolean
  }

  let {
    n,
    edges,
    size = 168,
    labelSize = 9,
    color = '#2563eb',
    highlight = null,
    layout = 'auto',
    draggable = true,
    dark = false,
  }: Props = $props()

  const pad = $derived(size * 0.14)
  const radius = $derived(size / 2 - pad)

  let offsets = $state<Array<{ x: number; y: number }>>([])
  let dragIndex: number | null = null
  let dragStart = { x: 0, y: 0, ox: 0, oy: 0 }
  let svgEl: SVGSVGElement | null = null

  // 布局计算
  const basePositions = $derived.by(() => {
    const positions: Array<{ x: number; y: number }> = []
    const colors = layout === 'circle' ? null : bipColoringOf(n, edges)
    if (colors && layout !== 'circle') {
      const left = [...Array(n).keys()].filter((v) => colors[v] === 0)
      const right = [...Array(n).keys()].filter((v) => colors[v] === 1)
      const place = (list: number[], x: number): void => {
        list.forEach((v, i) => {
          const y = list.length <= 1 ? size / 2 : pad + ((size - 2 * pad) * i) / (list.length - 1)
          positions[v] = { x, y }
        })
      }
      place(left, pad + size * 0.16)
      place(right, size - pad - size * 0.16)
    } else {
      for (let v = 0; v < n; v++) {
        const angle = -Math.PI / 2 + (2 * Math.PI * v) / Math.max(1, n)
        positions[v] = {
          x: size / 2 + radius * Math.cos(angle),
          y: size / 2 + radius * Math.sin(angle),
        }
      }
    }
    return positions
  })

  const positions = $derived.by(() => {
    const result = basePositions.map((position, index) => {
      const offset = offsets[index]
      return offset ? { x: position.x + offset.x, y: position.y + offset.y } : position
    })
    return result
  })

  function pointerDown(event: PointerEvent, index: number): void {
    if (!draggable) return
    dragIndex = index
    const rect = svgEl?.getBoundingClientRect()
    if (!rect) return
    dragStart = {
      x: event.clientX,
      y: event.clientY,
      ox: offsets[index]?.x ?? 0,
      oy: offsets[index]?.y ?? 0,
    }
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
  }

  function pointerMove(event: PointerEvent): void {
    if (dragIndex === null || !svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const scale = size / rect.width
    const current = offsets[dragIndex] ?? { x: 0, y: 0 }
    offsets[dragIndex] = {
      x: current.x + (event.clientX - dragStart.x) * scale,
      y: current.y + (event.clientY - dragStart.y) * scale,
    }
    dragStart = { x: event.clientX, y: event.clientY, ox: current.x, oy: current.y }
  }

  function pointerUp(): void {
    dragIndex = null
  }
</script>

<svg
  bind:this={svgEl}
  class="candidate-graph"
  viewBox={`0 0 ${size} ${size}`}
  width={size}
  height={size}
  role="img"
  aria-label={`${n} 个顶点、${edges.length} 条边的图`}
  onpointermove={pointerMove}
  onpointerup={pointerUp}
  onpointerleave={pointerUp}
>
  {#each edges as [u, v] (u * 1000 + v)}
    {#if positions[u] && positions[v]}
      <line
        class="edge"
        class:dark
        x1={positions[u]!.x}
        y1={positions[u]!.y}
        x2={positions[v]!.x}
        y2={positions[v]!.y}
      />
    {/if}
  {/each}
  {#each positions as position, v (v)}
    {#if position}
      <circle
        class="node"
        class:highlight={highlight?.includes(v)}
        class:dark
        cx={position.x}
        cy={position.y}
        r={size * 0.036 + 2}
        fill={highlight?.includes(v) ? '#dc2626' : color}
        role="button"
        aria-label={`顶点 ${v}（可拖动）`}
        tabindex="-1"
        onpointerdown={(event) => pointerDown(event, v)}
      />
      <text
        class="label"
        class:dark
        x={position.x}
        y={position.y + labelSize * 0.36}
        font-size={labelSize}
        text-anchor="middle"
      >
        {v}
      </text>
    {/if}
  {/each}
</svg>

<style>
  .candidate-graph {
    display: block;
    touch-action: none;
    user-select: none;
  }
  .edge {
    stroke: #94a3b8;
    stroke-width: 1.1;
  }
  .edge.dark {
    stroke: #64748b;
  }
  .node {
    cursor: grab;
    stroke: rgba(255, 255, 255, 0.85);
    stroke-width: 1;
  }
  .node.dark {
    stroke: rgba(15, 23, 42, 0.9);
  }
  .node.highlight {
    stroke: #b91c1c;
  }
  .label {
    fill: #ffffff;
    font-weight: 600;
    pointer-events: none;
    font-family: var(--sans);
  }
  .label.dark {
    fill: #f8fafc;
  }
</style>
