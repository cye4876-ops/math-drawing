<script lang="ts">
  import { mathToScreen } from '../core/transform'
  import type { AppStore } from '../state/store'
  import type { AppState, MarkerPoint, Size } from '../state/types'

  let {
    store,
    getMode,
  }: {
    store: AppStore
    /** 当前界面模式：标记点仅在函数绘图模式显示（图论模式隐藏） */
    getMode: () => 'plot' | 'graph'
  } = $props()

  let appState = $state<AppState | null>(null)
  let host = $state<HTMLDivElement | null>(null)
  let size = $state<Size>({ width: 0, height: 0 })

  $effect(() => {
    const unsubscribe = store.subscribe((state) => {
      appState = state
    })
    appState = store.getState()
    return unsubscribe
  })

  $effect(() => {
    const element = host
    if (!element) return

    const update = (): void => {
      size = { width: element.clientWidth, height: element.clientHeight }
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return () => observer.disconnect()
  })

  const markers = $derived.by(() => {
    const state = appState
    if (!state) return []
    if (getMode() !== 'plot') return []
    return state.doc.objects
      .filter((object): object is MarkerPoint => object.type === 'marker')
      .map((object) => {
        const screen = mathToScreen(state.view, size, object)
        return {
          id: object.id,
          left: screen.x,
          top: screen.y,
          label: `(${object.x}, ${object.y})`,
        }
      })
  })
</script>

<div class="marker-layer" bind:this={host}>
  {#each markers as marker (marker.id)}
    <div class="marker" data-testid="marker" style="left: {marker.left}px; top: {marker.top}px">
      <span class="marker-dot"></span>
      <span class="marker-label">{marker.label}</span>
    </div>
  {/each}
</div>

<style>
  .marker-layer {
    position: absolute;
    inset: 0;
  }

  .marker {
    position: absolute;
    transform: translate(-50%, -50%);
  }

  .marker-dot {
    display: block;
    box-sizing: border-box;
    width: 10px;
    height: 10px;
    margin: 0 auto;
    border: 2px solid #dc2626;
    border-radius: 50%;
    background: rgba(220, 38, 38, 0.15);
  }

  .marker-label {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 2px;
    padding: 0 4px;
    font-family: var(--mono);
    font-size: 11px;
    color: #b91c1c;
    white-space: nowrap;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 3px;
  }
</style>
