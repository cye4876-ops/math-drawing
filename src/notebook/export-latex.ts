/**
 * Notebook → LaTeX（v1.0）：
 * - 文档骨架（article + amsmath + pgfplots）；
 * - 文本格：原文放入 quote（公式 $..$ 原样保留）；
 * - 计算格：source 与结果以公式输出（toLatex）；
 * - 图形格：复用 v0.6 的 TikZ 导出（2D 曲线 / 图）；统计/3D 提示省略；
 * - 数据格：tabular 表格（前 20 行）。
 */
import { buildTikz } from '../export/tikz'
import { toLatex } from '../symbolic/latex'
import { parse } from '../expr'
import { formatResult, type NotebookRunResult, type Notebook } from './model'

function inferDocMode(doc: { objects: { type: string }[] }): 'plot' | 'graph' {
  return doc.objects.some((object) => object.type === 'graph') ? 'graph' : 'plot'
}

/** 转义顺序：反斜杠先占位，其余字符转义后再回填 \textbackslash{}（避免 {} 被二次转义） */
function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\uE000')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\uE000/g, '\\textbackslash{}')
}

/** verbatim 环境内的文本：防止输入包含 \end{verbatim} 提前闭合 */
function safeVerbatim(text: string): string {
  return text.replace(/\\end\{verbatim\}/g, '\\textbackslash{}end\\{verbatim\\}')
}

/** LaTeX 文本模式转义（保留 $...$ 行内与 $$...$$ 块级公式段） */
function escapeLatexKeepMath(text: string): string {
  const isMath = (part: string): boolean =>
    (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) ||
    (part.startsWith('$') && part.endsWith('$') && part.length > 2)
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+\$)/g)
  return parts.map((part) => (part !== '' && isMath(part) ? part : escapeLatex(part))).join('')
}

export function buildNotebookLatex(notebook: Notebook, runResult: NotebookRunResult): string {
  const body: string[] = []
  const skipped: string[] = []
  for (const cell of notebook.cells) {
    const execution = runResult.cells.get(cell.id)
    if (cell.type === 'markdown') {
      body.push('% ---- 文本格 ----')
      for (const line of cell.text.split('\n')) {
        const heading = /^(#{1,4})\s+(.*)$/.exec(line)
        if (heading) {
          const command = ['section', 'subsection', 'subsubsection', 'paragraph'][
            heading[1]!.length - 1
          ]
          body.push(`\\${command}{${escapeLatex(heading[2]!)}}`)
        } else if (line.trim() !== '') {
          body.push(escapeLatexKeepMath(line))
        }
      }
      body.push('')
    } else if (cell.type === 'compute') {
      body.push('% ---- 计算格 ----')
      body.push(`\\begin{verbatim}${safeVerbatim(cell.source)}\\end{verbatim}`)
      let latex: string | null
      try {
        latex = toLatex(parse(cell.source))
      } catch {
        latex = null
      }
      if (latex) body.push(`\\[ ${latex} \\]`)
      if (execution?.status === 'error') {
        body.push(`% 执行错误：${execution.error ?? ''}`)
      } else if (execution?.defined) {
        body.push(`\\[ ${execution.defined.name} = ${formatResult(execution.defined.value)} \\]`)
      } else if (execution?.symbolic) {
        for (const line of execution.symbolic.latex) body.push(`\\[ ${line} \\]`)
        for (const line of execution.symbolic.text) body.push(`% ${line}`)
      } else if (execution?.status === 'ok' && execution.value !== undefined) {
        body.push(`\\[ = ${formatResult(execution.value)} \\]`)
      }
      body.push('')
    } else if (cell.type === 'figure') {
      body.push('% ---- 图形格 ----')
      if (!cell.doc || !cell.view) {
        body.push('% （空图形格）')
        continue
      }
      const mode = inferDocMode(cell.doc)
      const hasStats = cell.doc.objects.some((object) => object.type === 'dataset')
      const hasSpace = cell.doc.objects.some((object) =>
        ['surface3d', 'curve3d', 'field3d', 'ode2d'].includes(object.type),
      )
      if (
        hasStats ||
        (hasSpace && !cell.doc.objects.some((object) => ['curve', 'graph'].includes(object.type)))
      ) {
        skipped.push('图形格含统计/3D 内容，LaTeX 导出省略')
        body.push('% （含统计/3D 内容，LaTeX 导出省略）')
        continue
      }
      const size = { width: 900, height: 480 }
      const result = buildTikz(cell.doc, mode, cell.view, {
        range: { kind: 'view' },
        size,
        standalone: false,
        samples: 200,
      })
      body.push(result.tex)
      for (const item of result.skipped) body.push(`% 跳过 ${item.name}：${item.reason}`)
      if (cell.caption) body.push(`% 图注：${cell.caption.replace(/\s*\n\s*/g, ' ')}`)
      body.push('')
    } else if (cell.type === 'data') {
      body.push('% ---- 数据格 ----')
      if (execution?.table) {
        const table = execution.table
        body.push(`\\begin{tabular}{${'r'.repeat(Math.max(1, table.columns.length))}}`)
        body.push(`${table.columns.map((column) => escapeLatex(column)).join(' & ')} \\\\ \\hline`)
        for (const row of table.preview.slice(0, 20)) {
          body.push(
            `${row.map((value) => (value === null ? '—' : formatResult(value))).join(' & ')} \\\\`,
          )
        }
        body.push('\\end{tabular}')
      } else {
        body.push(`\\begin{verbatim}${safeVerbatim(cell.csv)}\\end{verbatim}`)
      }
      body.push('')
    } else {
      body.push(`% 插件单元格「${cell.pluginType}」未导出`)
    }
  }
  const skippedNote = skipped.length > 0 ? `% 已跳过：${skipped.join('；')}\n` : ''
  return [
    '% 由 Math Drawing v1.0 导出（xelatex/lualatex 编译以支持中文）',
    '\\documentclass[11pt]{article}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{pgfplots}',
    '\\pgfplotsset{compat=1.16}',
    '\\usepackage[UTF8]{ctex}',
    '\\usepackage[margin=2.5cm]{geometry}',
    '',
    `\\title{${escapeLatex(notebook.title)}}`,
    '\\date{}',
    '',
    '\\begin{document}',
    '\\maketitle',
    skippedNote + body.join('\n'),
    '\\end{document}',
    '',
  ].join('\n')
}
