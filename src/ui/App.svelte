<script lang="ts">
  import { mount, onMount, unmount } from 'svelte'
  import { createCanvasLayer, type CanvasLayer } from '../render/canvas-layer'
  import { drawCurves } from '../render/curve-renderer'
  import { createDomLayer } from '../render/dom-layer'
  import { drawGrid } from '../render/grid-renderer'
  import { createView } from '../core/transform'
  import { type ViewRangeInput, exactView } from '../render/viewport'
  import { createStore, type AppStore } from '../state/store'
  import type { Point2 } from '../state/types'
  import { attachInteractions, attachKeyboardShortcuts } from './interactions'
  import CurveList from './CurveList.svelte'
  import MarkerLayer from './MarkerLayer.svelte'
  import StatusBar from './StatusBar.svelte'
  import Toolbar from './Toolbar.svelte'

  const store = createStore()
  let stageSizeRef: CanvasLayer | null = null

  /**
   * URL 预载（自动化测试与基准截图用）：
   * - ?curves=sin(x);i:x^2+y^2-4;p:cos(t):sin(t);r:1+cos(theta)
   *   （无前缀 = 显函数；i = 隐函数；p = 参数方程 x(t):y(t)；r = 极坐标 r(θ)）
   * - ?view=centerX,centerY,scaleX[,scaleY]
   * - ?range=minX,maxX,minY,maxY（精确视口，等画布尺寸就绪后应用；非等比）
   *
   * 注意：不使用 URLSearchParams 解析（它会把 `+` 当作空格，破坏表达式），
   * 改用原始查询串 + decodeURIComponent（脚本可用 %2B 表示字面加号）。
   */
  function readRawParam(search: string, key: string): string | null {
    const query = search.startsWith('?') ? search.slice(1) : search
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=')
      if (eq < 0) continue
      if (pair.slice(0, eq) !== key) continue
      const raw = pair.slice(eq + 1)
      try {
        return decodeURIComponent(raw)
      } catch {
        return raw
      }
    }
    return null
  }

  function preloadFromUrl(target: AppStore): ViewRangeInput | null {
    if (typeof location === 'undefined') return null
    const viewParam = readRawParam(location.search, 'view')
    if (viewParam) {
      const parts = viewParam.split(',').map(Number)
      const [cx = 0, cy = 0, sx = 80, sy] = parts
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(sx)) {
        const base = createView(cx, cy, sx)
        target.setView({
          ...base,
          scaleY: sy !== undefined && Number.isFinite(sy) ? sy : sx,
        })
      }
    }
    const curvesParam = readRawParam(location.search, 'curves')
    if (curvesParam) {
      for (const item of curvesParam.split(';')) {
        const spec = item.trim()
        if (!spec) continue
        const [head = '', ...rest] = spec.split(':')
        const first = rest[0]
        const second = rest[1]
        if (head === 'i' && first !== undefined && first !== '') {
          target.addCurve({ kind: 'implicit', expr: rest.join(':') })
        } else if (head === 'p' && first !== undefined && second !== undefined) {
          target.addCurve({ kind: 'parametric', expr: first, expr2: rest.slice(1).join(':') })
        } else if (head === 'r' && first !== undefined && first !== '') {
          target.addCurve({ kind: 'polar', expr: rest.join(':') })
        } else {
          target.addCurve({ kind: 'explicit', expr: spec })
        }
      }
    }

    // range 参数（精确视口）：在画布尺寸就绪后于 onMount 中应用
    const rangeParam = readRawParam(location.search, 'range')
    if (rangeParam) {
      const parts = rangeParam.split(',').map(Number)
      const [minX = 0, maxX = 0, minY = 0, maxY = 0] = parts
      if (
        Number.isFinite(minX) &&
        Number.isFinite(maxX) &&
        Number.isFinite(minY) &&
        Number.isFinite(maxY) &&
        maxX > minX &&
        maxY > minY
      ) {
        return { minX, maxX, minY, maxY }
      }
    }
    return null
  }

  let stageElement: HTMLDivElement
  let canUndo = $state(false)
  let canRedo = $state(false)
  let cursor = $state<Point2 | null>(null)

  // 预载必须在组件状态初始化之前执行（否则初始 UI 状态捕获不到）
  const pendingRange = preloadFromUrl(store)

  let scale = $state(store.getView().scaleX)

  onMount(() => {
    // 分层渲染：Canvas 层（网格 + 曲线）+ DOM 覆盖层（标记点与面板）
    const canvasLayer = createCanvasLayer(stageElement, (ctx, size, dpr) => {
      const state = store.getState()
      drawGrid(ctx, state.view, size, dpr)
      drawCurves(ctx, store.getCurves(), state.view, size)
    })
    stageSizeRef = canvasLayer
    const domLayer = createDomLayer(stageElement)

    const markers = mount(MarkerLayer, {
      target: domLayer.element,
      props: { store },
    })

    const unsubscribe = store.subscribe((state) => {
      canUndo = store.canUndo()
      canRedo = store.canRedo()
      scale = state.view.scaleX
      canvasLayer.requestRender()
    })

    // range 参数：拿到真实画布尺寸后换算精确视口（非等比，与 JSXGraph boundingBox 语义一致）
    if (pendingRange) {
      const base = { ...store.getView(), equalAspect: false }
      const next = exactView(base, canvasLayer.getSize(), pendingRange)
      if (next !== base) store.setView(next)
    }

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
  <Toolbar
    {store}
    {canUndo}
    {canRedo}
    getStageSize={() => stageSizeRef?.getSize() ?? { width: 0, height: 0 }}
  />
  <div class="main">
    <div class="stage" bind:this={stageElement}></div>
    <CurveList {store} />
  </div>
  <StatusBar {cursor} {scale} />
</div>
