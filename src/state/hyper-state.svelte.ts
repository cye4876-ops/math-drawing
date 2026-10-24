/**
 * 超图、彩虹与极值计算台共享状态（v3.4 / v3.5 / v3.6）。
 * HyperView（画布）与 HyperPanel（控件）通过模块级 runes 共享；不进入文档序列化。
 */
import type { AntiRamseyResult, ColoredGraph, RainbowCopy } from '../graph/rainbow'
import {
  buildColoredComplete,
  completeEdgePairs,
  completeGraphWithColoring,
} from '../graph/rainbow'
import { docFromEdgeSets, type HypergraphDoc } from '../hypergraph/model'
import type { HyperPresetKind } from '../hypergraph/presets'
import { buildHypergraphPreset } from '../hypergraph/presets'
import type { HyperRainbowResult } from '../hypergraph/rainbow'
import { atlasEdgeList } from '../extremal/atlas'
import type { HyperTuranPattern, HyperTuranResult } from '../extremal/hyper-turan'
import { HYPER_TURAN_LABELS, ex3Uniform } from '../extremal/hyper-turan'
import {
  parseCustomPattern,
  patternGraph,
  patternPreset,
  subscript,
  turanEdges,
  turanGraph,
} from '../extremal/patterns'
import { triangleRamsey, type RamseyResult } from '../extremal/ramsey'
import { extremalSearch, type ExtremalSearchResult, type PatternMode } from '../extremal/search'

export type HyperTab = 'hypergraph' | 'rainbow' | 'extremal'
export type HyperViewMode = 'set' | 'bipartite' | 'section' | 'line'
export type RainbowPreset = 'rainbow' | 'gallai' | 'random3'

export interface HyperSelection {
  kind: 'vertex' | 'edge'
  index: number
}

export interface HyperWitness {
  kind: 'none' | 'matching' | 'transversal' | 'propertyB'
  edges: number[]
  vertices: number[]
  label: string
}

export interface RainbowState {
  n: number
  preset: RainbowPreset
  graph: ColoredGraph
  patternId: string
  copies: RainbowCopy[]
  selectedCopy: number
  searchNote: string
  searchComplete: boolean
  anti: AntiRamseyResult | null
  antiMessage: string
  gallai: { gallai: boolean; count: number; complete: boolean } | null
  hyperSize: number
  hyperResult: HyperRainbowResult | null
}

export interface ExtremalPreview {
  n: number
  edges: Array<[number, number]>
  /** 可选边颜色（Ramsey 见证） */
  colors?: string[]
  title: string
  subtitle: string
}

export interface ExtremalState {
  n: number
  patternId: string
  mode: PatternMode
  customEdges: string
  customError: string
  result: ExtremalSearchResult | null
  selectedExtremal: number
  preview: ExtremalPreview | null
  previewNote: string
  turanParts: number
  turanMessage: string
  ramseyN: number
  ramsey: RamseyResult | null
  hyperN: number
  hyperPattern: HyperTuranPattern
  hyperResult: HyperTuranResult | null
}

function initialExtremalPreview(): ExtremalPreview {
  const turan = turanGraph(6, 2)
  return {
    n: 6,
    edges: turan.edges,
    title: 'T₂(6)：Mantel 极图',
    subtitle: '6 个顶点 · 9 条边 · 二部平衡完全图',
  }
}

function emptyWitness(): HyperWitness {
  return { kind: 'none', edges: [], vertices: [], label: '' }
}

export const hyperLab = $state({
  tab: 'hypergraph' as HyperTab,
  view: 'set' as HyperViewMode,
  preset: 'complete' as HyperPresetKind,
  n: 5,
  r: 3,
  seed: 7,
  doc: buildHypergraphPreset('complete', 5, 3, 7) as HypergraphDoc,
  selected: null as HyperSelection | null,
  witness: emptyWitness(),
  coloring: null as number[] | null,
  error: '',
  rainbow: {
    n: 5,
    preset: 'rainbow' as RainbowPreset,
    graph: buildColoredComplete(5, 'rainbow'),
    patternId: 'cycle3',
    copies: [],
    selectedCopy: 0,
    searchNote: '',
    searchComplete: true,
    anti: null,
    antiMessage: '',
    gallai: null,
    hyperSize: 2,
    hyperResult: null,
  } as RainbowState,
  extremal: {
    n: 6,
    patternId: 'K3',
    mode: 'subgraph' as PatternMode,
    customEdges: '0-1, 1-2, 2-0',
    customError: '',
    result: null,
    selectedExtremal: 0,
    preview: initialExtremalPreview(),
    previewNote: '默认展示 T₂(6)：9 条边，Mantel 定理的极图。',
    turanParts: 2,
    turanMessage: '',
    ramseyN: 5,
    ramsey: null,
    hyperN: 6,
    hyperPattern: 'K4_3' as HyperTuranPattern,
    hyperResult: null,
  } as ExtremalState,
})

export function setHyperTab(tab: HyperTab): void {
  hyperLab.tab = tab
  hyperLab.error = ''
}

export function setHyperView(view: HyperViewMode): void {
  hyperLab.view = view
  hyperLab.selected = null
}

export function selectHyper(selection: HyperSelection | null): void {
  hyperLab.selected = selection
}

export function clearHyperWitness(): void {
  hyperLab.witness = emptyWitness()
  hyperLab.coloring = null
}

export function replaceHyperDoc(doc: HypergraphDoc): void {
  hyperLab.doc = doc
  hyperLab.selected = null
  hyperLab.witness = emptyWitness()
  hyperLab.coloring = null
  hyperLab.error = ''
  hyperLab.n = doc.vertices.length
  const firstEdge = doc.edges[0]
  if (firstEdge) hyperLab.r = firstEdge.members.length
}

export function generateHyperDoc(
  preset: HyperPresetKind = hyperLab.preset,
  n: number = hyperLab.n,
  r: number = hyperLab.r,
  seed: number = hyperLab.seed,
): void {
  try {
    const doc = buildHypergraphPreset(preset, n, r, seed)
    hyperLab.preset = preset
    hyperLab.n = doc.vertices.length
    hyperLab.r =
      doc.edges[0]?.members.length ?? Math.max(1, Math.min(doc.vertices.length, Math.round(r)))
    hyperLab.doc = doc
    hyperLab.selected = null
    hyperLab.witness = emptyWitness()
    hyperLab.coloring = null
    hyperLab.error = ''
  } catch (error) {
    hyperLab.error = error instanceof Error ? error.message : '生成失败'
  }
}

export function regenerateHyperSeed(): void {
  hyperLab.seed++
  generateHyperDoc('random', hyperLab.n, hyperLab.r, hyperLab.seed)
}

export function regenerateRainbow(preset: RainbowPreset = hyperLab.rainbow.preset): void {
  hyperLab.rainbow.preset = preset
  hyperLab.rainbow.graph = buildColoredComplete(hyperLab.rainbow.n, preset)
  hyperLab.rainbow.copies = []
  hyperLab.rainbow.selectedCopy = 0
  hyperLab.rainbow.searchNote = ''
  hyperLab.rainbow.anti = null
  hyperLab.rainbow.antiMessage = ''
  hyperLab.rainbow.gallai = null
}

export function setRainbowN(n: number): void {
  hyperLab.rainbow.n = Math.max(3, Math.min(6, Math.round(n)))
  regenerateRainbow()
}

export function setRainbowGraph(graph: ColoredGraph, preset?: RainbowPreset): void {
  hyperLab.rainbow.graph = graph
  hyperLab.rainbow.n = Math.max(3, Math.min(6, graph.n))
  if (preset) hyperLab.rainbow.preset = preset
  hyperLab.rainbow.copies = []
  hyperLab.rainbow.selectedCopy = 0
  hyperLab.rainbow.searchNote = ''
  hyperLab.rainbow.anti = null
  hyperLab.rainbow.antiMessage = ''
  hyperLab.rainbow.gallai = null
}

const RAMSEY_COLORS = ['#ef4444', '#3b82f6'] as const

export function setExtremalN(n: number): void {
  hyperLab.extremal.n = Math.max(1, Math.min(7, Math.round(n) || 1))
}

export function setTuranParts(parts: number): void {
  hyperLab.extremal.turanParts = Math.max(1, Math.min(7, Math.round(parts) || 1))
}

export function runExtremalSearch(): void {
  const state = hyperLab.extremal
  state.customError = ''
  let pattern: ReturnType<typeof patternGraph>
  let label: string
  try {
    if (state.patternId === 'custom') {
      const parsed = parseCustomPattern(state.customEdges)
      pattern = parsed.graph
      label = `自定义禁图（${parsed.edges.length} 条边）`
    } else {
      const preset = patternPreset(state.patternId)
      pattern = patternGraph(preset)
      label = preset.label
    }
    const result = extremalSearch(state.n, pattern, state.mode, label)
    state.result = result
    state.selectedExtremal = 0
    if (result.extremal[0]) {
      showExtremalGraph(0)
    } else {
      state.preview = null
      state.previewNote = '没有不含禁图的图：请检查 n 与禁图规模。'
    }
  } catch (error) {
    state.result = null
    state.customError = error instanceof Error ? error.message : '搜索失败'
    state.preview = null
    state.previewNote = state.customError
  }
}

export function showExtremalGraph(index: number): void {
  const state = hyperLab.extremal
  const graph = state.result?.extremal[index]
  if (!graph) return
  state.selectedExtremal = index
  state.preview = {
    n: graph.n,
    edges: atlasEdgeList(graph),
    title: `极图 #${index + 1}：${state.result?.patternLabel ?? '极图'}`,
    subtitle: `${graph.n} 个顶点 · ${graph.m} 条边 · graph6 ${graph.graph6}`,
  }
  state.previewNote = `第 ${index + 1} 个极图（共展示 ${state.result?.extremal.length ?? 0} 个，实际 ${
    state.result?.extremalCount ?? 0
  } 个）。`
}

export function runTuranConstruction(): void {
  const state = hyperLab.extremal
  const parts = Math.max(1, Math.min(state.n, state.turanParts))
  state.turanParts = parts
  const turan = turanGraph(state.n, parts)
  state.preview = {
    n: turan.graph.n,
    edges: turan.edges,
    title: `T${subscript(parts)}(${state.n})`,
    subtitle: `${turan.parts.map((part) => part.length).join(' + ')} · ${turan.edges.length} 条边`,
  }
  const formula =
    parts < state.n
      ? `Turán：ex(${state.n}, K${parts + 1}) = T${subscript(parts)}(${state.n}) = ${turanEdges(state.n, parts)}`
      : `r ≥ n：T${subscript(parts)}(${state.n}) 就是 K${state.n}，不再排除任何团。`
  const exact = state.result
  const compare =
    exact && exact.mode === 'subgraph'
      ? ` · 当前精确搜索 ex(${state.n}, ${exact.patternLabel}) = ${exact.maxEdges}`
      : ''
  state.turanMessage = `${formula}（${turan.edges.length} 条边）${compare}`
}

export function runTriangleRamsey(): void {
  const state = hyperLab.extremal
  const result = triangleRamsey(state.ramseyN)
  state.ramsey = result
  if (result.colors) {
    const pairs = completeEdgePairs(result.n)
    state.preview = {
      n: result.n,
      edges: pairs,
      colors: result.colors.map((color) => RAMSEY_COLORS[color] ?? RAMSEY_COLORS[0]),
      title: `K${result.n} 的无单色三角形 2-着色`,
      subtitle: `${pairs.length} 条边 · 红/蓝两色 · 首边固定为红`,
    }
    state.previewNote = '见证已显示在画布；可载入彩虹实验室继续做彩虹子图搜索。'
  } else {
    state.preview = null
    state.previewNote = `n = ${result.n} 时不存在无单色三角形的 2-着色。`
  }
}

export function loadRamseyToRainbow(): void {
  const state = hyperLab.extremal
  const result = state.ramsey
  if (!result?.colors) return
  setRainbowGraph(completeGraphWithColoring(result.n, result.colors))
  setHyperTab('rainbow')
}

export function runHyperTuran(): void {
  const state = hyperLab.extremal
  state.hyperResult = ex3Uniform(state.hyperN, state.hyperPattern)
}

export function loadHyperTuranWitness(): void {
  const state = hyperLab.extremal
  const result = state.hyperResult
  if (!result || result.witness.length === 0) return
  const doc = docFromEdgeSets(
    `ex₃(${result.n}, ${HYPER_TURAN_LABELS[result.pattern].split('（')[0]}) 极值见证`,
    result.n,
    result.witness,
  )
  replaceHyperDoc(doc)
  setHyperTab('hypergraph')
}
