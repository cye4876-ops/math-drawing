import { describe, expect, it } from 'vitest'
import { createView } from '../core/transform'
import { normalizeGraphDoc } from '../graph/model'
import { parseHypergraphJson } from '../hypergraph/model'
import { parseArchive } from '../lab/archive'
import { parseNotebook } from '../notebook/model'
import { createField3D, createSurface3D } from '../render3d/objects'
import { normalizeDataset } from '../stats/model'
import { parseDelimited, tableToDataset } from '../stats/parse'
import { deserializeDocument, serializeDocument } from './serialize'
import type { Curve, Dataset, Field3D, Surface3D } from './types'

function roundtrip<T extends { id: string; type: string }>(objects: T[]) {
  return deserializeDocument(serializeDocument({ objects: objects as never[] }, createView())).doc
    .objects
}

describe('数据完整性：文档往返', () => {
  it('隐式曲面等值面水平与向量场模长着色不丢失', () => {
    const surface = createSurface3D({
      kind: 'implicit',
      expr: 'x^2 + y^2 + z^2',
      isoValue: 2.5,
    })
    const field = createField3D({ colorMode: 'magnitude' })
    const restored = roundtrip([surface, field])
    const restoredSurface = restored.find((object) => object.id === surface.id) as Surface3D
    const restoredField = restored.find((object) => object.id === field.id) as Field3D
    expect(restoredSurface.isoValue).toBe(2.5)
    expect(restoredField.colorMode).toBe('magnitude')
  })

  it('重复的对象 id 被拒绝，避免选择/渲染串线', () => {
    const curve: Curve = {
      id: 'dup',
      type: 'curve',
      kind: 'explicit',
      name: 'x',
      expr: 'x',
      color: '#2563eb',
      lineStyle: 'solid',
      quality: 3,
      visible: true,
    }
    const json = serializeDocument({ objects: [curve, { ...curve, expr: 'x^2' }] }, createView())
    expect(() => deserializeDocument(json)).toThrow(/id 重复/)
  })

  it('异常缩放被归一化到可用范围', () => {
    const raw = JSON.stringify({
      version: 1,
      objects: [],
      view: { ...createView(), scaleX: 0, scaleY: -20 },
    })
    const { view } = deserializeDocument(raw)
    expect(view.scaleX).toBeGreaterThan(0)
    expect(view.scaleY).toBeGreaterThan(0)
  })
})

describe('数据完整性：图对象', () => {
  const node = (id: string, x = 0, y = 0) => ({ id, label: id, x, y })

  it('拒绝重复顶点 id', () => {
    expect(() => normalizeGraphDoc({ nodes: [node('n1'), node('n1')], edges: [] })).toThrow(
      /顶点 id 重复/,
    )
  })

  it('拒绝重复边 id 与悬空端点', () => {
    expect(() =>
      normalizeGraphDoc({
        nodes: [node('a'), node('b')],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e1', source: 'a', target: 'b' },
        ],
      }),
    ).toThrow(/边 id 重复/)

    expect(() =>
      normalizeGraphDoc({
        nodes: [node('a')],
        edges: [{ id: 'e1', source: 'a', target: 'missing' }],
      }),
    ).toThrow(/不存在的顶点/)
  })

  it('非有限坐标被拒绝；尺寸/权重回退到安全默认值', () => {
    expect(() =>
      normalizeGraphDoc({
        nodes: [{ id: 'a', label: 'a', x: Number.POSITIVE_INFINITY, y: 0, size: Number.NaN }],
        edges: [],
      }),
    ).toThrow(/坐标非有限数/)

    const doc = normalizeGraphDoc({
      nodes: [{ id: 'a', label: 'a', x: 0, y: 0, size: Number.NaN }],
      edges: [{ id: 'e1', source: 'a', target: 'a', weight: Number.POSITIVE_INFINITY }],
    })
    expect(doc.nodes[0]!.size).toBeGreaterThan(0)
    expect(doc.edges[0]!.weight).toBeNull()
  })
})

describe('数据完整性：数据集', () => {
  it('图表列索引被夹取到实际列范围', () => {
    const dataset = normalizeDataset({
      id: 'd1',
      name: '单列',
      columns: ['x'],
      rows: [[1], [2]],
      chart: { kind: 'scatter', xColumn: 0, yColumn: 9 },
    }) as Dataset
    expect(dataset.chart.kind).toBe('scatter')
    if (dataset.chart.kind === 'scatter') {
      expect(dataset.chart.xColumn).toBe(0)
      expect(dataset.chart.yColumn).toBe(0)
    }
  })

  it('单列且未指定图表时使用直方图', () => {
    const dataset = normalizeDataset({
      id: 'd2',
      name: '单列',
      columns: ['x'],
      rows: [[1], [2]],
    }) as Dataset
    expect(dataset.chart.kind).toBe('histogram')
  })

  it('首列为文本时，导入默认图表仍指向数值列', () => {
    const table = parseDelimited('name,x,y\na,1,2\nb,2,4')
    expect(table.textColumns).toEqual([0])
    const scatter = tableToDataset(table)
    expect(scatter.chart.kind).toBe('scatter')
    if (scatter.chart.kind === 'scatter') {
      expect(scatter.chart.xColumn).toBe(1)
      expect(scatter.chart.yColumn).toBe(2)
    }

    const oneNumeric = tableToDataset(parseDelimited('name,v\na,1\nb,2'))
    expect(oneNumeric.chart.kind).toBe('histogram')
    if (oneNumeric.chart.kind === 'histogram') expect(oneNumeric.chart.column).toBe(1)
  })
})

describe('数据完整性：Notebook / 超图', () => {
  it('拒绝重复单元格 id', () => {
    const raw = JSON.stringify({
      title: 't',
      cells: [
        { id: 'same', type: 'markdown', text: 'a' },
        { id: 'same', type: 'markdown', text: 'b' },
      ],
    })
    expect(() => parseNotebook(raw)).toThrow(/id 重复/)
  })

  it('拒绝重复超边 id', () => {
    const raw = JSON.stringify({
      name: 'h',
      vertices: [{ id: 'v0' }, { id: 'v1' }],
      edges: [
        { id: 'e1', members: ['v0'] },
        { id: 'e1', members: ['v1'] },
      ],
    })
    expect(() => parseHypergraphJson(raw)).toThrow(/超边 id 不能重复/)
  })

  it('图形单元格的损坏快照不会进入 Notebook', () => {
    const raw = JSON.stringify({
      title: 't',
      cells: [{ id: 'f1', type: 'figure', doc: { objects: 'not-an-array' } }],
    })
    expect(() => parseNotebook(raw)).toThrow(/图形单元格的快照无效/)
  })

  it('实验档案逐条丢弃损坏记录，保留有效构造', () => {
    const archive = parseArchive(
      JSON.stringify({
        experiments: [{ id: 'bad-experiment' }],
        constructions: [
          { id: 'bad', title: '损坏' },
          {
            id: 'good',
            title: '有效构造',
            createdAt: '2026-01-01T00:00:00.000Z',
            hypergraph: { n: 3, edges: [[0, 1]] },
            notes: '',
          },
        ],
        comparisons: [{ id: 'bad-comparison', left: null }],
      }),
    )
    expect(archive.experiments).toHaveLength(0)
    expect(archive.comparisons).toHaveLength(0)
    expect(archive.constructions.map((item) => item.id)).toEqual(['good'])
  })
})
