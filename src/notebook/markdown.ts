/**
 * 迷你 Markdown 渲染（v1.0，Notebook 文本格与导出共用）：
 * - 标题（#~####）、粗体 / 斜体、行内代码、代码块、无序 / 有序列表、引用、链接；
 * - 公式：`$...$` 行内、`$$...$$` 块级（注入 KaTeX 时渲染为 HTML，否则显示为等宽原文）；
 * - 安全：全部文本先转义再套标记，公式走 KaTeX 自带转义（throwOnError: false）。
 */
export interface KatexLike {
  renderToString: (
    tex: string,
    options?: { throwOnError?: boolean; displayMode?: boolean },
  ) => string
  /** DOM 渲染（KaTeX 模块具备；测试替身可省略）——注意 KaTeX 的实参顺序为 (tex, element, options) */
  render?: (
    tex: string,
    element: HTMLElement,
    options?: { throwOnError?: boolean; displayMode?: boolean },
  ) => void
}

export interface MarkdownRenderOptions {
  /** KaTeX 模块（动态加载后传入） */
  katex?: KatexLike
}

interface MathPlaceholder {
  latex: string
  display: boolean
}

const PLACEHOLDER = /\uE000M(\d+)\uE000/g

/** 占位符 → 原文（$...$ 形式）；用于代码块/行内代码内（公式在其中不渲染为 HTML），
 *  输入为已转义文本，LaTeX 原文需再次转义以安全回填。 */
function restoreMathText(text: string, placeholders: MathPlaceholder[]): string {
  return text.replace(PLACEHOLDER, (_match, index: string) => {
    const math = placeholders[Number(index)]
    if (!math) return ''
    const latex = escapeHtml(math.latex)
    return math.display ? `$$${latex}$$` : `$${latex}$`
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export { escapeHtml }

function renderInline(
  text: string,
  placeholders: MathPlaceholder[],
  options: MarkdownRenderOptions,
): string {
  let result = text
  // 行内代码：还原其中的公式占位符为原文（不渲染 KaTeX HTML）
  result = result.replace(
    /`([^`]+)`/g,
    (_match, code: string) => `<code>${restoreMathText(code, placeholders)}</code>`,
  )
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    // 协议白名单：非 http(s)/mailto/相对/锚点 的链接置空（防 javascript:/data: 注入）
    const safe = /^(https?:|mailto:|#|\/|\.\/)/.test(href) ? href : '#'
    return `<a href="${safe}" target="_blank" rel="noopener">${label}</a>`
  })
  result = result.replace(PLACEHOLDER, (_match, index: string) => {
    const math = placeholders[Number(index)]
    if (!math) return ''
    if (options.katex) {
      try {
        return options.katex.renderToString(math.latex, {
          throwOnError: false,
          displayMode: math.display,
        })
      } catch {
        return `<code>${escapeHtml(math.latex)}</code>`
      }
    }
    return `<code class="math-fallback" title="KaTeX 未加载">${escapeHtml(math.latex)}</code>`
  })
  return result
}

/** Markdown → HTML（不含包裹容器） */
export function renderMarkdown(text: string, options: MarkdownRenderOptions = {}): string {
  const placeholders: MathPlaceholder[] = []
  let source = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, latex: string) => {
    placeholders.push({ latex, display: true })
    return `\uE000M${placeholders.length - 1}\uE000`
  })
  source = source.replace(/\$([^$\n]+?)\$/g, (_match, latex: string) => {
    placeholders.push({ latex, display: false })
    return `\uE000M${placeholders.length - 1}\uE000`
  })
  source = escapeHtml(source)

  const lines = source.split('\n')
  const html: string[] = []
  let index = 0
  let paragraph: string[] = []
  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(paragraph.join('<br/>'), placeholders, options)}</p>`)
      paragraph = []
    }
  }

  while (index < lines.length) {
    const line = lines[index]!
    if (/^```/.test(line)) {
      flushParagraph()
      index++
      const code: string[] = []
      while (index < lines.length && !/^```/.test(lines[index]!)) {
        code.push(lines[index]!)
        index++
      }
      index++ // 结束围栏
      html.push(`<pre><code>${restoreMathText(code.join('\n'), placeholders)}</code></pre>`)
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      const level = heading[1]!.length
      html.push(`<h${level}>${renderInline(heading[2]!, placeholders, options)}</h${level}>`)
      index++
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length) {
        const match = /^\s*[-*]\s+(.*)$/.exec(lines[index]!)
        if (!match) break
        items.push(`<li>${renderInline(match[1]!, placeholders, options)}</li>`)
        index++
      }
      html.push(`<ul>${items.join('')}</ul>`)
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length) {
        const match = /^\s*\d+\.\s+(.*)$/.exec(lines[index]!)
        if (!match) break
        items.push(`<li>${renderInline(match[1]!, placeholders, options)}</li>`)
        index++
      }
      html.push(`<ol>${items.join('')}</ol>`)
      continue
    }
    // 注意：行文本已转义，引用符 > 变为 &gt;
    if (/^&gt;\s?/.test(line)) {
      flushParagraph()
      const quoteLines: string[] = []
      while (index < lines.length) {
        const match = /^&gt;\s?(.*)$/.exec(lines[index]!)
        if (!match) break
        quoteLines.push(match[1]!)
        index++
      }
      html.push(
        `<blockquote>${renderInline(quoteLines.join('<br/>'), placeholders, options)}</blockquote>`,
      )
      continue
    }
    if (line.trim() === '') {
      flushParagraph()
      index++
      continue
    }
    paragraph.push(line)
    index++
  }
  flushParagraph()
  return html.join('\n')
}

/** 动态加载 KaTeX（Singleton；加载失败返回 null，公式降级为等宽原文） */
let katexModule: KatexLike | null = null
let katexPromise: Promise<KatexLike | null> | null = null

export function ensureKatex(): Promise<KatexLike | null> {
  if (katexModule) return Promise.resolve(katexModule)
  if (!katexPromise) {
    katexPromise = import('katex')
      .then((module) => {
        katexModule = module.default ?? (module as unknown as KatexLike)
        return katexModule
      })
      .catch(() => null)
  }
  return katexPromise
}
