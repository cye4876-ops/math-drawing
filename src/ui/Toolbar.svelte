<script lang="ts">
  import type { AppStore } from '../state/store'

  let { store, canUndo, canRedo }: { store: AppStore; canUndo: boolean; canRedo: boolean } =
    $props()

  function addMarker(): void {
    const view = store.getView()
    store.addMarker(view.centerX, view.centerY)
  }
</script>

<div class="toolbar" role="toolbar" aria-label="工具条">
  <button type="button" data-testid="add-marker" onclick={addMarker}>添加标记点</button>
  <button
    type="button"
    data-testid="undo"
    title="撤销（Ctrl+Z）"
    disabled={!canUndo}
    onclick={() => store.undo()}>撤销</button
  >
  <button
    type="button"
    data-testid="redo"
    title="重做（Ctrl+Shift+Z）"
    disabled={!canRedo}
    onclick={() => store.redo()}>重做</button
  >
</div>
