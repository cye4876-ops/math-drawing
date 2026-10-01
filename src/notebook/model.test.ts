/**
 * Notebook 模型测试（v1.0）：跨格变量、拓扑执行、环检测、序列化、数据格。
 */
import { describe, expect, it } from 'vitest'
import {
  analyzeNotebook,
  createCell,
  formatResult,
  makeCellId,
  moveCell,
  NotebookFormatError,
  parseNotebook,
  runNotebook,
  serializeNotebook,
  type ComputeCell,
  type FigureCell,
  type Notebook,
} from './model'
import type { DocState } from '../state/types'

function compute(source: string, operation: ComputeCell['operation'] = 'evaluate'): ComputeCell {
  const cell = createCell('compute') as ComputeCell
  cell.source = source
  cell.operation = operation
  return cell
}

function notebookOf(...cells: Notebook['cells']): Notebook {
  return { title: '测试', cells }
}

describe('v1.0 Notebook：跨格变量与级联', () => {
  it('a = 2 → b = a*3 → 正确求值（6）', () => {
    const notebook = notebookOf(compute('a = 2'), compute('b = a * 3'))
    const result = runNotebook(notebook)
    expect(result.scope['a']).toBe(2)
    expect(result.scope['b']).toBe(6)
    const bCell = notebook.cells[1]!
    const execution = result.cells.get(bCell.id)
    expect(execution?.status).toBe('ok')
    expect(execution?.defined?.value).toBe(6)
  })

  it('修改定义后重跑，引用格级联更新', () => {
    const notebook = notebookOf(compute('a = 2'), compute('b = a * 3'))
    expect(runNotebook(notebook).scope['b']).toBe(6)
    ;(notebook.cells[0] as ComputeCell).source = 'a = 5'
    expect(runNotebook(notebook).scope['b']).toBe(15)
  })

  it('引用定义格在后（逆文档序）：拓扑排序仍正确', () => {
    const notebook = notebookOf(compute('b = a * 3'), compute('a = 2'))
    const result = runNotebook(notebook)
    expect(result.scope['b']).toBe(6)
    expect(result.scope['a']).toBe(2)
  })

  it('数值表达式：a*sin(0)+1 → 1（evaluate 结果与 LaTeX）', () => {
    const notebook = notebookOf(compute('a = 2'), compute('a * sin(0) + 1'))
    const result = runNotebook(notebook)
    const execution = result.cells.get(notebook.cells[1]!.id)
    expect(execution?.value).toBeCloseTo(1, 12)
    expect(execution?.latex).toContain('\\sin')
  })

  it('自变量名不能作为变量：x = 5 → 明确报错', () => {
    const notebook = notebookOf(compute('x = 5'))
    const execution = runNotebook(notebook).cells.get(notebook.cells[0]!.id)
    expect(execution?.status).toBe('error')
    expect(execution?.error).toContain('自变量')
  })

  it('未定义变量引用 → 报错（不产生 NaN 静默结果）', () => {
    const notebook = notebookOf(compute('c = a + 1'))
    const execution = runNotebook(notebook).cells.get(notebook.cells[0]!.id)
    expect(execution?.status).toBe('error')
    expect(execution?.error).toContain('a')
  })
})

describe('v1.0 Notebook：循环依赖', () => {
  it('a = b + 1 与 b = a + 1 → 环检测报错（不死循环）', () => {
    const notebook = notebookOf(compute('a = b + 1'), compute('b = a + 1'))
    const analysis = analyzeNotebook(notebook)
    expect(analysis.cyclic.size).toBe(2)
    expect(analysis.cycleVariables.length).toBeGreaterThan(0)
    const result = runNotebook(notebook)
    for (const cell of notebook.cells) {
      const execution = result.cells.get(cell.id)
      expect(execution?.status).toBe('error')
      expect(execution?.error).toContain('循环依赖')
    }
  })

  it('自引用 a = a + 1 → 环', () => {
    const notebook = notebookOf(compute('a = a + 1'))
    const execution = runNotebook(notebook).cells.get(notebook.cells[0]!.id)
    expect(execution?.status).toBe('error')
    expect(execution?.error).toContain('循环依赖')
  })

  it('依赖环中变量的下游格被阻塞并报错', () => {
    const notebook = notebookOf(compute('a = b + 1'), compute('b = a + 1'), compute('c = a + 10'))
    const analysis = analyzeNotebook(notebook)
    expect(analysis.blocked.has(notebook.cells[2]!.id)).toBe(true)
    const execution = runNotebook(notebook).cells.get(notebook.cells[2]!.id)
    expect(execution?.status).toBe('error')
  })

  it('环旁的健康格照常执行', () => {
    const notebook = notebookOf(
      compute('a = b + 1'),
      compute('b = a + 1'),
      compute('d = 7'),
      compute('f = d * 2'),
    )
    const result = runNotebook(notebook)
    expect(result.scope['d']).toBe(7)
    expect(result.scope['f']).toBe(14)
  })

  it('内置常量名不能作为变量：e = 5 → 报错', () => {
    const notebook = notebookOf(compute('e = 5'))
    const execution = runNotebook(notebook).cells.get(notebook.cells[0]!.id)
    expect(execution?.status).toBe('error')
    expect(execution?.error).toContain('常量')
  })
})

describe('v1.0 Notebook：重复定义与符号格', () => {
  it('同名变量后赋值覆盖前者（并提示）', () => {
    const notebook = notebookOf(compute('a = 2'), compute('a = 9'), compute('a * 2'))
    const analysis = analyzeNotebook(notebook)
    expect(analysis.definitions.get('a')).toBe(1)
    const result = runNotebook(notebook)
    expect(result.scope['a']).toBe(9)
    const first = result.cells.get(notebook.cells[0]!.id)
    expect(first?.text ?? '').toContain('覆盖')
  })

  it('符号操作格：solve x²−1=0 → x = ±1', () => {
    const notebook = notebookOf(compute('x^2 - 1 = 0', 'solve'))
    const execution = runNotebook(notebook).cells.get(notebook.cells[0]!.id)
    expect(execution?.status).toBe('ok')
    expect(execution?.symbolic?.latex.some((item) => item.includes('x ='))).toBe(true)
  })
})

describe('v1.0 Notebook：数据格', () => {
  it('CSV 解析：行列数与预览', () => {
    const cell = createCell('data')
    if (cell.type !== 'data') throw new Error('类型错误')
    cell.csv = 'x,y\n1,1\n2,4\n3,9'
    const execution = runNotebook(notebookOf(cell)).cells.get(cell.id)
    expect(execution?.status).toBe('ok')
    expect(execution?.table?.columns).toEqual(['x', 'y'])
    expect(execution?.table?.rowCount).toBe(3)
    expect(execution?.table?.preview[2]?.[1]).toBe(9)
  })

  it('空数据格 → empty', () => {
    const cell = createCell('data')
    if (cell.type !== 'data') throw new Error('类型错误')
    cell.csv = ''
    expect(runNotebook(notebookOf(cell)).cells.get(cell.id)?.status).toBe('empty')
  })
})

describe('v1.0 Notebook：figure 格变量引用', () => {
  function figureWith(expressions: string[]): FigureCell {
    const cell = createCell('figure') as FigureCell
    cell.doc = {
      objects: expressions.map((expr, index) => ({
        id: `c${index}`,
        type: 'curve',
        kind: 'explicit',
        name: expr,
        expr,
        color: '#000',
        lineStyle: 'solid',
        quality: 3,
        visible: true,
      })),
    } as unknown as DocState
    return cell
  }

  it('figure 引用的变量进入依赖图', () => {
    const notebook = notebookOf(figureWith(['a * sin(x)']), compute('a = 3'))
    const analysis = analyzeNotebook(notebook)
    const figureRefs = analysis.references.get(notebook.cells[0]!.id)
    expect(figureRefs).toContain('a')
    expect(analysis.dependencies.get(notebook.cells[0]!.id)?.has(1)).toBe(true)
    expect(runNotebook(notebook).scope['a']).toBe(3)
  })
})

describe('v1.0 Notebook：序列化与工具', () => {
  it('序列化往返完整还原', () => {
    const notebook = notebookOf(compute('a = 2'), createCell('markdown'), createCell('data'))
    const restored = parseNotebook(serializeNotebook(notebook))
    expect(restored).toEqual(notebook)
  })

  it('非法 JSON / 缺 cells / 错误类型 → NotebookFormatError', () => {
    expect(() => parseNotebook('{')).toThrow(NotebookFormatError)
    expect(() => parseNotebook('{"title":"x"}')).toThrow(NotebookFormatError)
    expect(() => parseNotebook('{"cells":[{"type":"bogus"}]}')).toThrow(NotebookFormatError)
  })

  it('parseNotebook 填充缺省字段', () => {
    const parsed = parseNotebook('{"cells":[{"type":"compute","source":"a = 1"}]}')
    expect(parsed.cells[0]!.collapsed).toBe(false)
    expect(parsed.title).toBe('未命名 Notebook')
  })

  it('moveCell 拖拽排序', () => {
    const cells = [createCell('markdown'), createCell('compute'), createCell('data')]
    const moved = moveCell(cells, 2, 0)
    expect(moved[0]!.type).toBe('data')
    expect(moved[1]!.type).toBe('markdown')
    // 向后移动：from 0 → to 3（插到末尾）
    const moved2 = moveCell(cells, 0, 3)
    expect(moved2[2]!.type).toBe('markdown')
  })

  it('makeCellId 唯一；formatResult 格式', () => {
    expect(makeCellId()).not.toBe(makeCellId())
    expect(formatResult(3)).toBe('3')
    expect(formatResult(1 / 3)).toBe('0.333333')
    expect(formatResult(0.5)).toBe('0.5')
    // 非有限值的可读显示（∞/−∞/未定义）
    expect(formatResult(Number.POSITIVE_INFINITY)).toBe('∞')
    expect(formatResult(Number.NEGATIVE_INFINITY)).toBe('−∞')
    expect(formatResult(Number.NaN)).toBe('未定义')
  })
})
