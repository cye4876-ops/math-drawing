/**
 * 保存状态（v2.5，评审方案 04）：
 * - 以「文档快照引用」对比最近一次保存点；不等即「有未保存修改」；
 * - 保存点更新：保存项目（JSON 导出）、打开项目（导入）、初始加载；
 * - 撤销回到保存点时会自动恢复「已保存」（引用相等）。
 */
import type { AppStore } from '../state/store'
import type { DocState } from '../state/types'

export const saveState = $state<{ dirty: boolean }>({ dirty: false })

let savedDoc: DocState | null = null

/** 订阅仓库并在应用启动时建立初始保存点；返回取消订阅函数 */
export function initSaveState(store: AppStore): () => void {
  savedDoc = store.getDoc()
  saveState.dirty = false
  return store.subscribe((state) => {
    saveState.dirty = state.doc !== savedDoc
  })
}

/** 保存点前移（保存/导入成功后调用） */
export function markSaved(store: AppStore): void {
  savedDoc = store.getDoc()
  saveState.dirty = false
}
