<script lang="ts">
  /**
   * 群结构探索（v2.2 近世代数模块）：
   * - 性质卡：阶 / 交换 / 循环 / 中心 / 子群数 / 元素阶分布；
   * - Cayley 表：点击任意格 → 选中行元素，显示其阶、逆元、生成子群 ⟨a⟩ 并高亮；
   * - 子群格：Hasse 图（正规 = 绿，非正规 = 橙）。
   */
  import { onMount } from 'svelte'
  import { getAlgebraGroup } from '../state/advanced-state.svelte'
  import {
    centerElements,
    cyclicSubgroup,
    elementOrder,
    elementOrderStats,
    getGroup,
    inverseOf,
    isAbelian,
    isCyclic,
    isNormalSubgroup,
    labelOf,
    labelsOf,
  } from '../algebra/groups'
  import { computeSmartLattice } from '../algebra/lattice'
  import { enumerateSubgroupsSmart } from '../algebra/subgroups'
  import { groupAutomorphismSummary } from '../algebra/group-automorphism'
  import { drawSubgroupLattice } from '../algebra/diagrams'
  import { CAYLEY_COLORS, buildCayleyGraph } from '../algebra/cayley'
  import CayleyTable from './CayleyTable.svelte'

  const group = $derived(getGroup(getAlgebraGroup()))
  let selected = $state<number | null>(null)

  const facts = $derived.by(() => {
    const g = group
    const stats = [...elementOrderStats(g).entries()].sort((x, y) => x[0] - y[0])
    const aut = groupAutomorphismSummary(g)
    return {
      abelian: isAbelian(g),
      cyclic: isCyclic(g),
      center: labelsOf(g, centerElements(g)),
      subgroupCount: enumerateSubgroupsSmart(g).length,
      automorphisms: aut.automorphisms,
      outer: aut.outer,
      inner: aut.inner,
      stats: stats.map(([order, count]) => `阶 ${order} × ${count}`).join('、'),
    }
  })

  const lattice = $derived(computeSmartLattice(group))
  const cayley = $derived(buildCayleyGraph(group))

  const selection = $derived.by(() => {
    const g = group
    if (selected === null || selected < 0 || selected >= g.order) return null
    const cycle = cyclicSubgroup(g, selected)
    return {
      label: labelOf(g, selected),
      order: elementOrder(g, selected),
      inverse: labelOf(g, inverseOf(g, selected)),
      cycleLabels: cycle.map((index) => labelOf(g, index)),
      normal: isNormalSubgroup(g, cycle),
    }
  })

  let canvasEl: HTMLCanvasElement
  let cayleyEl: HTMLCanvasElement
  /** Cayley 图顶点屏幕坐标（点击命中用，按 element 存） */
  let cayleyHits: Array<{ element: number; x: number; y: number }> = []

  function drawLattice(): void {
    const canvas = canvasEl
    if (!canvas) return
    const width = Math.max(260, canvas.clientWidth)
    const height = 340
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawSubgroupLattice(context, lattice, width, height)
  }

  function drawCayley(selection: number | null): void {
    const canvas = cayleyEl
    if (!canvas) return
    const width = Math.max(260, canvas.clientWidth)
    const height = 360
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)
    const data = cayley
    const pad = 34
    const sx = (x: number): number => pad + ((x + 1) / 2) * (width - pad * 2)
    const sy = (y: number): number => pad + ((1 - y) / 2) * (height - pad * 2)
    cayleyHits = data.nodes.map((node) => ({ element: node.element, x: sx(node.x), y: sy(node.y) }))
    const radius = data.nodes.length <= 12 ? 13 : data.nodes.length <= 30 ? 10 : 7
    const byElement = new Map(cayleyHits.map((hit) => [hit.element, hit]))
    // 边（生成元着色 + 轻微弧线，避免 reciprocal 边重叠）
    context.lineWidth = 1.6
    for (const edge of data.edges) {
      const a = byElement.get(edge.from)
      const b = byElement.get(edge.to)
      if (!a || !b) continue
      const color = CAYLEY_COLORS[edge.generator % CAYLEY_COLORS.length]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const length = Math.hypot(dx, dy) || 1
      const offset = (edge.from < edge.to ? 1 : -1) * (5 + edge.generator * 2.5)
      const cx = (a.x + b.x) / 2 - (dy / length) * offset
      const cy = (a.y + b.y) / 2 + (dx / length) * offset
      context.strokeStyle = color
      context.fillStyle = color
      context.beginPath()
      context.moveTo(a.x, a.y)
      context.quadraticCurveTo(cx, cy, b.x, b.y)
      context.stroke()
      // 箭头（沿控制点 → 终点方向）
      const angle = Math.atan2(b.y - cy, b.x - cx)
      const tip = 7
      context.beginPath()
      context.moveTo(b.x, b.y)
      context.lineTo(b.x - tip * Math.cos(angle - 0.4), b.y - tip * Math.sin(angle - 0.4))
      context.lineTo(b.x - tip * Math.cos(angle + 0.4), b.y - tip * Math.sin(angle + 0.4))
      context.closePath()
      context.fill()
    }
    // 顶点
    for (const node of data.nodes) {
      const hit = byElement.get(node.element)!
      const isSelected = selection === node.element
      context.beginPath()
      context.arc(hit.x, hit.y, radius, 0, Math.PI * 2)
      context.fillStyle = isSelected ? '#fbbf24' : '#16203a'
      context.fill()
      context.lineWidth = isSelected ? 2.4 : 1.4
      context.strokeStyle = isSelected ? '#fde68a' : '#3b82f6'
      context.stroke()
    }
    // 标签（元素多时省略，避免糊成一团）
    if (data.nodes.length <= 26) {
      context.font = '10px ui-monospace, Consolas, monospace'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      for (const node of data.nodes) {
        const hit = byElement.get(node.element)!
        context.fillStyle = selection === node.element ? '#111827' : '#c7d4ea'
        context.fillText(node.label, hit.x, hit.y)
      }
    }
  }

  function pickCayley(event: MouseEvent): void {
    const canvas = cayleyEl
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let best: number | null = null
    let bestDistance = 20 * 20
    for (const hit of cayleyHits) {
      const distance = (hit.x - x) ** 2 + (hit.y - y) ** 2
      if (distance <= bestDistance) {
        bestDistance = distance
        best = hit.element
      }
    }
    if (best !== null) selected = best
  }

  onMount(() => {
    drawLattice()
    drawCayley(selected)
    const observer = new ResizeObserver(() => {
      drawLattice()
      drawCayley(selected)
    })
    observer.observe(canvasEl)
    observer.observe(cayleyEl)
    return () => observer.disconnect()
  })

  $effect(() => {
    // 换群时清空选择并重绘子群格 / Cayley 图（用固定 null，避免把 selected 纳入依赖）
    void group.id
    selected = null
    drawLattice()
    drawCayley(null)
  })

  $effect(() => {
    // 选中元素变化时只重绘 Cayley 图（高亮联动）
    drawCayley(selected)
  })
</script>

<div class="group-explorer" data-testid={`alg-group-${group.id}`}>
  <div class="ge-facts" data-testid="alg-group-facts">
    <div class="fact"><span>群</span><strong>{group.name}</strong></div>
    <div class="fact"><span>阶</span><strong>{group.order}</strong></div>
    <div class="fact">
      <span>交换</span><strong>{facts.abelian ? '是（阿贝尔群）' : '否（非交换）'}</strong>
    </div>
    <div class="fact"><span>循环</span><strong>{facts.cyclic ? '是' : '否'}</strong></div>
    <div class="fact"><span>中心 Z(G)</span><strong>{facts.center}</strong></div>
    <div class="fact"><span>子群</span><strong>{facts.subgroupCount} 个</strong></div>
    <div class="fact">
      <span>自同构</span><strong
        >|Aut| = {facts.automorphisms}（内 {facts.inner} / 外 {facts.outer}）</strong
      >
    </div>
    <div class="fact wide"><span>元素阶分布</span><strong>{facts.stats}</strong></div>
    <div class="fact wide dim-only">{group.description}</div>
  </div>

  <div class="ge-body">
    <div class="ge-table">
      <div class="ge-subtitle">Cayley 乘法表（点击任意格 → 选择该行元素）</div>
      <CayleyTable
        table={group}
        highlightRows={selection?.cycleLabels ?? []}
        highlightCols={selection?.cycleLabels ?? []}
        oncell={(a) => (selected = a)}
      />
    </div>
    <div class="ge-lattice">
      <div class="ge-subtitle">子群格（Hasse 图）</div>
      <canvas bind:this={canvasEl} class="lattice-canvas" data-testid="alg-lattice"></canvas>
    </div>
  </div>

  <div class="ge-cayley">
    <div class="ge-subtitle">Cayley 图（右乘生成元着色；点击顶点选中该元素）</div>
    <canvas bind:this={cayleyEl} class="cayley-canvas" data-testid="alg-cayley" onclick={pickCayley}
    ></canvas>
    <div class="cayley-legend" data-testid="alg-cayley-legend">
      {#each cayley.generators as generator, index (generator)}
        <span class="legend-item" data-testid={`alg-cayley-generator-${index}`}>
          <i style={`background:${CAYLEY_COLORS[index % CAYLEY_COLORS.length]}`}></i>
          生成元 {cayley.generatorLabels[index]}（阶 {elementOrder(group, generator)}）
        </span>
      {/each}
      <span class="legend-meta">顶点 {cayley.nodes.length} · 边 {cayley.edges.length}</span>
    </div>
  </div>

  {#if selection}
    <div class="ge-selection" data-testid="alg-element-info">
      元素 <code>{selection.label}</code>：阶 <strong>{selection.order}</strong>；逆元
      <code>{selection.inverse}</code>；生成子群 ⟨{selection.label}⟩ =
      <code>{`{${selection.cycleLabels.join(', ')}}`}</code>（{selection.normal
        ? '正规 ✓'
        : '非正规 ✗'}）{selection.order === group.order
        ? '——该元素是生成元，⟨a⟩ = G（循环群）'
        : ''}
    </div>
  {:else}
    <div class="ge-hint">点击乘法表中任意单元格：显示行元素的阶、逆元与生成子群 ⟨a⟩。</div>
  {/if}
</div>

<style>
  .group-explorer {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ge-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .fact {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #26324a;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    color: #8fa3c2;
    background: #101725;
  }
  .fact strong {
    color: #c7d4ea;
    font-family: ui-monospace, Consolas, monospace;
    font-weight: 600;
  }
  .fact.dim-only {
    color: #6f819f;
    background: transparent;
  }
  .ge-body {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    align-items: flex-start;
  }
  .ge-table {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ge-lattice {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 300px;
  }
  .ge-subtitle {
    font-size: 12px;
    color: #8fa3c2;
  }
  .lattice-canvas {
    display: block;
    width: 100%;
    height: 340px;
    border: 1px solid #26324a;
    border-radius: 8px;
    background: #0b0e14;
  }
  .ge-cayley {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cayley-canvas {
    display: block;
    width: 100%;
    height: 360px;
    border: 1px solid #26324a;
    border-radius: 8px;
    background: #0b0e14;
    cursor: pointer;
  }
  .cayley-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: #8fa3c2;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .legend-item i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }
  .legend-meta {
    color: #6f819f;
  }
  .ge-selection {
    font-size: 12px;
    color: #c7d4ea;
    border: 1px solid rgba(59, 130, 246, 0.4);
    background: rgba(59, 130, 246, 0.1);
    border-radius: 6px;
    padding: 8px 12px;
    line-height: 1.7;
  }
  .ge-selection code {
    font-family: ui-monospace, Consolas, monospace;
    color: #8fd0ff;
  }
  .ge-hint {
    font-size: 12px;
    color: #6f819f;
  }
</style>
