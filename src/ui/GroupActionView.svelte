<script lang="ts">
  /**
   * 群作用视图（v3.0）：
   * ① 共轭作用——Cl(g) 与 C_G(g) 联动，验证 |Cl(g)| = [G : C_G(g)]；
   * ② 类方程——|G| = Σ|Clᵢ|，标注中心 Z(G)；
   * ③ 陪集作用——H = ⟨g⟩ 的左右陪集对照，正规时构造商群 G/H；
   * ④ Burnside 计数——置换群作用于顶点着色的不动点统计与轨道数。
   */
  import { getActionElement, getActionGroup } from '../state/advanced-state.svelte'
  import {
    burnsideColoring,
    centralizerOf,
    classEquation,
    conjugacyClassOf,
    cosets,
    quotientGroup,
  } from '../algebra/actions'
  import { cyclicSubgroup, getGroup, labelOf } from '../algebra/groups'
  import CayleyTable from './CayleyTable.svelte'
  import { notation } from './notation'

  const group = $derived(getGroup(getActionGroup()))
  const element = $derived(Math.max(0, Math.min(getActionElement(), group.order - 1)))
  const elementLabel = $derived(labelOf(group, element))

  const classMembers = $derived(conjugacyClassOf(group, element))
  const centralizer = $derived(centralizerOf(group, element))
  const equation = $derived(classEquation(group))

  const cyclic = $derived(cyclicSubgroup(group, element))
  const cosetInfo = $derived(cosets(group, cyclic))
  const quotient = $derived(quotientGroup(group, cyclic))

  let colors = $state(2)
  const burnside = $derived(burnsideColoring(group, colors))

  function labelsOf(indices: number[]): string {
    return indices.map((index) => labelOf(group, index)).join(', ')
  }
</script>

<div class="action-view" data-testid="alg-action-view">
  <div class="av-title">
    群作用 · 共轭类（<strong>{group.name}</strong>，|G| = {group.order}）
  </div>

  <section class="av-panel">
    <div class="av-panel-title">① 共轭作用：轨道与稳定子</div>
    <div class="av-row">
      <span class="av-key">元素 g</span><span class="av-val mono">{elementLabel}</span>
    </div>
    <div class="av-row">
      <span class="av-key">共轭类 Cl(g) = {'{xgx⁻¹}'}</span>
      <span class="av-val mono" data-testid="alg-action-class">{`{${labelsOf(classMembers)}}`}</span
      >
      <span class="av-count">|Cl(g)| = {classMembers.length}</span>
    </div>
    <div class="av-row">
      <span class="av-key">{@render subs('中心化子 C_G(g) = {x : xg = gx}')}</span>
      <span class="av-val mono" data-testid="alg-action-centralizer"
        >{`{${labelsOf(centralizer)}}`}</span
      >
      <span class="av-count">{@render subs('|C_G(g)|')} = {centralizer.length}</span>
    </div>
    <div class="av-check" data-testid="alg-action-stabilizer">
      ✓ 轨道-稳定子：{@render subs('|Cl(g)| = [G : C_G(g)]')} = {group.order} / {centralizer.length} =
      {group.order / centralizer.length}（实际 {classMembers.length}）
    </div>
  </section>

  <section class="av-panel">
    <div class="av-panel-title">② 类方程（共轭作用分解整个群）</div>
    <div class="av-equation mono" data-testid="alg-action-class-equation">
      |G| = Σ|Clᵢ| = {equation.sizes.join(' + ')} = {equation.sizes.reduce(
        (sum, size) => sum + size,
        0,
      )}
    </div>
    <div class="av-row">
      <span class="av-key">中心 Z(G)</span>
      <span class="av-val mono" data-testid="alg-action-center"
        >{`{${labelsOf(equation.center)}}`}</span
      >
      <span class="av-count">|Z(G)| = {equation.centerSize}（大小为 1 的类之并）</span>
    </div>
  </section>

  <section class="av-panel">
    <div class="av-panel-title">③ 陪集作用与商群：H = ⟨{elementLabel}⟩</div>
    <div class="av-row">
      <span class="av-key">子群 H</span>
      <span class="av-val mono">{`{${labelsOf(cyclic)}}`}</span>
      <span class="av-count">|H| = {cyclic.length}，指数 [G : H] = {cosetInfo.index}</span>
    </div>
    <div class="av-cosets" data-testid="alg-action-cosets">
      <div class="av-coset-col">
        <div class="av-coset-head">左陪集 gH（{cosetInfo.left.length} 个）</div>
        {#each cosetInfo.left as coset (coset.representative)}
          <div class="mono coset">
            {labelOf(group, coset.representative)}H = {'{'}{labelsOf(coset.members)}}
          </div>
        {/each}
      </div>
      <div class="av-coset-col">
        <div class="av-coset-head">右陪集 Hg（{cosetInfo.right.length} 个）</div>
        {#each cosetInfo.right as coset (coset.representative)}
          <div class="mono coset">
            H{labelOf(group, coset.representative)} = {'{'}{labelsOf(coset.members)}}
          </div>
        {/each}
      </div>
    </div>
    {#if cosetInfo.normal}
      <div class="av-check">✓ 左右陪集集合相同 ⇒ H 正规，可以构造商群 G/H</div>
      {#if quotient}
        <div class="av-quotient" data-testid="alg-action-quotient">
          <div class="av-coset-head">商群 G/H（{quotient.elements.length} 个陪集）</div>
          <CayleyTable table={quotient} />
        </div>
      {/if}
    {:else}
      <div class="av-warn" data-testid="alg-action-not-normal">
        ✗ 左右陪集集合不同 ⇒ H 不正规，无法构造商群（陪集乘法无定义）
      </div>
    {/if}
  </section>

  <section class="av-panel">
    <div class="av-panel-title">④ Burnside 计数（置换群作用在顶点 k 着色上）</div>
    {#if burnside}
      <div class="av-row">
        <span class="av-key">颜色数 k</span>
        <div class="av-colors">
          {#each [2, 3, 4] as value (value)}
            <button
              type="button"
              class:active={colors === value}
              data-testid={`alg-action-colors-${value}`}
              onclick={() => (colors = value)}>{value} 色</button
            >
          {/each}
        </div>
      </div>
      <table class="av-table">
        <thead>
          <tr><th>元素 g</th><th>轮换数 c(g)</th><th>不动着色 k^c(g)</th></tr>
        </thead>
        <tbody>
          {#each burnside.rows.slice(0, burnside.rows.length > 12 ? 8 : burnside.rows.length) as row (row.element)}
            <tr>
              <td class="mono">{row.element}</td>
              <td>{row.cycles}</td>
              <td>{row.fixed}</td>
            </tr>
          {/each}
          {#if burnside.rows.length > 12}
            <tr><td colspan="3" class="av-more">…（共 {burnside.rows.length} 个元素）</td></tr>
          {/if}
        </tbody>
      </table>
      <div class="av-check" data-testid="alg-action-burnside">
        ✓ 不同着色数 = (1/|G|)·Σ k^c(g) = {burnside.total} / {group.order} =
        <strong>{burnside.orbits}</strong>
      </div>
      <div class="av-note">
        例：D₄ 作用于正方形顶点的 {colors} 色着色（旋转/翻转视为相同，即项圈问题）；Burnside 引理把计数化为各元素固定点数的平均。
      </div>
    {:else}
      <div class="av-note">
        该群由乘法表构造（无置换数据），Burnside 计数适用于 S₃、D₄、A₄、S₄、A₅ 等置换群。
      </div>
    {/if}
  </section>
</div>

{#snippet subs(text: string)}
  {#each notation(text) as part, partIndex (partIndex)}{#if part.sub}<sub>{part.text}</sub
      >{:else}{part.text}{/if}{/each}
{/snippet}

<style>
  .action-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
    overflow: auto;
  }
  .av-title {
    font-size: 14px;
    color: #c7d4ea;
  }
  .av-panel {
    border: 1px solid #26324a;
    background: #101725;
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .av-panel-title {
    font-size: 12px;
    color: #8fa3c2;
    letter-spacing: 0.02em;
  }
  .av-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 13px;
  }
  .av-key {
    color: #8fa3c2;
    font-size: 12px;
    min-width: 90px;
  }
  .av-val {
    color: #e2ebfa;
    word-break: break-all;
    max-width: 100%;
  }
  .av-count {
    color: #9fb3d1;
    font-size: 12px;
  }
  .mono {
    font-family: ui-monospace, Consolas, monospace;
  }
  .av-check {
    font-size: 12px;
    color: #86efac;
  }
  .av-warn {
    font-size: 12px;
    color: #fca5a5;
  }
  .av-note {
    font-size: 12px;
    color: #8fa3c2;
    line-height: 1.5;
  }
  .av-equation {
    font-size: 13px;
    color: #e2ebfa;
  }
  .av-cosets {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .av-coset-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .av-coset-head {
    font-size: 12px;
    color: #8fa3c2;
    margin-bottom: 2px;
  }
  .coset {
    font-size: 12px;
    color: #c7d4ea;
    word-break: break-all;
  }
  .av-quotient {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: auto;
  }
  .av-colors {
    display: flex;
    gap: 6px;
  }
  .av-colors button {
    border: 1px solid #26324a;
    background: #0b1220;
    color: #c7d4ea;
    border-radius: 6px;
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .av-colors button.active {
    border-color: #4c7dff;
    color: #fff;
    background: #16233c;
  }
  .av-table {
    border-collapse: collapse;
    font-size: 12px;
    color: #c7d4ea;
  }
  .av-table th,
  .av-table td {
    border: 1px solid #26324a;
    padding: 2px 8px;
    text-align: left;
  }
  .av-table th {
    color: #8fa3c2;
    font-weight: 500;
  }
  .av-more {
    color: #8fa3c2;
  }
</style>
