import type { Size } from '../state/types'

export interface CanvasLayer {
  readonly canvas: HTMLCanvasElement
  /** 请求重绘（合并到下一帧执行） */
  requestRender(): void
  /** 当前 CSS 像素尺寸 */
  getSize(): Size
  destroy(): void
}

/**
 * 管理铺满容器的 <canvas>：
 * - 按 devicePixelRatio 设置物理分辨率（canvas.width = CSS 宽 × dpr），绘制坐标系为 CSS 像素；
 * - ResizeObserver 跟随容器尺寸、监听 dpr 变化，保证窗口缩放/跨屏拖动后依然清晰；
 * - 失效驱动渲染：多次 requestRender 合并为下一帧一次绘制。
 */
export function createCanvasLayer(
  container: HTMLElement,
  draw: (ctx: CanvasRenderingContext2D, size: Size, dpr: number) => void,
): CanvasLayer {
  const canvas = document.createElement('canvas')
  canvas.className = 'canvas-layer'
  canvas.setAttribute('data-testid', 'stage-canvas')

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取 Canvas 2D 上下文')

  container.appendChild(canvas)

  let size: Size = { width: 0, height: 0 }
  let frame = 0
  let disposed = false

  const render = (): void => {
    if (disposed) return
    frame = 0
    const dpr = window.devicePixelRatio || 1
    ctx.save()
    draw(ctx, size, dpr)
    ctx.restore()
  }

  const requestRender = (): void => {
    if (disposed || frame !== 0) return
    frame = requestAnimationFrame(render)
  }

  const resize = (): void => {
    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    size = { width, height }

    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)

    // 宽高赋值会重置上下文变换，需重新把坐标系拉回 CSS 像素
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    render()
  }

  const observer = new ResizeObserver(() => {
    resize()
  })
  observer.observe(container)

  // devicePixelRatio 变化（如拖动到另一块显示器）时重建媒体查询
  let dprMedia: MediaQueryList | null = null
  const onDprChange = (): void => {
    resize()
    watchDpr()
  }
  const watchDpr = (): void => {
    dprMedia?.removeEventListener('change', onDprChange)
    dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dprMedia.addEventListener('change', onDprChange)
  }
  watchDpr()

  resize()

  return {
    canvas,
    requestRender,
    getSize: () => size,
    destroy: () => {
      disposed = true
      if (frame !== 0) cancelAnimationFrame(frame)
      observer.disconnect()
      dprMedia?.removeEventListener('change', onDprChange)
      canvas.remove()
    },
  }
}
