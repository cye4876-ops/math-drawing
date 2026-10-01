import type { AppStore } from '../state/store'
import type { Point2, Size } from '../state/types'
import { mathToScreen, panBy, screenToMath, zoomAt } from '../core/transform'

/** 滚轮缩放灵敏度 */
const ZOOM_SENSITIVITY = 0.0015

/** 坐标轴命中距离（CSS 像素） */
const AXIS_HIT_PX = 5

export interface InteractionOptions {
  /** 手势区域（stage 容器） */
  container: HTMLElement
  store: AppStore
  /** 当前画布 CSS 像素尺寸 */
  getSize: () => Size
  /** 光标所在数学坐标（离开画布为 null） */
  onCursorMove?: (position: Point2 | null) => void
}

/**
 * 绑定画布交互：
 * - 滚轮缩放（以光标为锚点，视图操作不入撤销历史）；
 * - 指针拖拽平移（setPointerCapture，拖出容器不中断）；
 * - 返回解绑函数。
 */
export function attachInteractions(options: InteractionOptions): () => void {
  const { container, store, getSize, onCursorMove } = options

  let dragging = false
  let axisDrag: 'x' | 'y' | null = null
  let lastX = 0
  let lastY = 0

  const toMath = (clientX: number, clientY: number): Point2 => {
    const rect = container.getBoundingClientRect()
    return screenToMath(store.getView(), getSize(), {
      x: clientX - rect.left,
      y: clientY - rect.top,
    })
  }

  /** 指针是否落在可见坐标轴附近：'x' = 水平轴（调 axisX），'y' = 垂直轴（调 axisY） */
  const axisAt = (clientX: number, clientY: number): 'x' | 'y' | null => {
    const view = store.getView()
    if (!view.axisVisible) return null
    const size = getSize()
    const rect = container.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top
    const axisScreenY = mathToScreen(view, size, { x: view.centerX, y: view.axisX }).y
    const axisScreenX = mathToScreen(view, size, { x: view.axisY, y: view.centerY }).x
    const nearH =
      axisScreenY >= 0 && axisScreenY <= size.height && Math.abs(py - axisScreenY) <= AXIS_HIT_PX
    const nearV =
      axisScreenX >= 0 && axisScreenX <= size.width && Math.abs(px - axisScreenX) <= AXIS_HIT_PX
    if (nearV && (!nearH || Math.abs(px - axisScreenX) <= Math.abs(py - axisScreenY))) return 'y'
    if (nearH) return 'x'
    return null
  }

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const rect = container.getBoundingClientRect()
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY)
    store.setView(zoomAt(store.getView(), getSize(), anchor, factor))
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return
    const hit = axisAt(event.clientX, event.clientY)
    if (hit) {
      axisDrag = hit
      container.setPointerCapture(event.pointerId)
      return
    }
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    container.setPointerCapture(event.pointerId)
    container.classList.add('dragging')
  }

  const onPointerMove = (event: PointerEvent): void => {
    onCursorMove?.(toMath(event.clientX, event.clientY))

    if (axisDrag) {
      const m = toMath(event.clientX, event.clientY)
      const view = store.getView()
      if (axisDrag === 'x') store.setView({ ...view, axisX: m.y })
      else store.setView({ ...view, axisY: m.x })
      return
    }

    if (!dragging) {
      // 悬停在坐标轴上时给出可拖动提示
      const hit = axisAt(event.clientX, event.clientY)
      container.style.cursor = hit === 'x' ? 'ns-resize' : hit === 'y' ? 'ew-resize' : ''
      return
    }
    const dx = event.clientX - lastX
    const dy = event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY
    store.setView(panBy(store.getView(), dx, dy))
  }

  const endDrag = (event: PointerEvent): void => {
    if (axisDrag) {
      axisDrag = null
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId)
      }
      return
    }
    if (!dragging) return
    dragging = false
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId)
    }
    container.classList.remove('dragging')
  }

  const onPointerLeave = (): void => {
    onCursorMove?.(null)
    container.style.cursor = ''
  }

  container.addEventListener('wheel', onWheel, { passive: false })
  container.addEventListener('pointerdown', onPointerDown)
  container.addEventListener('pointermove', onPointerMove)
  container.addEventListener('pointerup', endDrag)
  container.addEventListener('pointercancel', endDrag)
  container.addEventListener('pointerleave', onPointerLeave)

  return () => {
    container.removeEventListener('wheel', onWheel)
    container.removeEventListener('pointerdown', onPointerDown)
    container.removeEventListener('pointermove', onPointerMove)
    container.removeEventListener('pointerup', endDrag)
    container.removeEventListener('pointercancel', endDrag)
    container.removeEventListener('pointerleave', onPointerLeave)
  }
}

/**
 * 全局键盘快捷键：
 * - Ctrl/Cmd + Z：撤销
 * - Ctrl/Cmd + Shift + Z 或 Ctrl + Y：重做
 */
export function attachKeyboardShortcuts(store: AppStore): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const mod = event.ctrlKey || event.metaKey
    if (!mod) return

    const key = event.key.toLowerCase()
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault()
      store.undo()
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault()
      store.redo()
    }
  }

  window.addEventListener('keydown', onKeyDown)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
  }
}
