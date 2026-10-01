/**
 * 图算法步骤类型（v0.5 阶段 5）：
 * 所有算法实现为 `function*`（可中断），逐步 `yield` 出可视化步骤，
 * 最终 `return` 结构化结果——播放器（单步/播放/回退）只需收集步骤数组。
 */

/** 步骤类型（播放器据此着色/高亮） */
export type StepKind =
  /** 节点被正式访问/处理（如出队、确定最短距离） */
  | 'visit'
  /** 节点被发现、加入前沿（如入队、入栈、松弛成功） */
  | 'push'
  /** 检查一条边（高亮边） */
  | 'inspect'
  /** 距离被有效更新（松弛成功） */
  | 'relax'
  /** 拒绝/冲突（负权、已访问、颜色冲突等） */
  | 'reject'
  /** 选中一条边（生成树/匹配） */
  | 'select'
  /** 节点着色 */
  | 'color'
  /** 算法级提示（整体说明） */
  | 'note'

/** 单个算法步骤；node/edge 使用图内 id（非标签），note 为可直接显示的中文叙述 */
export interface AlgorithmStep {
  kind: StepKind
  /** 主体节点 id（可选） */
  node?: string
  /** 高亮边（按图内节点 id；无向边方向不敏感） */
  edge?: { source: string; target: string }
  /** 中文叙述（含标签文本） */
  note: string
}

/** 算法运行出错时的返回（如负权图跑 Dijkstra） */
export interface AlgorithmFailure {
  error: string
}

/** 最短路径类结果（Dijkstra / Bellman-Ford） */
export interface ShortestPathResult {
  /** 起点 id */
  start: string
  /** 到各节点的最终距离；不可达为 null */
  distance: Record<string, number | null>
  /** 最短路树父指针；起点为 null */
  parent: Record<string, string | null>
  /** 节点「确定」顺序（Dijkstra 出堆顺序 / Bellman-Ford 无此概念则为空） */
  order: string[]
}

/** 遍历类结果（BFS / DFS） */
export interface TraversalResult {
  /** 访问（出队/弹栈）顺序 */
  order: string[]
  /** 遍历树父指针 */
  parent: Record<string, string | null>
  /** 跳数距离（BFS 有效；DFS 同样给出「树深度」） */
  distance: Record<string, number | null>
}

/** 拓扑排序结果 */
export interface TopologicalResult {
  /** 无环时的拓扑序；有环为 null */
  order: string[] | null
  /** 检测到环时：剩余（入度始终 > 0）的节点 id */
  remaining: string[] | null
}

/** 着色结果 */
export interface ColoringResult {
  /** 节点 id → 颜色编号（0 起） */
  colors: Record<string, number>
  /** 使用颜色数 */
  count: number
  /** 算法名（greedy / dsatur） */
  method: string
}

/** 二分判定结果 */
export interface BipartiteResult {
  bipartite: boolean
  /** 二分着色（0/1）；非二分时含冲突前的着色 */
  colors: Record<string, number>
  /** 冲突边（u,v 同色）；无冲突为 null */
  conflict: { source: string; target: string } | null
}

/** 收集生成器：取全部步骤与最终结果（测试与播放器通用） */
export function collectSteps<T>(generator: Generator<AlgorithmStep, T, void>): {
  steps: AlgorithmStep[]
  result: T
} {
  const steps: AlgorithmStep[] = []
  let next = generator.next()
  while (!next.done) {
    steps.push(next.value)
    next = generator.next()
  }
  return { steps, result: next.value }
}
