/**
 * 超图与彩虹实验室共享状态（v3.4 / v3.5）。
 * HyperView（画布）与 HyperPanel（控件）通过模块级 runes 共享；不进入文档序列化。
 */
import type { AntiRamseyResult, ColoredGraph, RainbowCopy } from '../graph/rainbow'
import { buildColoredComplete } from '../graph/rainbow'
import type { HypergraphDoc } from '../hypergraph/model'
import type { HyperPresetKind } from '../hypergraph/presets'
import { buildHypergraphPreset } from '../hypergraph/presets'
import type { HyperRainbowResult } from '../hypergraph/rainbow'

export type HyperTab = 'hypergraph' | 'rainbow'
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
