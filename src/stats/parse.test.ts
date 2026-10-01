import { describe, expect, it } from 'vitest'
import { parseDelimited, parseDelimitedAsync, tableToDataset } from './parse'

describe('stats/parse: CSV/TSV 解析', () => {
  it('逗号 CSV：表头 + 数值列', () => {
    const table = parseDelimited('x,y\n1,2\n3,4\n5,6')
    expect(table.columns).toEqual(['x', 'y'])
    expect(table.rows).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ])
    expect(table.rowCount).toBe(3)
  })

  it('制表符与分号分隔自动识别', () => {
    const tsv = parseDelimited('a\tb\n1\t2')
    expect(tsv.columns).toEqual(['a', 'b'])
    expect(tsv.rows).toEqual([[1, 2]])
    const semi = parseDelimited('a;b\n1;2')
    expect(semi.columns).toEqual(['a', 'b'])
    expect(semi.rows).toEqual([[1, 2]])
  })

  it('引号字段：内含逗号与换行；"" 转义', () => {
    const table = parseDelimited('name,value\n"a,b",1\n"line\nbreak",2\n"say ""hi""",3')
    expect(table.rows[0]).toEqual([null, 1]) // "a,b" 非数值 → null
    expect(table.rows[1]![1]).toBe(2)
    expect(table.rows[2]![1]).toBe(3)
  })

  it('BOM 与 CRLF、空行跳过', () => {
    const table = parseDelimited('\uFEFFx,y\r\n1,2\r\n\r\n3,4\r\n')
    expect(table.columns).toEqual(['x', 'y'])
    expect(table.rows).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('缺失值：空串 / NA / NaN / - 均记 null', () => {
    const table = parseDelimited('x,y\n1,NA\n,2\nNaN,-\n4,5')
    expect(table.rows).toEqual([
      [1, null],
      [null, 2],
      [null, null],
      [4, 5],
    ])
  })

  it('千分位：1,234.5 破碎片自动合并（逗号分隔场景）', () => {
    const table = parseDelimited('x,y\n1,234.5,7\n2,345,8')
    expect(table.rows).toEqual([
      [1234.5, 7],
      [2345, 8],
    ])
  })

  it('非数值列（> 50% 文本）置 null 并警告', () => {
    const table = parseDelimited('city,v\n北京,1\n上海,2\n广州,3')
    expect(table.textColumns).toEqual([0])
    expect(table.rows.map((row) => row[0])).toEqual([null, null, null])
    expect(table.warnings.some((w) => w.includes('非数值列'))).toBe(true)
  })

  it('无表头（全数值首行）自动生成 x1..xn', () => {
    const table = parseDelimited('1,2\n3,4')
    expect(table.columns).toEqual(['x1', 'x2'])
    expect(table.rows).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('列名去重', () => {
    const table = parseDelimited('x,x,x\n1,2,3')
    expect(table.columns).toEqual(['x', 'x_2', 'x_3'])
  })

  it('10 万行导入 < 3 秒（性能验收）', () => {
    const lines: string[] = ['x,y']
    for (let i = 0; i < 100_000; i++) lines.push(`${i},${Math.sin(i)}`)
    const text = lines.join('\n')
    const start = performance.now()
    const table = parseDelimited(text)
    const elapsed = performance.now() - start
    expect(table.rowCount).toBe(100_000)
    expect(elapsed).toBeLessThan(3000)
  })

  it('异步分片解析结果与同步一致（行数/列名）', async () => {
    const lines: string[] = ['x,y']
    for (let i = 0; i < 5000; i++) lines.push(`${i},${i * 2}`)
    const progress: number[] = []
    const table = await parseDelimitedAsync(lines.join('\n'), 1000, (f) => progress.push(f))
    expect(table.columns).toEqual(['x', 'y'])
    expect(table.rows.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1]).toBeCloseTo(1, 6)
  })

  it('tableToDataset：转数据集对象', () => {
    const table = parseDelimited('x,y\n1,2\n3,4')
    const dataset = tableToDataset(table, '测试数据')
    expect(dataset.type).toBe('dataset')
    expect(dataset.name).toBe('测试数据')
    expect(dataset.rows).toHaveLength(2)
    expect(dataset.chart.kind).toBe('scatter')
  })
})
