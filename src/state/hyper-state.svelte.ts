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
import { DEFAULT_HOST_FILTERS, type HostFilters } from '../extremal/filters'
import { decodeExtremalLink, encodeExtremalLink } from '../extremal/link'
import type { HyperTuranPattern, HyperTuranResult } from '../extremal/hyper-turan'
import { HYPER_TURAN_LABELS, ex3Uniform } from '../extremal/hyper-turan'
import {
  complementSimpleGraph,
  parsePatternInput,
  patternGraph,
  patternKey,
  patternPreset,
  subscript,
  turanEdges,
  turanGraph,
  PATTERN_PRESETS,
  type PatternInputFormat,
  type ParsedPattern,
} from '../extremal/patterns'
import { triangleRamsey, type RamseyResult } from '../extremal/ramsey'
import {
  extremalSearchMulti,
  type ExtremalSearchResult,
  type PatternMode,
} from '../extremal/search'

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
  extraPatternIds: string[]
  mode: PatternMode
  customFormat: PatternInputFormat
  customEdges: string
  customError: string
  complement: boolean
  filters: HostFilters
  result: ExtremalSearchResult | null
  table: ExtremalTable | null
  history: ExtremalHistoryEntry[]
  compareId: number | null
  selectedExtremal: number
  galleryPage: number
  previewSelection: { kind: 'vertex' | 'edge'; index: number } | null
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

export const EXTREMAL_GALLERY_PAGE_SIZE = 6

export interface ExtremalTable {
  presetIds: string[]
  labels: string[]
  rows: Array<{ n: number; values: number[] }>
}

export interface ExtremalHistoryEntry {
  id: number
  result: ExtremalSearchResult
}

let extremalHistorySeq = 1

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
    extraPatternIds: [],
    mode: 'subgraph' as PatternMode,
    customFormat: 'edges' as PatternInputFormat,
    customEdges: '0-1, 1-2, 2-0',
    customError: '',
    complement: false,
    filters: { ...DEFAULT_HOST_FILTERS },
    result: null,
    table: null,
    history: [],
    compareId: null,
    selectedExtremal: 0,
    galleryPage: 0,
    previewSelection: null,
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
  hyperLab.extremal.result = null
}

export function setExtremalMode(mode: PatternMode): void {
  hyperLab.extremal.mode = mode
  hyperLab.extremal.result = null
}

export function buildExtremalTable(): void {
  const presetIds = PATTERN_PRESETS.map((preset) => preset.id)
  const labels = PATTERN_PRESETS.map((preset) => preset.label)
  const rows: ExtremalTable['rows'] = []
  for (let n = 1; n <= 7; n++) {
    const values: number[] = []
    for (const preset of PATTERN_PRESETS) {
      const result = extremalSearchMulti({
        n,
        patterns: [{ graph: patternGraph(preset), label: preset.label }],
        mode: 'subgraph',
        filters: DEFAULT_HOST_FILTERS,
        allowKnownFormula: false,
      })
      values.push(result.maxEdges)
    }
    rows.push({ n, values })
  }
  hyperLab.extremal.table = { presetIds, labels, rows }
}

export function runExtremalTableCell(n: number, presetId: string): void {
  const state = hyperLab.extremal
  state.n = n
  state.patternId = presetId
  state.extraPatternIds = []
  state.complement = false
  state.filters = { ...DEFAULT_HOST_FILTERS }
  state.mode = 'subgraph'
  state.result = null
  runExtremalSearch()
}

export function setGalleryPage(page: number): void {
  const state = hyperLab.extremal
  const total = state.result?.extremal.length ?? 0
  const count = Math.max(1, Math.ceil(total / EXTREMAL_GALLERY_PAGE_SIZE))
  state.galleryPage = Math.max(0, Math.min(count - 1, Math.trunc(page)))
}

export function selectExtremalPreview(kind: 'vertex' | 'edge' | null, index = 0): void {
  hyperLab.extremal.previewSelection = kind ? { kind, index } : null
}

export function setExtremalCompare(id: number | null): void {
  hyperLab.extremal.compareId = id
}

export function loadExtremalHistory(id: number): void {
  const state = hyperLab.extremal
  const entry = state.history.find((item) => item.id === id)
  if (!entry) return
  state.result = entry.result
  state.selectedExtremal = 0
  state.galleryPage = 0
  state.previewSelection = null
  state.n = entry.result.n
  if (entry.result.extremal[0]) showExtremalGraph(0)
}

/** 当前极值查询的可分享 URL（mode=hyper + extremal 参数） */
export function extremalShareUrl(): string {
  const state = hyperLab.extremal
  const href = typeof location === 'undefined' ? 'http://localhost/' : location.href
  return encodeExtremalLink(
    {
      n: state.n,
      patternId: state.patternId,
      extraPatternIds: state.extraPatternIds,
      mode: state.mode,
      customFormat: state.customFormat,
      customEdges: state.customEdges,
      complement: state.complement,
      filters: state.filters,
    },
    href,
  )
}

/** 从 URL 恢复极值查询并立即计算；无 extremal 参数时返回 false */
export function applyExtremalDeepLink(search: string): boolean {
  const config = decodeExtremalLink(search)
  if (!config) return false
  const state = hyperLab.extremal
  state.n = Math.max(1, Math.min(7, Math.round(config.n) || 1))
  state.patternId =
    config.patternId === 'custom' ||
    PATTERN_PRESETS.some((preset) => preset.id === config.patternId)
      ? config.patternId
      : 'K3'
  state.customFormat = config.customFormat
  if (config.customEdges !== '') state.customEdges = config.customEdges
  state.extraPatternIds = config.extraPatternIds.filter((id) =>
    PATTERN_PRESETS.some((preset) => preset.id === id),
  )
  state.complement = config.complement
  state.mode = config.mode
  state.filters = {
    ...config.filters,
    maxDegree: Math.max(0, Math.min(7, Math.round(config.filters.maxDegree) || 0)),
  }
  setHyperTab('extremal')
  runExtremalSearch()
  return true
}

/** 把当前 3-一致超图 Turán 见证的 2-截面画到极值画布 */
export function previewHyperTuranTwoSection(): void {
  const state = hyperLab.extremal
  const result = state.hyperResult
  if (!result || result.witness.length === 0) return
  const seen: string[] = []
  const edges: Array<[number, number]> = []
  for (const triple of result.witness) {
    for (let i = 0; i < triple.length; i++) {
      for (let j = i + 1; j < triple.length; j++) {
        const u = Math.min(triple[i]!, triple[j]!)
        const v = Math.max(triple[i]!, triple[j]!)
        const key = `${u},${v}`
        if (seen.includes(key)) continue
        seen.push(key)
        edges.push([u, v])
      }
    }
  }
  state.preview = {
    n: result.n,
    edges,
    title: `2-截面：ex₃(${result.n}, ${HYPER_TURAN_LABELS[result.pattern].split('（')[0]})`,
    subtitle: `${result.witness.length} 条超边 → ${edges.length} 条 2-截面边`,
  }
  state.previewSelection = null
  state.previewNote = '把超边的每个三元组展开为三条普通边（同一对顶点只计一次）。'
}

export function setExtremalPattern(id: string): void {
  const state = hyperLab.extremal
  state.patternId = id
  state.extraPatternIds = state.extraPatternIds.filter((item) => item !== id)
  state.result = null
  state.customError = ''
}

export function toggleExtraPattern(id: string): void {
  const state = hyperLab.extremal
  if (id === state.patternId) return
  state.extraPatternIds = state.extraPatternIds.includes(id)
    ? state.extraPatternIds.filter((item) => item !== id)
    : [...state.extraPatternIds, id]
  state.result = null
}

export function clearExtraPatterns(): void {
  hyperLab.extremal.extraPatternIds = []
  hyperLab.extremal.result = null
}

export function setCustomFormat(format: PatternInputFormat): void {
  hyperLab.extremal.customFormat = format
  hyperLab.extremal.customError = ''
  hyperLab.extremal.result = null
}

export function setExtremalComplement(value: boolean): void {
  hyperLab.extremal.complement = value
  hyperLab.extremal.result = null
}

export function setExtremalFilterBoolean(
  key: 'connected' | 'bipartite' | 'planar' | 'triangleFree',
  value: boolean,
): void {
  hyperLab.extremal.filters = { ...hyperLab.extremal.filters, [key]: value }
  hyperLab.extremal.result = null
}

export function setExtremalMaxDegree(value: number): void {
  hyperLab.extremal.filters = {
    ...hyperLab.extremal.filters,
    maxDegree: Math.max(0, Math.min(7, Math.round(value) || 0)),
  }
  hyperLab.extremal.result = null
}

export function resetExtremalFilters(): void {
  hyperLab.extremal.filters = { ...DEFAULT_HOST_FILTERS }
  hyperLab.extremal.result = null
}

export function setTuranParts(parts: number): void {
  hyperLab.extremal.turanParts = Math.max(1, Math.min(7, Math.round(parts) || 1))
}

function selectedPatterns(state: ExtremalState): ParsedPattern[] {
  const parsed: ParsedPattern[] = []
  if (state.patternId === 'custom') {
    parsed.push(...parsePatternInput(state.customEdges, state.customFormat))
  } else {
    const preset = patternPreset(state.patternId)
    parsed.push({ graph: patternGraph(preset), label: preset.label })
  }
  for (const id of state.extraPatternIds) {
    if (id === state.patternId) continue
    const preset = patternPreset(id)
    parsed.push({ graph: patternGraph(preset), label: preset.label })
  }
  const seen: string[] = []
  const result: ParsedPattern[] = []
  for (const item of parsed) {
    const graph = state.complement ? complementSimpleGraph(item.graph) : item.graph
    const key = patternKey(graph)
    if (seen.includes(key)) continue
    seen.push(key)
    result.push({
      graph,
      label: state.complement ? `${item.label} 的补图` : item.label,
    })
  }
  return result
}

export function runExtremalSearch(): void {
  const state = hyperLab.extremal
  state.customError = ''
  try {
    const patterns = selectedPatterns(state)
    const result = extremalSearchMulti({
      n: state.n,
      patterns,
      mode: state.mode,
      filters: state.filters,
      analyses: true,
      allowKnownFormula: patterns.length === 1,
    })
    state.result = result
    state.selectedExtremal = 0
    state.galleryPage = 0
    state.previewSelection = null
    state.history = [{ id: extremalHistorySeq++, result }, ...state.history].slice(0, 8)
    state.compareId = null
    if (result.extremal[0]) {
      showExtremalGraph(0)
    } else if (result.saturation?.examples[0]) {
      showSaturationGraph(0)
    } else {
      state.preview = null
      state.previewNote = result.note
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
  state.galleryPage = Math.floor(index / EXTREMAL_GALLERY_PAGE_SIZE)
  state.previewSelection = null
  state.preview = {
    n: graph.n,
    edges: atlasEdgeList(graph),
    title: `极图 #${index + 1}：${state.result?.patternLabel ?? '极图'}`,
    subtitle: `${graph.n} 个顶点 · ${graph.m} 条边 · graph6 ${graph.graph6}`,
  }
  const maximality = graph.maximality
  state.previewNote = `第 ${index + 1} 个极图（共展示 ${state.result?.extremal.length ?? 0} 个，实际 ${
    state.result?.extremalCount ?? 0
  } 个）；${
    maximality.maximal
      ? `结构约束内极大：${maximality.addableEdges} 条可加入边都会产生禁图${
          maximality.blockedByFilters > 0
            ? `，另有 ${maximality.blockedByFilters} 条被约束阻止`
            : ''
        }。`
      : `非极大：缺失边 (${maximality.witnessEdge?.join(',') ?? '?'}) 加入后仍无禁图。`
  }`
}

export function showSaturationGraph(index: number): void {
  const state = hyperLab.extremal
  const graph = state.result?.saturation?.examples[index]
  if (!graph) return
  state.previewSelection = null
  state.preview = {
    n: graph.n,
    edges: atlasEdgeList(graph),
    title: `饱和图 #${index + 1}：sat = ${graph.m}`,
    subtitle: `${graph.n} 个顶点 · ${graph.m} 条边 · graph6 ${graph.graph6}`,
  }
  state.previewNote = `H-饱和图：不含禁图，但加入任意缺失边都会产生禁图（${graph.m} 条边）。`
}

export function runTuranConstruction(): void {
  const state = hyperLab.extremal
  const parts = Math.max(1, Math.min(state.n, state.turanParts))
  state.turanParts = parts
  state.previewSelection = null
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
  state.previewSelection = null
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
