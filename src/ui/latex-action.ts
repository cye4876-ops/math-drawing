/**
 * Svelte action：把 LaTeX 渲染进节点（v1.0）。
 * KaTeX 动态加载（独立分包）；加载失败或渲染异常时降级为等宽原文。
 */
import { ensureKatex } from '../notebook/markdown'

interface LatexNodeAction {
  update: (value: string | undefined) => void
  destroy: () => void
}

export function latexNode(current: HTMLElement, latex: string | undefined): LatexNodeAction {
  let cancelled = false

  const render = async (value: string | undefined): Promise<void> => {
    const katex = await ensureKatex()
    if (cancelled || !current.isConnected) return
    current.textContent = ''
    if (!value) return
    current.dataset['latex'] = value
    if (katex) {
      try {
        if (katex.render) {
          katex.render(value, current, { throwOnError: false, displayMode: true })
        } else {
          current.innerHTML = katex.renderToString(value, {
            throwOnError: false,
            displayMode: true,
          })
        }
        return
      } catch {
        // 降级
      }
    }
    const fallback = document.createElement('code')
    fallback.textContent = value
    current.append(fallback)
  }

  void render(latex)
  return {
    update: (value: string | undefined) => void render(value),
    destroy: () => {
      cancelled = true
    },
  }
}
