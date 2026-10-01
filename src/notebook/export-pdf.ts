/**
 * Notebook PDF 导出（v1.0）：以「打印视图」实现。
 *
 * 方案说明（兑现 docs/versions/v1.0-notebook-teaching.md 的 export-pdf 交付物）：
 * - 复用 buildNotebookHtml(..., { print: true }) 生成静态高 DPI 打印版单文件 HTML；
 * - 装入隐藏 iframe（srcdoc）并触发 window.print()，由浏览器「另存为 PDF」落盘；
 * - 打印对话框关闭时机无法可靠检测，iframe 延迟清理（60s）避免内存泄漏；
 * - 打印版样式针对分页优化：白底、黑字、图卡不透页、公式 KaTeX 预渲染。
 */
import { buildNotebookHtml } from './export-html'
import type { Notebook, NotebookRunResult } from './model'

/** 打开打印视图（浏览器打印对话框 → 另存为 PDF） */
export async function printNotebookPdf(
  notebook: Notebook,
  runResult: NotebookRunResult,
): Promise<void> {
  const html = await buildNotebookHtml(notebook, runResult, { print: true })
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  frame.setAttribute('aria-hidden', 'true')
  frame.srcdoc = html
  document.body.append(frame)
  await new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
  })
  try {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
  } finally {
    setTimeout(() => frame.remove(), 60_000)
  }
}
