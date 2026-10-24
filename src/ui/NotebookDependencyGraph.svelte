<script lang="ts">
  /**
   * 笔记本依赖图（v3.3）：SVG 绘制单元格依赖关系（定义格 → 引用格）。
   * 环上的格子用红色描边，被阻塞的用虚线；便于讲解执行顺序与循环依赖。
   */
  import type { Notebook } from '../notebook/model'
  import { buildNotebookDependencyGraph } from '../notebook/dependency-graph'

  let { notebook }: { notebook: Notebook } = $props()

  const graph = $derived(buildNotebookDependencyGraph(notebook))

  const NODE_WIDTH = 92
  const NODE_HEIGHT = 24
  const H_GAP = 14
  const V_GAP = 34
  const PAD = 16

  const layout = $derived.by(() => {
    const rows: number[][] = Array.from({ length: Math.max(1, graph.levelCount) }, () => [])
    for (const node of graph.nodes) rows[node.level]!.push(node.index)
    const maxRow = Math.max(0, ...rows.map((members) => members.length))
    const width = Math.max(260, maxRow * NODE_WIDTH + (maxRow - 1) * H_GAP + PAD * 2)
    const height = Math.max(60, graph.levelCount * (NODE_HEIGHT + V_GAP) - V_GAP + PAD * 2)
    const x = new Array<number>(graph.nodes.length).fill(0)
    const y = new Array<number>(graph.nodes.length).fill(0)
    rows.forEach((members, level) => {
      const rowWidth = members.length * NODE_WIDTH + (members.length - 1) * H_GAP
      const startX = (width - rowWidth) / 2
      members.forEach((index, k) => {
        x[index] = startX + k * (NODE_WIDTH + H_GAP)
        y[index] = PAD + level * (NODE_HEIGHT + V_GAP)
      })
    })
    return { width, height, x, y }
  })
</script>

<div class="dep-graph">
  <svg
    class="dep-svg"
    data-testid="notebook-dependency-graph"
    viewBox={`0 0 ${layout.width} ${layout.height}`}
    preserveAspectRatio="xMidYMin meet"
    role="img"
    aria-label="笔记本依赖图"
  >
    <defs>
      <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#60a5fa" />
      </marker>
    </defs>
    {#each graph.edges as edge, k (k)}
      {@const fromX = layout.x[edge.from] ?? 0}
      {@const fromY = layout.y[edge.from] ?? 0}
      {@const toX = layout.x[edge.to] ?? 0}
      {@const toY = layout.y[edge.to] ?? 0}
      <path
        class="dep-edge"
        data-testid={`dep-edge-${k}`}
        d={`M ${fromX + NODE_WIDTH / 2} ${fromY + NODE_HEIGHT} C ${fromX + NODE_WIDTH / 2} ${fromY + NODE_HEIGHT + 16}, ${toX + NODE_WIDTH / 2} ${toY - 16}, ${toX + NODE_WIDTH / 2} ${toY}`}
        marker-end="url(#dep-arrow)"
      />
    {/each}
    {#each graph.nodes as node (node.cellId)}
      {@const positionX = layout.x[node.index] ?? 0}
      {@const positionY = layout.y[node.index] ?? 0}
      <g data-testid={`dep-node-${node.index}`}>
        <rect
          class="dep-node"
          class:cyclic={node.cyclic}
          class:blocked={node.blocked}
          x={positionX}
          y={positionY}
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          rx="5"
        />
        <text class="dep-label" x={positionX + NODE_WIDTH / 2} y={positionY + 10}>
          {node.label}
        </text>
        <text class="dep-snippet" x={positionX + NODE_WIDTH / 2} y={positionY + 20}>
          {node.snippet}
        </text>
      </g>
    {/each}
  </svg>
  {#if graph.hasCycle}
    <div class="dep-warning" data-testid="notebook-dependency-warning">
      检测到循环依赖：红框为环上单元格，虚线为被阻塞单元格。
    </div>
  {/if}
</div>

<style>
  .dep-graph {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dep-svg {
    width: 100%;
    height: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
  }
  .dep-edge {
    fill: none;
    stroke: #60a5fa;
    stroke-width: 1.4;
    opacity: 0.8;
  }
  .dep-node {
    fill: rgba(37, 99, 235, 0.12);
    stroke: #3b82f6;
    stroke-width: 1.2;
  }
  .dep-node.cyclic {
    fill: rgba(220, 38, 38, 0.16);
    stroke: #dc2626;
  }
  .dep-node.blocked {
    stroke-dasharray: 4 3;
    opacity: 0.8;
  }
  .dep-label {
    fill: var(--text);
    font-size: 9px;
    text-anchor: middle;
    font-family: ui-monospace, Consolas, monospace;
  }
  .dep-snippet {
    fill: var(--text-dim);
    font-size: 8px;
    text-anchor: middle;
  }
  .dep-warning {
    font-size: 12px;
    color: #b45309;
  }
</style>
