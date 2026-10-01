/**
 * 工具抽象与注册机制（v0.4 架构重点）。
 *
 * 设计（规格 Tool 接口 + 生命周期统一管理）：
 * - 工具是框架无关的普通对象；画布事件、重绘、UI 刷新由 ToolRegistry 转发；
 * - **同一时刻只激活一个主工具**：activate 会先 deactivate 旧工具（状态清理）；
 * - 工具是"查看"行为：不允许写入撤销历史（禁止调用 store.commit；视图操作允许）；
 * - 工具不自行注册 DOM 监听（避免"切换工具忘记解绑"的经典泄漏），
 *   需要响应的输入（指针/键盘）全部经 registry 转发；activate/deactivate 只管理内部状态；
 * - 覆盖率验证：注册表提供 subscribe 供 UI 订阅（读数/控件/激活变化）。
 */
import type { AppStore } from '../state/store'
import type { Point2, Size, ViewTransform } from '../state/types'

/** 转发给工具的指针事件（屏幕坐标 + 数学坐标 + 原始事件） */
export interface ToolPointerEvent {
  /** 画布内 CSS 像素坐标 */
  screen: Point2
  /** 对应的数学坐标 */
  math: Point2
  pointer: PointerEvent
}

/** 工具上下文：由 App 注入的运行时能力 */
export interface ToolContext {
  store: AppStore
  getView(): ViewTransform
  getSize(): Size
  /** 请求下一帧重绘（合并多次调用） */
  requestRender(): void
  /** 通知 UI 刷新读数/控件（工具的交互状态变化时调用） */
  notify(): void
}

/** 工具读数面板内容 */
export interface ToolReadout {
  title: string
  rows: { label: string; value: string }[]
  /** 附加说明（限制/提示） */
  note?: string
}

/** 工具控件（通用渲染规格，UI 层不感知具体工具） */
export type ToolControl =
  | {
      kind: 'slider'
      id: string
      label: string
      min: number
      max: number
      step: number
      value: number
      valueText: string
    }
  | {
      kind: 'buttons'
      id: string
      label: string
      options: { value: string; label: string }[]
      value: string
    }
  | {
      kind: 'text'
      id: string
      label: string
      value: string
      placeholder?: string
      /** 快捷符号：点击后把 value 直接作为输入值提交（免打字，如 π、2π） */
      chips?: { label: string; value: string }[]
    }
  | {
      kind: 'actions'
      id: string
      buttons: { id: string; label: string; disabled: boolean }[]
    }

export interface Tool {
  id: string
  name: string
  /** 激活：只做准备与内部状态初始化（不得注册全局监听） */
  activate?(ctx: ToolContext): void
  /** 取消激活：清理内部状态（必须对称清理 activate 中的一切） */
  deactivate?(ctx: ToolContext): void
  /** 返回 true 表示已消费该事件（阻止平移/轴拖动） */
  onPointerDown?(e: ToolPointerEvent, ctx: ToolContext): boolean | void
  onPointerMove?(e: ToolPointerEvent, ctx: ToolContext): boolean | void
  onPointerUp?(e: ToolPointerEvent, ctx: ToolContext): boolean | void
  /** 返回 true 表示已消费该按键 */
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): boolean | void
  /** 覆盖层绘制（CSS 像素坐标系，画在网格与曲线之上） */
  drawOverlay?(c: CanvasRenderingContext2D, ctx: ToolContext): void
  getReadout?(ctx: ToolContext): ToolReadout | null
  getControls?(ctx: ToolContext): ToolControl[]
  onControl?(id: string, value: string | number, ctx: ToolContext): void
  /** 动画进行中返回 true：App 每帧继续调度重绘 */
  isAnimating?(ctx: ToolContext): boolean
}

export type RegistryListener = () => void

export class ToolRegistry {
  private readonly tools: Tool[] = []
  private active: Tool | null = null
  private readonly listeners = new Set<RegistryListener>()

  constructor(private readonly ctx: ToolContext) {}

  register(tool: Tool): this {
    this.tools.push(tool)
    return this
  }

  getTools(): Tool[] {
    return [...this.tools]
  }

  getActive(): Tool | null {
    return this.active
  }

  /** UI 订阅（激活变化 / 读数变化 / 控件变化统一走这里） */
  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(): void {
    for (const listener of this.listeners) listener()
  }

  /** 激活工具（null = 取消激活）；旧工具保证先 deactivate */
  activate(id: string | null): void {
    const next = id === null ? null : (this.tools.find((tool) => tool.id === id) ?? null)
    if (next === this.active) return
    this.active?.deactivate?.(this.ctx)
    this.active = next
    this.active?.activate?.(this.ctx)
    this.notify()
    this.ctx.requestRender()
  }

  handlePointerDown(e: ToolPointerEvent): boolean {
    return this.active?.onPointerDown?.(e, this.ctx) === true
  }

  handlePointerMove(e: ToolPointerEvent): boolean {
    return this.active?.onPointerMove?.(e, this.ctx) === true
  }

  handlePointerUp(e: ToolPointerEvent): boolean {
    return this.active?.onPointerUp?.(e, this.ctx) === true
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    return this.active?.onKeyDown?.(e, this.ctx) === true
  }

  drawOverlay(c: CanvasRenderingContext2D): void {
    this.active?.drawOverlay?.(c, this.ctx)
  }

  isAnimating(): boolean {
    return this.active?.isAnimating?.(this.ctx) ?? false
  }

  getReadout(): ToolReadout | null {
    return this.active?.getReadout?.(this.ctx) ?? null
  }

  getControls(): ToolControl[] {
    return this.active?.getControls?.(this.ctx) ?? []
  }

  onControl(id: string, value: string | number = ''): void {
    this.active?.onControl?.(id, value, this.ctx)
    this.notify()
  }
}
