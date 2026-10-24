/** 应用工作区（v3.10 三栏工作台）：全局导航与模式共享的单一类型来源 */
export type AppMode =
  'plot' | 'graph' | 'lab' | 'hyper' | 'stats' | 'space' | 'advanced' | 'notebook' | 'matrix'

export const MODE_LABELS: Record<AppMode, string> = {
  plot: '函数绘图',
  graph: '图论绘图',
  lab: '图论实验',
  hyper: '超图与彩虹',
  stats: '统计与数据',
  space: '3D 与场',
  advanced: '数学专题',
  matrix: '矩阵',
  notebook: '笔记本',
}
