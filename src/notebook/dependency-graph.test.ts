/**
 * v3.3 笔记本依赖图测试：链式分层、独立格、环标记、边方向。
 */
import { describe, expect, it } from 'vitest'
import { buildNotebookDependencyGraph } from './dependency-graph'
import { createCell, createNotebook, type Notebook } from './model'

function notebookOf(sources: string[]): Notebook {
  const cells = sources.map((source) => {
    const cell = createCell('compute')
    if (cell.type === 'compute') cell.source = source
    return cell
  })
  return { title: 't', cells }
}

describe('v3.3 笔记本依赖图', () => {
  it('链 a=1 → b=a+1 → c=b*2：三条边、层号 0/1/2', () => {
    const graph = buildNotebookDependencyGraph(notebookOf(['a = 1', 'b = a + 1', 'c = b * 2']))
    expect(graph.nodes.map((node) => node.level)).toEqual([0, 1, 2])
    expect(graph.edges).toEqual([
      { from: 0, to: 1 },
      { from: 1, to: 2 },
    ])
    expect(graph.hasCycle).toBe(false)
    expect(graph.levelCount).toBe(3)
  })

  it('独立格全部第 0 层、无边；标签包含序号与类型', () => {
    const graph = buildNotebookDependencyGraph(notebookOf(['a = 1', 'b = 2']))
    expect(graph.edges).toHaveLength(0)
    expect(graph.nodes.map((node) => node.level)).toEqual([0, 0])
    expect(graph.nodes[0]!.label).toBe('#1 计算')
  })

  it('循环依赖：hasCycle = true 且相关节点被标记', () => {
    const graph = buildNotebookDependencyGraph(notebookOf(['a = b + 1', 'b = a + 1']))
    expect(graph.hasCycle).toBe(true)
    expect(graph.nodes.some((node) => node.cyclic)).toBe(true)
  })

  it('说明格无变量：出现在图中但不产生边', () => {
    const notebook = createNotebook('demo')
    const graph = buildNotebookDependencyGraph(notebook)
    expect(graph.nodes).toHaveLength(notebook.cells.length)
    expect(graph.nodes[0]!.label).toBe('#1 说明')
    expect(graph.edges).toHaveLength(0)
  })
})
