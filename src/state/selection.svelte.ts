/**
 * 图元素选中状态（v0.5，UI 级：不入文档、不进撤销历史）：
 * 图编辑工具在画布上**单击**节点/边时设置；图面板「选中元素」卡片读取并操作
 * （边：赋权/清除/删除；节点：删除（连同关联边））。
 * 放在 .svelte.ts 中以便 Svelte 5 runes 跨组件响应式。
 */
export type GraphSelection =
  | { kind: 'node'; graphId: string; nodeId: string }
  | { kind: 'edge'; graphId: string; edgeId: string }
  | null

let current = $state<GraphSelection>(null)

export function getGraphSelection(): GraphSelection {
  return current
}

export function setGraphSelection(value: GraphSelection): void {
  current = value
}
