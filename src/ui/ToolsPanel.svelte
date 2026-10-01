<script lang="ts">
  import type { ToolControl, ToolReadout, ToolRegistry } from '../tools/tool-registry'

  let { registry }: { registry: ToolRegistry } = $props()

  let activeId = $state<string | null>(null)
  let readout = $state<ToolReadout | null>(null)
  let controls = $state<ToolControl[]>([])

  $effect(() => {
    const sync = (): void => {
      activeId = registry.getActive()?.id ?? null
      readout = registry.getReadout()
      controls = registry.getControls()
    }
    sync()
    return registry.subscribe(sync)
  })
</script>

{#if activeId}
  <div class="tool-panel" data-testid="tools-readout">
    {#if readout}
      <h4 data-testid="tool-readout-title">{readout.title}</h4>
      {#each readout.rows as row (row.label)}
        <div class="row">
          <span class="label">{row.label}</span>
          <span class="value" data-testid="tool-readout-value">{row.value}</span>
        </div>
      {/each}
      {#if readout.note}
        <p class="note">{readout.note}</p>
      {/if}
    {/if}

    {#each controls as control (control.id)}
      {#if control.kind === 'slider'}
        <label class="control slider">
          <span class="label">{control.label}</span>
          <input
            type="range"
            data-testid={`tool-control-${control.id}`}
            min={control.min}
            max={control.max}
            step={control.step}
            value={control.value}
            oninput={(e) =>
              registry.onControl(control.id, Number((e.currentTarget as HTMLInputElement).value))}
          />
          <span class="value">{control.valueText}</span>
        </label>
      {:else if control.kind === 'text'}
        <label class="control text">
          <span class="label">{control.label}</span>
          <input
            type="text"
            data-testid={`tool-control-${control.id}`}
            value={control.value}
            placeholder={control.placeholder ?? ''}
            onkeydown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
            }}
            onchange={(e) =>
              registry.onControl(control.id, (e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        {#if control.chips && control.chips.length > 0}
          <div class="chips">
            {#each control.chips as chip (chip.value)}
              <button
                type="button"
                data-testid={`tool-chip-${control.id}-${chip.value}`}
                title={`输入 ${chip.value}`}
                onclick={() => registry.onControl(control.id, chip.value)}>{chip.label}</button
              >
            {/each}
          </div>
        {/if}
      {:else if control.kind === 'buttons'}
        <div class="control buttons">
          <span class="label">{control.label}</span>
          <div class="button-row">
            {#each control.options as option (option.value)}
              <button
                type="button"
                data-testid={`tool-control-${control.id}-${option.value}`}
                class:active={option.value === control.value}
                onclick={() => registry.onControl(control.id, option.value)}>{option.label}</button
              >
            {/each}
          </div>
        </div>
      {:else if control.kind === 'actions'}
        <div class="control actions">
          <div class="button-row">
            {#each control.buttons as button (button.id)}
              <button
                type="button"
                data-testid={`tool-action-${button.id}`}
                disabled={button.disabled}
                onclick={() => registry.onControl(button.id)}>{button.label}</button
              >
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .tool-panel {
    flex: 0 0 auto;
    max-height: 46%;
    overflow-y: auto;
    background: var(--bg);
    border-left: 1px solid var(--border);
    border-top: 1px solid var(--border);
    padding: 10px 12px;
    font-size: 13px;
    box-sizing: border-box;
  }

  h4 {
    margin: 0 0 6px;
    font-size: 13px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 1px 0;
  }

  .label {
    color: var(--text-dim);
    white-space: nowrap;
  }

  .value {
    text-align: right;
    word-break: break-all;
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 6px 0 0;
    color: var(--text-dim);
    font-size: 12px;
    line-height: 1.4;
  }

  .control {
    margin-top: 8px;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .slider input {
    flex: 1;
  }

  .text {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .text input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 12px;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
  }

  .text input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0 0;
  }

  .chips button {
    font: inherit;
    font-size: 12px;
    padding: 1px 7px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg);
    color: var(--text-dim);
    cursor: pointer;
  }

  .chips button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .buttons .button-row,
  .actions .button-row {
    display: flex;
    gap: 4px;
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .button-row button {
    font: inherit;
    font-size: 12px;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }

  .button-row button.active {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(37, 99, 235, 0.06);
  }

  .button-row button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
