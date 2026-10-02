/**
 * 主题系统（v2.5，评审方案 03/VISUAL SYSTEM）：
 * - 浅色优先（默认），深色保留，可用工具栏按钮切换；
 * - 通过 html[data-theme] 驱动 CSS 令牌；同步画布网格配色（grid-renderer）；
 * - 持久化到 localStorage（md.theme），index.html 内联脚本避免首帧闪错主题。
 */
import { setGridTheme } from '../render/grid-renderer'

export type AppTheme = 'light' | 'dark'

const STORAGE_KEY = 'md.theme'

export const themeState = $state<{ theme: AppTheme }>({ theme: 'light' })

function readStoredTheme(): AppTheme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme: AppTheme): void {
  themeState.theme = theme
  document.documentElement.dataset.theme = theme
  // 画布网格/坐标轴配色随主题切换（采样缓存不受影响；调用方负责触发重绘）
  setGridTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // 忽略存储失败（隐私模式等）
  }
}

export function initTheme(): void {
  applyTheme(readStoredTheme())
}

export function toggleTheme(): void {
  applyTheme(themeState.theme === 'light' ? 'dark' : 'light')
}
