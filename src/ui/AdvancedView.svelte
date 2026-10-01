<script lang="ts">
  import { onMount } from 'svelte'
  import katex from 'katex'
  import 'katex/dist/katex.min.css'
  import {
    getModule,
    getRevision,
    getComplexMode,
    getComplexExpr,
    getComplexSpan,
    setComplexSpan,
    getComplexCenter,
    setComplexCenter,
    resetComplexView,
    getComplexResolution,
    getComplexColormap,
    getComplexGrids,
    getMobiusPreset,
    getMobiusExtent,
    getBranchKind,
    getBranchIndex,
    getContourExpr,
    getContourRadius,
    getNumberViz,
    getUlamSize,
    getSacksCount,
    getModularN,
    getModularMode,
    getCollatzLimit,
    getPrimeLimit,
    getAutomataViz,
    getLifeSpeed,
    isLifePlaying,
    getFractalIter,
    getFractalColormap,
    getFractalView,
    setFractalView,
    resetFractalView,
    getJuliaC,
    ensureLifeSim,
    getLifeSim,
    toggleLifeCell,
    getSymbolicOutput,
  } from '../state/advanced-state.svelte'
  import { compileComplexExpression, type ComplexFn } from '../complex/evaluate'
  import { renderDomainColoring } from '../complex/domain-coloring'
  import { MOBIUS_PRESETS, mappedGrid, mappedCircle } from '../complex/mobius'
  import { branchCount, branchFn } from '../complex/riemann-surface'
  import { contourIntegral } from '../complex/contour'
  import { renderUlam, renderSacks } from '../numbertheory/ulam'
  import { primeCurvePoints } from '../numbertheory/primes'
  import { renderModularPattern } from '../numbertheory/modular'
  import { renderCollatzHeat } from '../numbertheory/collatz'
  import { renderLife } from '../cellular/life'
  import { colorizeFractal, renderFractal } from '../fractal/mandelbrot'
  import { downloadBlob } from '../export/download'
  import type { Interval } from '../symbolic/inequality'

  let { active = false }: { active?: boolean } = $props()

  let containerEl: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let latexContainer: HTMLDivElement | undefined = $state()
  let offscreen: HTMLCanvasElement | null = null
  let renderMs = $state(0)
  let errorText = $state('')
  let contourText = $state('')

  /** 位图 → 画布（离屏 putImageData + 拉伸绘制） */
  function blit(data: Uint8ClampedArray, width: number, height: number, smooth = true): void {
    const canvas = canvasEl
    const context = canvas?.getContext('2d')
    if (!canvas || !context || width <= 0 || height <= 0) return
    if (!offscreen) offscreen = document.createElement('canvas')
    offscreen.width = width
    offscreen.height = height
    const offContext = offscreen.getContext('2d')
    if (!offContext) return
    // 拷贝为 ArrayBuffer 底层数组（满足 ImageData 构造签名）
    offContext.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)
    context.imageSmoothingEnabled = smooth
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(offscreen, 0, 0, canvas.width, canvas.height)
  }

  function compileOrReport(source: string): ComplexFn | null {
    const compiled = compileComplexExpression(source)
    if ('error' in compiled) {
      errorText = compiled.error
      return null
    }
    return compiled.fn
  }

  function fillBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.fillStyle = '#0b0e14'
    context.fillRect(0, 0, width, height)
  }

  // ---------- 复变 ----------

  function renderComplex(context: CanvasRenderingContext2D, width: number, height: number): void {
    const mode = getComplexMode()
    if (mode === 'domain' || mode === 'branch') {
      const fn =
        mode === 'domain'
          ? compileOrReport(getComplexExpr())
          : branchFn(getBranchKind(), Math.min(getBranchIndex(), branchCount(getBranchKind()) - 1))
      if (!fn) {
        fillBackground(context, width, height)
        return
      }
      const resolution = dragging ? Math.min(256, getComplexResolution()) : getComplexResolution()
      const pixelWidth = Math.max(32, Math.min(width, resolution))
      const pixelHeight = Math.max(32, Math.min(height, Math.round((resolution * height) / width)))
      const span = getComplexSpan()
      const center = getComplexCenter()
      const data = renderDomainColoring(fn, {
        width: pixelWidth,
        height: pixelHeight,
        centerRe: center.re,
        centerIm: center.im,
        pixelsPerUnit: pixelWidth / span,
        colormap: getComplexColormap(),
        phaseGrid: getComplexGrids(),
        modulusGrid: getComplexGrids(),
      })
      blit(data, pixelWidth, pixelHeight)
      return
    }
    if (mode === 'mobius') {
      const preset =
        MOBIUS_PRESETS.find((item) => item.id === getMobiusPreset()) ?? MOBIUS_PRESETS[0]!
      const extent = getMobiusExtent()
      const scale = Math.min(width, height) / (4 * extent)
      const cx = width / 2
      const cy = height / 2
      fillBackground(context, width, height)
      const toPixel = (point: { x: number; y: number }): [number, number] => [
        cx + point.x * scale,
        cy - point.y * scale,
      ]
      // 映射后的网格（保角性）
      context.strokeStyle = 'rgba(120, 220, 255, 0.75)'
      context.lineWidth = 1
      for (const segment of mappedGrid(preset.params, extent, extent / 6, extent * 6)) {
        context.beginPath()
        segment.forEach((point, index) => {
          const [px, py] = toPixel(point)
          if (index === 0) context.moveTo(px, py)
          else context.lineTo(px, py)
        })
        context.stroke()
      }
      // 单位圆的像（圆 → 圆/直线演示）
      context.strokeStyle = 'rgba(255, 190, 90, 0.95)'
      context.lineWidth = 1.5
      for (const segment of mappedCircle(preset.params, { re: 0, im: 0 }, 1, extent * 6)) {
        context.beginPath()
        segment.forEach((point, index) => {
          const [px, py] = toPixel(point)
          if (index === 0) context.moveTo(px, py)
          else context.lineTo(px, py)
        })
        context.stroke()
      }
      return
    }
    // contour
    const fn = compileOrReport(getContourExpr())
    const radius = getContourRadius()
    fillBackground(context, width, height)
    if (!fn) return
    const halfSpan = Math.max(1.6, radius * 1.35)
    const scale = Math.min(width, height) / (2 * halfSpan)
    const cx = width / 2
    const cy = height / 2
    const toPixel = (re: number, im: number): [number, number] => [cx + re * scale, cy - im * scale]
    // 网格
    context.strokeStyle = 'rgba(70, 90, 130, 0.6)'
    context.lineWidth = 1
    for (let k = -Math.ceil(halfSpan); k <= Math.ceil(halfSpan); k++) {
      const [vx] = toPixel(k, 0)
      const [, hy] = toPixel(0, k)
      context.beginPath()
      context.moveTo(vx, 0)
      context.lineTo(vx, height)
      context.stroke()
      context.beginPath()
      context.moveTo(0, hy)
      context.lineTo(width, hy)
      context.stroke()
    }
    // 积分路径圆
    context.strokeStyle = 'rgba(255, 160, 90, 0.95)'
    context.lineWidth = 2
    context.beginPath()
    context.arc(cx, cy, radius * scale, 0, Math.PI * 2)
    context.stroke()
    context.fillStyle = 'rgba(255, 160, 90, 0.95)'
    context.beginPath()
    context.arc(cx, cy, 3, 0, Math.PI * 2)
    context.fill()
    // 数值积分结果
    const result = contourIntegral(fn, { center: { re: 0, im: 0 }, radius }, 2000)
    const re = result.value.re
    const im = result.value.im
    const format = (value: number): string => (Math.abs(value) < 5e-4 ? '0' : value.toPrecision(4))
    contourText = `∮ f dz ≈ ${format(re)} ${im >= 0 ? '+' : '−'} ${format(Math.abs(im))}i | |∮| = ${result.magnitude.toPrecision(4)} | 相位 = ${result.phase.toFixed(3)} rad`
  }

  // ---------- 数论 ----------

  function renderNumber(context: CanvasRenderingContext2D, width: number, height: number): void {
    const viz = getNumberViz()
    if (viz === 'ulam') {
      const size = getUlamSize()
      blit(renderUlam(size, 1), size, size, false)
      return
    }
    if (viz === 'primes') {
      // π(x) vs x/ln x：canvas 直接绘制两条曲线
      const limit = getPrimeLimit()
      const curve = primeCurvePoints(limit, width, height)
      fillBackground(context, width, height)
      context.strokeStyle = 'rgba(70, 90, 130, 0.35)'
      context.lineWidth = 1
      for (let k = 1; k < 5; k++) {
        const y = 12 + ((height - 24) * k) / 4
        context.beginPath()
        context.moveTo(34, y)
        context.lineTo(width - 4, y)
        context.stroke()
      }
      for (let k = 1; k < 8; k++) {
        const x = 34 + ((width - 38) * k) / 8
        context.beginPath()
        context.moveTo(x, 12)
        context.lineTo(x, height - 12)
        context.stroke()
      }
      context.strokeStyle = '#f5c542'
      context.lineWidth = 2
      context.beginPath()
      curve.pi.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
      context.stroke()
      context.strokeStyle = '#4fc3f7'
      context.lineWidth = 1.6
      context.beginPath()
      curve.xlog.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
      context.stroke()
      context.fillStyle = '#c7d4ea'
      context.font = '12px ui-monospace, monospace'
      context.fillText(
        `π(x)（金色） vs x/ln x（蓝色），x ≤ ${limit}，π(${limit}) = ${Math.round(curve.maxValue)}`,
        40,
        height - 20,
      )
      return
    }
    if (viz === 'sacks') {
      const count = getSacksCount()
      blit(renderSacks(count, 512, 512), 512, 512, true)
      return
    }
    if (viz === 'modular') {
      const n = getModularN()
      const cell = Math.max(1, Math.min(10, Math.floor(Math.min(width, height) / n)))
      const data = renderModularPattern(n, getModularMode(), cell, 'viridis')
      blit(data, n * cell, n * cell, false)
      return
    }
    const limit = getCollatzLimit()
    const data = renderCollatzHeat(limit, Math.max(64, width), Math.max(64, height), 'plasma')
    blit(data, Math.max(64, width), Math.max(64, height), true)
    void context
  }

  // ---------- 自动机 ----------

  function renderAutomata(context: CanvasRenderingContext2D, width: number, height: number): void {
    const viz = getAutomataViz()
    if (viz === 'life') {
      const gridW = Math.max(20, Math.min(480, Math.round(width / 2)))
      const gridH = Math.max(15, Math.min(360, Math.round(height / 2)))
      const sim = ensureLifeSim(gridW, gridH)
      const data = renderLife(sim, 2)
      blit(data, sim.width * 2, sim.height * 2, false)
      return
    }
    // 分形：两阶段渐进渲染（1/4 分辨率预览 → 异步全分辨率）
    const view = { ...getFractalView(), maxIter: getFractalIter() }
    const kind = viz === 'julia' ? 'julia' : 'mandelbrot'
    const juliaC = getJuliaC()
    const maxIter = getFractalIter()
    const colormap = getFractalColormap()
    const token = ++fractalToken
    const previewWidth = Math.max(16, Math.round(width / 4))
    const previewHeight = Math.max(16, Math.round(height / 4))
    const previewIters = renderFractal(view, previewWidth, previewHeight, kind, juliaC)
    blit(colorizeFractal(previewIters, maxIter, colormap), previewWidth, previewHeight, true)
    if (pendingFullRender !== null) window.clearTimeout(pendingFullRender)
    pendingFullRender = window.setTimeout(() => {
      pendingFullRender = null
      if (token !== fractalToken || !active) return
      const pixelWidth = Math.max(16, Math.round(width / 2))
      const pixelHeight = Math.max(16, Math.round(height / 2))
      const started = performance.now()
      const iters = renderFractal(view, pixelWidth, pixelHeight, kind, juliaC)
      blit(colorizeFractal(iters, maxIter, colormap), pixelWidth, pixelHeight, true)
      renderMs = Math.round(performance.now() - started)
    }, 25)
    void context
  }

  let fractalToken = 0
  let pendingFullRender: number | null = null

  function renderAll(): void {
    const canvas = canvasEl
    if (!canvas || !active) return
    const width = canvas.width
    const height = canvas.height
    if (width < 4 || height < 4) return
    const context = canvas.getContext('2d')
    if (!context) return
    const started = performance.now()
    errorText = ''
    contourText = ''
    const current = getModule()
    if (current === 'complex') renderComplex(context, width, height)
    else if (current === 'numbertheory') renderNumber(context, width, height)
    else if (current === 'automata') renderAutomata(context, width, height)
    else {
      context.clearRect(0, 0, width, height)
      fillBackground(context, width, height)
    }
    renderMs = Math.round(performance.now() - started)
  }

  // ---------- 生命游戏动画 ----------

  let lifeTimer: number | null = null

  function syncLifeTimer(): void {
    const shouldRun =
      active && getModule() === 'automata' && getAutomataViz() === 'life' && isLifePlaying()
    if (lifeTimer !== null) {
      window.clearInterval(lifeTimer)
      lifeTimer = null
    }
    if (shouldRun) {
      const interval = Math.max(30, Math.round(1000 / getLifeSpeed()))
      lifeTimer = window.setInterval(() => {
        getLifeSim()?.step()
        renderAll()
      }, interval)
    }
  }

  $effect(() => {
    // 对任意视图参数建立依赖
    getRevision()
    syncLifeTimer()
    renderAll()
    return () => {
      if (lifeTimer !== null) {
        window.clearInterval(lifeTimer)
        lifeTimer = null
      }
      if (pendingFullRender !== null) {
        window.clearTimeout(pendingFullRender)
        pendingFullRender = null
      }
    }
  })

  // 符号输出 → KaTeX 渲染（DOM API，避免 {@html}）
  $effect(() => {
    const container = latexContainer
    const output = getSymbolicOutput()
    getRevision()
    if (!container) return
    container.textContent = ''
    if (!output) return
    for (const item of output.latex) {
      const line = document.createElement('div')
      line.className = 'sym-latex'
      try {
        katex.render(item, line, { throwOnError: false, displayMode: true })
      } catch {
        line.textContent = item
      }
      container.append(line)
    }
  })

  onMount(() => {
    const resize = (): void => {
      const container = containerEl
      const canvas = canvasEl
      if (!container || !canvas) return
      const width = Math.max(64, container.clientWidth)
      const height = Math.max(64, container.clientHeight)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        renderAll()
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(containerEl)
    resize()
    return () => observer.disconnect()
  })

  function handleCanvasClick(event: MouseEvent): void {
    if (getModule() !== 'automata' || getAutomataViz() !== 'life') return
    const sim = getLifeSim()
    if (!sim) return
    const rect = canvasEl.getBoundingClientRect()
    const gx = Math.floor(((event.clientX - rect.left) / rect.width) * sim.width)
    const gy = Math.floor(((event.clientY - rect.top) / rect.height) * sim.height)
    if (gx >= 0 && gy >= 0 && gx < sim.width && gy < sim.height) toggleLifeCell(gx, gy)
  }

  // ---------- 复变拖拽平移（域着色/分支视图） ----------
  let dragging = false
  let dragStart = { x: 0, y: 0, re: 0, im: 0 }

  function isComplexPanMode(): boolean {
    return (
      getModule() === 'complex' && (getComplexMode() === 'domain' || getComplexMode() === 'branch')
    )
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!isComplexPanMode()) return
    dragging = true
    const center = getComplexCenter()
    dragStart = { x: event.clientX, y: event.clientY, re: center.re, im: center.im }
    canvasEl.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!dragging || !isComplexPanMode()) return
    const rect = canvasEl.getBoundingClientRect()
    const aspect = canvasEl.height / canvasEl.width
    const span = getComplexSpan()
    const unitsPerPxX = span / Math.max(1, rect.width)
    const unitsPerPxY = (span * aspect) / Math.max(1, rect.height)
    const dx = (event.clientX - dragStart.x) * unitsPerPxX
    const dy = (event.clientY - dragStart.y) * unitsPerPxY
    setComplexCenter(dragStart.re - dx, dragStart.im + dy)
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!dragging) return
    dragging = false
    try {
      canvasEl.releasePointerCapture(event.pointerId)
    } catch {
      // 指针已释放
    }
    setComplexCenter(getComplexCenter().re, getComplexCenter().im)
  }

  function handleWheel(event: WheelEvent): void {
    if (isComplexPanMode()) {
      event.preventDefault()
      const center = getComplexCenter()
      const span = getComplexSpan()
      const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15
      const rect = canvasEl.getBoundingClientRect()
      const aspect = canvasEl.height / canvasEl.width
      const fx = (event.clientX - rect.left) / rect.width - 0.5
      const fy = 0.5 - (event.clientY - rect.top) / rect.height
      const nextSpan = Math.max(1, Math.min(20, span * factor))
      setComplexSpan(nextSpan)
      setComplexCenter(
        center.re + fx * (span - nextSpan),
        center.im + fy * aspect * (span - nextSpan),
      )
      return
    }
    if (getModule() !== 'automata' || getAutomataViz() === 'life') return
    event.preventDefault()
    const { centerRe, centerIm, span } = getFractalView()
    const factor = event.deltaY > 0 ? 1.18 : 1 / 1.18
    const rect = canvasEl.getBoundingClientRect()
    const aspect = canvasEl.height / canvasEl.width
    const fx = (event.clientX - rect.left) / rect.width - 0.5
    const fy = 0.5 - (event.clientY - rect.top) / rect.height
    const nextSpan = Math.max(1e-6, Math.min(8, span * factor))
    setFractalView(
      centerRe + fx * (span - nextSpan),
      centerIm + fy * aspect * (span - nextSpan),
      nextSpan,
    )
  }

  function handleDoubleClick(): void {
    if (isComplexPanMode()) {
      resetComplexView()
      return
    }
    if (getModule() === 'automata' && getAutomataViz() !== 'life') resetFractalView()
  }

  function exportPng(): void {
    const canvas = canvasEl
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `advanced-${getModule()}.png`)
    }, 'image/png')
  }

  // ---------- 数轴（不等式解集） ----------

  function axisRange(intervals: Interval[]): { min: number; max: number } {
    const values: number[] = []
    for (const interval of intervals) {
      if (interval.lo !== null) values.push(interval.lo)
      if (interval.hi !== null) values.push(interval.hi)
    }
    if (values.length === 0) return { min: -5, max: 5 }
    let min = Math.min(...values)
    let max = Math.max(...values)
    if (max - min < 1e-9) {
      min -= 2
      max += 2
    }
    const pad = (max - min) * 0.15
    return { min: min - pad, max: max + pad }
  }

  function toAxisX(value: number, range: { min: number; max: number }): number {
    return 40 + ((value - range.min) / (range.max - range.min)) * 560
  }
</script>

<div
  class="advanced-view"
  class:hidden={!active}
  bind:this={containerEl}
  data-testid="advanced-view"
>
  <canvas
    bind:this={canvasEl}
    data-testid="advanced-canvas"
    class:symbolic={getModule() === 'symbolic'}
    onclick={handleCanvasClick}
    onwheel={handleWheel}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
    ondblclick={handleDoubleClick}
  ></canvas>
  {#if getModule() === 'symbolic'}
    <div class="symbolic-area" data-testid="adv-symbolic-result">
      {#if getSymbolicOutput()}
        {@const output = getSymbolicOutput()}
        <div class="sym-title">{output?.title}</div>
        <div class="sym-latex-list" bind:this={latexContainer}></div>
        {#if output?.intervals && output.intervals.length > 0}
          {@const range = axisRange(output.intervals)}
          <svg class="number-line" viewBox="0 0 640 70" data-testid="adv-number-line">
            <line class="axis" x1="40" y1="42" x2="600" y2="42" />
            {#each output.intervals as interval, index (index)}
              {@const loX = interval.lo === null ? 40 : toAxisX(interval.lo, range)}
              {@const hiX = interval.hi === null ? 600 : toAxisX(interval.hi, range)}
              <line class="segment" x1={loX} y1="42" x2={hiX} y2="42" />
              {#if interval.lo !== null}
                <circle class="endpoint" class:filled={interval.loClosed} cx={loX} cy="42" r="6" />
              {/if}
              {#if interval.hi !== null && (interval.lo === null || Math.abs(interval.hi - interval.lo) > 1e-12)}
                <circle class="endpoint" class:filled={interval.hiClosed} cx={hiX} cy="42" r="6" />
              {/if}
            {/each}
            <text class="tick" x="40" y="66">{range.min.toFixed(2)}</text>
            <text class="tick" x="600" y="66" text-anchor="end">{range.max.toFixed(2)}</text>
          </svg>
        {/if}
        {#if !output?.ok}
          <div class="sym-error">{output?.text.join('；')}</div>
        {:else}
          {#each output?.text ?? [] as line, index (index)}
            <div class="sym-text">{line}</div>
          {/each}
        {/if}
      {:else}
        <div class="sym-hint">
          在右侧输入表达式并选择操作（化简 / 展开 / 解方程 / 积分 / 极限 / LaTeX）
        </div>
      {/if}
    </div>
  {/if}
  {#if errorText}
    <div class="overlay-error" data-testid="adv-error">{errorText}</div>
  {/if}
  {#if contourText}
    <div class="overlay-info" data-testid="adv-contour-result">{contourText}</div>
  {/if}
  <div class="render-ms" data-testid="adv-render-ms">{renderMs} ms</div>
  <button class="export-btn" type="button" data-testid="adv-export-png" onclick={exportPng}
    >导出 PNG</button
  >
</div>

<style>
  .advanced-view {
    position: relative;
    width: 100%;
    height: 100%;
    background: #0b0e14;
    overflow: hidden;
  }
  .advanced-view.hidden {
    visibility: hidden;
    pointer-events: none;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: crosshair;
  }
  canvas.symbolic {
    position: absolute;
    inset: 0;
    visibility: hidden;
  }
  .symbolic-area {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: #e8ecf5;
    overflow: auto;
  }
  .sym-title {
    font-size: 14px;
    letter-spacing: 2px;
    color: #9fb3d1;
    text-transform: uppercase;
  }
  .sym-latex-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    font-size: 20px;
  }
  .sym-text {
    font-family: ui-monospace, monospace;
    font-size: 14px;
    color: #b8c6dd;
  }
  .sym-error {
    color: #ff9b8a;
    font-size: 14px;
  }
  .sym-hint {
    color: #7a8aa8;
    font-size: 14px;
  }
  .overlay-error {
    position: absolute;
    left: 50%;
    top: 16px;
    transform: translateX(-50%);
    background: rgba(120, 30, 30, 0.85);
    color: #ffd9d2;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    max-width: 80%;
  }
  .overlay-info {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    background: rgba(16, 24, 40, 0.9);
    border: 1px solid rgba(120, 160, 220, 0.35);
    color: #dce6f5;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-family: ui-monospace, monospace;
    white-space: nowrap;
  }
  .render-ms {
    position: absolute;
    right: 8px;
    bottom: 6px;
    font-size: 11px;
    color: #5b6b88;
    font-family: ui-monospace, monospace;
  }
  .export-btn {
    position: absolute;
    right: 8px;
    bottom: 26px;
    font-size: 11px;
    padding: 2px 10px;
    background: rgba(16, 24, 40, 0.85);
    color: #b8c6dd;
    border: 1px solid rgba(120, 160, 220, 0.35);
    border-radius: 6px;
    cursor: pointer;
  }
  .number-line {
    width: min(640px, 92%);
  }
  .number-line .axis {
    stroke: #8fa3c2;
    stroke-width: 1.5;
  }
  .number-line .segment {
    stroke: #6fd3a0;
    stroke-width: 6;
    stroke-linecap: round;
  }
  .number-line .endpoint {
    stroke: #dce6f5;
    stroke-width: 2;
    fill: #0b0e14;
  }
  .number-line .endpoint.filled {
    fill: #dce6f5;
  }
  .number-line .tick {
    fill: #7a8aa8;
    font-size: 11px;
    font-family: ui-monospace, monospace;
  }
</style>
