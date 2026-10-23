<script lang="ts">
  /**
   * 群同态视图（v3.2）：枚举 G → H 的全部同态（生成元像穷举），
   * 显示核与像并核对第一同构定理 |G| = |ker| · |Im|。
   */
  import { getMorphSource, getMorphTarget } from '../state/advanced-state.svelte'
  import { getGroup, labelOf, type FiniteGroup } from '../algebra/groups'
  import { enumerateHomomorphisms } from '../algebra/homomorphism'

  const source = $derived(getGroup(getMorphSource()))
  const target = $derived(getGroup(getMorphTarget()))
  const result = $derived(enumerateHomomorphisms(source, target))

  function labelsOf(group: FiniteGroup, indices: number[], limit = 6): string {
    const labels = indices.slice(0, limit).map((index) => labelOf(group, index))
    return indices.length > limit ? `${labels.join(', ')}, …` : labels.join(', ')
  }
</script>

<div class="morph-view" data-testid="alg-morph-view">
  <div class="morph-title">
    群同态 <strong>{source.name}</strong> → <strong>{target.name}</strong>
  </div>

  <div class="morph-summary" data-testid="alg-morph-summary">
    共 <strong>{result.total}</strong> 个同态{result.complete
      ? ''
      : '（搜索未完成）'}。第一同构定理：|G| = |ker| × |Im|（下方逐条校验）。
  </div>
  <div class="morph-note">{result.note}</div>

  {#if result.homs.length > 0}
    <table class="morph-table" data-testid="alg-morph-table">
      <thead>
        <tr>
          <th>#</th>
          <th>核 ker φ</th>
          <th>|ker|</th>
          <th>像 Im φ</th>
          <th>|Im|</th>
          <th>性质</th>
        </tr>
      </thead>
      <tbody>
        {#each result.homs as hom, index (index)}
          <tr data-testid={`alg-morph-row-${index}`}>
            <td>{index + 1}</td>
            <td class="mono">{`{${labelsOf(source, hom.kernel)}}`}</td>
            <td>{hom.kernel.length}</td>
            <td class="mono">{`{${labelsOf(target, hom.image)}}`}</td>
            <td>{hom.image.length}</td>
            <td>
              {#if hom.injective && hom.surjective}
                <span class="tag ok">同构</span>
              {:else if hom.injective}
                <span class="tag">单射</span>
              {:else if hom.surjective}
                <span class="tag">满射</span>
              {:else}
                <span class="tag dim">—</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <div class="morph-note">没有找到任何同态（理论上至少存在平凡同态）。</div>
  {/if}

  <div class="morph-hint">
    平凡同态（所有元素 ↦ e）恒存在；同构的数量等于 |Aut(G)|（当 G ≅ H
    时）。同态的核恒为源群的正规子群。
  </div>
</div>

<style>
  .morph-view {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: #0b0e14;
    padding: 16px 20px 28px;
    color: #c7d4ea;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .morph-title {
    font-size: 15px;
  }

  .morph-summary {
    font-size: 13px;
  }

  .morph-note {
    font-size: 12px;
    color: #8b9bb4;
  }

  .morph-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .morph-table th,
  .morph-table td {
    border-bottom: 1px solid #1d2735;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
  }

  .morph-table th {
    color: #8b9bb4;
    font-weight: 500;
  }

  .mono {
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 12px;
  }

  .tag {
    border-radius: 8px;
    padding: 0 6px;
    background: #1b2534;
    color: #9fb3d1;
    font-size: 11px;
  }

  .tag.ok {
    background: #123321;
    color: #6ee7a8;
  }

  .tag.dim {
    color: #6b7a90;
  }

  .morph-hint {
    font-size: 12px;
    color: #8b9bb4;
  }
</style>
