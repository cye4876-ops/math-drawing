/**
 * 下载工具（v0.6）：Blob/文本触发浏览器下载；统一时间戳文件名。
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 对象 URL 延迟释放（部分浏览器下载启动滞后）
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename)
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** 文件名：math-drawing-YYYYMMDD-HHmmss.<ext> */
export function timestampName(extension: string): string {
  const now = new Date()
  return `math-drawing-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}.${extension}`
}
