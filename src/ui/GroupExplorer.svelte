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
    allSubgroups,
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
  import { computeSubgroupLattice } from '../algebra/lattice'
  import { drawSubgroupLattice } from '../algebra/diagrams'
  import CayleyTable from './CayleyTable.svelte'

  const group = $derived(getGroup(getAlgebraGroup()))
  let selected = $state<number | null>(null)

  const facts = $derived.by(() => {
    const g = group
    const stats = [...elementOrderStats(g).entries()].sort((x, y) => x[0] - y[0])
    return {
      abelian: isAbelian(g),
      cyclic: isCyclic(g),
      center: labelsOf(g, centerElements(g)),
      subgroupCount: allSubgroups(g).length,
      stats: stats.map(([order, count]) => `阶 ${order} × ${count}`).join('、'),
    }
  })

  const lattice = $derived(computeSubgroupLattice(group))

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

  onMount(() => {
    drawLattice()
    const observer = new ResizeObserver(() => drawLattice())
    observer.observe(canvasEl)
    return () => observer.disconnect()
  })

  $effect(() => {
    // 换群时清空选择并重绘子群格
    void group.id
    selected = null
    drawLattice()
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
