import { describe, expect, it } from 'vitest'
import { buildSvg } from './svg'
import { resolveView } from './frame'
import { graphObjectFromDsl } from '../graph/dsl-to-doc'
import { createView } from '../core/transform'
import type { Curve, DocState, MarkerPoint } from '../state/types'

function curve(expr: string, extra: Partial<Curve> = {}): Curve {
  return {
    id: 'c1',
    type: 'curve',
    kind: 'explicit',
    name: expr,
    expr,
    color: '#2563eb',
    lineStyle: 'solid',
    quality: 3,
    visible: true,
    ...extra,
  }
}

const view = createView()
const size = { width: 600, height: 400 }
const baseOptions = { width: 600, height: 400, range: { kind: 'view' as const } }

describe('export/svg: 矢量生成', () => {
  it('显式曲线：<path> 高精度采样（振荡函数点密度充分）', () => {
    const doc: DocState = { objects: [curve('sin(10*x)')] }
    const svg = buildSvg(doc, 'plot', view, baseOptions)
    expect(svg).toContain('<svg xmlns')
    expect(svg).toContain('<path d="M')
    // 12 个震荡周期每周期 ≥ 10 点 → 点数充分（矢量精度而非屏幕粗糙采样）
    const moves = (svg.match(/[ML]/g) ?? []).length
    expect(moves).toBeGreaterThan(150)
  })

  it('虚线曲线输出 stroke-dasharray；渐近线输出虚线', () => {
    const doc: DocState = { objects: [curve('tan(x)', { lineStyle: 'dashed' })] }
    const svg = buildSvg(doc, 'plot', view, baseOptions)
    expect(svg).toContain('stroke-dasharray="8,5"')
    expect(svg).toContain('stroke-dasharray="4,4"')
  })

  it('网格与刻度为 <line>/<text> 元素（可选中文本）', () => {
    const doc: DocState = { objects: [curve('x')] }
    const svg = buildSvg(doc, 'plot', view, baseOptions)
    expect(svg).toContain('<line')
    expect(svg).toContain('<text')
    expect(svg).toContain('#e5e7eb')
  })

  it('透明背景：无背景 rect 且无网格', () => {
    const doc: DocState = { objects: [curve('x')] }
    const svg = buildSvg(doc, 'plot', view, { ...baseOptions, background: null })
    expect(svg).not.toContain('<rect x="0" y="0" width="600"')
    expect(svg).not.toContain('#e5e7eb')
  })

  it('图：节点圆、边折线、有向箭头、权重文本、标签转义', () => {
    const { graph } = graphObjectFromDsl('A->B:3, B-C')
    // 手动改一个标签测试转义
    graph!.nodes[0]!.label = 'A<1&gt'
    const doc: DocState = { objects: [graph!] }
    const svg = buildSvg(doc, 'graph', view, baseOptions)
    expect(svg).toContain('<circle')
    expect(svg).toContain('<polyline')
    expect(svg).toContain('<polygon')
    expect(svg).toContain('>3</text>')
    expect(svg).toContain('A&lt;1&amp;gt')
  })

  it('标记点：圆 + 坐标文本', () => {
    const marker: MarkerPoint = { id: 'm1', type: 'marker', x: 1, y: 2 }
    const doc: DocState = { objects: [marker] }
    const svg = buildSvg(doc, 'plot', view, baseOptions)
    expect(svg).toContain('#dc2626')
    expect(svg).toContain('(1, 2)')
  })
})

describe('export/frame: 范围解析', () => {
  it('region：中心与比例精确铺满', () => {
    const resolved = resolveView(
      { kind: 'region', xMin: -2, xMax: 2, yMin: -1, yMax: 1 },
      view,
      size,
      [],
    )
    expect(resolved.centerX).toBe(0)
    expect(resolved.centerY).toBe(0)
    expect(resolved.scaleX).toBe(150)
    expect(resolved.scaleY).toBe(200)
    expect(resolved.equalAspect).toBe(false)
  })

  it('content：包含标记点与图节点的包围盒（等比 + 边距）', () => {
    const marker: MarkerPoint = { id: 'm1', type: 'marker', x: 0, y: 0 }
    const graph = graphObjectFromDsl('A-B').graph!
    graph.nodes[0]!.x = 10
    graph.nodes[0]!.y = 0
    graph.nodes[1]!.x = 0
    graph.nodes[1]!.y = 8
    const resolved = resolveView({ kind: 'content' }, view, size, [marker, graph])
    expect(resolved.centerX).toBe(5)
    expect(resolved.centerY).toBe(4)
    expect(resolved.scaleX).toBe(resolved.scaleY)
    expect(resolved.equalAspect).toBe(true)
  })

  it('content 无内容时回落当前视窗；view 原样返回', () => {
    expect(resolveView({ kind: 'content' }, view, size, [])).toEqual(view)
    expect(resolveView({ kind: 'view' }, view, size, [])).toEqual(view)
  })
})
