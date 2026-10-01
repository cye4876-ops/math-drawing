import { describe, expect, it } from 'vitest'
import { parse } from '../expr'
import { buildTikz, exprToPgf } from './tikz'
import { graphObjectFromDsl } from '../graph/dsl-to-doc'
import { createView } from '../core/transform'
import type { Curve, DocState } from '../state/types'

function pgf(source: string, variable = 'x'): string | null {
  return exprToPgf(parse(source), variable)
}

const curve = (expr: string, extra: Partial<Curve> = {}): Curve => ({
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
})

describe('export/tikz: 表达式 → PGFPlots 数学（符号形式）', () => {
  it('三角函数按度桥接：sin/cos/tan → sin(deg(u))', () => {
    expect(pgf('sin(x)')).toBe('sin(deg(x))')
    expect(pgf('cos(2*x)')).toBe('cos(deg(2 * x))')
    expect(pgf('tan(x)')).toBe('tan(deg(x))')
  })

  it('反三角输出弧度：asin → rad(asin(u))', () => {
    expect(pgf('asin(x)')).toBe('rad(asin(x))')
    expect(pgf('atan(x)')).toBe('rad(atan(x))')
  })

  it('对数：log(x)=ln(x)；log(x,2)=ln(x)/ln(2)；log10 展开', () => {
    expect(pgf('log(x)')).toBe('ln(x)')
    expect(pgf('log(x, 2)')).toBe('ln(x)/ln(2)')
    expect(pgf('log10(x)')).toBe('ln(x)/ln(10)')
    expect(pgf('ln(x)')).toBe('ln(x)')
  })

  it('幂/模/常量/一元负号', () => {
    expect(pgf('x^2')).toBe('x^2')
    expect(pgf('2^x')).toBe('2^x')
    expect(pgf('x^2 + 1')).toBe('x^2 + 1')
    expect(pgf('mod(x, 2)')).toBe('mod(x, 2)')
    expect(pgf('pi*x')).toBe('pi * x')
    expect(pgf('-(x + 1)')).toBe('-(x + 1)')
    expect(pgf('2*x^3 - 4*x')).toBe('2 * x^3 - 4 * x')
  })

  it('min/max 变参折叠；clamp 展开', () => {
    expect(pgf('min(x, 1)')).toBe('min(x, 1)')
    expect(pgf('max(x, 1, 2)')).toBe('max(max(x, 1), 2)')
    expect(pgf('clamp(x, 0, 1)')).toBe('min(max(x, 0), 1)')
  })

  it('不支持的运算返回 null：阶乘、erf、赋值、分段', () => {
    expect(pgf('x!')).toBeNull()
    expect(pgf('erf(x)')).toBeNull()
    expect(pgf('gamma(x)')).toBeNull()
    expect(pgf('a = x')).toBeNull()
  })

  it('参数方程变量 t 与极坐标变量 theta 映射为 x', () => {
    expect(pgf('cos(t)', 't')).toBe('cos(deg(x))')
    expect(pgf('1 + cos(theta)', 'theta')).toBe('1 + cos(deg(x))')
  })
})

describe('export/tikz: 文档生成', () => {
  const view = createView()

  it('显式曲线：\\addplot 符号形式 + standalone 完整文档', () => {
    const doc: DocState = { objects: [curve('sin(x)')] }
    const result = buildTikz(doc, 'plot', view, {
      range: { kind: 'view' },
      size: { width: 800, height: 600 },
      standalone: true,
    })
    expect(result.tex).toContain('\\documentclass')
    expect(result.tex).toContain('\\usepackage{pgfplots}')
    expect(result.tex).toContain('\\begin{axis}')
    expect(result.tex).toContain('\\addplot')
    expect(result.tex).toContain('{sin(deg(x))}')
    expect(result.tex).toContain('domain=')
    expect(result.skipped).toEqual([])
  })

  it('隐函数：以折线坐标列输出（plot coordinates），不再跳过', () => {
    const doc: DocState = {
      objects: [curve('x^2 + y^2 - 4', { kind: 'implicit' }), curve('x')],
    }
    const result = buildTikz(doc, 'plot', view, {
      range: { kind: 'view' },
      size: { width: 800, height: 600 },
      standalone: false,
    })
    expect(result.tex).not.toContain('\\documentclass')
    expect(result.tex).toContain('plot[smooth] coordinates')
    expect(result.tex).toContain('\\draw[color=')
    expect(result.skipped).toEqual([])
    // 圆应有较多坐标点（左上/右下象限多段）
    const coords = (result.tex.match(/\(/g) ?? []).length
    expect(coords).toBeGreaterThan(20)
  })

  it('隐函数在范围内无分支：跳过并注明', () => {
    const doc: DocState = { objects: [curve('x^2 + y^2 + 100', { kind: 'implicit' })] }
    const result = buildTikz(doc, 'plot', view, {
      range: { kind: 'view' },
      size: { width: 800, height: 600 },
      standalone: false,
    })
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]!.reason).toContain('无可绘制分支')
    expect(result.tex).toContain('% [跳过]')
  })

  it('参数方程与极坐标输出 parametric 列', () => {
    const param: Curve = {
      ...curve('cos(t)'),
      kind: 'parametric',
      expr2: 'sin(t)',
    }
    const polar: Curve = { ...curve('1 + cos(theta)'), kind: 'polar' }
    const doc: DocState = { objects: [param, polar] }
    const result = buildTikz(doc, 'plot', view, {
      range: { kind: 'view' },
      size: { width: 800, height: 600 },
      standalone: false,
    })
    expect(result.tex).toContain('parametric')
    expect(result.tex).toContain('({cos(deg(x))}, {sin(deg(x))})')
    expect(result.tex).toContain('cos(deg(x))')
    expect(result.tex).toContain('sin(deg(x))')
  })

  it('图：\\node/\\draw、有向箭头、权重标签', () => {
    const { graph } = graphObjectFromDsl('A->B:3, B-C')
    const doc: DocState = { objects: [graph!] }
    const result = buildTikz(doc, 'graph', view, {
      range: { kind: 'view' },
      size: { width: 800, height: 600 },
      standalone: true,
    })
    expect(result.tex).toContain('\\node')
    expect(result.tex).toContain('\\begin{tikzpicture}')
    expect(result.tex).toContain('[->, ')
    expect(result.tex).toContain('{3}')
  })

  it('图：自环用 loop 语法', () => {
    const { graph } = graphObjectFromDsl('A-A, A-B')
    const doc: DocState = { objects: [graph!] }
    const result = buildTikz(doc, 'graph', view, {
      range: { kind: 'view' },
      size: { width: 800, height: 600 },
      standalone: false,
    })
    expect(result.tex).toContain('loop above')
  })

  it('范围 region：domain 使用指定数学区间', () => {
    const doc: DocState = { objects: [curve('x')] }
    const result = buildTikz(doc, 'plot', view, {
      range: { kind: 'region', xMin: -3, xMax: 4, yMin: -1, yMax: 1 },
      size: { width: 800, height: 600 },
      standalone: false,
    })
    expect(result.tex).toContain('domain=-3:4')
  })
})
