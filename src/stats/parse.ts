/**
 * CSV/TSV 解析与清洗（v0.7）：
 * - 分隔符自动识别：逗号 / 制表 / 分号（按引号外出现频次）；
 * - 引号字段（含分隔符/换行/"" 转义）；BOM；CRLF/LF；空行跳过；
 * - 表头识别：首行存在非数值（且非缺失）单元格 → 作为列名（去重），否则生成 x1..xn；
 * - 缺失值：空串 / NA / N/A / NaN / null / - / —（不分大小写）；
 * - 千分位：字段级尝试去逗号（1,234.5）；行内多出的相邻数字碎片自动合并；
 * - 文本列：非缺失单元格数值比例 < 50% → 整列置 null 并给出警告。
 */
import { normalizeDataset, type Dataset } from './model'

export interface ParsedTable {
  columns: string[]
  rows: (number | null)[][]
  /** 被判定为文本（置 null）的列索引 */
  textColumns: number[]
  warnings: string[]
  rowCount: number
}

const MISSING_VALUES = new Set(['', 'na', 'n/a', 'nan', 'null', 'nil', '-', '—', '–'])

function isMissing(text: string): boolean {
  return MISSING_VALUES.has(text.trim().toLowerCase())
}

/** 尝试解析数值（含千分位与前后空白）；失败返回 undefined */
function tryParseNumber(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const direct = Number(trimmed)
  if (Number.isFinite(direct)) return direct
  // 千分位：1,234 / 1,234.5 / -1,234,567
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?([eE][-+]?\d+)?$/.test(trimmed)) {
    const cleaned = Number(trimmed.replace(/,/g, ''))
    if (Number.isFinite(cleaned)) return cleaned
  }
  // 全角空格与 NBSP
  const cleaned2 = Number(trimmed.replace(/[\u00a0\u3000]/g, ''))
  if (Number.isFinite(cleaned2) && /^[-+]?[\d.]/.test(trimmed.replace(/[\u00a0\u3000]/g, ''))) {
    return cleaned2
  }
  return undefined
}

/** 扫描：按分隔符切分（引号感知），返回行数组（每行单元格文本） */
function scanCells(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text
  const len = source.length
  while (i < len) {
    const ch = source[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"' && cell.trim() === '') {
      inQuotes = true
      cell = ''
      i++
      continue
    }
    if (ch === delimiter) {
      cells.push(cell)
      cell = ''
      i++
      continue
    }
    if (ch === '\r') {
      // CRLF 或 CR：行结束
      cells.push(cell)
      rows.push(cells)
      cells = []
      cell = ''
      i += source[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (ch === '\n') {
      cells.push(cell)
      rows.push(cells)
      cells = []
      cell = ''
      i++
      continue
    }
    cell += ch
    i++
  }
  cells.push(cell)
  rows.push(cells)
  return rows
}

/** 推断分隔符：取前若干行中引号外出现次数最多的候选 */
function detectDelimiter(text: string): string {
  const candidates = [',', '\t', ';']
  const counts = new Map<string, number>(candidates.map((c) => [c, 0]))
  let inQuotes = false
  let lines = 0
  for (let i = 0; i < text.length && lines < 30; i++) {
    const ch = text[i]!
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === '\n' && !inQuotes) lines++
    else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  let best = ','
  let bestCount = 0
  for (const [candidate, count] of counts) {
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

/** 合并行内多出的数字碎片（千分位被误切，如 "1,234.5" → ["1","234.5"]） */
function mergeNumericFragments(cells: string[], columnCount: number): string[] {
  if (cells.length <= columnCount) return cells
  const out: string[] = []
  for (let i = 0; i < cells.length; i++) {
    const current = cells[i]!
    const next = cells[i + 1]
    if (
      next !== undefined &&
      /^[-+]?\d{1,3}$/.test(current.trim()) &&
      /^\d{3}(\.\d+)?([eE][-+]?\d+)?$/.test(next.trim())
    ) {
      out.push(`${current.trim()},${next.trim()}`)
      i++
      continue
    }
    out.push(current)
  }
  return out
}

/** 解析分隔文本（同步；10 万行约 1 秒量级） */
export function parseDelimited(text: string): ParsedTable {
  const warnings: string[] = []
  const delimiter = detectDelimiter(text)
  const scanned = scanCells(text, delimiter)
  // 去掉纯空行（全单元格空白）
  const nonEmpty = scanned.filter((row) => row.some((cell) => cell.trim() !== ''))
  if (nonEmpty.length === 0) {
    return { columns: [], rows: [], textColumns: [], warnings: ['未找到有效数据'], rowCount: 0 }
  }

  const first = nonEmpty[0]!
  const headerDetected = first.some(
    (cell) => !isMissing(cell) && tryParseNumber(cell) === undefined,
  )
  const dataRows = headerDetected ? nonEmpty.slice(1) : nonEmpty
  const rawColumns = headerDetected
    ? first.map((cell, i) => cell.trim() || `x${i + 1}`)
    : first.map((_, i) => `x${i + 1}`)

  // 列名去重（空名回退，重名加后缀）
  const seen = new Map<string, number>()
  const columns = rawColumns.map((name) => {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    return count === 0 ? name : `${name}_${count + 1}`
  })
  const columnCount = columns.length

  // 逐行解析：先合并千分位碎片，再补齐/截断
  const numericRows: (number | null)[][] = []
  for (const raw of dataRows) {
    const merged = mergeNumericFragments(raw, columnCount)
    const cells = merged.slice(0, columnCount)
    while (cells.length < columnCount) cells.push('')
    numericRows.push(cells.map((cell) => tryParseNumber(cell) ?? null))
  }

  // 文本列判定（非缺失单元格中数值比例 < 50%）
  const textColumns: number[] = []
  for (let c = 0; c < columnCount; c++) {
    let total = 0
    let numeric = 0
    for (let r = 0; r < dataRows.length; r++) {
      const rawCell = (dataRows[r]![c] ?? '').trim()
      if (rawCell === '' || isMissing(rawCell)) continue
      total++
      if (tryParseNumber(rawCell) !== undefined) numeric++
    }
    if (total > 0 && numeric / total < 0.5) textColumns.push(c)
  }
  for (const c of textColumns) {
    warnings.push(`第 ${c + 1} 列「${columns[c]}」判定为非数值列，已置空`)
    for (const row of numericRows) row[c] = null
  }
  // 顺带修正：单格非数值（列数值占比 ≥50%）同样置 null 不报警
  return { columns, rows: numericRows, textColumns, warnings, rowCount: numericRows.length }
}

/** 分片异步解析（大文本不阻塞 UI；每片让出主线程） */
export async function parseDelimitedAsync(
  text: string,
  chunkRows = 4000,
  onProgress?: (fraction: number) => void,
): Promise<ParsedTable> {
  // 简单策略：先统计行数，分片交给 scanCells（通过切分行段）
  const lines = text.split(/\r\n|\r|\n/)
  if (lines.length <= chunkRows) {
    const result = parseDelimited(text)
    onProgress?.(1)
    return result
  }
  const parts: string[] = []
  for (let i = 0; i < lines.length; i += chunkRows) {
    parts.push(lines.slice(i, i + chunkRows).join('\n'))
    onProgress?.(Math.min(1, (i + chunkRows) / lines.length) * 0.3)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  // 各分片做「行级」粗解析后合并（引号跨片边界属极端情况，README 注明）
  const merged: ParsedTable = { columns: [], rows: [], textColumns: [], warnings: [], rowCount: 0 }
  let first = true
  for (let i = 0; i < parts.length; i++) {
    const part = parseDelimited(parts[i]!)
    if (first && part.columns.length > 0) {
      merged.columns = part.columns
      first = false
    }
    merged.rows.push(...part.rows)
    merged.warnings.push(...part.warnings)
    onProgress?.(0.3 + (0.7 * (i + 1)) / parts.length)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  merged.rowCount = merged.rows.length
  return merged
}

/** 解析结果 → Dataset（列选择与默认图表由调用方覆盖） */
export function tableToDataset(table: ParsedTable, name = '数据集'): Dataset {
  const numericColumns = table.columns.filter((_, i) => !table.textColumns.includes(i))
  const chart =
    numericColumns.length >= 2
      ? undefined
      : {
          kind: 'histogram' as const,
          column: 0,
          bins: 'auto' as const,
          kde: true,
          kernel: 'gaussian' as const,
        }
  const base = normalizeDataset({
    name,
    columns: table.columns,
    rows: table.rows,
    chart,
  })
  return base
}
