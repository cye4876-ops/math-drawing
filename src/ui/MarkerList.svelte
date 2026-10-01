<script lang="ts">
  import type { AppStore } from '../state/store'
  import type { AppState, MarkerPoint } from '../state/types'
  import { formatNum, parseCoordinate } from '../tools/helpers'

  let { store }: { store: AppStore } = $props()

  let appState = $state<AppState | null>(null)
  $effect(() => {
    appState = store.getState()
    return store.subscribe((state) => {
      appState = state
    })
  })

  const markers = $derived(
    (appState?.doc.objects ?? []).filter(
      (object): object is MarkerPoint => object.type === 'marker',
    ),
  )

  let draftX = $state('')
  let draftY = $state('')
  let error = $state('')

  function addMarker(): void {
    const x = parseCoordinate(draftX)
    const y = parseCoordinate(draftY)
    if (x === null || y === null) {
      error = '坐标无法解析：支持数字与常量表达式（如 1.5、pi/2、-e）'
      return
    }
    error = ''
    store.addMarker(x, y)
    draftX = ''
    draftY = ''
  }

  function removeMarker(id: string): void {
    store.removeMarker(id)
  }
</script>

<div class="marker-panel" aria-label="标记点">
  <div class="panel-header">
    <span>标记点</span>
    <span class="count">{markers.length}</span>
  </div>

  <div class="add-row">
    <input
      data-testid="marker-x-input"
      type="text"
      placeholder="x，如 1、pi/2"
      bind:value={draftX}
      onkeydown={(e) => {
        if (e.key === 'Enter') addMarker()
      }}
    />
    <input
      data-testid="marker-y-input"
      type="text"
      placeholder="y，如 -2、e"
      bind:value={draftY}
      onkeydown={(e) => {
        if (e.key === 'Enter') addMarker()
      }}
    />
    <button type="button" data-testid="marker-add" onclick={addMarker}>添加</button>
  </div>
  {#if error}
    <p class="error" data-testid="marker-error">{error}</p>
  {/if}

  {#if markers.length > 0}
    <div class="marker-items" data-testid="marker-items">
      {#each markers as marker (marker.id)}
        <div class="marker-item" data-testid="marker-item">
          <span class="coords">({formatNum(marker.x)}, {formatNum(marker.y)})</span>
          <button
            type="button"
            class="remove"
            data-testid="marker-remove"
            title="删除标记点"
            onclick={() => removeMarker(marker.id)}>✕</button
          >
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .marker-panel {
    flex: 0 0 auto;
    max-height: 32%;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--border);
    border-top: 1px solid var(--border);
    background: var(--bg);
    box-sizing: border-box;
    padding: 8px 12px 10px;
    min-height: 0;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    padding-bottom: 6px;
  }

  .count {
    color: var(--text-dim);
    font-weight: 400;
  }

  .add-row {
    display: flex;
    gap: 4px;
  }

  .add-row input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 12px;
    padding: 3px 6px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--text);
  }

  .add-row input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .add-row button {
    font: inherit;
    font-size: 12px;
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }

  .add-row button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .error {
    margin: 4px 0 0;
    color: #dc2626;
    font-size: 12px;
  }

  .marker-items {
    overflow-y: auto;
    margin-top: 6px;
    min-height: 0;
  }

  .marker-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 0;
    font-family: var(--mono);
    font-size: 12px;
  }

  .remove {
    border: none;
    background: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
  }

  .remove:hover {
    color: #dc2626;
  }
</style>
