<script lang="ts">
  /**
   * 子群结构报告（v2.2）：枚举全部子群，标注阶、元素、正规性；
   * - missingOrder：验证「不存在 m 阶子群」（拉格朗日之逆反例的证据）；
   * - 若全部子群正规，给出「哈密顿群」徽标。
   */
  import { allSubgroups, isNormalSubgroup, type FiniteGroup } from '../algebra/groups'

  let {
    group,
    missingOrder,
    note,
  }: {
    group: FiniteGroup
    missingOrder?: number
    note?: string
  } = $props()

  const entries = $derived.by(() =>
    allSubgroups(group).map((sub) => ({
      sub,
      size: sub.length,
      normal: isNormalSubgroup(group, sub),
    })),
  )

  const allNormal = $derived(entries.length > 0 && entries.every((entry) => entry.normal))
  const hasMissingOrder = $derived(
    missingOrder === undefined || !entries.some((entry) => entry.size === missingOrder),
  )

  const orderChips = $derived.by(() => {
    const sizes: number[] = []
    for (const entry of entries) {
      if (!sizes.includes(entry.size)) sizes.push(entry.size)
    }
    sizes.sort((a, b) => a - b)
    return sizes.map(
      (size) => [size, entries.filter((entry) => entry.size === size).length] as [number, number],
    )
  })
</script>

<div class="subgroup-report" data-testid={`alg-subgroups-${group.id}`}>
  <div class="sg-summary">
    「{group.name}」共 {entries.length} 个子群：
    {#each orderChips as chip (chip[0])}
      <span class="chip">阶 {chip[0]} × {chip[1]}</span>
    {/each}
  </div>

  {#if allNormal}
    <div class="sg-badge ok">✓ 全部子群均正规（哈密顿群性质）</div>
  {:else}
    <div class="sg-badge warn">存在非正规子群（见下方标注）</div>
  {/if}

  {#if missingOrder !== undefined}
    <div class="sg-missing" data-testid={`alg-missing-${group.id}`}>
      {#if hasMissingOrder}
        ✗ 不存在 {missingOrder} 阶子群——虽然 {missingOrder} 整除 {group.order}（拉格朗日定理之逆不成立）
      {:else}
        存在 {missingOrder} 阶子群
      {/if}
    </div>
  {/if}

  <ul class="sg-list">
    {#each entries as entry (entry.sub.join(','))}
      <li>
        <span class="sg-order">|H| = {entry.size}</span>
        <span class="sg-elements"
          >{`{${entry.sub.map((index) => group.elements[index]).join(', ')}}`}</span
        >
        {#if entry.size === group.order}
          <span class="sg-tag">G 自身</span>
        {:else if entry.size === 1}
          <span class="sg-tag">平凡</span>
        {/if}
        <span class="sg-normal" class:no={!entry.normal}
          >{entry.normal ? '正规 ✓' : '非正规 ✗'}</span
        >
      </li>
    {/each}
  </ul>

  {#if note}
    <div class="sg-note">{note}</div>
  {/if}
</div>

<style>
  .subgroup-report {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sg-summary {
    font-size: 12px;
    color: #8fa3c2;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    border: 1px solid #26324a;
    background: #101725;
    border-radius: 10px;
    padding: 1px 8px;
    font-family: ui-monospace, Consolas, monospace;
    color: #c7d4ea;
  }
  .sg-badge {
    font-size: 12px;
    border-radius: 6px;
    padding: 5px 10px;
  }
  .sg-badge.ok {
    color: #86efac;
    background: rgba(34, 197, 94, 0.12);
    border: 1px solid rgba(34, 197, 94, 0.4);
  }
  .sg-badge.warn {
    color: #fcd34d;
    background: rgba(245, 158, 11, 0.12);
    border: 1px solid rgba(245, 158, 11, 0.4);
  }
  .sg-missing {
    font-size: 12px;
    color: #ffb4a8;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.45);
    border-radius: 6px;
    padding: 6px 10px;
  }
  .sg-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 260px;
    overflow: auto;
  }
  .sg-list li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-family: ui-monospace, Consolas, monospace;
    color: #c7d4ea;
    border-bottom: 1px solid #1c2740;
    padding: 3px 2px;
  }
  .sg-order {
    color: #8fa3c2;
    min-width: 60px;
  }
  .sg-elements {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sg-tag {
    font-size: 11px;
    color: #6f819f;
    border: 1px solid #26324a;
    border-radius: 4px;
    padding: 0 5px;
  }
  .sg-normal {
    color: #86efac;
    font-size: 11px;
  }
  .sg-normal.no {
    color: #fcd34d;
  }
  .sg-note {
    font-size: 12px;
    color: #6f819f;
    line-height: 1.6;
  }
</style>
