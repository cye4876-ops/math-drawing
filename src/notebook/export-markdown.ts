/**
 * Notebook → Markdown（v1.0）：
 * - 文本格：原文输出；
 * - 计算格：代码块 + 结果（LaTeX 源码 + 文本）；
 * - 图形格：渲染 2× PNG（images/cell-N.png），Markdown 引用；
 * - 数据格：Markdown 表格（前 20 行）；
 * - 打包为 zip（notebook.md + images/）：调用方使用 fflate 的 zipSync。
 */
import { zipSync, type Zippable } from 'fflate'
import { renderPngCanvas } from '../export/png'
import type { DocState } from '../state/types'
import { formatResult, type NotebookRunResult, type Notebook } from './model'

const EXPORT_SIZE = { width: 900, height: 480 }

function inferDocMode(doc: DocState): 'plot' | 'graph' | 'stats' {
  if (doc.objects.some((object) => object.type === 'graph')) return 'graph'
  if (doc.objects.some((object) => object.type === 'dataset')) return 'stats'
  return 'plot'
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('PNG 编码失败'))),
      'image/png',
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}

export interface MarkdownExportResult {
  markdown: string
  files: Zippable
  skipped: string[]
}

/** 构建 Markdown 与其图片资源（不打包，便于测试） */
export async function buildNotebookMarkdown(
  notebook: Notebook,
  runResult: NotebookRunResult,
): Promise<MarkdownExportResult> {
  const lines: string[] = [`# ${notebook.title}`, '']
  const files: Zippable = {}
  const skipped: string[] = []
  let figureIndex = 0
  for (const cell of notebook.cells) {
    const execution = runResult.cells.get(cell.id)
    if (cell.type === 'markdown') {
      lines.push(cell.text, '')
    } else if (cell.type === 'compute') {
      lines.push('```', cell.source, '```')
      if (execution?.status === 'error') {
        lines.push(`> ⚠️ ${execution.error ?? '执行失败'}`, '')
      } else if (execution?.defined) {
        lines.push(`**${execution.defined.name} = ${formatResult(execution.defined.value)}**`, '')
      } else if (execution?.symbolic) {
        for (const line of execution.symbolic.latex) lines.push(`$$${line}$$`)
        for (const line of execution.symbolic.text) lines.push(line)
        lines.push('')
      } else if (execution?.status === 'ok' && execution.value !== undefined) {
        lines.push(`= **${execution.text ?? formatResult(execution.value)}**`, '')
      } else {
        lines.push('')
      }
    } else if (cell.type === 'figure') {
      if (!cell.doc || !cell.view) {
        lines.push('*（空图形格）*', '')
        continue
      }
      if (
        cell.doc.objects.some((object) =>
          ['surface3d', 'curve3d', 'field3d', 'ode2d'].includes(object.type),
        )
      ) {
        const has2d = cell.doc.objects.some((object) =>
          ['curve', 'graph', 'dataset', 'marker'].includes(object.type),
        )
        if (!has2d) {
          skipped.push('图形格仅含 3D 对象，未导出图片')
          lines.push('*（含 3D 对象，Markdown 导出省略该图）*', '')
          continue
        }
      }
      figureIndex++
      const name = `cell-${figureIndex}.png`
      const canvas = renderPngCanvas(cell.doc, inferDocMode(cell.doc), cell.view, EXPORT_SIZE, {
        scale: 2,
        transparent: false,
        range: { kind: 'view' },
      })
      files[`images/${name}`] = await canvasToPngBytes(canvas)
      const captionText = (cell.caption || '').replace(/\s*\n\s*/g, ' ')
      const altText = captionText.replace(/[[\]]/g, '\\$&').replace(/\)/g, '\\)')
      lines.push(`![${altText || '图形'}](images/${name})`)
      if (captionText) lines.push(`*${captionText.replace(/\*/g, '\\*')}*`)
      lines.push('')
    } else if (cell.type === 'data') {
      if (execution?.table) {
        const table = execution.table
        lines.push(`| ${table.columns.join(' | ')} |`)
        lines.push(`| ${table.columns.map(() => '---').join(' | ')} |`)
        for (const row of table.preview.slice(0, 20)) {
          lines.push(
            `| ${row.map((value) => (value === null ? '' : formatResult(value))).join(' | ')} |`,
          )
        }
        if (table.rowCount > table.preview.length) {
          lines.push('')
          lines.push(`*（仅显示前 ${table.preview.length} 行，共 ${table.rowCount} 行）*`)
        }
        lines.push('')
      } else {
        lines.push('```', cell.csv, '```', '')
      }
    } else {
      lines.push(`*（插件单元格「${cell.pluginType}」需在应用内查看）*`, '')
    }
  }
  return { markdown: lines.join('\n'), files, skipped }
}

/** 打包为 zip（notebook.md + images/） */
export async function exportNotebookMarkdownZip(
  notebook: Notebook,
  runResult: NotebookRunResult,
): Promise<{ blob: Blob; filename: string }> {
  const { markdown, files } = await buildNotebookMarkdown(notebook, runResult)
  const encoder = new TextEncoder()
  const zip = zipSync({ 'notebook.md': encoder.encode(markdown), ...files })
  const name = (notebook.title || 'notebook').replace(/[\\/:*?"<>|]/g, '_')
  return {
    blob: new Blob([new Uint8Array(zip)], { type: 'application/zip' }),
    filename: `${name}.zip`,
  }
}
