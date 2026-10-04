/**
 * graph6 编解码（v2.7）：nauty 的标准小型图交换格式。
 * 仅支持头部无压缩的 n ≤ 31 形式（与实验台内部位掩码模型一致）。
 * 位序：二元组 (j, i)，i = 1..n−1、j = 0..i−1，每组 6 位按高位在前。
 */
import { addEdgeAt, emptyGraph, type LabGraph, MAX_LAB_N } from './graph'

export class Graph6Error extends Error {}

const HEADER = '>>graph6<<'

/** 解码 graph6 → LabGraph；输入含 `>>graph6<<` 前缀时自动剥离 */
export function parseGraph6(source: string, maxN = MAX_LAB_N): LabGraph {
  let value = source.trim()
  if (value.startsWith(HEADER)) value = value.slice(HEADER.length)
  if (value.length === 0) throw new Graph6Error('graph6 字符串为空')
  const first = value.charCodeAt(0)
  if (first < 64 || first > 126) throw new Graph6Error('graph6 首字符无效（应为 64–126）')
  const n = first - 63
  if (n < 1 || n > maxN) throw new Graph6Error(`graph6 顶点数须为 1–${maxN}，实际 ${n}`)
  const needed = Math.ceil((n * (n - 1)) / 2)
  const groups = Math.ceil(needed / 6)
  if (value.length !== 1 + groups) throw new Graph6Error('graph6 长度与顶点数不一致')
  const bits: number[] = []
  for (let k = 1; k < value.length; k++) {
    const code = value.charCodeAt(k)
    if (code < 63 || code > 126) throw new Graph6Error('graph6 包含无效字符')
    const chunk = code - 63
    for (let b = 5; b >= 0; b--) bits.push((chunk >> b) & 1)
  }
  const g = emptyGraph(n)
  let index = 0
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (bits[index] === 1) addEdgeAt(g, j, i)
      index++
    }
  }
  return g
}

/** 编码 LabGraph → graph6 */
export function toGraph6(g: LabGraph): string {
  if (g.n < 1 || g.n > MAX_LAB_N) throw new Graph6Error(`graph6 编码仅支持 1–${MAX_LAB_N} 个顶点`)
  const bits: number[] = []
  for (let i = 1; i < g.n; i++) {
    for (let j = 0; j < i; j++) bits.push((g.adj[j]! >> i) & 1)
  }
  const groups = Math.ceil(bits.length / 6)
  let result = String.fromCharCode(63 + g.n)
  for (let k = 0; k < groups; k++) {
    let chunk = 0
    for (let b = 0; b < 6; b++) chunk = (chunk << 1) | (bits[k * 6 + b] ?? 0)
    result += String.fromCharCode(63 + chunk)
  }
  return result
}
