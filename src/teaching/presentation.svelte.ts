/**
 * 演示模式（v1.0）：全屏 + 隐藏编辑 UI + 放大字号，适合课堂投影。
 * body.presentation-mode 的样式在 app.css；状态经模块级 runes 供 Toolbar/Panel 绑定。
 */
let presentation = $state(false)

export function isPresentationMode(): boolean {
  return presentation
}

function applyClass(on: boolean): void {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('presentation-mode', on)
}

export async function enterPresentation(): Promise<void> {
  presentation = true
  applyClass(true)
  try {
    if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // 全屏被拒绝（权限/手势）：仍保留放大与隐藏 UI
  }
}

export async function exitPresentation(): Promise<void> {
  presentation = false
  applyClass(false)
  try {
    if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen()
    }
  } catch {
    // 忽略
  }
}

export async function togglePresentation(): Promise<boolean> {
  if (presentation) {
    await exitPresentation()
    return false
  }
  await enterPresentation()
  return true
}

// 用户按 Esc 退出全屏时同步状态
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && presentation) {
      presentation = false
      applyClass(false)
    }
  })
  // 非全屏环境（或全屏被拒）下，Esc 也能退出演示模式
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && presentation) {
      presentation = false
      applyClass(false)
    }
  })
}
