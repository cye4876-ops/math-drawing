<script lang="ts">
  import { mount, onMount, unmount } from 'svelte'
  import { createCanvasLayer, type CanvasLayer } from '../render/canvas-layer'
  import { createSceneRenderer, type SceneRenderer } from '../render/scene'
  import { graphObjectFromDsl } from '../graph/dsl-to-doc'
  import { createDomLayer } from '../render/dom-layer'
  import { drawGrid } from '../render/grid-renderer'
  import { createView } from '../core/transform'
  import { type ViewRangeInput, exactView } from '../render/viewport'
  import { createStore, type AppStore } from '../state/store'
  import type { Point2 } from '../state/types'
  import {
    ToolRegistry,
    createGraphTool,
    createIntegralTool,
    createIntersectionTool,
    createRiemannTool,
    createRootsTool,
    createTangentTool,
    createTaylorTool,
    createTraceCursorTool,
  } from '../tools'
  import { attachInteractions, attachKeyboardShortcuts } from './interactions'
  import CurveList from './CurveList.svelte'
  import GraphPanel from './GraphPanel.svelte'
  import MarkerLayer from './MarkerLayer.svelte'
  import StatusBar from './StatusBar.svelte'
  import MarkerList from './MarkerList.svelte'
  import Toolbar from './Toolbar.svelte'
  import ToolsPanel from './ToolsPanel.svelte'

  const store = createStore()
  let canvasLayerRef: CanvasLayer | null = null
  let sceneRef: SceneRenderer | null = null

  // 工具注册表（v0.4）：ctx 延迟绑定到画布层与场景渲染器
  const registry = new ToolRegistry({
    store,
    getView: () => store.getView(),
    getSize: () => canvasLayerRef?.getSize() ?? { width: 0, height: 0 },
    requestRender: () => canvasLayerRef?.requestRender(),
    notify: () => registry.notify(),
    hitTest: (screen, maxDistancePx) => {
      const size = canvasLayerRef?.getSize()
      if (!sceneRef || !size || size.width <= 0) return null
      return sceneRef.hitTest(
        store.getState().doc.objects,
        screen,
        { view: store.getView(), size },
        maxDistancePx,
      )
    },
  })
  registry
    .register(createTraceCursorTool())
    .register(createTangentTool())
    .register(createRootsTool())
    .register(createIntersectionTool())
    .register(createIntegralTool())
    .register(createRiemannTool())
    .register(createTaylorTool())
    .register(createGraphTool())

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
    // range 参数（精确视口）：在画布尺寸就绪后于 onMount 中应用
    const graphParam = readRawParam(location.search, 'graph')
    if (graphParam) {
      const { graph } = graphObjectFromDsl(graphParam)
      if (graph) target.addGraph(graph.nodes, graph.edges, graph.name)
    }

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

  /** 界面模式（工具条左上角切换）：plot = 函数绘图，graph = 图论绘图；?mode= / ?graph= 可指定 */
  const initialMode: 'plot' | 'graph' =
    typeof location !== 'undefined' &&
    (readRawParam(location.search, 'mode') === 'graph' ||
      readRawParam(location.search, 'graph') !== null)
      ? 'graph'
      : 'plot'
  let mode = $state<'plot' | 'graph'>(initialMode)

  function setMode(next: 'plot' | 'graph'): void {
    if (mode === next) return
    mode = next
    // 切模式时取消激活工具（工具按钮列表会变化）
    registry.activate(null)
  }

  let scale = $state(store.getView().scaleX)
  let coordType = $state(store.getView().coordType)

  onMount(() => {
    // 分层渲染：Canvas 层（网格 + 场景元素 + 工具覆盖层）+ DOM 覆盖层（标记点与面板）
    const scene = createSceneRenderer()
    sceneRef = scene
    let boundLayer: CanvasLayer | null = null
    const canvasLayer = createCanvasLayer(stageElement, (ctx, size, dpr) => {
      const state = store.getState()
      drawGrid(ctx, state.view, size, dpr)
      scene.draw(ctx, state.doc.objects, { view: state.view, size })
      registry.drawOverlay(ctx)
      if (registry.isAnimating()) boundLayer?.requestRender()
    })
    boundLayer = canvasLayer
    canvasLayerRef = canvasLayer
    const domLayer = createDomLayer(stageElement)

    const markers = mount(MarkerLayer, {
      target: domLayer.element,
      props: { store },
    })

    const syncUi = (): void => {
      canUndo = store.canUndo()
      canRedo = store.canRedo()
      const view = store.getView()
      scale = view.scaleX
      coordType = view.coordType
      canvasLayer.requestRender()
      // 文档变化时刷新工具读数/控件（如撤销恢复图、拖动预览中的顶点/边统计）
      registry.notify()
    }
    const unsubscribe = store.subscribe(syncUi)
    // 订阅后立即同步一次（URL 预载等「订阅前已提交」的操作也要反映到 UI）
    syncUi()

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
      toolHooks: {
        down: (e) => registry.handlePointerDown(e),
        move: (e) => registry.handlePointerMove(e),
        up: (e) => registry.handlePointerUp(e),
      },
    })
    const unbindKeyboard = attachKeyboardShortcuts(store, {
      onKey: (event) => {
        if (registry.handleKeyDown(event)) {
          // 消费后阻止默认行为（空格滚动页面 / 按钮被空格二次触发）
          event.preventDefault()
          return true
        }
        if (event.key === 'Escape' && registry.getActive()) {
          registry.activate(null)
          return true
        }
        return false
      },
    })

    return () => {
      unbindKeyboard()
      unbindInteractions()
      unsubscribe()
      unmount(markers)
      domLayer.destroy()
      canvasLayer.destroy()
      sceneRef = null
    }
  })
</script>

<div class="app">
  <Toolbar
    {store}
    {canUndo}
    {canRedo}
    {registry}
    {mode}
    onModeChange={setMode}
    getStageSize={() => canvasLayerRef?.getSize() ?? { width: 0, height: 0 }}
  />
  <div class="main">
    <div class="stage" bind:this={stageElement}></div>
    <div class="side-column">
      {#if mode === 'plot'}
        <CurveList {store} />
        <MarkerList {store} />
      {:else}
        <GraphPanel {store} />
      {/if}
      <ToolsPanel {registry} />
    </div>
  </div>
  <StatusBar {cursor} {scale} {coordType} />
</div>
