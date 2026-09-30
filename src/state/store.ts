import type { AppState, DocState, MarkerPoint, ViewTransform } from './types'
import { DEFAULT_SCALE } from '../core/transform'

/** 撤销历史最大深度 */
export const HISTORY_LIMIT = 100

type Listener = (state: AppState) => void

/**
 * 应用状态仓库（框架无关）：
 * - 单一状态源：{ doc, view }；
 * - doc 采用不可变快照进入撤销/重做历史，视图操作（缩放/平移）不记录；
 * - 通过 subscribe 通知订阅者（UI 层做薄适配）。
 */
export class AppStore {
  private doc: DocState = { objects: [] }
  private view: ViewTransform = { centerX: 0, centerY: 0, scale: DEFAULT_SCALE }
  private undoStack: DocState[] = []
  private redoStack: DocState[] = []
  private readonly listeners = new Set<Listener>()

  getState(): AppState {
    return { doc: this.doc, view: this.view }
  }

  getView(): ViewTransform {
    return this.view
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 修改文档并记入撤销历史。
   * mutate 必须是纯函数式更新：基于旧 doc 返回新 doc（不可变快照）。
   */
  commit(mutate: (doc: DocState) => DocState): void {
    this.undoStack.push(this.doc)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.doc = mutate(this.doc)
    this.emit()
  }

  /** 更新视图：不进撤销历史（规格要求：视图缩放/平移不入历史） */
  setView(view: ViewTransform): void {
    this.view = view
    this.emit()
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (prev === undefined) return
    this.redoStack.push(this.doc)
    this.doc = prev
    this.emit()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (next === undefined) return
    this.undoStack.push(this.doc)
    this.doc = next
    this.emit()
  }

  /** 在指定数学坐标添加标记点（v0.1 的"添加对象"操作，支撑撤销/重做验收） */
  addMarker(x: number, y: number): MarkerPoint {
    const marker: MarkerPoint = { id: crypto.randomUUID(), type: 'marker', x, y }
    this.commit((doc) => ({ objects: [...doc.objects, marker] }))
    return marker
  }

  private emit(): void {
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }
}

export function createStore(): AppStore {
  return new AppStore()
}
