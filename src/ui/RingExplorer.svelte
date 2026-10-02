<script lang="ts">
  /**
   * 环与域探索（v2.2 近世代数模块）：ℤₙ 的加法 / 乘法表。
   * - 表头：绿 = 单位（gcd(a,n)=1），红 = 零因子（gcd(a,n)>1）；
   * - 乘法表：两非零元素乘积为 0 的格标红（零因子证据）；
   * - 性质：n 素 ⇔ ℤₙ 无零因子 ⇔ ℤₙ 是域；φ(n) 单位数、幂等元。
   */
  import { getAlgebraRingN } from '../state/advanced-state.svelte'
  import {
    buildZnTables,
    eulerPhi,
    idempotentsOf,
    isPrime,
    isUnit,
    isZeroDivisor,
    subscriptNumber,
    unitsOf,
    zeroDivisorsOf,
  } from '../algebra/rings'

  const n = $derived(getAlgebraRingN())
  const tables = $derived(buildZnTables(n))
  const indexRange = $derived(Array.from({ length: tables.n }, (_, index) => index))

  const facts = $derived.by(() => {
    const units = unitsOf(n)
    const zeros = zeroDivisorsOf(n)
    const prime = isPrime(n)
    const idempotents = idempotentsOf(n)
    return { units, zeros, prime, phi: eulerPhi(n), idempotents }
  })

  const fancy = $derived(`ℤ${subscriptNumber(n)}`)
</script>

<div class="ring-explorer" data-testid={`alg-ring-${n}`}>
  <div class="re-facts" data-testid="alg-ring-facts">
    <div class="fact"><span>环</span><strong>{fancy}</strong></div>
    <div class="fact">
      <span>是否域</span><strong>{facts.prime ? '是（n 为素数）' : '否'}</strong>
    </div>
    <div class="fact">
      <span>单位</span><strong
        >{facts.units.length} 个（φ = {facts.phi}）：{facts.units.join(', ')}</strong
      >
    </div>
    <div class="fact">
      <span>零因子</span><strong
        >{facts.zeros.length === 0
          ? '无'
          : `${facts.zeros.length} 个：${facts.zeros.join(', ')}`}</strong
      >
    </div>
    <div class="fact"><span>幂等元</span><strong>{facts.idempotents.join(', ')}</strong></div>
  </div>

  <div class="re-tables">
    <div class="re-table-block">
      <div class="re-subtitle">加法表（模 {n}）</div>
      <table class="ring-table" data-testid="alg-ring-add">
        <thead>
          <tr>
            <th class="corner">+</th>
            {#each indexRange as j (j)}
              <th class:unit={isUnit(n, j)} class:zerodiv={isZeroDivisor(n, j)}>{j}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each indexRange as i (i)}
            <tr>
              <th class:unit={isUnit(n, i)} class:zerodiv={isZeroDivisor(n, i)}>{i}</th>
              {#each indexRange as j (j)}
                <td>{tables.addition[i]?.[j] ?? 0}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="re-table-block">
      <div class="re-subtitle">乘法表（模 {n}）</div>
      <table class="ring-table" data-testid="alg-ring-mul">
        <thead>
          <tr>
            <th class="corner">×</th>
            {#each indexRange as j (j)}
              <th class:unit={isUnit(n, j)} class:zerodiv={isZeroDivisor(n, j)}>{j}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each indexRange as i (i)}
            <tr>
              <th class:unit={isUnit(n, i)} class:zerodiv={isZeroDivisor(n, i)}>{i}</th>
              {#each indexRange as j (j)}
                {@const value = tables.multiplication[i]?.[j] ?? 0}
                <td class:zero-product={value === 0 && i !== 0 && j !== 0} data-result={value}
                  >{value}</td
                >
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="re-notes">
    <p>
      绿 = <strong>单位</strong>（gcd(a, {n}) = 1，有乘法逆元）；红 =
      <strong>零因子</strong>（gcd(a, {n}) &gt; 1，存在 b ≠ 0 使 ab ≡ 0）。
    </p>
    <p>
      n 为素数 ⇔ ℤₙ 无零因子 ⇔ ℤₙ 是域——切换 n 观察：n = 2、3、5、7、11 时表头全绿（除 0），无红格。
    </p>
    <p>
      ℤₙ 的加法群恒为循环群 Cₙ；单位群（乘法）是 φ(n) 阶的阿贝尔群，一般不循环（如 ℤ₈ 的单位群 ≅
      C₂×C₂）。
    </p>
    <p class="re-ref">
      其他有限域（GF(4) 等非素数阶）见「反例列举 · 域的元素个数是素数」；ℤ[√−5]
      的唯一分解反例见「整环 ⇒ 唯一分解」。
    </p>
  </div>
</div>

<style>
  .ring-explorer {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .re-facts {
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
  .re-tables {
    display: flex;
    flex-wrap: wrap;
    gap: 22px;
    align-items: flex-start;
  }
  .re-table-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .re-subtitle {
    font-size: 12px;
    color: #8fa3c2;
  }
  .ring-table {
    border-collapse: collapse;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
  }
  .ring-table th,
  .ring-table td {
    width: 26px;
    height: 24px;
    text-align: center;
    border: 1px solid #26324a;
    color: #c7d4ea;
    padding: 0 2px;
  }
  .ring-table th {
    background: #131b2c;
    color: #8fa3c2;
    font-weight: 600;
  }
  .ring-table th.corner {
    color: #5c6b8a;
  }
  .ring-table th.unit {
    color: #22c55e;
  }
  .ring-table th.zerodiv {
    color: #ef4444;
  }
  .ring-table td.zero-product {
    background: rgba(239, 68, 68, 0.2);
    color: #ffb4a8;
  }
  .re-notes {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 900px;
  }
  .re-notes p {
    margin: 0;
    font-size: 12px;
    line-height: 1.7;
    color: #8fa3c2;
  }
  .re-notes strong {
    color: #c7d4ea;
  }
  .re-ref {
    color: #6f819f;
  }
</style>
