/**
 * Notebook 模式共享状态（v1.0）：
 * - 单元格数据（$state 深代理，编辑即时响应）；
 * - 防抖执行（执行委托 notebook/model.runNotebook；级联更新为全量重跑，20 格规模毫秒级）；
 * - 执行后同步「环境参数」到曲线采样（跨格变量在 2D 绘图模式同样生效）；
 * - localStorage 自动保存 / 显式保存与载入。
 */
import {
  createCell,
  createNotebook,
  makeCellId,
  moveCell,
  parseNotebook,
  runNotebook,
  serializeNotebook,
  type Notebook,
  type NotebookCell,
  type NotebookCellType,
  type NotebookRunResult,
} from '../notebook/model'
import { setAmbientParameters } from '../render/curve-renderer'

const STORAGE_KEY = 'math-drawing-notebook-v1'

function loadFromStorage(): Notebook | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const json = localStorage.getItem(STORAGE_KEY)
    if (!json) return null
    return parseNotebook(json)
  } catch {
    return null
  }
}

let notebook = $state<Notebook>(loadFromStorage() ?? createNotebook('教学 Notebook'))
let runResult = $state<NotebookRunResult>({ scope: {}, cells: new Map() })
let executionMs = $state(0)
let saveState = $state<'saved' | 'saving' | 'error'>('saved')

let runTimer: ReturnType<typeof setTimeout> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

/** 立即执行并同步环境参数（初始化用） */
function runNow(): void {
  const started = performance.now()
  runResult = runNotebook(notebook)
  executionMs = Math.round((performance.now() - started) * 100) / 100
  setAmbientParameters(runResult.scope)
}

/** 防抖执行：编辑后 300ms 重跑（级联更新） */
export function scheduleRun(): void {
  if (runTimer !== null) clearTimeout(runTimer)
  runTimer = setTimeout(() => {
    runTimer = null
    runNow()
    scheduleSave()
  }, 300)
}

function scheduleSave(): void {
  saveState = 'saving'
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, serializeNotebook(notebook))
      }
      saveState = 'saved'
    } catch {
      saveState = 'error'
    }
  }, 500)
}

/** 强制立刻执行（按钮触发） */
export function runAll(): void {
  if (runTimer !== null) {
    clearTimeout(runTimer)
    runTimer = null
  }
  runNow()
  scheduleSave()
}

// 初始执行（模块加载时）
runNow()

// ---------- 读取 ----------

export function getNotebook(): Notebook {
  return notebook
}
export function getRunResult(): NotebookRunResult {
  return runResult
}
export function getExecutionMs(): number {
  return executionMs
}
export function getSaveState(): 'saved' | 'saving' | 'error' {
  return saveState
}

// ---------- 编辑 ----------

export function addCell(type: NotebookCellType, index?: number): NotebookCell {
  const cell = createCell(type)
  const at = index ?? notebook.cells.length
  notebook.cells.splice(at, 0, cell)
  scheduleRun()
  return cell
}

/** 添加插件单元格（插件系统注册的自定义格） */
export function addPluginCell(pluginType: string, data: unknown): NotebookCell {
  const cell = createCell('plugin')
  if (cell.type === 'plugin') {
    cell.pluginType = pluginType
    cell.data = data
  }
  notebook.cells.push(cell)
  scheduleRun()
  return cell
}

export function removeCell(id: string): void {
  const index = notebook.cells.findIndex((cell) => cell.id === id)
  if (index >= 0) {
    notebook.cells.splice(index, 1)
    scheduleRun()
  }
}

export function duplicateCell(id: string): void {
  const index = notebook.cells.findIndex((cell) => cell.id === id)
  if (index < 0) return
  const source = notebook.cells[index]!
  const copy = JSON.parse(JSON.stringify(source)) as NotebookCell
  copy.id = makeCellId()
  notebook.cells.splice(index + 1, 0, copy)
  scheduleRun()
}

export function toggleCollapse(id: string): void {
  const cell = notebook.cells.find((item) => item.id === id)
  if (cell) cell.collapsed = !cell.collapsed
}

/** 拖拽排序：from → to（插入位置） */
export function moveCellTo(from: number, to: number): void {
  notebook.cells = moveCell(notebook.cells, from, to)
  scheduleRun()
}

export function setNotebookTitle(title: string): void {
  notebook.title = title
  scheduleSave()
}

/** 整体替换（示例载入 / 文件导入 / 新建） */
export function loadNotebook(next: Notebook): void {
  notebook = next
  runAll()
}

export function newNotebook(): void {
  notebook = createNotebook('教学 Notebook')
  runAll()
}

/** 载入序列化 JSON（失败抛出 NotebookFormatError） */
export function loadNotebookJson(json: string): void {
  loadNotebook(parseNotebook(json))
}

export function exportNotebookJson(): string {
  return serializeNotebook(notebook)
}

/** 清空本地存储（测试/重置用） */
export function clearStoredNotebook(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 忽略
  }
}
