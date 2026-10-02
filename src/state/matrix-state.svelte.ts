/**
 * 矩阵模块共享状态（v2.3）：输入矩阵、运算选择与计算结果。
 * MatrixPanel（控件）与 MatrixView（渲染 / 结果）经模块级 runes 共享。
 */
import {
  determinant,
  eigenDecompose,
  inverse,
  luDecompose,
  matmul,
  maxAbsDiff,
  qrDecompose,
  rank,
  type EigenDecomposition,
  type Matrix,
} from '../matrix/linalg'

export type MatrixSize = 2 | 3 | 4
export type MatrixOp = 'lu' | 'qr' | 'eigen' | 'summary'

export interface MatrixOutput {
  op: MatrixOp
  input: Matrix
  lu?: { p: Matrix; l: Matrix; u: Matrix; singular: boolean; residual: number }
  qr?: { q: Matrix; r: Matrix; residual: number }
  eigen?: EigenDecomposition
  summary?: { det: number; trace: number; rank: number; inverse: Matrix | null }
  error: string
}

export interface MatrixPreset {
  id: string
  label: string
  size: MatrixSize
  entries: number[]
}

export const MATRIX_PRESETS: MatrixPreset[] = [
  { id: 'symmetric', label: '对称（λ=3,1）', size: 2, entries: [2, 1, 1, 2] },
  { id: 'general', label: '一般（实特征值）', size: 2, entries: [1, 2, 3, 4] },
  { id: 'shear', label: '剪切（不可对角化）', size: 2, entries: [1, 1, 0, 1] },
  { id: 'rotation', label: '旋转（复特征值）', size: 2, entries: [0, -1, 1, 0] },
]

let size = $state<MatrixSize>(2)
let entries = $state<number[]>([2, 1, 1, 2])
let op = $state<MatrixOp>('qr')
let output = $state<MatrixOutput | null>(null)
let error = $state('')
/** 变化计数器：读取它即可对输入/结果建立响应依赖 */
let revision = $state(0)

export function getMatrixRevision(): number {
  return revision
}

export function getMatrixSize(): MatrixSize {
  return size
}

export function setMatrixSize(next: MatrixSize): void {
  if (next === size) return
  // 保留左上角已有值，扩展区域补 0
  const nextEntries = new Array<number>(next * next).fill(0)
  for (let i = 0; i < next; i++) {
    for (let j = 0; j < next; j++) {
      if (i < size && j < size) nextEntries[i * next + j] = entries[i * size + j] ?? 0
    }
  }
  size = next
  entries = nextEntries
  output = null
  error = ''
  revision++
}

export function getMatrixEntry(index: number): number {
  return entries[index] ?? 0
}

export function setMatrixEntry(index: number, value: number): void {
  if (index < 0 || index >= size * size || !Number.isFinite(value)) return
  entries = entries.map((item, i) => (i === index ? value : item))
  output = null
  revision++
}

export function getMatrixOp(): MatrixOp {
  return op
}

export function setMatrixOp(next: MatrixOp): void {
  if (next === op) return
  op = next
  output = null
  error = ''
  revision++
}

export function getMatrixOutput(): MatrixOutput | null {
  return output
}

export function getMatrixError(): string {
  return error
}

export function applyMatrixPreset(id: string): void {
  const preset = MATRIX_PRESETS.find((item) => item.id === id)
  if (!preset) return
  size = preset.size
  entries = [...preset.entries]
  output = null
  error = ''
  revision++
}

export function toMatrix(): Matrix {
  return Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => entries[i * size + j] ?? 0),
  )
}

export function runMatrixOp(): void {
  const matrix = toMatrix()
  error = ''
  try {
    if (op === 'lu') {
      const { p, l, u, singular } = luDecompose(matrix)
      output = {
        op,
        input: matrix,
        lu: { p, l, u, singular, residual: maxAbsDiff(matmul(p, matrix), matmul(l, u)) },
        error: '',
      }
    } else if (op === 'qr') {
      const { q, r } = qrDecompose(matrix)
      output = {
        op,
        input: matrix,
        qr: { q, r, residual: maxAbsDiff(matmul(q, r), matrix) },
        error: '',
      }
    } else if (op === 'eigen') {
      output = { op, input: matrix, eigen: eigenDecompose(matrix), error: '' }
    } else {
      let trace = 0
      for (let i = 0; i < size; i++) trace += matrix[i]?.[i] ?? 0
      output = {
        op,
        input: matrix,
        summary: { det: determinant(matrix), trace, rank: rank(matrix), inverse: inverse(matrix) },
        error: '',
      }
    }
  } catch (cause) {
    output = null
    error = cause instanceof Error ? cause.message : '计算失败'
  }
  revision++
}
