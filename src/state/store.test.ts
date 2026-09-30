import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_LIMIT, createStore, type AppStore } from './store'

let store: AppStore

beforeEach(() => {
  store = createStore()
})

describe('store: 初始状态', () => {
  it('初始为空文档、默认视图、无历史', () => {
    const s = store.getState()
    expect(s.doc.objects).toHaveLength(0)
    expect(s.view.scale).toBe(80)
    expect(store.canUndo()).toBe(false)
    expect(store.canRedo()).toBe(false)
  })
})

describe('store: 撤销/重做', () => {
  it('添加对象后可撤销、可重做', () => {
    store.addMarker(1, 2)
    expect(store.getState().doc.objects).toHaveLength(1)
    expect(store.canUndo()).toBe(true)

    store.undo()
    expect(store.getState().doc.objects).toHaveLength(0)
    expect(store.canRedo()).toBe(true)

    store.redo()
    expect(store.getState().doc.objects).toHaveLength(1)
  })

  it('无历史时 undo/redo 为安全的 no-op', () => {
    expect(() => store.undo()).not.toThrow()
    expect(() => store.redo()).not.toThrow()
    expect(store.getState().doc.objects).toHaveLength(0)
  })

  it('撤销后新操作清空 redo 栈', () => {
    store.addMarker(0, 0)
    store.addMarker(1, 1)
    store.undo()
    expect(store.canRedo()).toBe(true)

    store.addMarker(2, 2)
    expect(store.canRedo()).toBe(false)
  })

  it('历史深度受 HISTORY_LIMIT 约束', () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store.addMarker(i, 0)

    let undone = 0
    while (store.canUndo()) {
      store.undo()
      undone++
    }
    expect(undone).toBe(HISTORY_LIMIT)
  })
})

describe('store: 视图不入历史', () => {
  it('setView 不产生可撤销项', () => {
    store.setView({ centerX: 5, centerY: -5, scale: 200 })
    expect(store.canUndo()).toBe(false)
  })

  it('撤销/重做不会回滚视图', () => {
    store.addMarker(0, 0)
    store.setView({ centerX: 5, centerY: -5, scale: 200 })
    store.undo()
    expect(store.getState().view).toEqual({ centerX: 5, centerY: -5, scale: 200 })
    store.redo()
    expect(store.getState().view).toEqual({ centerX: 5, centerY: -5, scale: 200 })
  })
})

describe('store: 订阅', () => {
  it('状态变更通知订阅者，退订后不再通知', () => {
    const fn = vi.fn()
    const unsubscribe = store.subscribe(fn)

    store.addMarker(0, 0)
    store.setView({ centerX: 0, centerY: 0, scale: 50 })
    store.undo()
    expect(fn).toHaveBeenCalledTimes(3)

    unsubscribe()
    store.addMarker(1, 1)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('addMarker 返回带唯一 id 的标记点', () => {
    const a = store.addMarker(0, 0)
    const b = store.addMarker(1, 1)
    expect(a.id).not.toBe(b.id)
    expect(a.type).toBe('marker')
    expect(a.x).toBe(0)
    expect(b.y).toBe(1)
  })
})
