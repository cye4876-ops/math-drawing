<script lang="ts">
  /**
   * Sylow 工作台（v3.0）：并排显示「算术允许的数量」与「实际数量」，
   * 逐条核验 n_p | |G|/pᵃ、n_p ≡ 1 (mod p)、n_p = [G : N_G(P)]，
   * 列出每个 Sylow 子群及其正规化子、共轭见证元（Q = xP₁x⁻¹）。
   */
  import { getSylowGroup, getSylowPrime } from '../state/advanced-state.svelte'
  import { sylowReport } from '../algebra/actions'
  import { getGroup, labelOf } from '../algebra/groups'

  const group = $derived(getGroup(getSylowGroup()))
  const prime = $derived(getSylowPrime())
  const report = $derived(sylowReport(group, prime))
  const dividesOrder = $derived(group.order % prime === 0)

  function labelsOf(indices: number[]): string {
    return indices.map((index) => labelOf(group, index)).join(', ')
  }
</script>

<div class="sylow-view" data-testid="alg-sylow-view">
  <div class="sv-title">
    Sylow 工作台（<strong>{group.name}</strong>）
  </div>

  <section class="sv-panel">
    <div class="sv-line mono">
      |G| = {group.order} = pᵃ · m = {prime}<sup>{report.exponent}</sup> × {report.cofactor}（p = {prime}）
    </div>
    {#if dividesOrder}
      <div class="sv-compare">
        <div class="sv-cell">
          <div class="sv-cell-head">算术允许的数量（必要条件）</div>
          <div class="mono" data-testid="alg-sylow-allowed">
            n_p ∈ {'{'}{report.allowedCounts.join('、')}}
          </div>
          <div class="sv-cell-note">n_p | m 且 n_p ≡ 1 (mod p) 的约束下允许的取值</div>
        </div>
        <div class="sv-cell">
          <div class="sv-cell-head">实际数量（本群实现）</div>
          <div class="mono strong" data-testid="alg-sylow-count">n_{prime} = {report.count}</div>
          <div class="sv-cell-note">
            {report.count === 1
              ? '唯一的 Sylow 子群 ⇒ 正规子群'
              : '多个 Sylow 子群 ⇒ 均非正规（互相共轭）'}
          </div>
        </div>
      </div>
      <div class="sv-note">
        算术上允许的数值只是必要条件——哪些数值能被真正实现由群结构决定（例如 A₄ 的 n₂ 允许 {'{'}1,
        3}，实际取 1）。
      </div>
      <div class="sv-checks" data-testid="alg-sylow-checks">
        {#each report.checks as check (check.label)}
          <div class="sv-check" class:bad={!check.ok}>
            <span class="mark">{check.ok ? '✓' : '✗'}</span>
            <span class="mono">{check.label}</span>
            <span class="detail">{check.detail}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div class="sv-note">p = {prime} 不整除 |G| —— 无 Sylow {prime}-子群。</div>
    {/if}
  </section>

  {#if dividesOrder}
    <section class="sv-panel">
      <div class="sv-panel-title">
        Sylow {prime}-子群一览（{report.count} 个，每个 {report.pPart} 阶）
      </div>
      <div class="sv-subgroups">
        {#each report.subgroups as sub, index (sub.members.join(','))}
          <div class="sv-sub" data-testid={`alg-sylow-subgroup-${index}`}>
            <div class="sv-sub-head">
              <span class="mono">P{index + 1}</span>
              {#if sub.normal}
                <span class="sv-badge ok">正规 ✓</span>
              {:else}
                <span class="sv-badge">非正规</span>
              {/if}
              <span class="sv-sub-meta"
                >|N_G(P)| = {sub.normalizer.length}，[G : N_G(P)] = {group.order /
                  sub.normalizer.length}</span
              >
            </div>
            <div class="sv-sub-elements mono">{'{'}{labelsOf(sub.members)}}</div>
            {#if index > 0 && sub.conjugatorFromFirst !== null}
              <div class="sv-conj mono">
                P{index + 1} = x·P1·x⁻¹，例如 x = {labelOf(group, sub.conjugatorFromFirst)}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <div class="sv-note">
        Sylow 定理第二部分的体现：n_p = [G : N_G(P)]，且全部 Sylow p-子群互相共轭（每张卡片的见证元
        x 给出 P{'{'}i} = x·P1·x⁻¹）。
      </div>
    </section>
  {/if}
</div>

<style>
  .sylow-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
    overflow: auto;
  }
  .sv-title {
    font-size: 14px;
    color: #c7d4ea;
  }
  .sv-panel {
    border: 1px solid #26324a;
    background: #101725;
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sv-panel-title {
    font-size: 12px;
    color: #8fa3c2;
  }
  .mono {
    font-family: ui-monospace, Consolas, monospace;
  }
  .sv-line {
    font-size: 13px;
    color: #e2ebfa;
  }
  .sv-compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .sv-cell {
    border: 1px solid #26324a;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sv-cell-head {
    font-size: 12px;
    color: #8fa3c2;
  }
  .sv-cell-note {
    font-size: 11px;
    color: #7186a6;
  }
  .strong {
    font-size: 15px;
    color: #86efac;
  }
  .sv-note {
    font-size: 12px;
    color: #8fa3c2;
    line-height: 1.5;
  }
  .sv-checks {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sv-check {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
    color: #86efac;
  }
  .sv-check.bad {
    color: #fca5a5;
  }
  .sv-check .detail {
    color: #9fb3d1;
  }
  .sv-subgroups {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sv-sub {
    border: 1px solid #26324a;
    border-radius: 6px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sv-sub-head {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
    color: #c7d4ea;
  }
  .sv-badge {
    font-size: 11px;
    border: 1px solid #26324a;
    border-radius: 8px;
    padding: 0 6px;
    color: #9fb3d1;
  }
  .sv-badge.ok {
    border-color: #1f5f39;
    color: #86efac;
  }
  .sv-sub-meta {
    color: #8fa3c2;
    font-size: 11px;
  }
  .sv-sub-elements {
    font-size: 12px;
    color: #e2ebfa;
    word-break: break-all;
  }
  .sv-conj {
    font-size: 12px;
    color: #9fb3d1;
    word-break: break-all;
  }
</style>
