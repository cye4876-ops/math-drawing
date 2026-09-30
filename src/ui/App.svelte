<script lang="ts">
  import { mount, onMount, unmount } from 'svelte'
  import { createCanvasLayer } from '../render/canvas-layer'
  import { createDomLayer } from '../render/dom-layer'
  import { drawGrid } from '../render/grid-renderer'
  import { createStore } from '../state/store'
  import type { Point2 } from '../state/types'
  import { attachInteractions, attachKeyboardShortcuts } from './interactions'
  import MarkerLayer from './MarkerLayer.svelte'
  import StatusBar from './StatusBar.svelte'
  import Toolbar from './Toolbar.svelte'

  const store = createStore()

  let stageElement: HTMLDivElement
  let canUndo = $state(false)
  let canRedo = $state(false)
  let cursor = $state<Point2 | null>(null)
  let scale = $state(store.getView().scale)

  onMount(() => {
    // 分层渲染：Canvas 层（网格）+ DOM 覆盖层（标记点）
    const canvasLayer = createCanvasLayer(stageElement, (ctx, size, dpr) => {
      drawGrid(ctx, store.getView(), size, dpr)
    })
    const domLayer = createDomLayer(stageElement)

    const markers = mount(MarkerLayer, {
      target: domLayer.element,
      props: { store },
    })

    const unsubscribe = store.subscribe((state) => {
      canUndo = store.canUndo()
      canRedo = store.canRedo()
      scale = state.view.scale
      canvasLayer.requestRender()
    })

    const unbindInteractions = attachInteractions({
      container: stageElement,
      store,
      getSize: () => canvasLayer.getSize(),
      onCursorMove: (position) => {
        cursor = position
      },
    })
    const unbindKeyboard = attachKeyboardShortcuts(store)

    return () => {
      unbindKeyboard()
      unbindInteractions()
      unsubscribe()
      unmount(markers)
      domLayer.destroy()
      canvasLayer.destroy()
    }
  })
</script>

<div class="app">
  <Toolbar {store} {canUndo} {canRedo} />
  <div class="stage" bind:this={stageElement}></div>
  <StatusBar {cursor} {scale} />
</div>
