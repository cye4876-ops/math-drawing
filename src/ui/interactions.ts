import type { AppStore } from '../state/store'
import type { Point2, Size } from '../state/types'
import { panBy, screenToMath, zoomAt } from '../core/transform'

/** 滚轮缩放灵敏度 */
const ZOOM_SENSITIVITY = 0.0015

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
  let lastX = 0
  let lastY = 0

  const toMath = (clientX: number, clientY: number): Point2 => {
    const rect = container.getBoundingClientRect()
    return screenToMath(store.getView(), getSize(), {
      x: clientX - rect.left,
      y: clientY - rect.top,
    })
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
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    container.setPointerCapture(event.pointerId)
    container.classList.add('dragging')
  }

  const onPointerMove = (event: PointerEvent): void => {
    onCursorMove?.(toMath(event.clientX, event.clientY))

    if (!dragging) return
    const dx = event.clientX - lastX
    const dy = event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY
    store.setView(panBy(store.getView(), dx, dy))
  }

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return
    dragging = false
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId)
    }
    container.classList.remove('dragging')
  }

  const onPointerLeave = (): void => {
    onCursorMove?.(null)
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
