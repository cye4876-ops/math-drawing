/**
 * LaTeX 导出的转义与结构测试（v1.0）。
 */
import { describe, expect, it } from 'vitest'
import { buildNotebookLatex } from './export-latex'
import type { Notebook, NotebookRunResult } from './model'

const emptyRun: NotebookRunResult = { scope: {}, cells: new Map() }

describe('v1.0 LaTeX 导出：文本转义', () => {
  it('反斜杠不二次转义花括号；保留字全部转义', () => {
    const notebook: Notebook = {
      title: '测试',
      cells: [
        {
          id: 'c1',
          type: 'markdown',
          collapsed: false,
          text: '路径 C:\\temp 与 a_b & 100% #1 ~ ^',
        },
      ],
    }
    const tex = buildNotebookLatex(notebook, emptyRun)
    expect(tex).toContain('\\textbackslash{}temp')
    expect(tex).not.toContain('\\textbackslash\\{')
    expect(tex).toContain('a\\_b')
    expect(tex).toContain('\\&')
    expect(tex).toContain('\\%')
    expect(tex).toContain('\\textasciitilde{}')
    expect(tex).toContain('\\textasciicircum{}')
  })

  it('$...$ 与 $$...$$ 公式段保留（不被转义）', () => {
    const notebook: Notebook = {
      title: '测试',
      cells: [{ id: 'c1', type: 'markdown', collapsed: false, text: '前 $$x^2$$ 中 $y_1$ 后' }],
    }
    const tex = buildNotebookLatex(notebook, emptyRun)
    expect(tex).toContain('$$x^2$$')
    expect(tex).toContain('$y_1$')
    expect(tex).not.toContain('\\$')
  })

  it('verbatim 环境防注入（\\end{verbatim} 被消毒）', () => {
    const notebook: Notebook = {
      title: '测试',
      cells: [
        {
          id: 'c1',
          type: 'compute',
          collapsed: false,
          operation: 'evaluate',
          source: 'x+1\\end{verbatim}\\input{secret}',
        },
      ],
    }
    const tex = buildNotebookLatex(notebook, emptyRun)
    expect(tex).not.toContain('\\end{verbatim}\\input')
    expect((tex.match(/\\end\{verbatim\}/g) ?? []).length).toBe(1)
  })

  it('未执行的计算格也输出源码 verbatim', () => {
    const notebook: Notebook = {
      title: '测试',
      cells: [
        { id: 'c1', type: 'compute', collapsed: false, operation: 'evaluate', source: 'sin(x)' },
      ],
    }
    const tex = buildNotebookLatex(notebook, emptyRun)
    expect(tex).toContain('\\begin{verbatim}sin(x)\\end{verbatim}')
  })
})
