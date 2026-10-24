/**
 * 笔记本依赖图（v3.3）：把 analyzeNotebook 的变量级依赖整理成可直接绘制的图数据。
 * 顶点 = 单元格，边 = 定义格 → 引用格；层号 = 最长依赖链深度（环安全）。
 */
import { analyzeNotebook, type Notebook, type NotebookCell } from './model'

export const CELL_TYPE_LABELS: Record<NotebookCell['type'], string> = {
  markdown: '说明',
  compute: '计算',
  figure: '图形',
  data: '数据',
  plugin: '插件',
}

export interface NotebookDependencyNode {
  cellId: string
  index: number
  label: string
  snippet: string
  type: NotebookCell['type']
  level: number
  cyclic: boolean
  blocked: boolean
}

export interface NotebookDependencyEdge {
  /** 定义格（文档索引） */
  from: number
  /** 引用格（文档索引） */
  to: number
}

export interface NotebookDependencyGraphData {
  nodes: NotebookDependencyNode[]
  edges: NotebookDependencyEdge[]
  hasCycle: boolean
  levelCount: number
}

function snippetOf(cell: NotebookCell): string {
  if (cell.type === 'compute') return cell.source.replace(/\s+/g, ' ').trim()
  if (cell.type === 'markdown') return cell.text.replace(/\s+/g, ' ').trim()
  if (cell.type === 'data') return 'CSV 数据'
  if (cell.type === 'figure') return cell.caption || '图形快照'
  return '插件单元格'
}

export function buildNotebookDependencyGraph(notebook: Notebook): NotebookDependencyGraphData {
  const analysis = analyzeNotebook(notebook)
  const cells = notebook.cells
  const n = cells.length
  const level = new Array<number>(n).fill(0)
  const edges: NotebookDependencyEdge[] = []
  for (let index = 0; index < n; index++) {
    for (const producer of analysis.dependencies.get(cells[index]!.id) ?? new Set<number>()) {
      if (producer === index) continue
      edges.push({ from: producer, to: index })
    }
  }
  // 最长路径分层：迭代松弛 n 轮（环图也会在 n 轮内稳定）
  for (let round = 0; round < n; round++) {
    let changed = false
    for (const edge of edges) {
      if (level[edge.to]! < level[edge.from]! + 1) {
        level[edge.to] = level[edge.from]! + 1
        changed = true
      }
    }
    if (!changed) break
  }
  const nodes: NotebookDependencyNode[] = cells.map((cell, index) => ({
    cellId: cell.id,
    index,
    label: `#${index + 1} ${CELL_TYPE_LABELS[cell.type]}`,
    snippet: snippetOf(cell).slice(0, 26),
    type: cell.type,
    level: level[index]!,
    cyclic: analysis.cyclic.has(cell.id),
    blocked: analysis.blocked.has(cell.id),
  }))
  return {
    nodes,
    edges,
    hasCycle: analysis.cyclic.size > 0 || analysis.blocked.size > 0,
    levelCount: n > 0 ? Math.max(...level) + 1 : 0,
  }
}
