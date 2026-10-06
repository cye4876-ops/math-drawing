/**
 * 图论实验台共享状态（v2.7）。
 * 面板（LabPanel）与舞台（LabView）共用一个模块级响应式状态；
 * 搜索在 Worker 中运行（进度流式上报；取消 = terminate 并重建）。
 */
import { SvelteDate } from 'svelte/reactivity'
import { DEFAULT_GRAPH_SPEC, validateGraphSpec, type GraphSpec } from '../lab/spec'
import { DEFAULT_HYPER_SPEC, validateHyperSpec, type HyperSpec } from '../lab/hyper-spec'
import {
  runGraphSearch,
  SEARCH_ALGORITHM,
  type GraphSearchResult,
  type OrderRecord,
  type SearchProgress,
  type SearchResumeSeed,
} from '../lab/search'
import {
  runHyperSearch,
  HYPER_SEARCH_ALGORITHM,
  type HyperSearchResult,
  type HyperSearchProgress,
} from '../lab/hyper-search'
import {
  analyzeHypergraph,
  compareHypergraphs,
  validateHypergraphInput,
  type HypergraphAnalysis,
  type HypergraphComparison,
  type LabHypergraph,
} from '../lab/hypergraph'
import {
  LabArchiveStore,
  experimentFromGraphSearch,
  experimentFromHyperSearch,
  resumeSeedFromGraphExperiment,
  type LabExperiment,
} from '../lab/archive'
import type { SearchWorkerRequest, SearchWorkerResponse } from '../lab/search-worker'

export type LabTab = 'search' | 'hyper' | 'compare' | 'archive'

/** Fano 平面默认示例（与实验说明一致） */
export const DEFAULT_ANALYSIS_EDGES = '0 1 2\n0 3 4\n0 5 6\n1 3 5\n1 4 6\n2 3 6\n2 4 5'

export const labState = $state({
  tab: 'search' as LabTab,

  // —— 普通图搜索 ——
  graphSpec: { ...DEFAULT_GRAPH_SPEC } as GraphSpec,
  graphRunning: false,
  graphProgress: null as SearchProgress | null,
  graphResult: null as GraphSearchResult | null,
  graphError: '',

  // —— 超图研究 ——
  hyperSpec: { ...DEFAULT_HYPER_SPEC } as HyperSpec,
  hyperRunning: false,
  hyperProgress: null as HyperSearchProgress | null,
  hyperResult: null as HyperSearchResult | null,
  hyperError: '',

  analysisN: 7,
  analysisEdges: DEFAULT_ANALYSIS_EDGES,
  analysis: null as HypergraphAnalysis | null,
  analysisError: '',
  analysisSavedAt: 0,

  compareLeftN: 6,
  compareLeftEdges: '0 1 2\n2 3 4',
  compareRightN: 6,
  compareRightEdges: '0 1 2\n2 3 4',
  compareResult: null as HypergraphComparison | null,
  compareError: '',
  compareLeftH: null as LabHypergraph | null,
  compareRightH: null as LabHypergraph | null,

  // —— 选中项（详情展示） ——
  selectedGraph: null as { orderIndex: number; candidateIndex: number } | null,
  selectedHyper: null as { orderIndex: number; candidateIndex: number } | null,

  // —— 档案 ——
  archiveVersion: 0,
  archiveNotice: '',
  /** 正在查看的档案记录 id（非空时舞台显示档案详情） */
  viewingExperimentId: null as string | null,
})

// —— 档案（懒初始化，测试环境无 localStorage 时不影响导入） ——

let archiveStore: LabArchiveStore | null = null

export function getArchive(): LabArchiveStore {
  if (!archiveStore) archiveStore = new LabArchiveStore(localStorage)
  return archiveStore
}

function bumpArchive(): void {
  labState.archiveVersion++
}

export function archiveExperiments(): LabExperiment[] {
  return getArchive().snapshot().experiments
}

/** 按 id 取档案记录（舞台详情用） */
export function getExperimentById(id: string | null): LabExperiment | null {
  if (!id) return null
  return (
    getArchive()
      .snapshot()
      .experiments.find((entry) => entry.id === id) ?? null
  )
}

// —— Worker 管理 ——

let worker: Worker | null = null

function ensureWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('../lab/search-worker.ts', import.meta.url), { type: 'module' })
    return worker
  } catch {
    return null
  }
}

function cancelWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
}

function runInWorker<T>(
  request: SearchWorkerRequest,
  handlers: {
    onProgress: (response: Extract<SearchWorkerResponse, { type: 'progress' }>) => void
    resolve: (result: T) => void
    reject: (message: string) => void
  },
): void {
  const instance = ensureWorker()
  if (!instance) {
    // 兜底：同步运行（界面短暂无响应）
    try {
      if (request.type === 'graph') {
        handlers.resolve(runGraphSearch(request.spec) as T)
      } else {
        handlers.resolve(runHyperSearch(request.spec) as T)
      }
    } catch (error) {
      handlers.reject(error instanceof Error ? error.message : String(error))
    }
    return
  }
  instance.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
    const message = event.data
    if (message.type === 'progress') {
      handlers.onProgress(message)
    } else if (message.type === 'result') {
      handlers.resolve(message.result as T)
    } else {
      handlers.reject(message.message)
    }
  }
  instance.onerror = (event) => handlers.reject(event.message || '搜索线程异常')
  instance.postMessage(request)
}

// —— 动作 ——

export function runGraphSearchAction(): void {
  if (labState.graphRunning) return
  let spec: GraphSpec
  try {
    spec = validateGraphSpec(labState.graphSpec)
    labState.graphSpec = spec
  } catch (error) {
    labState.graphError = error instanceof Error ? error.message : String(error)
    return
  }
  labState.graphError = ''
  labState.graphRunning = true
  labState.graphProgress = null
  labState.graphResult = null
  labState.selectedGraph = null
  labState.viewingExperimentId = null
  runInWorker<GraphSearchResult>(
    { type: 'graph', spec },
    {
      onProgress: (message) => {
        if (message.kind === 'graph') labState.graphProgress = message.progress as SearchProgress
      },
      resolve: (result) => {
        labState.graphResult = result
        labState.graphRunning = false
        cancelWorker()
      },
      reject: (message) => {
        labState.graphError = message
        labState.graphRunning = false
        cancelWorker()
      },
    },
  )
}

export function cancelGraphSearch(): void {
  if (!labState.graphRunning) return
  cancelWorker()
  labState.graphRunning = false
}

/** v3.1：由当前（未完成）搜索结果构造续算种子：只并入已完成的阶与它们的增量统计 */
function seedFromResult(result: GraphSearchResult): SearchResumeSeed {
  const completed = result.orders.filter((order) => order.complete)
  const sum = (pick: (order: OrderRecord) => number): number =>
    completed.reduce((total, order) => total + pick(order), 0)
  return {
    orders: completed,
    checked: sum((order) => order.checked),
    feasible: sum((order) => order.feasible),
    violations: sum((order) => order.violations),
    uncertainViolations: sum((order) => order.uncertainViolations),
    nodes: sum((order) => order.nodes),
    spectralEvaluations: sum((order) => order.spectralEvaluations),
    spectralPruned: sum((order) => order.spectralPruned),
  }
}

/**
 * v3.1 续算：优先对“正在查看的未完成档案”续算，否则续算当前未完成结果。
 * 已完成的阶直接沿用，本次仅重算其余阶。
 */
export function resumeGraphSearchAction(): void {
  if (labState.graphRunning) return
  const viewing = getExperimentById(labState.viewingExperimentId)
  let spec: GraphSpec | null = null
  let seed: SearchResumeSeed | null = null
  if (viewing && viewing.kind === 'graph' && !viewing.complete) {
    spec = viewing.spec as GraphSpec
    seed = resumeSeedFromGraphExperiment(viewing)
  } else if (labState.graphResult && !labState.graphResult.complete) {
    spec = labState.graphResult.spec
    seed = seedFromResult(labState.graphResult)
  }
  if (!spec || !seed) return
  try {
    spec = validateGraphSpec(spec)
  } catch (error) {
    labState.graphError = error instanceof Error ? error.message : String(error)
    return
  }
  labState.graphSpec = spec
  labState.graphError = ''
  labState.graphRunning = true
  labState.graphProgress = null
  labState.selectedGraph = null
  labState.viewingExperimentId = null
  runInWorker<GraphSearchResult>(
    { type: 'graph', spec, resume: seed },
    {
      onProgress: (message) => {
        if (message.kind === 'graph') labState.graphProgress = message.progress as SearchProgress
      },
      resolve: (result) => {
        labState.graphResult = result
        labState.graphRunning = false
        cancelWorker()
      },
      reject: (message) => {
        labState.graphError = message
        labState.graphRunning = false
        cancelWorker()
      },
    },
  )
}

export function runHyperSearchAction(): void {
  if (labState.hyperRunning) return
  let spec: HyperSpec
  try {
    spec = validateHyperSpec(labState.hyperSpec)
    labState.hyperSpec = spec
  } catch (error) {
    labState.hyperError = error instanceof Error ? error.message : String(error)
    return
  }
  labState.hyperError = ''
  labState.hyperRunning = true
  labState.hyperProgress = null
  labState.hyperResult = null
  labState.selectedHyper = null
  labState.viewingExperimentId = null
  runInWorker<HyperSearchResult>(
    { type: 'hyper', spec },
    {
      onProgress: (message) => {
        if (message.kind === 'hyper')
          labState.hyperProgress = message.progress as HyperSearchProgress
      },
      resolve: (result) => {
        labState.hyperResult = result
        labState.hyperRunning = false
        cancelWorker()
      },
      reject: (message) => {
        labState.hyperError = message
        labState.hyperRunning = false
        cancelWorker()
      },
    },
  )
}

export function cancelHyperSearch(): void {
  if (!labState.hyperRunning) return
  cancelWorker()
  labState.hyperRunning = false
}

/** 解析“每行一条超边”的文本输入 */
export function parseEdgeText(text: string): number[][] {
  const edges: number[][] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const parts = line.split(/[\s,，]+/).filter(Boolean)
    const vertices = parts.map((part) => {
      const value = Number(part)
      if (!Number.isInteger(value)) throw new Error(`超边顶点须为整数：${line}`)
      return value
    })
    edges.push(vertices)
  }
  return edges
}

export function analyzeAction(): void {
  try {
    const edges = parseEdgeText(labState.analysisEdges)
    const validated = validateHypergraphInput({ n: labState.analysisN, edges })
    labState.analysis = analyzeHypergraph(validated)
    labState.analysisError = ''
    labState.analysisSavedAt = Date.now()
  } catch (error) {
    labState.analysis = null
    labState.analysisError = error instanceof Error ? error.message : String(error)
  }
}

export function compareAction(): void {
  try {
    const left = validateHypergraphInput({
      n: labState.compareLeftN,
      edges: parseEdgeText(labState.compareLeftEdges),
    })
    const right = validateHypergraphInput({
      n: labState.compareRightN,
      edges: parseEdgeText(labState.compareRightEdges),
    })
    labState.compareLeftH = left
    labState.compareRightH = right
    labState.compareResult = compareHypergraphs(left, right)
    labState.compareError = ''
  } catch (error) {
    labState.compareResult = null
    labState.compareError = error instanceof Error ? error.message : String(error)
  }
}

// —— 档案动作 ——

export function saveGraphResultToArchive(): void {
  if (!labState.graphResult) return
  try {
    getArchive().addExperiment(experimentFromGraphSearch(labState.graphResult))
    labState.archiveNotice = '实验已保存到档案'
    bumpArchive()
  } catch (error) {
    labState.archiveNotice = error instanceof Error ? error.message : String(error)
  }
}

export function saveHyperResultToArchive(): void {
  if (!labState.hyperResult) return
  try {
    getArchive().addExperiment(experimentFromHyperSearch(labState.hyperResult))
    labState.archiveNotice = '实验已保存到档案'
    bumpArchive()
  } catch (error) {
    labState.archiveNotice = error instanceof Error ? error.message : String(error)
  }
}

export function saveAnalysisAsConstruction(): void {
  analyzeAction()
  if (!labState.analysis) return
  try {
    getArchive().addConstruction(`构造 n=${labState.analysis.n} · ${labState.analysis.m} 条超边`, {
      n: labState.analysis.n,
      edges: labState.analysis.edges.map((edge) => [...edge]),
    })
    labState.archiveNotice = '构造已保存到构造库'
    bumpArchive()
  } catch (error) {
    labState.archiveNotice = error instanceof Error ? error.message : String(error)
  }
}

export function saveCompareToArchive(): void {
  if (!labState.compareResult || !labState.compareLeftH || !labState.compareRightH) return
  try {
    getArchive().addComparison(
      `比较 ${new SvelteDate().toLocaleString('zh-CN', { hour12: false })}`,
      labState.compareLeftH,
      labState.compareRightH,
      labState.compareResult.isomorphic,
      labState.compareResult.cospectral,
    )
    labState.archiveNotice = '比较已保存到档案'
    bumpArchive()
  } catch (error) {
    labState.archiveNotice = error instanceof Error ? error.message : String(error)
  }
}

export function exportArchiveAction(): void {
  const text = getArchive().exportText()
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `graph-lab-archive-${new SvelteDate().toISOString().slice(0, 10)}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function importArchiveAction(file: File): Promise<void> {
  try {
    const text = await file.text()
    const counts = getArchive().importArchive(text)
    labState.archiveNotice = `已导入：实验 ${counts.experiments}、构造 ${counts.constructions}、比较 ${counts.comparisons}`
    bumpArchive()
  } catch (error) {
    labState.archiveNotice = error instanceof Error ? error.message : String(error)
  }
}

export function deleteExperiment(id: string): void {
  getArchive().removeExperiment(id)
  bumpArchive()
}

export function updateExperimentNotes(id: string, notes: string): void {
  getArchive().updateExperimentNotes(id, notes)
  bumpArchive()
}

export function deleteConstruction(id: string): void {
  getArchive().removeConstruction(id)
  bumpArchive()
}

export function deleteComparison(id: string): void {
  getArchive().removeComparison(id)
  bumpArchive()
}

/** 用档案中保存的规格重新运行（“冻结复算”；算法版本不同会提示） */
export function recomputeExperiment(experiment: LabExperiment): void {
  const expected = experiment.kind === 'graph' ? SEARCH_ALGORITHM : HYPER_SEARCH_ALGORITHM
  if (experiment.kind === 'graph') {
    labState.graphSpec = { ...(experiment.spec as GraphSpec) }
    labState.tab = 'search'
    runGraphSearchAction()
  } else {
    labState.hyperSpec = { ...(experiment.spec as HyperSpec) }
    labState.tab = 'hyper'
    runHyperSearchAction()
  }
  labState.archiveNotice =
    experiment.algorithm === expected
      ? '已按保存的规格重新运行（与保存记录同一算法版本）'
      : `记录来自 ${experiment.algorithm}，当前算法为 ${expected}，复算结果或与本记录不同`
}

/** 把超图加入自定义禁图编辑区（升到搜索面板） */
export function sendHypergraphToCustomForbidden(h: LabHypergraph, title: string): void {
  if (labState.hyperSpec.customForbidden.length >= 3) {
    labState.archiveNotice = '自定义禁超图最多 3 个'
    return
  }
  labState.hyperSpec.customForbidden = [
    ...labState.hyperSpec.customForbidden,
    { title, n: h.n, edges: h.edges.map((edge) => [...edge]) },
  ]
  labState.tab = 'hyper'
  labState.archiveNotice = '已加入自定义禁超图'
}
