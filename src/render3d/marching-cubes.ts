/**
 * 隐式曲面提取（v0.8）：Marching Cubes 家族。
 *
 * **取舍（见 docs/3d.md）**：标准 MC 的 256 情形表存在面歧义（需渐近判定器消歧），
 * 而本实现采用**四面体分解**（Marching Tetrahedra）——每个立方体单元拆为 6 个四面体，
 * 逐四面体按 16 种符号组合提取三角形。优点：实现小、**无歧义**、易验证；
 * 代价：三角形数量略多（同单元内顶点不共享边插值点，但跨单元按网格边去重）。
 *
 * 顶点法线取 F 的**梯度**（中心差分）归一化——即曲面法线（朝 F 增大方向）。
 * 渲染材质使用 DoubleSide，绕向不影响光照。
 */

export interface IsoSurfaceOptions {
  min: [number, number, number]
  max: [number, number, number]
  /** 每轴单元数（内部采样 (n+1)³ 网格） */
  resolution: number
}

export interface IsoSurface {
  positions: Float32Array
  normals: Float32Array
  triangleCount: number
  /** 提取提前终止（触发三角形上限保护） */
  truncated: boolean
}

export const MAX_ISO_RESOLUTION = 128
/** 三角形上限（内存与卡顿保护） */
export const MAX_ISO_TRIANGLES = 4_000_000

/** 立方体角编号（按 x/y/z 位）：位 0 = x, 位 1 = y, 位 2 = z */
const CORNER: readonly [number, number, number][] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
]

/** 标准 6 四面体分解（共享角 0-6 主对角线） */
const TETRA: readonly [number, number, number, number][] = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
]

export function marchingCubes(
  F: (x: number, y: number, z: number) => number,
  options: IsoSurfaceOptions,
): IsoSurface {
  const res = Math.max(2, Math.min(MAX_ISO_RESOLUTION, Math.round(options.resolution)))
  const n = res + 1
  const [minX, minY, minZ] = options.min
  const [maxX, maxY, maxZ] = options.max
  const dx = (maxX - minX) / res
  const dy = (maxY - minY) / res
  const dz = (maxZ - minZ) / res

  // 采样 (n)³ 网格（非有限值视为「外部」，不参与提取）
  const values = new Float64Array(n * n * n)
  const inside = new Uint8Array(n * n * n)
  const gid = (i: number, j: number, k: number): number => (k * n + j) * n + i
  for (let k = 0; k < n; k++) {
    const z = minZ + k * dz
    for (let j = 0; j < n; j++) {
      const y = minY + j * dy
      for (let i = 0; i < n; i++) {
        const value = F(minX + i * dx, y, z)
        const id = gid(i, j, k)
        values[id] = value
        inside[id] = Number.isFinite(value) && value >= 0 ? 1 : 0
      }
    }
  }

  const positions: number[] = []
  const indices: number[] = []
  /** 网格边（两角 gid 对）→ 交点顶点索引 */
  const vertexCache = new Map<number, number>()
  let truncated = false

  /** 在角 a、b 之间线性插值出交点（值为 f 的过零点） */
  const intersect = (
    aId: number,
    bId: number,
    a: [number, number, number],
    b: [number, number, number],
  ): number => {
    const key = aId < bId ? aId * 1_000_003 + bId : bId * 1_000_003 + aId
    const cached = vertexCache.get(key)
    if (cached !== undefined) return cached
    const va = values[aId]!
    const vb = values[bId]!
    let t = va / (va - vb)
    if (!Number.isFinite(t)) t = 0.5
    t = Math.min(1, Math.max(0, t))
    const x = a[0] + (b[0] - a[0]) * t
    const y = a[1] + (b[1] - a[1]) * t
    const z = a[2] + (b[2] - a[2]) * t
    const index = positions.length / 3
    positions.push(x, y, z)
    vertexCache.set(key, index)
    return index
  }

  for (let k = 0; k < res && !truncated; k++) {
    for (let j = 0; j < res && !truncated; j++) {
      for (let i = 0; i < res; i++) {
        // 快速跳过：8 角全同侧
        let allIn = true
        let allOut = true
        for (const [cx, cy, cz] of CORNER) {
          if (inside[gid(i + cx, j + cy, k + cz)]!) allOut = false
          else allIn = false
        }
        if (allIn || allOut) continue

        for (const [t0, t1, t2, t3] of TETRA) {
          const corners = [t0, t1, t2, t3] as const
          const ids = corners.map((c) =>
            gid(i + CORNER[c]![0], j + CORNER[c]![1], k + CORNER[c]![2]),
          )
          const points = corners.map((_c, index): [number, number, number] => {
            const id = ids[index]!
            const gi = id % n
            const gj = Math.floor(id / n) % n
            const gk = Math.floor(id / (n * n))
            return [minX + gi * dx, minY + gj * dy, minZ + gk * dz]
          })
          const flags = ids.map((id) => inside[id]!)
          const insideList: number[] = []
          const outsideList: number[] = []
          for (let c = 0; c < 4; c++) {
            if (flags[c]!) insideList.push(c)
            else outsideList.push(c)
          }
          if (insideList.length === 0 || insideList.length === 4) continue
          if (insideList.length === 1 || insideList.length === 3) {
            const apex = (insideList.length === 1 ? insideList : outsideList)[0]!
            const others = insideList.length === 1 ? outsideList : insideList
            const p0 = intersect(ids[apex]!, ids[others[0]!]!, points[apex]!, points[others[0]!]!)
            const p1 = intersect(ids[apex]!, ids[others[1]!]!, points[apex]!, points[others[1]!]!)
            const p2 = intersect(ids[apex]!, ids[others[2]!]!, points[apex]!, points[others[2]!]!)
            indices.push(p0, p1, p2)
          } else {
            // 2/2：截面是四边形（环 a-c → a-d → b-d → b-c，其中 a,b 为内侧）
            const [a, b] = insideList as [number, number]
            const [c, d] = outsideList as [number, number]
            const pAC = intersect(ids[a]!, ids[c]!, points[a]!, points[c]!)
            const pAD = intersect(ids[a]!, ids[d]!, points[a]!, points[d]!)
            const pBD = intersect(ids[b]!, ids[d]!, points[b]!, points[d]!)
            const pBC = intersect(ids[b]!, ids[c]!, points[b]!, points[c]!)
            indices.push(pAC, pAD, pBD)
            indices.push(pAC, pBD, pBC)
          }
          if (indices.length / 3 >= MAX_ISO_TRIANGLES) {
            truncated = true
            break
          }
        }
      }
    }
  }

  // 顶点法线：F 的梯度（中心差分）
  const vertexCount = positions.length / 3
  const normals = new Float32Array(vertexCount * 3)
  const hx = dx / 2
  const hy = dy / 2
  const hz = dz / 2
  for (let v = 0; v < vertexCount; v++) {
    const x = positions[v * 3]!
    const y = positions[v * 3 + 1]!
    const z = positions[v * 3 + 2]!
    const gx = (F(x + hx, y, z) - F(x - hx, y, z)) / (2 * hx)
    const gy = (F(x, y + hy, z) - F(x, y - hy, z)) / (2 * hy)
    const gz = (F(x, y, z + hz) - F(x, y, z - hz)) / (2 * hz)
    const norm = Math.hypot(gx, gy, gz)
    if (norm > 0 && Number.isFinite(norm)) {
      normals[v * 3] = gx / norm
      normals[v * 3 + 1] = gy / norm
      normals[v * 3 + 2] = gz / norm
    } else {
      normals[v * 3 + 2] = 1
    }
  }

  return {
    positions: Float32Array.from(positions),
    normals,
    triangleCount: indices.length / 3,
    truncated,
  }
}
