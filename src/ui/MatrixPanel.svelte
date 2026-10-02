<script lang="ts">
  /**
   * 矩阵面板（v2.3）：尺寸 / 输入网格 / 预设 / 运算选择 / 计算。
   */
  import {
    MATRIX_PRESETS,
    applyMatrixPreset,
    getMatrixEntry,
    getMatrixError,
    getMatrixOp,
    getMatrixSize,
    runMatrixOp,
    setMatrixEntry,
    setMatrixOp,
    setMatrixSize,
    type MatrixOp,
    type MatrixSize,
  } from '../state/matrix-state.svelte'

  const SIZES: { id: MatrixSize; label: string }[] = [
    { id: 2, label: '2×2' },
    { id: 3, label: '3×3' },
    { id: 4, label: '4×4' },
  ]
  const OPS: { id: MatrixOp; label: string }[] = [
    { id: 'lu', label: 'LU 分解' },
    { id: 'qr', label: 'QR 分解' },
    { id: 'eigen', label: '相似对角化' },
    { id: 'summary', label: '行列式·秩·逆' },
  ]

  const size = $derived(getMatrixSize())
  const rows = $derived(
    Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => r * size + c)),
  )
</script>

<aside class="matrix-panel" data-testid="matrix-panel">
  <div class="section-title">矩阵分解（v2.3）</div>

  <div class="section">
    <div class="row">
      <span class="dim">尺寸</span>
      {#each SIZES as item (item.id)}
        <button
          type="button"
          class:active={size === item.id}
          data-testid={`matrix-size-${item.id}`}
          onclick={() => setMatrixSize(item.id)}>{item.label}</button
        >
      {/each}
    </div>

    <div class="grid-wrap">
      {#each rows as row, r (r)}
        <div class="grid-row">
          {#each row as index, c (c)}
            <input
              type="number"
              step="any"
              class="cell"
              data-testid={`matrix-cell-${r + 1}-${c + 1}`}
              value={getMatrixEntry(index)}
              oninput={(event) =>
                setMatrixEntry(index, Number((event.currentTarget as HTMLInputElement).value))}
            />
          {/each}
        </div>
      {/each}
    </div>

    <div class="row wrap">
      <span class="dim">预设</span>
      {#each MATRIX_PRESETS as preset (preset.id)}
        <button
          type="button"
          class="preset"
          data-testid={`matrix-preset-${preset.id}`}
          onclick={() => applyMatrixPreset(preset.id)}>{preset.label}</button
        >
      {/each}
    </div>
  </div>

  <div class="section">
    <div class="section-title">运算</div>
    <div class="op-list">
      {#each OPS as item (item.id)}
        <button
          type="button"
          class:active={getMatrixOp() === item.id}
          data-testid={`matrix-op-${item.id}`}
          onclick={() => setMatrixOp(item.id)}>{item.label}</button
        >
      {/each}
    </div>
    <div class="row">
      <button type="button" class="run" data-testid="matrix-run" onclick={() => runMatrixOp()}
        >计算</button
      >
    </div>
    {#if getMatrixError()}
      <div class="matrix-error" data-testid="matrix-error">{getMatrixError()}</div>
    {/if}
    <div class="hint">
      画布实时显示当前矩阵对单位正方形的变换（2×2 及以上取左上 2×2
      块）；「计算」后在右侧查看分解矩阵与验证残差。
    </div>
  </div>
</aside>

<style>
  .matrix-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    overflow-y: auto;
    min-width: 0;
  }
  .section-title {
    font-size: 12px;
    letter-spacing: 2px;
    color: #8fa3c2;
    text-transform: uppercase;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .row.wrap {
    flex-wrap: wrap;
  }
  .dim {
    color: #8fa3c2;
    font-size: 12px;
  }
  .row button {
    font-size: 12px;
    padding: 4px 10px;
  }
  .row button.active {
    background: var(--accent);
    color: #fff;
  }
  .grid-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .grid-row {
    display: flex;
    gap: 4px;
  }
  .cell {
    width: 100%;
    max-width: 64px;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    text-align: center;
  }
  .preset {
    font-size: 11px;
  }
  .op-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
  }
  .op-list button {
    font-size: 12px;
    padding: 5px 0;
  }
  .op-list button.active {
    background: var(--accent);
    color: #fff;
  }
  .row .run {
    flex: 1;
    padding: 6px 0;
    font-size: 13px;
  }
  .matrix-error {
    font-size: 12px;
    color: #fca5a5;
  }
  .hint {
    font-size: 11px;
    color: #6f819f;
    line-height: 1.5;
  }
</style>
