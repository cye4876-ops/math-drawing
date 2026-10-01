/**
 * 曲面网格生成（v0.8）：显式 z = f(x,y) / 参数曲面 (x,y,z)(u,v) / 旋转体（曲线绕 x 轴）。
 * 统一输出 MeshData（positions / normals / values / indices），供 three.js BufferGeometry 消费。
 *
 * 法线约定：
 * - 显式曲面：解析梯度 (−f_x, −f_y, 1) 归一化（中心差分求 f_x / f_y）；
 * - 参数曲面：∂P/∂u × ∂P/∂v（中心差分）；
 * - 旋转体：∂P/∂θ × ∂P/∂x（径向外）。
 * values 统一为顶点 z 值（高度着色）。
 *
 * 无效值（NaN/Infinity）处理：顶点保留（z 记 0），相关三角形**整体跳过**；
 * 由调用方保证分辨率上限（LOD/降级在视图层控制）。
 */

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  /** 顶点标量（= z 值；高度着色用） */
  values: Float32Array
  indices: Uint32Array
  vertexCount: number
  triangleCount: number
}

/** 网格规模上限（每轴单元数）——视图层可以更低 */
export const MAX_GRID_DIVISIONS = 512

function fillIndices(cols: number, rows: number, valid: Uint8Array, indices: number[]): void {
  const stride = cols + 1
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v00 = j * stride + i
      const v10 = v00 + 1
      const v01 = v00 + stride
      const v11 = v01 + 1
      if (valid[v00]! && valid[v10]! && valid[v01]!) indices.push(v00, v10, v01)
      if (valid[v10]! && valid[v11]! && valid[v01]!) indices.push(v10, v11, v01)
    }
  }
}

export interface ExplicitSurfaceOptions {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  /** 每轴单元数（顶点数 = (cols+1)·(rows+1)） */
  cols: number
  rows: number
}

/** 显式曲面 z = f(x, y) 的三角网格 */
export function explicitSurfaceMesh(
  f: (x: number, y: number) => number,
  options: ExplicitSurfaceOptions,
): MeshData {
  const cols = Math.max(1, Math.min(MAX_GRID_DIVISIONS, Math.round(options.cols)))
  const rows = Math.max(1, Math.min(MAX_GRID_DIVISIONS, Math.round(options.rows)))
  const count = (cols + 1) * (rows + 1)
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const values = new Float32Array(count)
  const valid = new Uint8Array(count)
  const dx = (options.xMax - options.xMin) / cols
  const dy = (options.yMax - options.yMin) / rows
  const hx = dx / 2 || 1e-3
  const hy = dy / 2 || 1e-3
  let k = 0
  for (let j = 0; j <= rows; j++) {
    const y = options.yMin + j * dy
    for (let i = 0; i <= cols; i++) {
      const x = options.xMin + i * dx
      const z = f(x, y)
      const finite = Number.isFinite(z)
      positions[k * 3] = x
      positions[k * 3 + 1] = y
      positions[k * 3 + 2] = finite ? z : 0
      values[k] = finite ? z : 0
      valid[k] = finite ? 1 : 0
      if (finite) {
        const fx = (f(x + hx, y) - f(x - hx, y)) / (2 * hx)
        const fy = (f(x, y + hy) - f(x, y - hy)) / (2 * hy)
        const nx = -fx
        const ny = -fy
        const nz = 1
        const norm = Math.hypot(nx, ny, nz) || 1
        normals[k * 3] = nx / norm
        normals[k * 3 + 1] = ny / norm
        normals[k * 3 + 2] = nz / norm
      } else {
        normals[k * 3 + 2] = 1
      }
      k++
    }
  }
  const indexList: number[] = []
  fillIndices(cols, rows, valid, indexList)
  return {
    positions,
    normals,
    values,
    indices: Uint32Array.from(indexList),
    vertexCount: count,
    triangleCount: indexList.length / 3,
  }
}

export interface ParametricSurfaceOptions {
  uMin: number
  uMax: number
  vMin: number
  vMax: number
  cols: number
  rows: number
}

/** 参数曲面 (u,v) → (x, y, z) 的三角网格；法线 = ∂P/∂u × ∂P/∂v（中心差分） */
export function parametricSurfaceMesh(
  f: (u: number, v: number) => [number, number, number],
  options: ParametricSurfaceOptions,
): MeshData {
  const cols = Math.max(1, Math.min(MAX_GRID_DIVISIONS, Math.round(options.cols)))
  const rows = Math.max(1, Math.min(MAX_GRID_DIVISIONS, Math.round(options.rows)))
  const count = (cols + 1) * (rows + 1)
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const values = new Float32Array(count)
  const valid = new Uint8Array(count)
  const du = (options.uMax - options.uMin) / cols
  const dv = (options.vMax - options.vMin) / rows
  const hu = du / 2 || 1e-4
  const hv = dv / 2 || 1e-4
  const at = (u: number, v: number): [number, number, number] => f(u, v)
  let k = 0
  for (let j = 0; j <= rows; j++) {
    const v = options.vMin + j * dv
    for (let i = 0; i <= cols; i++) {
      const u = options.uMin + i * du
      const [x, y, z] = at(u, v)
      const finite = Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
      positions[k * 3] = finite ? x : 0
      positions[k * 3 + 1] = finite ? y : 0
      positions[k * 3 + 2] = finite ? z : 0
      values[k] = finite ? z : 0
      valid[k] = finite ? 1 : 0
      if (finite) {
        const [xU1, yU1, zU1] = at(u + hu, v)
        const [xU0, yU0, zU0] = at(u - hu, v)
        const [xV1, yV1, zV1] = at(u, v + hv)
        const [xV0, yV0, zV0] = at(u, v - hv)
        const dux = (xU1 - xU0) / (2 * hu)
        const duy = (yU1 - yU0) / (2 * hu)
        const duz = (zU1 - zU0) / (2 * hu)
        const dvx = (xV1 - xV0) / (2 * hv)
        const dvy = (yV1 - yV0) / (2 * hv)
        const dvz = (zV1 - zV0) / (2 * hv)
        let nx = duy * dvz - duz * dvy
        let ny = duz * dvx - dux * dvz
        let nz = dux * dvy - duy * dvx
        const norm = Math.hypot(nx, ny, nz)
        if (norm > 0) {
          nx /= norm
          ny /= norm
          nz /= norm
        } else {
          nx = 0
          ny = 0
          nz = 1
        }
        normals[k * 3] = nx
        normals[k * 3 + 1] = ny
        normals[k * 3 + 2] = nz
      } else {
        normals[k * 3 + 2] = 1
      }
      k++
    }
  }
  const indexList: number[] = []
  fillIndices(cols, rows, valid, indexList)
  return {
    positions,
    normals,
    values,
    indices: Uint32Array.from(indexList),
    vertexCount: count,
    triangleCount: indexList.length / 3,
  }
}

export interface RevolveSurfaceOptions {
  xMin: number
  xMax: number
  /** 沿轴向的分段数 */
  cols: number
  /** 旋转一圈的分段数 */
  rows: number
}

/**
 * 旋转体：母线 y = f(x)（x 轴为旋转轴）绕 x 轴旋转一圈。
 * 顶点 (x, f(x)·cosθ, f(x)·sinθ)；法线 ∝ ∂P/∂θ × ∂P/∂x（径向外）。
 */
export function revolveSurfaceMesh(
  f: (x: number) => number,
  options: RevolveSurfaceOptions,
): MeshData {
  const cols = Math.max(1, Math.min(MAX_GRID_DIVISIONS, Math.round(options.cols)))
  const rows = Math.max(3, Math.min(MAX_GRID_DIVISIONS, Math.round(options.rows)))
  const count = (cols + 1) * (rows + 1)
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const values = new Float32Array(count)
  const valid = new Uint8Array(count)
  const dx = (options.xMax - options.xMin) / cols
  const hx = dx / 2 || 1e-3
  let k = 0
  for (let j = 0; j <= rows; j++) {
    const theta = (j / rows) * Math.PI * 2
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    for (let i = 0; i <= cols; i++) {
      const x = options.xMin + i * dx
      const r = f(x)
      const finite = Number.isFinite(r)
      const y = finite ? r * cos : 0
      const z = finite ? r * sin : 0
      positions[k * 3] = x
      positions[k * 3 + 1] = y
      positions[k * 3 + 2] = z
      values[k] = z
      valid[k] = finite ? 1 : 0
      if (finite) {
        // ∂P/∂x 与 ∂P/∂θ 的中心差分
        const r1 = f(x + hx)
        const r0 = f(x - hx)
        const drdx = (r1 - r0) / (2 * hx)
        const dPdx: [number, number, number] = [1, drdx * cos, drdx * sin]
        const dPdTheta: [number, number, number] = [0, -r * sin, r * cos]
        let nx = dPdTheta[1] * dPdx[2] - dPdTheta[2] * dPdx[1]
        let ny = dPdTheta[2] * dPdx[0] - dPdTheta[0] * dPdx[2]
        let nz = dPdTheta[0] * dPdx[1] - dPdTheta[1] * dPdx[0]
        const norm = Math.hypot(nx, ny, nz)
        if (norm > 0) {
          nx /= norm
          ny /= norm
          nz /= norm
        } else {
          nx = 0
          ny = cos
          nz = sin
        }
        normals[k * 3] = nx
        normals[k * 3 + 1] = ny
        normals[k * 3 + 2] = nz
      } else {
        normals[k * 3 + 2] = 1
      }
      k++
    }
  }
  const indexList: number[] = []
  fillIndices(cols, rows, valid, indexList)
  return {
    positions,
    normals,
    values,
    indices: Uint32Array.from(indexList),
    vertexCount: count,
    triangleCount: indexList.length / 3,
  }
}
