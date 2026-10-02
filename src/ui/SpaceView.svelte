<script lang="ts">
  /**
   * 3D 视图（v0.8）：常驻挂载的 WebGL 画布（首次激活时懒初始化 three 场景）；
   * - store 订阅驱动对象同步；视图选项经 space-state revision 驱动重建；
   * - ResizeObserver → 场景尺寸；rAF 连续渲染循环（OrbitControls 阻尼需要）；
   * - 切平面模式：在曲面上左键拖动 = 移动切点（期间暂停轨道控制），空白拖动仍为旋转；
   * - 导出：PNG 截图 / 旋转 GIF（命令通道由 SpacePanel 发起）；
   * - 上下文丢失显示提示并等待恢复（恢复后全量重建对象）。
   */
  import { onMount, onDestroy } from 'svelte'
  import { GIFEncoder, applyPalette, quantize } from 'gifenc'
  import type { AppStore } from '../state/store'
  import type { AppState, SpaceObject } from '../state/types'
  import { createSpaceScene, isWebGLAvailable, type SpaceScene } from '../render3d/scene'
  import { downloadBlob, timestampName } from '../export/download'
  import {
    getExportRequest,
    getGifFps,
    getGifFrames,
    getIntegralRegion,
    getSpaceOptions,
    getSpaceRevision,
    isSpaceExporting,
    isTangentEnabled,
    loadCameraState,
    saveCameraState,
    setContextAvailable,
    setSpaceExporting,
    setTangentPoint,
  } from '../state/space-state.svelte'

  let { store, active }: { store: AppStore; active: boolean } = $props()

  let container: HTMLDivElement
  let canvasElement: HTMLCanvasElement | undefined = $state()
  let contextLost = $state(false)
  let webglAvailable = $state(true)
  let appState = $state<AppState | null>(null)
  let sceneReady = $state(false)

  let sceneRef: SpaceScene | null = null
  let resizeObserver: ResizeObserver | null = null
  let raf = 0

  function isSpaceObject(object: { type: string }): boolean {
    return (
      object.type === 'surface3d' ||
      object.type === 'curve3d' ||
      object.type === 'field3d' ||
      object.type === 'ode2d'
    )
  }

  function syncScene(): void {
    const scene = sceneRef
    const state = appState
    if (!scene || !state) return
    scene.update(state.doc.objects.filter(isSpaceObject) as SpaceObject[], getSpaceOptions())
    scene.setIntegralRegion(getIntegralRegion())
  }

  function resizeScene(): void {
    const scene = sceneRef
    if (!scene || !container) return
    const rect = container.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    scene.resize(rect.width, rect.height, Math.min(2, window.devicePixelRatio || 1))
  }

  function ensureScene(): void {
    if (sceneRef || !canvasElement || !webglAvailable) return
    sceneRef = createSpaceScene(canvasElement)
    sceneRef.setOnContextEvent((lost) => {
      contextLost = lost
      setContextAvailable(!lost)
      if (!lost) syncScene()
    })
    const saved = loadCameraState()
    if (saved) sceneRef.setCameraState(saved)
    resizeObserver = new ResizeObserver(() => resizeScene())
    resizeObserver.observe(container)
    resizeScene()
    sceneReady = true
    syncScene()
    if (raf === 0) raf = requestAnimationFrame(loop)
  }

  let lastFrameTime = 0

  function loop(now: number): void {
    // 限帧 ~33ms（约 30fps）：软件渲染/低端设备下控制 CPU 占用，交互无明显差异
    if (active && sceneReady && sceneRef && !contextLost && now - lastFrameTime >= 30) {
      lastFrameTime = now
      sceneRef.render()
    }
    raf = requestAnimationFrame(loop)
  }

  onMount(() => {
    webglAvailable = isWebGLAvailable()
    setContextAvailable(webglAvailable)
    const unsubscribe = store.subscribe((state) => {
      appState = state
    })
    appState = store.getState()
    return () => {
      unsubscribe()
    }
  })

  onDestroy(() => {
    if (raf !== 0) cancelAnimationFrame(raf)
    resizeObserver?.disconnect()
    if (sceneRef) {
      const state = sceneRef.getCameraState()
      if (state) saveCameraState(state.position, state.target)
      sceneRef.dispose()
      sceneRef = null
    }
  })

  // 首次进入 3D 模式时懒初始化
  $effect(() => {
    if (active) ensureScene()
  })

  // 选项/文档变化 → 场景同步
  $effect(() => {
    void getSpaceRevision()
    void appState
    if (sceneReady) syncScene()
  })

  // 离开模式时保存相机
  let lastActive = false
  $effect(() => {
    if (lastActive && !active && sceneRef) {
      const state = sceneRef.getCameraState()
      if (state) saveCameraState(state.position, state.target)
    }
    lastActive = active
  })

  // ---------- 切平面拖动 ----------
  let dragging = false

  function pointerRelative(event: PointerEvent): [number, number] {
    const rect = canvasElement!.getBoundingClientRect()
    return [event.clientX - rect.left, event.clientY - rect.top]
  }

  function onPointerDown(event: PointerEvent): void {
    if (!active || !isTangentEnabled() || !sceneRef || event.button !== 0) return
    const [px, py] = pointerRelative(event)
    const hit = sceneRef.pick(px, py)
    if (!hit) return
    dragging = true
    sceneRef.setControlsEnabled(false)
    setTangentPoint(hit[0], hit[1])
    canvasElement?.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging || !sceneRef) return
    const [px, py] = pointerRelative(event)
    const hit = sceneRef.pick(px, py)
    if (hit) setTangentPoint(hit[0], hit[1])
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging) return
    dragging = false
    sceneRef?.setControlsEnabled(true)
    canvasElement?.releasePointerCapture(event.pointerId)
  }

  // ---------- 导出（命令通道） ----------
  async function exportPng(): Promise<void> {
    const scene = sceneRef
    if (!scene) return
    const blob = await scene.snapshot()
    if (blob) downloadBlob(blob, timestampName('png'))
  }

  async function exportGif(): Promise<void> {
    const scene = sceneRef
    if (!scene) return
    const initial = scene.getCameraState()
    const frames = getGifFrames()
    const delay = Math.max(20, Math.round(1000 / getGifFps()))
    const gif = GIFEncoder()
    for (let i = 0; i < frames; i++) {
      scene.spinCamera(360 / frames)
      const frame = scene.captureFrame()
      // 降采样到 ≤ 420 宽（GIF 体积与量化成本控制）
      const scale = Math.max(1 / 4, Math.min(1, 420 / frame.width))
      const width = Math.max(2, Math.round(frame.width * scale))
      const height = Math.max(2, Math.round(frame.height * scale))
      const small = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y++) {
        const sy = Math.min(frame.height - 1, Math.floor(y / scale))
        for (let x = 0; x < width; x++) {
          const sx = Math.min(frame.width - 1, Math.floor(x / scale))
          const src = (sy * frame.width + sx) * 4
          const dst = (y * width + x) * 4
          small[dst] = frame.data[src] ?? 0
          small[dst + 1] = frame.data[src + 1] ?? 0
          small[dst + 2] = frame.data[src + 2] ?? 0
          small[dst + 3] = 255
        }
      }
      const palette = quantize(small, 256)
      const index = applyPalette(small, palette)
      gif.writeFrame(index, width, height, { palette, delay })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    gif.finish()
    if (initial) scene.setCameraState(initial)
    // Uint8Array.from 产生独立 ArrayBuffer（避免 SharedArrayBuffer 泛型不可赋 BlobPart）
    const bytes = Uint8Array.from(gif.bytes()).buffer
    downloadBlob(new Blob([bytes], { type: 'image/gif' }), timestampName('gif'))
  }

  // 导出命令通道：按 token 消账（同一请求只执行一次）；导出期间新请求排队
  // （exporting 变化会重触发本 effect，但 token 已消账 → 直接返回，不会重复执行）
  let handledExportToken = -1

  $effect(() => {
    const request = getExportRequest()
    if (!request || !sceneReady) return
    if (request.token === handledExportToken) return
    if (isSpaceExporting()) return
    handledExportToken = request.token
    if (request.kind === 'reset') {
      sceneRef?.resetCamera()
      return
    }
    setSpaceExporting(true)
    const run = request.kind === 'png' ? exportPng() : exportGif()
    void run
      .catch(() => {})
      .finally(() => {
        setSpaceExporting(false)
      })
  })
</script>

<div class="space-view" class:active bind:this={container}>
  <canvas
    bind:this={canvasElement}
    data-testid="space-canvas"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  ></canvas>

  {#if !webglAvailable}
    <div class="overlay" data-testid="space-unavailable">
      当前环境不支持 WebGL：3D 视图不可用（检测到软件/受限渲染环境）。<br />
      其余模式（函数绘图 / 图论 / 统计）不受影响。
    </div>
  {:else if contextLost}
    <div class="overlay" data-testid="space-context-lost">
      WebGL 上下文丢失（显卡驱动或资源原因）。<br />恢复后视图将自动重建…
    </div>
  {:else if isSpaceExporting()}
    <div class="overlay" data-testid="space-exporting">
      正在导出（相机临时旋转取帧）…<br />完成后自动恢复视角
    </div>
  {/if}

  {#if webglAvailable && !contextLost && isTangentEnabled()}
    <div class="hint-bar" data-testid="space-tangent-hint">
      切平面：在曲面上左键拖动移动切点；空白处拖动仍为旋转视图
    </div>
  {/if}
</div>

<style>
  .space-view {
    position: absolute;
    inset: 0;
    display: none;
  }

  .space-view.active {
    display: block;
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: grab;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--text-dim);
    background: rgba(15, 23, 42, 0.92);
  }

  .hint-bar {
    position: absolute;
    left: 12px;
    bottom: 12px;
    padding: 4px 10px;
    font-size: 12px;
    color: var(--text-dim);
    background: rgba(11, 18, 32, 0.92);
    border: 1px solid var(--border);
    border-radius: 6px;
    pointer-events: none;
  }
</style>
