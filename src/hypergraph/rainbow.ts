/**
 * 超图彩虹匹配（v3.5）：边着色超图中两两不交且颜色互不相同的超边集合。
 * 顶点数 ≤ 12、超边数 ≤ 120 时用位掩码回溯精确求解。
 */
import { memberIndices, type HypergraphDoc } from './model'

export interface HyperRainbowResult {
  size: number
  /** 每条见证为超边下标数组（升序） */
  witnesses: number[][]
  complete: boolean
  note: string
}

interface Prepared {
  n: number
  edges: number[][]
  masks: number[]
  colors: string[]
}

function prepare(doc: HypergraphDoc): Prepared {
  const n = doc.vertices.length
  const edges = memberIndices(doc)
  const colors: string[] = []
  const masks: number[] = []
  for (let index = 0; index < doc.edges.length; index++) {
    const edge = doc.edges[index]!
    const members = edge.members
      .map((id) => doc.vertices.findIndex((vertex) => vertex.id === id))
      .filter((value) => value >= 0)
    if (members.length === 0) continue
    let mask = 0
    for (const vertex of members) mask |= 1 << vertex
    masks.push(mask)
    colors.push(edge.color)
  }
  // 若 memberIndices 跳过了无效边，颜色数组需与之一致（正常数据下一致）
  const count = Math.min(edges.length, masks.length)
  return {
    n,
    edges: edges.slice(0, count),
    masks: masks.slice(0, count),
    colors: colors.slice(0, count),
  }
}

export function findRainbowHyperMatching(
  doc: HypergraphDoc,
  target: number,
  limit = 20,
): HyperRainbowResult {
  const prepared = prepare(doc)
  const wanted = Math.max(1, Math.round(target))
  if (wanted > prepared.edges.length) {
    return {
      size: wanted,
      witnesses: [],
      complete: true,
      note: `目标大小 ${wanted} 超过超边数 ${prepared.edges.length}`,
    }
  }
  const witnesses: number[][] = []
  const chosen: number[] = []
  const usedColors = new Set<string>()
  let mask = 0
  let nodes = 0
  let complete = true
  const search = (start: number): void => {
    if (!complete) return
    nodes++
    if (chosen.length === wanted) {
      witnesses.push([...chosen])
      if (witnesses.length >= limit) complete = false
      return
    }
    for (let index = start; index < prepared.edges.length; index++) {
      const edgeMask = prepared.masks[index]!
      if ((mask & edgeMask) !== 0) continue
      const color = prepared.colors[index]!
      if (usedColors.has(color)) continue
      chosen.push(index)
      usedColors.add(color)
      mask |= edgeMask
      search(index + 1)
      mask &= ~edgeMask
      usedColors.delete(color)
      chosen.pop()
      if (!complete) return
    }
  }
  search(0)
  return {
    size: wanted,
    witnesses,
    complete,
    note:
      witnesses.length > 0
        ? `存在 ${witnesses.length}${complete ? '' : '+'} 个彩虹匹配（大小 ${wanted}）`
        : `不存在大小为 ${wanted} 的彩虹匹配（穷举 ${nodes} 节点）`,
  }
}

export function maxRainbowHyperMatching(doc: HypergraphDoc, limit = 20): HyperRainbowResult {
  const prepared = prepare(doc)
  const witnesses: number[][] = []
  const chosen: number[] = []
  const usedColors = new Set<string>()
  let mask = 0
  let best = 0
  let nodes = 0
  const complete = true
  const search = (start: number): void => {
    if (!complete) return
    nodes++
    if (chosen.length + (prepared.edges.length - start) <= best) return
    if (chosen.length > best) {
      best = chosen.length
      witnesses.length = 0
      witnesses.push([...chosen])
    } else if (chosen.length === best && best > 0 && witnesses.length < limit) {
      witnesses.push([...chosen])
    }
    for (let index = start; index < prepared.edges.length; index++) {
      const edgeMask = prepared.masks[index]!
      if ((mask & edgeMask) !== 0) continue
      const color = prepared.colors[index]!
      if (usedColors.has(color)) continue
      chosen.push(index)
      usedColors.add(color)
      mask |= edgeMask
      search(index + 1)
      mask &= ~edgeMask
      usedColors.delete(color)
      chosen.pop()
    }
  }
  search(0)
  return {
    size: best,
    witnesses,
    complete,
    note:
      best === 0
        ? '没有可用的彩虹匹配（无边或所有边共享颜色/顶点）'
        : `最大彩虹匹配大小 = ${best}（穷举 ${nodes} 节点）`,
  }
}
