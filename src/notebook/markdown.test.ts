/**
 * 迷你 Markdown 渲染测试（v1.0）。
 */
import { describe, expect, it } from 'vitest'
import { renderMarkdown, type KatexLike } from './markdown'

const fakeKatex: KatexLike = {
  renderToString: (tex, options) =>
    `<span class="katex" data-display="${String(options?.displayMode ?? false)}">${tex}</span>`,
}

describe('v1.0 Markdown：块级结构', () => {
  it('标题与段落', () => {
    const html = renderMarkdown('# 标题\n\n普通段落。\n第二行。')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<p>普通段落。<br/>第二行。</p>')
  })

  it('列表：无序与有序', () => {
    expect(renderMarkdown('- a\n- b')).toContain('<ul><li>a</li><li>b</li></ul>')
    expect(renderMarkdown('1. 一\n2. 二')).toContain('<ol><li>一</li><li>二</li></ol>')
  })

  it('代码块与引用', () => {
    const html = renderMarkdown('```\nconst a = 1 < 2\n```')
    expect(html).toContain('<pre><code>const a = 1 &lt; 2</code></pre>')
    expect(renderMarkdown('> 引用\n> 续行')).toContain('<blockquote>引用<br/>续行</blockquote>')
  })

  it('行内：粗体 / 斜体 / 代码 / 链接', () => {
    const html = renderMarkdown('**加粗** 与 *斜体* 与 `code` 与 [链接](https://example.com)')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<em>斜体</em>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<a href="https://example.com"')
  })
})

describe('v1.0 Markdown：公式与安全', () => {
  it('公式：无 KaTeX 时降级为等宽原文', () => {
    const html = renderMarkdown('行内 $x^2$ 与块级 $$\\int_0^1 x\\,dx$$')
    expect(html).toContain('math-fallback')
    expect(html).toContain('x^2')
    expect(html).toContain('\\int_0^1')
  })

  it('公式：注入 KaTeX 后渲染（displayMode 区分）', () => {
    const html = renderMarkdown('行内 $x^2$。\n\n$$y = mx + b$$', { katex: fakeKatex })
    expect(html).toContain('data-display="false"')
    expect(html).toContain('data-display="true"')
    expect(html).toContain('y = mx + b')
  })

  it('HTML 注入被转义', () => {
    const html = renderMarkdown('<script>alert("x")</script> **<b>bold?</b>**')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;bold?&lt;/b&gt;')
  })

  it('公式中的 HTML 不执行（KaTeX 自行转义；降级路径也转义）', () => {
    const html = renderMarkdown('$<img src=x onerror=1>$')
    expect(html).not.toContain('<img')
  })

  it('代码块内的公式不被抽取（还原为原文）', () => {
    const html = renderMarkdown('```\n$x^2$ 与 $$y$$\n```', { katex: fakeKatex })
    expect(html).not.toContain('katex')
    expect(html).toContain('$x^2$')
    expect(html).toContain('$$y$$')
  })

  it('行内代码内的公式保留原文（不渲染 KaTeX）', () => {
    const html = renderMarkdown('用 `$x^2$` 表示平方', { katex: fakeKatex })
    expect(html).toContain('<code>$x^2$</code>')
    expect(html).not.toContain('katex')
  })

  it('链接协议白名单：javascript:/data: 置空', () => {
    const html = renderMarkdown(
      '[点我](javascript:alert(1)) [数据](data:text/html,hi) [正常](https://a.b)',
    )
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text/html')
    expect(html).toContain('href="https://a.b"')
    expect(html).toContain('href="#"')
  })
})
