/**
 * 矩阵视图联动焦点（v0.5）：算法播放器把「当前处理的顶点」以 nodeId 写到这里，
 * 谱面板据此高亮矩阵中该顶点的行与列（Floyd 中间点 k 的单步演示；结束后清空）。
 */
let focus = $state<string | null>(null)

export function getMatrixFocus(): string | null {
  return focus
}

export function setMatrixFocus(value: string | null): void {
  focus = value
}
