/**
 * 等高线（v0.8，Marching Squares）：f(x, y) = level 的等值线**线段列表**（数学坐标）。
 * 用于曲面在底面的等高线投影。鞍点（角符号交错）用**单元中心值**消歧（标准做法，
 * 近似处理——歧义区域给出其中一种拓扑）。
 */
import type { Point2 } from '../state/types'

export interface ContourOptions {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  cols: number
  rows: number
  level: number
}

export function contourSegments(
  f: (x: number, y: number) => number,
  options: ContourOptions,
): [Point2, Point2][] {
  const cols = Math.max(1, Math.min(400, Math.round(options.cols)))
  const rows = Math.max(1, Math.min(400, Math.round(options.rows)))
  const dx = (options.xMax - options.xMin) / cols
  const dy = (options.yMax - options.yMin) / rows
  const segments: [Point2, Point2][] = []
  /** 单元角值 g = f − level */
  const g00 = new Float64Array((cols + 1) * (rows + 1))
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      g00[j * (cols + 1) + i] = f(options.xMin + i * dx, options.yMin + j * dy) - options.level
    }
  }
  const at = (i: number, j: number): number => g00[j * (cols + 1) + i]!

  /** 边 id：0=底(v00-v10) 1=右(v10-v11) 2=顶(v01-v11) 3=左(v00-v01) */
  const edgePoint = (i: number, j: number, edge: number): Point2 | null => {
    const x0 = options.xMin + i * dx
    const y0 = options.yMin + j * dy
    const lerp = (a: number, b: number, xa: number, ya: number, xb: number, yb: number): Point2 => {
      let t = a / (a - b)
      if (!Number.isFinite(t)) t = 0.5
      t = Math.min(1, Math.max(0, t))
      return { x: xa + (xb - xa) * t, y: ya + (yb - ya) * t }
    }
    switch (edge) {
      case 0:
        return lerp(at(i, j), at(i + 1, j), x0, y0, x0 + dx, y0)
      case 1:
        return lerp(at(i + 1, j), at(i + 1, j + 1), x0 + dx, y0, x0 + dx, y0 + dy)
      case 2:
        return lerp(at(i, j + 1), at(i + 1, j + 1), x0, y0 + dy, x0 + dx, y0 + dy)
      default:
        return lerp(at(i, j), at(i, j + 1), x0, y0, x0, y0 + dy)
    }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v00 = at(i, j)
      const v10 = at(i + 1, j)
      const v11 = at(i + 1, j + 1)
      const v01 = at(i, j + 1)
      if (
        !Number.isFinite(v00) ||
        !Number.isFinite(v10) ||
        !Number.isFinite(v11) ||
        !Number.isFinite(v01)
      )
        continue
      const index =
        (v00 >= 0 ? 1 : 0) | (v10 >= 0 ? 2 : 0) | (v11 >= 0 ? 4 : 0) | (v01 >= 0 ? 8 : 0)
      if (index === 0 || index === 15) continue
      const crossed: number[] = []
      if (v00 >= 0 !== v10 >= 0) crossed.push(0)
      if (v10 >= 0 !== v11 >= 0) crossed.push(1)
      if (v01 >= 0 !== v11 >= 0) crossed.push(2)
      if (v00 >= 0 !== v01 >= 0) crossed.push(3)
      if (crossed.length === 2) {
        const p0 = edgePoint(i, j, crossed[0]!)
        const p1 = edgePoint(i, j, crossed[1]!)
        if (p0 && p1) segments.push([p0, p1])
        continue
      }
      // 4 交点：鞍点消歧（中心值）
      const center = f(options.xMin + (i + 0.5) * dx, options.yMin + (j + 0.5) * dy) - options.level
      const p0 = edgePoint(i, j, 0)!
      const p1 = edgePoint(i, j, 1)!
      const p2 = edgePoint(i, j, 2)!
      const p3 = edgePoint(i, j, 3)!
      // case 5（正=v00,v11）：中心正 → 正区连通 → 弧绕 v10（p0-p1）与 v01（p2-p3）
      // case 10（正=v10,v01）：中心正 → 弧绕 v00（p3-p0）与 v11（p1-p2）
      const case5 = index === 5
      const adjacentPairA = case5 ? center >= 0 : center < 0
      if (adjacentPairA) {
        segments.push([p0, p1])
        segments.push([p2, p3])
      } else {
        segments.push([p3, p0])
        segments.push([p1, p2])
      }
    }
  }
  return segments
}
