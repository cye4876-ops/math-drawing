<script lang="ts">
  /**
   * 矩阵与谱面板（v0.5）：
   * - 加权邻接矩阵表格（点击格子 ↔ 画布高亮联动；对角 = 自环）；
   * - 特征值（对称邻接阵全谱，按重数聚合显示）；
   * - 谱半径与 Perron 向量（幂迭代；Perron–Frobenius 保证非负主特征向量）。
   * 计算缓存：仅在图「结构」变化时重算（拖动坐标不触发 O(n³) 全谱）。
   */
  import type { GraphObject } from '../graph/model'
  import type { SceneHighlight } from '../render/element-registry'
  import { computeSpectrum, type GraphSpectrum } from '../graph/spectral'

  let {
    graph,
    onHighlight,
  }: {
    graph: GraphObject | null
    onHighlight: (highlight: SceneHighlight | null) => void
  } = $props()

  /** 矩阵显示规模上限（超出仅显示谱信息） */
  const MAX_MATRIX_DISPLAY = 40

  let spectrum = $state<GraphSpectrum | null>(null)
  let selected = $state<{ i: number; j: number } | null>(null)
  let lastKey: string | null = null

  /** 结构签名（标签 + 边）：坐标变化不改变签名 → 不触发重算 */
  function structuralKey(value: GraphObject): string {
    const nodes = value.nodes.map((node) => node.label).join('|')
    const edges = value.edges
      .map(
        (edge) => `${edge.source}${edge.directed ? '>' : '-'}${edge.target}:${edge.weight ?? ''}`,
      )
      .join(';')
    return `${nodes}#${edges}`
  }

  const structureKey = $derived(graph ? structuralKey(graph) : '')

  $effect(() => {
    const key = structureKey
    if (key === lastKey) return
    lastKey = key
    selected = null
    onHighlight(null)
    spectrum = graph ? computeSpectrum(graph) : null
  })

  /** 数值格式：接近 0 归零；整数显整数；其余 3 位小数 */
  function formatValue(value: number): string {
    if (!Number.isFinite(value)) return '—'
    if (Math.abs(value) < 5e-4) return '0'
    if (Math.abs(value - Math.round(value)) < 5e-4) return String(Math.round(value))
    return value.toFixed(3)
  }

  function cellValue(i: number, j: number): number {
    return spectrum?.adjacency.matrix[i]?.[j] ?? 0
  }

  /** 点击矩阵格子：切换高亮（点击已选格或零格取消；对角为自环） */
  function toggleCell(i: number, j: number): void {
    const current = spectrum
    if (!current) return
    const labelA = current.adjacency.labels[i]
    const labelB = current.adjacency.labels[j]
    if (!labelA || !labelB) return
    if (selected && selected.i === i && selected.j === j) {
      selected = null
      onHighlight(null)
      return
    }
    if (cellValue(i, j) === 0 && i !== j) {
      selected = null
      onHighlight(null)
      return
    }
    selected = { i, j }
    onHighlight({ edges: [{ source: labelA.id, target: labelB.id }] })
  }

  /** 特征值按重数聚合（已降序：连续相等值归组） */
  const groupedEigenvalues = $derived.by(() => {
    const values = spectrum?.eigenvalues
    if (!values) return []
    const groups: { value: number; count: number }[] = []
    for (const value of values) {
      const last = groups[groups.length - 1]
      if (last && Math.abs(last.value - value) < 1e-6) last.count += 1
      else groups.push({ value, count: 1 })
    }
    return groups
  })

  const matrixSize = $derived(spectrum?.adjacency.matrix.length ?? 0)
</script>

<div class="spectrum" data-testid="spectrum-panel">
  <div class="section-title">矩阵与谱</div>
  {#if !graph || !spectrum}
    <div class="hint">暂无图：用图族或 DSL 创建</div>
  {:else}
    <div class="line" data-testid="spectral-radius">
      谱半径 ρ = <b>{formatValue(spectrum.spectralRadius)}</b>
      {#if spectrum.eigenvalues}
        <span class="dim">（最大特征值）</span>
      {:else}
        <span class="dim">（Perron–Frobenius 主特征值）</span>
      {/if}
    </div>

    {#if matrixSize > MAX_MATRIX_DISPLAY}
      <div class="hint" data-testid="matrix-omitted">
        图较大（{matrixSize} 顶点）：矩阵显示已省略，仅给出谱信息
      </div>
    {:else}
      <div class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th></th>
              {#each spectrum.adjacency.labels as item (item.id)}
                <th title={item.label}>{item.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each spectrum.adjacency.labels as rowLabel, i (rowLabel.id)}
              <tr>
                <th title={rowLabel.label}>{rowLabel.label}</th>
                {#each spectrum.adjacency.labels as colLabel, j (colLabel.id)}
                  <td>
                    <button
                      type="button"
                      class="cell"
                      class:nonzero={cellValue(i, j) !== 0}
                      class:selected={selected?.i === i && selected?.j === j}
                      data-testid={`matrix-cell-${i}-${j}`}
                      title={`${rowLabel.label} → ${colLabel.label}`}
                      onclick={() => toggleCell(i, j)}
                    >
                      {formatValue(cellValue(i, j))}
                    </button>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if spectrum.eigenvalues}
      <div class="line" data-testid="eigenvalues">
        <span class="dim">特征值：</span>
        {#each groupedEigenvalues as group, index (index)}
          <span class="chip"
            >{formatValue(group.value)}{group.count > 1 ? `×${group.count}` : ''}</span
          >
        {/each}
      </div>
    {:else}
      <div class="hint" data-testid="spectral-note">
        非对称邻接阵（有向图）：仅显示谱半径与 Perron 向量
      </div>
    {/if}

    <div class="line">
      <span class="dim">Perron 向量（最大分量 = 1）：</span>
      {#if !spectrum.perronConverged}<span class="chip warn">近似（慢收敛）</span>{/if}
    </div>
    <div class="perron">
      {#each spectrum.adjacency.labels as item, index (item.id)}
        <span class="perron-item" data-testid={`perron-${index}`}>
          <span class="dim">{item.label}</span>
          <span class="perron-value">{formatValue(spectrum.perron[index] ?? 0)}</span>
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .spectrum {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-title {
    font-size: 12px;
    color: var(--text-dim);
  }

  .line {
    font-size: 12px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .dim {
    color: var(--text-dim);
  }

  .hint {
    font-size: 12px;
    color: var(--text-dim);
  }

  .matrix-wrap {
    max-width: 100%;
    max-height: 240px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .matrix {
    border-collapse: collapse;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .matrix th {
    padding: 2px 5px;
    color: var(--text-dim);
    font-weight: 500;
    max-width: 64px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .matrix thead th {
    position: sticky;
    top: 0;
    background: var(--panel);
  }

  .matrix tbody th {
    position: sticky;
    left: 0;
    background: var(--panel);
  }

  .cell {
    width: 26px;
    height: 22px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    cursor: pointer;
  }

  .cell.nonzero {
    color: var(--text);
    background: rgba(37, 99, 235, 0.07);
    font-weight: 600;
  }

  .cell.selected {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.18);
  }

  .chip {
    display: inline-block;
    padding: 0 5px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .chip.warn {
    border-color: #f59e0b;
    color: #b45309;
  }

  .perron {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .perron-item {
    display: inline-flex;
    gap: 4px;
    align-items: baseline;
  }

  .perron-value {
    font-weight: 600;
  }
</style>
