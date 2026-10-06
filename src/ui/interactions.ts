import type { AppStore } from '../state/store'
import type { Point2, Size } from '../state/types'
import type { ToolPointerEvent } from '../tools/tool-registry'
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
  /** 工具钩子：返回 true 表示已消费（阻止平移等默认行为） */
  toolHooks?: {
    down?: (e: ToolPointerEvent) => boolean
    move?: (e: ToolPointerEvent) => boolean
    up?: (e: ToolPointerEvent) => boolean
  }
}

/**
 * 绑定画布交互：
 * - 滚轮缩放（以画布中心为锚点，视图操作不入撤销历史）；
 * - 指针拖拽平移（setPointerCapture，拖出容器不中断）；
 * - v3.1 移动端：双指收放缩放（以双指中点为锚）+ 双指中点拖动平移 + 双击放大；
 * - 返回解绑函数。
 */
export function attachInteractions(options: InteractionOptions): () => void {
  const { container, store, getSize, onCursorMove, toolHooks } = options

  let dragging = false
  let lastX = 0
  let lastY = 0

  // v3.1 双指手势状态
  const touchPoints = new Map<number, { x: number; y: number }>()
  let pinch: { distance: number; midX: number; midY: number } | null = null
  let lastTapTime = 0
  let lastTapX = 0
  let lastTapY = 0

  /** 双指缩放灵敏度上限/下限由 transform 内部钳制（此处仅做比率换算） */
  function beginPinch(): void {
    const points = [...touchPoints.values()]
    const first = points[0]
    const second = points[1]
    if (!first || !second) return
    pinch = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      midX: (first.x + second.x) / 2,
      midY: (first.y + second.y) / 2,
    }
    if (dragging) {
      dragging = false
      container.classList.remove('dragging')
    }
  }

  /** 事件目标是否属于画布区域（画布本身或容器空白区），而非叠加的 DOM 面板/控件 */
  const isCanvasTarget = (target: EventTarget | null): boolean =>
    target === container || (target instanceof HTMLElement && target.tagName === 'CANVAS')

  /** 构造工具事件（屏幕坐标 + 数学坐标 + 原始事件） */
  const buildToolEvent = (event: PointerEvent): ToolPointerEvent => {
    const rect = container.getBoundingClientRect()
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    return {
      screen,
      math: screenToMath(store.getView(), getSize(), screen),
      pointer: event,
    }
  }

  const onWheel = (event: WheelEvent): void => {
    // 仅画布区域响应滚轮缩放（面板/控件上的滚动不缩放视图）
    if (!isCanvasTarget(event.target)) return
    event.preventDefault()
    // 以视图中心为锚点缩放：中心的数学坐标保持不动（坐标轴中心始终位于画布中央）
    const size = getSize()
    const anchor = { x: size.width / 2, y: size.height / 2 }
    const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY)
    store.setView(zoomAt(store.getView(), size, anchor, factor))
  }

  const onPointerDown = (event: PointerEvent): void => {
    // 仅画布区域响应：点击叠加面板/控件（DOM 层）不应触发工具或平移，
    // 也不调用 setPointerCapture（否则按钮的真实点击会因 capture 重定向而丢失）。
    if (!isCanvasTarget(event.target)) return
    if (event.button === 2) {
      // 右键：仅转发给工具（如删除图元素）；消费则阻止默认菜单
      if (toolHooks?.down?.(buildToolEvent(event))) event.preventDefault()
      return
    }
    const isTouch = event.pointerType === 'touch'
    if (isTouch) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touchPoints.size >= 2) {
        // 第二指落下：进入双指手势（中止当前工具/拖拽）
        container.setPointerCapture(event.pointerId)
        toolHooks?.up?.(buildToolEvent(event))
        beginPinch()
        return
      }
    }
    if (event.button !== 0) return
    // 工具优先：消费后不再触发平移
    if (toolHooks?.down?.(buildToolEvent(event))) return
    if (isTouch) {
      // 双击放大（以双击点为锚）；两击间隔 < 320ms 且位移 < 28px
      const now = performance.now()
      const isDoubleTap =
        now - lastTapTime < 320 &&
        Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) < 28
      lastTapTime = now
      lastTapX = event.clientX
      lastTapY = event.clientY
      if (isDoubleTap) {
        lastTapTime = 0
        const rect = container.getBoundingClientRect()
        const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        store.setView(zoomAt(store.getView(), getSize(), anchor, 1.6))
        return
      }
    }
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    container.setPointerCapture(event.pointerId)
    container.classList.add('dragging')
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pinch && touchPoints.size >= 2) {
        const points = [...touchPoints.values()]
        const first = points[0]!
        const second = points[1]!
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
        const midX = (first.x + second.x) / 2
        const midY = (first.y + second.y) / 2
        const rect = container.getBoundingClientRect()
        const anchor = { x: midX - rect.left, y: midY - rect.top }
        const zoomed = zoomAt(store.getView(), getSize(), anchor, distance / pinch.distance)
        store.setView(panBy(zoomed, midX - pinch.midX, midY - pinch.midY))
        pinch = { distance, midX, midY }
        return
      }
    }

    const toolEvent = buildToolEvent(event)
    onCursorMove?.(toolEvent.math)

    const toolHandled = toolHooks?.move?.(toolEvent) ?? false

    if (dragging) {
      const dx = event.clientX - lastX
      const dy = event.clientY - lastY
      lastX = event.clientX
      lastY = event.clientY
      store.setView(panBy(store.getView(), dx, dy))
      return
    }

    if (toolHandled) return
  }

  const endDrag = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
      touchPoints.delete(event.pointerId)
      if (touchPoints.size < 2) pinch = null
    }
    toolHooks?.up?.(buildToolEvent(event))
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
  // canvas 上的右键由工具处理（删除等），禁用浏览器默认菜单
  const onContextMenu = (event: Event): void => event.preventDefault()
  container.addEventListener('contextmenu', onContextMenu)
  container.addEventListener('pointercancel', endDrag)
  container.addEventListener('pointerleave', onPointerLeave)

  return () => {
    container.removeEventListener('wheel', onWheel)
    container.removeEventListener('pointerdown', onPointerDown)
    container.removeEventListener('pointermove', onPointerMove)
    container.removeEventListener('pointerup', endDrag)
    container.removeEventListener('pointercancel', endDrag)
    container.removeEventListener('pointerleave', onPointerLeave)
    container.removeEventListener('contextmenu', onContextMenu)
  }
}

/**
 * 全局键盘快捷键：
 * - Ctrl/Cmd + Z：撤销
 * - Ctrl/Cmd + Shift + Z 或 Ctrl + Y：重做
 */
export function attachKeyboardShortcuts(
  store: AppStore,
  options: { onKey?: (event: KeyboardEvent) => boolean } = {},
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    // 文本输入控件内不转发工具快捷键（空格、方向键等应留给输入本身）
    const target = event.target
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return
    }
    // 工具优先消费（空格/方向键等）；返回 true 则跳过全局快捷键
    if (options.onKey?.(event)) return

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
