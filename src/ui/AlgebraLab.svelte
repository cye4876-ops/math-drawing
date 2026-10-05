<script lang="ts">
  /**
   * 近世代数模块（v2.2）主视图：三个子视图——
   * ① 反例列举：经典命题的反例 + 可视化证据（乘法表 / 子群报告 / 格点图）；
   * ② 群结构探索：Cayley 表交互 + 子群格 + 元素生成子群；
   * ③ 环与域：ℤₙ 单位与零因子标注表 + 域判定。
   */
  import { getAlgebraCase, getAlgebraSection } from '../state/advanced-state.svelte'
  import {
    COUNTEREXAMPLE_CASES,
    getAlgebraTable,
    getCounterexampleCase,
    type CounterexamplePanel,
  } from '../algebra/counterexamples'
  import {
    cyclicSubgroup,
    elementOrderStats,
    getGroup,
    isAbelian,
    isCyclic,
    labelsOf,
    subsetProduct,
    type FiniteGroup,
  } from '../algebra/groups'
  import CayleyTable from './CayleyTable.svelte'
  import CaseDiagram from './CaseDiagram.svelte'
  import GroupActionView from './GroupActionView.svelte'
  import GroupExplorer from './GroupExplorer.svelte'
  import RingExplorer from './RingExplorer.svelte'
  import SubgroupReport from './SubgroupReport.svelte'
  import SylowView from './SylowView.svelte'

  const section = $derived(getAlgebraSection())
  const currentCase = $derived(getCounterexampleCase(getAlgebraCase()))
  const caseIndex = $derived(
    COUNTEREXAMPLE_CASES.findIndex((item) => item.id === currentCase.id) + 1,
  )

  function compareFacts(group: FiniteGroup): { label: string; value: string }[] {
    const stats = [...elementOrderStats(group).entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([order, count]) => `${order}×${count}`)
      .join('、')
    return [
      { label: '阶', value: String(group.order) },
      { label: '交换', value: isAbelian(group) ? '是' : '否' },
      { label: '循环', value: isCyclic(group) ? '是' : '否' },
      { label: '元素阶分布', value: stats },
    ]
  }

  function productInfo(groupId: string, generatorA: string, generatorB: string) {
    const group = getGroup(groupId)
    const a = Math.max(0, group.elements.indexOf(generatorA))
    const b = Math.max(0, group.elements.indexOf(generatorB))
    const h = cyclicSubgroup(group, a)
    const k = cyclicSubgroup(group, b)
    const hk = subsetProduct(group, h, k)
    return { group, h, k, hk, divides: hk.length > 0 && group.order % hk.length === 0 }
  }

  function panelTitle(panel: CounterexamplePanel): string | undefined {
    return panel.title
  }
</script>

<div class="algebra-area" data-testid="adv-algebra-area">
  {#if section === 'counterexamples'}
    {#key currentCase.id}
      <div class="alg-header">
        <div class="alg-meta">
          <span class="alg-field">{currentCase.field}</span>
          <span class="alg-count">案例 {caseIndex} / {COUNTEREXAMPLE_CASES.length}</span>
        </div>
        <h2 class="alg-title" data-testid="alg-case-title">{currentCase.title}</h2>
        <div class="alg-claim"><span class="alg-tag">被反驳的命题</span>{currentCase.claim}</div>
        <div class="alg-verdict" data-testid="alg-verdict">
          <span class="alg-x">✗ 不成立</span>
          <span>反例：<strong>{currentCase.object}</strong></span>
        </div>
        <p class="alg-explanation">{currentCase.explanation}</p>
      </div>

      <div class="alg-panels">
        {#each currentCase.panels as panel, panelIndex (panelIndex)}
          <section class="alg-panel">
            {#if panelTitle(panel)}
              <div class="alg-panel-title">{panelTitle(panel)}</div>
            {/if}

            {#if panel.kind === 'table'}
              <CayleyTable
                table={getAlgebraTable(panel.groupId)}
                markNonCommuting={panel.markNonCommuting}
                markCenter={panel.markCenter}
                highlightRows={panel.highlightRows}
                highlightCols={panel.highlightCols}
              />
            {:else if panel.kind === 'table-compare'}
              <div class="alg-compare">
                {#each panel.groupIds as groupId (groupId)}
                  {@const group = getGroup(groupId)}
                  <div class="alg-compare-item">
                    <div class="alg-compare-title">{group.name}</div>
                    <ul class="alg-facts">
                      {#each compareFacts(group) as fact (fact.label)}
                        <li><span>{fact.label}</span><strong>{fact.value}</strong></li>
                      {/each}
                    </ul>
                    <CayleyTable table={group} />
                  </div>
                {/each}
              </div>
            {:else if panel.kind === 'subgroup-report'}
              <SubgroupReport
                group={getGroup(panel.groupId)}
                missingOrder={panel.missingOrder}
                note={panel.note}
              />
            {:else if panel.kind === 'subgroup-product'}
              {@const info = productInfo(panel.groupId, panel.generatorA, panel.generatorB)}
              <div class="alg-product">
                <div class="alg-product-row">
                  <span class="dim">H = ⟨{panel.generatorA}⟩</span>
                  <code>{labelsOf(info.group, info.h)}</code>
                </div>
                <div class="alg-product-row">
                  <span class="dim">K = ⟨{panel.generatorB}⟩</span>
                  <code>{labelsOf(info.group, info.k)}</code>
                </div>
                <div class="alg-product-row">
                  <span class="dim">H · K</span>
                  <code data-testid="alg-hk-set">{labelsOf(info.group, info.hk)}</code>
                </div>
                <div class="alg-product-verdict" class:ok={info.divides}>
                  |H·K| = {info.hk.length}；|G| = {info.group.order}——
                  {info.divides
                    ? `${info.hk.length} 整除 ${info.group.order}（此处不构成反例证据）`
                    : `${info.group.order} 不能被 ${info.hk.length} 整除 ⇒ H·K 不是子群（拉格朗日定理）`}
                </div>
              </div>
            {:else if panel.kind === 'diagram'}
              <CaseDiagram kind={panel.diagram} />
            {:else if panel.kind === 'text'}
              <div class="alg-text">
                {#each panel.lines as line (line)}
                  <p>{line}</p>
                {/each}
              </div>
            {/if}

            {#if panel.note && panel.kind !== 'subgroup-report'}
              <div class="alg-note">{panel.note}</div>
            {/if}
          </section>
        {/each}
      </div>
    {/key}
  {:else if section === 'groups'}
    <GroupExplorer />
  {:else if section === 'actions'}
    <GroupActionView />
  {:else if section === 'sylow'}
    <SylowView />
  {:else}
    <RingExplorer />
  {/if}
</div>

<style>
  .algebra-area {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: #0b0e14;
    padding: 16px 20px 28px;
    color: #c7d4ea;
  }
  .alg-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 1100px;
    margin-bottom: 14px;
  }
  .alg-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .alg-field {
    font-size: 11px;
    letter-spacing: 1px;
    border: 1px solid rgba(59, 130, 246, 0.5);
    color: #8fd0ff;
    border-radius: 4px;
    padding: 1px 8px;
    background: rgba(59, 130, 246, 0.12);
  }
  .alg-count {
    font-size: 11px;
    color: #6f819f;
    font-family: ui-monospace, Consolas, monospace;
  }
  .alg-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #e8ecf5;
  }
  .alg-claim {
    font-size: 13px;
    color: #a9b8d4;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .alg-tag {
    font-size: 11px;
    color: #fcd34d;
    border: 1px solid rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.1);
    border-radius: 4px;
    padding: 1px 7px;
    white-space: nowrap;
  }
  .alg-verdict {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: #c7d4ea;
    border: 1px solid rgba(239, 68, 68, 0.45);
    background: rgba(239, 68, 68, 0.1);
    border-radius: 6px;
    padding: 7px 12px;
    width: fit-content;
  }
  .alg-verdict strong {
    color: #ffb4a8;
  }
  .alg-x {
    color: #f87171;
    font-weight: 700;
    white-space: nowrap;
  }
  .alg-explanation {
    margin: 0;
    font-size: 13px;
    line-height: 1.75;
    color: #a9b8d4;
    max-width: 1000px;
  }
  .alg-panels {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 1100px;
  }
  .alg-panel {
    border: 1px solid #26324a;
    border-radius: 10px;
    background: #101725;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .alg-panel-title {
    font-size: 13px;
    color: #8fa3c2;
    font-weight: 600;
  }
  .alg-compare {
    display: flex;
    flex-wrap: wrap;
    gap: 26px;
  }
  .alg-compare-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .alg-compare-title {
    font-size: 13px;
    color: #c7d4ea;
    font-weight: 600;
  }
  .alg-facts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .alg-facts li {
    display: flex;
    gap: 8px;
    font-size: 12px;
    color: #8fa3c2;
  }
  .alg-facts strong {
    color: #c7d4ea;
    font-family: ui-monospace, Consolas, monospace;
  }
  .alg-product {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .alg-product-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
  }
  .alg-product-row .dim {
    color: #8fa3c2;
    min-width: 110px;
  }
  .alg-product-row code {
    font-family: ui-monospace, Consolas, monospace;
    color: #8fd0ff;
    background: #131b2c;
    border: 1px solid #26324a;
    border-radius: 4px;
    padding: 2px 8px;
  }
  .alg-product-verdict {
    font-size: 12px;
    color: #ffb4a8;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.1);
    border-radius: 6px;
    padding: 6px 10px;
    width: fit-content;
  }
  .alg-product-verdict.ok {
    color: #86efac;
    border-color: rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.1);
  }
  .alg-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .alg-text p {
    margin: 0;
    font-size: 13px;
    line-height: 1.75;
    color: #a9b8d4;
  }
  .alg-note {
    font-size: 12px;
    color: #6f819f;
    line-height: 1.6;
  }
</style>
