/**
 * Notebook 模型与执行引擎（v1.0）：
 * - 单元格：markdown / figure / compute / data（+ 插件格由插件系统扩展）；
 * - 跨格变量引用：compute 格 `a = 2` 定义变量，后续格表达式以 scope 求值；
 * - 变量级依赖图：拓扑排序执行 + 循环依赖检测（环内格报错，不进入死循环）；
 * - 同名变量以文档中最后一次赋值为准，前序定义标记「被覆盖」；
 * - 防抖与级联更新由 UI 层驱动（本模块为纯函数全量执行，20 格规模毫秒级）。
 */
import {
  collectFreeVariables,
  evaluate,
  INDEPENDENT_VARIABLES,
  isConstantName,
  parse,
  type Expr,
} from '../expr'
import {
  runSymbolicOperation,
  type SymbolicOperation,
  type SymbolicOperationResult,
} from '../symbolic/run'
import { toLatex } from '../symbolic/latex'
import { parseDelimited } from '../stats/parse'
import type { DocState, ViewTransform } from '../state/types'

// ---------- 单元格模型 ----------

export type NotebookCellType = 'markdown' | 'figure' | 'compute' | 'data' | 'plugin'

interface CellBase {
  id: string
  collapsed: boolean
}

export interface MarkdownCell extends CellBase {
  type: 'markdown'
  /** Markdown 文本（支持 $...$ 与 $$...$$ 公式） */
  text: string
}

export type ComputeOperation = 'evaluate' | SymbolicOperation

export interface ComputeCell extends CellBase {
  type: 'compute'
  /** 表达式或赋值（a = 2） */
  source: string
  operation: ComputeOperation
  /** 仅 limit 使用：极限点（数字或 inf / -inf） */
  limitPoint: string
}

export interface FigureCell extends CellBase {
  type: 'figure'
  /** 捕获的文档快照（对象 + 视图） */
  doc: DocState | null
  view: ViewTransform | null
  caption: string
}

export interface DataCell extends CellBase {
  type: 'data'
  /** 内联 CSV/TSV 文本 */
  csv: string
}

/** 插件单元格（v1.0 插件接口注册的自定义格） */
export interface PluginCell extends CellBase {
  type: 'plugin'
  /** 注册的插件单元格类型 id */
  pluginType: string
  /** 插件自有数据（原样序列化） */
  data: unknown
}

export type NotebookCell = MarkdownCell | ComputeCell | FigureCell | DataCell | PluginCell

export interface Notebook {
  title: string
  cells: NotebookCell[]
}

export class NotebookFormatError extends Error {}

let idCounter = 0

/** 生成单元格 id（浏览器 / Node 通用，不依赖 crypto） */
export function makeCellId(): string {
  idCounter++
  return `cell-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

export function createCell(type: NotebookCellType): NotebookCell {
  const id = makeCellId()
  switch (type) {
    case 'markdown':
      return {
        id,
        type: 'markdown',
        collapsed: false,
        text: '# 标题\n\n支持 **Markdown** 与公式 $a^2 + b^2 = c^2$。',
      }
    case 'compute':
      return {
        id,
        type: 'compute',
        collapsed: false,
        source: 'a = 2',
        operation: 'evaluate',
        limitPoint: '0',
      }
    case 'figure':
      return { id, type: 'figure', collapsed: false, doc: null, view: null, caption: '' }
    case 'data':
      return { id, type: 'data', collapsed: false, csv: 'x,y\n1,1\n2,4\n3,9' }
    case 'plugin':
      return { id, type: 'plugin', collapsed: false, pluginType: '', data: null }
  }
}

export function createNotebook(title = '未命名 Notebook'): Notebook {
  return { title, cells: [createCell('markdown'), createCell('compute')] }
}

/** 移动单元格（拖拽排序）：from → to（to 为插入位置索引） */
export function moveCell(cells: NotebookCell[], from: number, to: number): NotebookCell[] {
  if (from < 0 || from >= cells.length) return cells
  const next = [...cells]
  const [cell] = next.splice(from, 1)
  if (!cell) return cells
  const target = Math.max(0, Math.min(next.length, to > from ? to - 1 : to))
  next.splice(target, 0, cell)
  return next
}

// ---------- 序列化 ----------

export function serializeNotebook(notebook: Notebook): string {
  return JSON.stringify(notebook)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const CELL_TYPES: readonly NotebookCellType[] = ['markdown', 'figure', 'compute', 'data', 'plugin']

function parseCell(raw: unknown, index: number): NotebookCell {
  if (!isRecord(raw)) throw new NotebookFormatError(`第 ${index + 1} 个单元格不是对象`)
  const type = raw['type']
  if (typeof type !== 'string' || !CELL_TYPES.includes(type as NotebookCellType)) {
    throw new NotebookFormatError(`第 ${index + 1} 个单元格类型无效：${String(type)}`)
  }
  const id = typeof raw['id'] === 'string' && raw['id'] !== '' ? raw['id'] : makeCellId()
  const collapsed = raw['collapsed'] === true
  switch (type as NotebookCellType) {
    case 'markdown':
      return {
        id,
        type: 'markdown',
        collapsed,
        text: typeof raw['text'] === 'string' ? raw['text'] : '',
      }
    case 'compute': {
      const operation = raw['operation']
      const valid: ComputeOperation[] = [
        'evaluate',
        'simplify',
        'expand',
        'solve',
        'integrate',
        'limit',
        'latex',
        'inequality',
      ]
      return {
        id,
        type: 'compute',
        collapsed,
        source: typeof raw['source'] === 'string' ? raw['source'] : '',
        operation: valid.includes(operation as ComputeOperation)
          ? (operation as ComputeOperation)
          : 'evaluate',
        limitPoint: typeof raw['limitPoint'] === 'string' ? raw['limitPoint'] : '0',
      }
    }
    case 'figure': {
      const doc = raw['doc']
      const view = raw['view']
      return {
        id,
        type: 'figure',
        collapsed,
        doc: isRecord(doc) ? (doc as unknown as DocState) : null,
        view: isRecord(view) ? (view as unknown as ViewTransform) : null,
        caption: typeof raw['caption'] === 'string' ? raw['caption'] : '',
      }
    }
    case 'data':
      return { id, type: 'data', collapsed, csv: typeof raw['csv'] === 'string' ? raw['csv'] : '' }
    case 'plugin':
      return {
        id,
        type: 'plugin',
        collapsed,
        pluginType: typeof raw['pluginType'] === 'string' ? raw['pluginType'] : '',
        data: raw['data'],
      }
  }
}

export function parseNotebook(json: string): Notebook {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (error) {
    throw new NotebookFormatError(`Notebook JSON 解析失败：${(error as Error).message}`)
  }
  if (!isRecord(data)) throw new NotebookFormatError('Notebook 根节点必须是对象')
  const cellsRaw = data['cells']
  if (!Array.isArray(cellsRaw)) throw new NotebookFormatError('Notebook 缺少 cells 数组')
  return {
    title: typeof data['title'] === 'string' ? data['title'] : '未命名 Notebook',
    cells: cellsRaw.map((cell, index) => parseCell(cell, index)),
  }
}

// ---------- 变量分析与依赖图 ----------

/** 从表达式源码中提取自由变量（排除自变量与常量；解析失败返回空集） */
function variablesOfSource(source: string): string[] {
  try {
    const expr = parse(source)
    const inner = expr.type === 'assignment' ? expr.value : expr
    return collectFreeVariables(inner).filter((name) => !INDEPENDENT_VARIABLES.includes(name))
  } catch {
    return []
  }
}

/** 深度收集对象中表达式字段（key 以 expr 开头）的字符串 */
function collectDocExpressions(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectDocExpressions(item, out)
    return
  }
  if (!isRecord(value)) return
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && /^expr\d*$/i.test(key)) {
      out.push(item)
    } else {
      collectDocExpressions(item, out)
    }
  }
}

function figureVariables(cell: FigureCell): string[] {
  if (!cell.doc) return []
  const sources: string[] = []
  collectDocExpressions(cell.doc.objects, sources)
  const names = new Set<string>()
  for (const source of sources) {
    for (const name of variablesOfSource(source)) names.add(name)
  }
  return [...names]
}

export interface NotebookAnalysis {
  /** 变量名 → 最终定义格索引 */
  definitions: Map<string, number>
  /** 每格引用的外部变量 */
  references: Map<string, string[]>
  /** 每格直接依赖的定义格索引 */
  dependencies: Map<string, Set<number>>
  /** 循环依赖核心环上的格 id */
  cyclic: Set<string>
  /** 被循环阻塞（上游在环中）的格 id */
  blocked: Set<string>
  /** 环路径变量名（用于报错文案，如 a → b → a） */
  cycleVariables: string[]
  /** 警告：格 id → 消息（如变量被后续同名赋值覆盖） */
  warnings: Map<string, string>
  /** 拓扑执行顺序（全部格 id，稳定按文档顺序） */
  order: string[]
}

export function analyzeNotebook(notebook: Notebook): NotebookAnalysis {
  const cells = notebook.cells
  const definitions = new Map<string, number>()
  const warnings = new Map<string, string>()
  const references = new Map<string, string[]>()
  const dependencies = new Map<string, Set<number>>()

  // 1. 收集定义（后覆盖前）与每格引用
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]!
    if (cell.type === 'compute') {
      try {
        const expr: Expr = parse(cell.source)
        if (expr.type === 'assignment') {
          const previous = definitions.get(expr.name)
          definitions.set(expr.name, index)
          if (previous !== undefined) {
            const previousCell = cells[previous]!
            warnings.set(previousCell.id, `变量 ${expr.name} 被后续同名赋值覆盖`)
          }
        }
      } catch {
        // 解析失败在执行阶段报错
      }
      references.set(cell.id, variablesOfSource(cell.source))
    } else if (cell.type === 'figure') {
      references.set(cell.id, figureVariables(cell))
    } else {
      references.set(cell.id, [])
    }
  }

  // 2. 每格依赖的定义格
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index]!
    const deps = new Set<number>()
    for (const name of references.get(cell.id) ?? []) {
      const definition = definitions.get(name)
      if (definition !== undefined) deps.add(definition)
    }
    dependencies.set(cell.id, deps)
  }

  // 3. Kahn 拓扑（稳定：每次取文档序最小的入度零节点）
  const n = cells.length
  const indegree = new Array<number>(n).fill(0)
  const dependents = new Map<number, number[]>()
  for (let index = 0; index < n; index++) {
    const deps = dependencies.get(cells[index]!.id) ?? new Set()
    indegree[index] = deps.size
    for (const dep of deps) {
      const list = dependents.get(dep) ?? []
      list.push(index)
      dependents.set(dep, list)
    }
  }
  const order: string[] = []
  const sorted = new Set<number>()
  for (let step = 0; step < n; step++) {
    let picked = -1
    for (let index = 0; index < n; index++) {
      if (!sorted.has(index) && indegree[index] === 0) {
        picked = index
        break
      }
    }
    if (picked < 0) break
    sorted.add(picked)
    order.push(cells[picked]!.id)
    for (const dependent of dependents.get(picked) ?? []) {
      indegree[dependent] = (indegree[dependent] ?? 1) - 1
    }
  }

  // 4. 环检测：未排序节点中找核心环（沿依赖边 DFS）
  const cyclic = new Set<string>()
  const blocked = new Set<string>()
  const cycleVariables: string[] = []
  const unsorted: number[] = []
  for (let index = 0; index < n; index++) if (!sorted.has(index)) unsorted.push(index)
  if (unsorted.length > 0) {
    const unsortedSet = new Set(unsorted)
    // 找核心环：从任一未排序节点沿依赖边前进，重复访问即环
    const visitState = new Map<number, number>() // 1=访问中, 2=完成
    let cycleNodes: number[] = []
    const dfs = (node: number, stack: number[]): boolean => {
      if (visitState.get(node) === 1) {
        cycleNodes = stack.slice(stack.indexOf(node))
        return true
      }
      if (visitState.get(node) === 2) return false
      visitState.set(node, 1)
      stack.push(node)
      for (const dep of dependencies.get(cells[node]!.id) ?? []) {
        if (unsortedSet.has(dep) && dfs(dep, stack)) return true
      }
      stack.pop()
      visitState.set(node, 2)
      return false
    }
    for (const node of unsorted) {
      if (dfs(node, [])) break
    }
    const cycleSet = new Set(cycleNodes)
    // 环上变量名（每格的赋值名）
    for (const node of cycleNodes) {
      const cell = cells[node]!
      if (cell.type === 'compute') {
        try {
          const expr = parse(cell.source)
          if (expr.type === 'assignment') cycleVariables.push(expr.name)
        } catch {
          // 忽略
        }
      }
    }
    for (const node of unsorted) {
      const id = cells[node]!.id
      if (cycleSet.has(node)) cyclic.add(id)
      else blocked.add(id)
    }
    if (cycleVariables.length > 0) cycleVariables.push(cycleVariables[0]!)
  }

  return { definitions, references, dependencies, cyclic, blocked, cycleVariables, warnings, order }
}

// ---------- 执行 ----------

export interface CellExecutionResult {
  status: 'ok' | 'error' | 'empty'
  error?: string
  /** 数值结果 */
  value?: number
  /** 显示文本 */
  text?: string
  /** LaTeX（evaluate 结果公式） */
  latex?: string
  /** 该格定义的变量 */
  defined?: { name: string; value: number }
  /** data 格解析结果 */
  table?: {
    columns: string[]
    rowCount: number
    preview: (number | null)[][]
    warnings: string[]
  }
  /** 符号操作完整输出 */
  symbolic?: SymbolicOperationResult
}

export interface NotebookRunResult {
  scope: Record<string, number>
  cells: Map<string, CellExecutionResult>
}

/** 数字格式化：整数直出，非有限值用数学符号，其余 6 位有效数字 */
export function formatResult(value: number): string {
  if (Number.isNaN(value)) return '未定义'
  if (value === Number.POSITIVE_INFINITY) return '∞'
  if (value === Number.NEGATIVE_INFINITY) return '−∞'
  if (Number.isInteger(value)) return String(value)
  const text = value.toPrecision(6)
  return text.includes('e') ? text : text.replace(/0+$/, '').replace(/\.$/, '')
}

/** 执行整个 Notebook（拓扑序；环内与受阻格报错不执行） */
export function runNotebook(notebook: Notebook): NotebookRunResult {
  const analysis = analyzeNotebook(notebook)
  const scope: Record<string, number> = {}
  const cells = new Map<string, CellExecutionResult>()

  // 环内与受阻格不在拓扑序中：先标记错误
  for (const cell of notebook.cells) {
    if (analysis.cyclic.has(cell.id)) {
      const path = analysis.cycleVariables.length > 0 ? analysis.cycleVariables.join(' → ') : '变量'
      cells.set(cell.id, { status: 'error', error: `循环依赖：${path}` })
    } else if (analysis.blocked.has(cell.id)) {
      cells.set(cell.id, { status: 'error', error: '依赖的变量处于循环依赖中，无法求值' })
    }
  }
  for (const cellId of analysis.order) {
    const cell = notebook.cells.find((item) => item.id === cellId)
    if (!cell || cells.has(cell.id)) continue
    cells.set(cell.id, executeCell(cell, scope))
  }
  // 未进入 order 的格（防御性兜底）
  for (const cell of notebook.cells) {
    if (!cells.has(cell.id)) cells.set(cell.id, { status: 'empty' })
  }
  // 追加警告（被覆盖定义）
  for (const [cellId, message] of analysis.warnings) {
    const result = cells.get(cellId)
    if (result && result.status === 'ok') {
      result.text = result.text ? `${result.text}（${message}）` : message
    }
  }
  return { scope, cells }
}

/** 未定义变量检查：scope 中缺失且非自变量的名字 */
function undefinedReferences(source: string, scope: Record<string, number>): string[] {
  const expr = parse(source)
  const inner = expr.type === 'assignment' ? expr.value : expr
  return collectFreeVariables(inner).filter(
    (name) => !INDEPENDENT_VARIABLES.includes(name) && scope[name] === undefined,
  )
}

function executeCell(cell: NotebookCell, scope: Record<string, number>): CellExecutionResult {
  if (cell.type === 'markdown' || cell.type === 'figure' || cell.type === 'plugin') {
    return { status: 'empty' }
  }
  if (cell.type === 'data') {
    if (cell.csv.trim() === '') return { status: 'empty' }
    const table = parseDelimited(cell.csv)
    return {
      status: 'ok',
      table: {
        columns: table.columns,
        rowCount: table.rowCount,
        preview: table.rows.slice(0, 20),
        warnings: table.warnings,
      },
    }
  }
  // compute
  const source = cell.source.trim()
  if (source === '') return { status: 'empty' }
  let expr: Expr
  try {
    expr = parse(source)
  } catch (error) {
    return { status: 'error', error: `解析失败：${(error as Error).message}` }
  }
  if (expr.type === 'assignment') {
    if (INDEPENDENT_VARIABLES.includes(expr.name)) {
      return {
        status: 'error',
        error: `${expr.name} 是自变量名，不能作为 Notebook 变量（可用 a、k、n 等）`,
      }
    }
    if (isConstantName(expr.name)) {
      return {
        status: 'error',
        error: `${expr.name} 是内置常量（pi/e/phi/tau），不能作为 Notebook 变量`,
      }
    }
    const missing = undefinedReferences(cell.source, scope)
    if (missing.length > 0) {
      return { status: 'error', error: `变量未定义：${missing.join(', ')}` }
    }
    try {
      const value = evaluate(expr.value, scope)
      if (!Number.isFinite(value)) {
        return { status: 'error', error: '求值结果不是有限数（检查定义域或除零）' }
      }
      scope[expr.name] = value
      return {
        status: 'ok',
        value,
        defined: { name: expr.name, value },
        latex: `${expr.name} = ${toLatex(expr.value)}`,
      }
    } catch (error) {
      return { status: 'error', error: `求值失败：${(error as Error).message}` }
    }
  }
  // 常量名赋值（e = 5）不产生 assignment 节点：按源文本识别并报错
  const constantAssignment = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(source)
  if (constantAssignment && isConstantName(constantAssignment[1]!)) {
    return {
      status: 'error',
      error: `${constantAssignment[1]} 是内置常量（pi/e/phi/tau），不能作为 Notebook 变量`,
    }
  }
  if (cell.operation === 'evaluate') {
    const missing = undefinedReferences(cell.source, scope)
    if (missing.length > 0) {
      return { status: 'error', error: `变量未定义：${missing.join(', ')}` }
    }
    try {
      const value = evaluate(expr, scope)
      return {
        status: 'ok',
        value,
        text: formatResult(value),
        latex: toLatex(expr),
      }
    } catch (error) {
      return { status: 'error', error: `求值失败：${(error as Error).message}` }
    }
  }
  // 符号操作（不依赖 scope：自由变量视为符号本身）
  const symbolic = runSymbolicOperation(cell.source, cell.operation, cell.limitPoint)
  return {
    status: symbolic.ok ? 'ok' : 'error',
    error: symbolic.ok ? undefined : symbolic.text.join('；'),
    symbolic,
  }
}
