/**
 * DOM 覆盖层容器（分层渲染架构的第二层）。
 *
 * 与 Canvas 层同尺寸、同坐标系（CSS 像素）：
 * - Canvas 层：网格、曲线等大批量图形；
 * - DOM 层（本模块）：可交互元素（v0.1：标记点；后续：控制点、标签、滑块等）。
 *
 * 覆盖层默认 pointer-events: none，不遮挡画布手势；交互元素可自行开启事件。
 * 覆盖层无需处理 devicePixelRatio（DOM 天然工作于 CSS 像素）。
 */
export interface DomLayer {
  readonly element: HTMLDivElement
  destroy(): void
}

export function createDomLayer(container: HTMLElement): DomLayer {
  const element = document.createElement('div')
  element.className = 'dom-layer'
  container.appendChild(element)

  return {
    element,
    destroy: () => {
      element.remove()
    },
  }
}
