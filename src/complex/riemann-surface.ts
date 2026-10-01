/**
 * 黎曼面示意（v0.9）：多值函数的分支展开（规格允许「多层/示意」而非严格 3D 几何）。
 * - sqrt：2 个分支（相位整体差 π）；
 * - log：n 层分支（相位整体差 2πk），常用 3 层示意；
 * 输出为**分支函数**，由域着色渲染器逐层绘制（可叠加或并排）。
 */
import { cAdd, cLog, cSqrt, cScale, type Complex } from './complex'
import type { ComplexFn } from './evaluate'

export type BranchKind = 'sqrt' | 'log'

export interface BranchInfo {
  count: number
  labels: string[]
}

export const BRANCH_INFO: Record<BranchKind, BranchInfo> = {
  sqrt: { count: 2, labels: ['+√z（arg 0..π）', '−√z（arg π..2π）'] },
  log: { count: 3, labels: ['ln z（k=0）', 'ln z + 2πi（k=1）', 'ln z + 4πi（k=2）'] },
}

/**
 * 第 k 个分支的函数：
 * - sqrt：w = (−1)^k √z（主值平方根再按分支翻转）；
 * - log：w = ln z + 2πk·i（主值对数 + 分支偏移）。
 */
export function branchFn(kind: BranchKind, k: number): ComplexFn {
  if (kind === 'sqrt') {
    const sign = k % 2 === 0 ? 1 : -1
    return (z: Complex) => cScale(cSqrt(z), sign)
  }
  return (z: Complex) => cAdd(cLog(z), { re: 0, im: 2 * Math.PI * k })
}

/** 分支总数 */
export function branchCount(kind: BranchKind): number {
  return BRANCH_INFO[kind].count
}
