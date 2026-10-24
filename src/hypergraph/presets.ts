/**
 * 超图族预设（v3.4）：完全 r-一致、Fano 平面、松/紧三角、星形、随机、空图。
 * 随机族使用确定性 LCG，同一 seed 可复现（便于 e2e 与文档示例）。
 */
import { docFromEdgeSets, type HypergraphDoc } from './model'

export type HyperPresetKind = 'complete' | 'fano' | 'loose' | 'tight' | 'star' | 'random' | 'empty'

export const HYPER_PRESETS: Array<{ id: HyperPresetKind; label: string }> = [
  { id: 'complete', label: '完全 r-一致 Kₙʳ' },
  { id: 'fano', label: 'Fano 平面（n=7）' },
  { id: 'loose', label: '松三角形（n≥6）' },
  { id: 'tight', label: '紧循环（n≥4）' },
  { id: 'star', label: '星形（含顶点 0）' },
  { id: 'random', label: '随机 r-一致（固定种子）' },
  { id: 'empty', label: '空超图（孤立点）' },
]

function combinations(n: number, r: number): number[][] {
  const result: number[][] = []
  const current: number[] = []
  const walk = (start: number): void => {
    if (current.length === r) {
      result.push([...current])
      return
    }
    for (let value = start; value < n; value++) {
      current.push(value)
      walk(value + 1)
      current.pop()
    }
  }
  walk(0)
  return result
}

function seededRandom(seed: number): () => number {
  let state = (seed || 1) >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export function buildHypergraphPreset(
  kind: HyperPresetKind,
  n: number,
  r = 3,
  seed = 7,
): HypergraphDoc {
  if (kind === 'fano') {
    const doc = docFromEdgeSets('Fano 平面', 7, [
      [0, 1, 2],
      [0, 3, 4],
      [0, 5, 6],
      [1, 3, 5],
      [1, 4, 6],
      [2, 3, 6],
      [2, 4, 5],
    ])
    return doc
  }
  const safeN = Math.max(1, Math.min(12, Math.round(n)))
  const safeR = Math.max(1, Math.min(safeN, Math.round(r)))
  if (kind === 'empty') return docFromEdgeSets('空超图', safeN, [])
  if (kind === 'loose') {
    if (safeN < 6) throw new Error('松三角形需要至少 6 个顶点')
    return docFromEdgeSets('松三角形', safeN, [
      [0, 1, 2],
      [2, 3, 4],
      [4, 5, 0],
    ])
  }
  if (kind === 'tight') {
    if (safeN < 4) throw new Error('紧循环需要至少 4 个顶点')
    const edges = Array.from({ length: safeN }, (_, i) => [i, (i + 1) % safeN, (i + 2) % safeN])
    return docFromEdgeSets('紧循环', safeN, edges)
  }
  if (kind === 'star') {
    const all = combinations(safeN, safeR).filter((edge) => edge.includes(0))
    return docFromEdgeSets('星形超图', safeN, all)
  }
  const all = combinations(safeN, safeR)
  if (kind === 'random') {
    const random = seededRandom(seed)
    const shuffled = [...all]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const temp = shuffled[i]!
      shuffled[i] = shuffled[j]!
      shuffled[j] = temp
    }
    const count = Math.max(1, Math.min(shuffled.length, Math.round(safeN / 2) + 1))
    return docFromEdgeSets(`随机 ${safeR}-一致（种子 ${seed}）`, safeN, shuffled.slice(0, count))
  }
  return docFromEdgeSets(`K${subscript(safeN)}${superscript(safeR)}`, safeN, all)
}

function subscript(value: number): string {
  const map: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
  }
  return String(value)
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
}

function superscript(value: number): string {
  const map: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  }
  return String(value)
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
}
