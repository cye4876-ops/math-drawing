<script lang="ts">
  /**
   * 矩阵面板（v2.3）：尺寸 / 输入网格 / 预设 / 运算选择 / 计算。
   */
  import {
    MATRIX_PRESETS,
    MAX_MATRIX_SIZE,
    MIN_MATRIX_SIZE,
    applyMatrixPreset,
    clearMatrix,
    fillIdentity,
    getMatrixEntry,
    getMatrixError,
    getMatrixOp,
    getMatrixSize,
    runMatrixOp,
    setMatrixEntry,
    setMatrixOp,
    setMatrixSize,
    type MatrixOp,
  } from '../state/matrix-state.svelte'

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
      <span class="dim">阶数 n</span>
      <input
        type="number"
        class="size-input"
        min={MIN_MATRIX_SIZE}
        max={MAX_MATRIX_SIZE}
        step="1"
        data-testid="matrix-size-n"
        value={getMatrixSize()}
        oninput={(event) => setMatrixSize(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <span class="dim">（{MIN_MATRIX_SIZE} ~ {MAX_MATRIX_SIZE} 阶）</span>
    </div>

    <div class="grid-wrap">
      {#each rows as row, r (r)}
        <div class="grid-row">
          {#each row as index, c (c)}
            <input
              type="number"
              step="any"
              class="cell"
              class:compact={size >= 5}
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
    <div class="row">
      <span class="dim">编辑</span>
      <button type="button" data-testid="matrix-clear" onclick={() => clearMatrix()}>清零</button>
      <button type="button" data-testid="matrix-identity" onclick={() => fillIdentity()}
        >单位矩阵</button
      >
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
      <button
        type="button"
        class="run btn-primary"
        data-testid="matrix-run"
        onclick={() => runMatrixOp()}>计算</button
      >
    </div>
    {#if getMatrixError()}
      <div class="matrix-error" data-testid="matrix-error">{getMatrixError()}</div>
    {/if}
    <div class="hint">
      画布实时显示当前矩阵的变换（阶数 ≥ 2 时取左上 2×2 块）；支持 {MIN_MATRIX_SIZE} ~ {MAX_MATRIX_SIZE}
      阶矩阵的 LU / QR / 相似对角化 / 行列式·秩·逆；「计算」后在右侧查看结果与验证残差。
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
  .grid-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .grid-row {
    display: flex;
    gap: 4px;
  }
  .size-input {
    width: 64px;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    text-align: center;
  }
  .cell {
    width: 100%;
    min-width: 0;
    max-width: 64px;
    font-family: ui-monospace, Consolas, monospace;
    font-size: 12px;
    text-align: center;
  }
  .cell.compact {
    font-size: 10px;
    padding: 0 1px;
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
