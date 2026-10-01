import type { Point2 } from '../../state/types'
import type { SampledPolyline } from './types'

/**
 * 隐函数 F(x, y) = 0 的固定网格 Marching Squares 采样（v0.3 明确不做自适应细化）。
 *
 * 局限（已写入用户文档）：固定网格会漏掉小于网格步长的细结构
 * （例如 sin(1/x) 级别的隐函数细节），这是规格允许的已知限制。
 *
 * 每个输出段是 2 个点的短线段（相邻单元间不缝合，渲染器按短线段直接描边）。
 * 网格分辨率由 quality 决定：1..5 → 单元边长 [16, 12, 8, 6, 4] CSS 像素。
 */
export interface ImplicitSampleOptions {
  /** 可见数学范围 */
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  /** 画布 CSS 尺寸（决定网格分辨率） */
  widthPx: number
  heightPx: number
  /** 采样精度 1..5（对应网格单元像素边长） */
  quality: number
}

/** quality → 网格单元边长（CSS 像素） */
const CELL_PX = [16, 12, 8, 6, 4] as const

/** 网格点数上限（防御极端小单元导致的计算量爆炸） */
const MAX_CORNERS = 200_000

export function sampleImplicit(
  F: (x: number, y: number) => number,
  options: ImplicitSampleOptions,
): SampledPolyline {
  const { xMin, xMax, yMin, yMax, widthPx, heightPx, quality } = options
  const segments: Point2[][] = []
  const asymptoteXs: number[] = []
  let evaluations = 0

  const index = Math.min(CELL_PX.length, Math.max(1, Math.round(quality))) - 1
  let cellPx = CELL_PX[index] ?? 8

  // 依据画布尺寸换算网格行列数，并受点数上限约束
  let cols = Math.max(4, Math.ceil(widthPx / cellPx))
  let rows = Math.max(4, Math.ceil(heightPx / cellPx))
  while ((cols + 1) * (rows + 1) > MAX_CORNERS) {
    cellPx *= 2
    cols = Math.max(4, Math.ceil(widthPx / cellPx))
    rows = Math.max(4, Math.ceil(heightPx / cellPx))
  }

  if (!(xMax > xMin) || !(yMax > yMin)) {
    return { segments, asymptoteXs, evaluations }
  }

  const n = cols + 1
  const m = rows + 1
  const dx = (xMax - xMin) / cols
  const dy = (yMax - yMin) / rows

  // 采样网格角点值（row-major：vals[j * n + i]，i 沿 x，j 沿 y）
  const vals = new Float64Array(n * m)
  for (let j = 0; j < m; j++) {
    const y = yMin + j * dy
    for (let i = 0; i < n; i++) {
      const x = xMin + i * dx
      vals[j * n + i] = F(x, y)
      evaluations++
    }
  }

  /** 网格坐标（i, j）与双线性交叉插值 */
  const valueAt = (i: number, j: number): number => vals[j * n + i] ?? Number.NaN

  /** 沿底边（v00→v10，x 方向）插值：返回交点 (x, y 固定底边) */
  const interpBottom = (i: number, j: number, v00: number, v10: number): Point2 => {
    const t = v00 / (v00 - v10)
    return { x: xMin + (i + t) * dx, y: yMin + j * dy }
  }
  const interpTop = (i: number, j: number, v01: number, v11: number): Point2 => {
    const t = v01 / (v01 - v11)
    return { x: xMin + (i + t) * dx, y: yMin + (j + 1) * dy }
  }
  const interpLeft = (i: number, j: number, v00: number, v01: number): Point2 => {
    const t = v00 / (v00 - v01)
    return { x: xMin + i * dx, y: yMin + (j + t) * dy }
  }
  const interpRight = (i: number, j: number, v10: number, v11: number): Point2 => {
    const t = v10 / (v10 - v11)
    return { x: xMin + (i + 1) * dx, y: yMin + (j + t) * dy }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v00 = valueAt(i, j)
      const v10 = valueAt(i + 1, j)
      const v11 = valueAt(i + 1, j + 1)
      const v01 = valueAt(i, j + 1)

      // 任一角点非有限：跳过该单元（固定网格的已知限制）
      if (
        !Number.isFinite(v00) ||
        !Number.isFinite(v10) ||
        !Number.isFinite(v11) ||
        !Number.isFinite(v01)
      ) {
        continue
      }

      let caseIndex = 0
      if (v00 >= 0) caseIndex |= 1
      if (v10 >= 0) caseIndex |= 2
      if (v11 >= 0) caseIndex |= 4
      if (v01 >= 0) caseIndex |= 8

      if (caseIndex === 0 || caseIndex === 15) continue

      const bottom = (): Point2 => interpBottom(i, j, v00, v10)
      const right = (): Point2 => interpRight(i, j, v10, v11)
      const top = (): Point2 => interpTop(i, j, v01, v11)
      const left = (): Point2 => interpLeft(i, j, v00, v01)

      const add = (a: Point2, b: Point2): void => {
        segments.push([a, b])
      }

      switch (caseIndex) {
        case 1:
        case 14:
          add(left(), bottom())
          break
        case 2:
        case 13:
          add(bottom(), right())
          break
        case 3:
        case 12:
          add(left(), right())
          break
        case 4:
        case 11:
          add(right(), top())
          break
        case 6:
        case 9:
          add(bottom(), top())
          break
        case 7:
        case 8:
          add(left(), top())
          break
        case 5: {
          // 歧义单元：用中心值决定连通性
          const center = (v00 + v10 + v11 + v01) / 4
          if (center >= 0) {
            add(bottom(), right())
            add(top(), left())
          } else {
            add(left(), bottom())
            add(right(), top())
          }
          break
        }
        case 10: {
          const center = (v00 + v10 + v11 + v01) / 4
          if (center >= 0) {
            // 正角点 v10/v01 经中心连通 → 分离负角点 v00（左下）与 v11（右上）
            add(left(), bottom())
            add(right(), top())
          } else {
            // 负角点连通 → 正角点隔离：v10 段与 v01 段
            add(bottom(), right())
            add(top(), left())
          }
          break
        }
        default:
          break
      }
    }
  }

  return { segments, asymptoteXs, evaluations }
}
