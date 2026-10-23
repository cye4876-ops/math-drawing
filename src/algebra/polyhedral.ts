/**
 * 立方体旋转群（24 阶 ≅ S₄）与 Burnside 着色计数（v3.2）。
 * - 旋转群由 24 个有符号置换矩阵（det = +1）作用在 8 个顶点上给出；
 * - 面 / 顶点 / 棱 上的置换由顶点置换导出；
 * - Burnside：(1/|G|)·Σ k^{c(g)}，c(g) 为循环数。
 * 独立核验（WSL Sage 环境·显式枚举）：面 2→10 / 3→57；顶点 2→23 / 3→333；棱 2→218 / 3→22815。
 */
import { createPermutationGroup, type FiniteGroup } from './groups'

export interface CubeAction {
  group: FiniteGroup
  /** 与群元素同序：对 8 个顶点的置换 */
  vertexPerms: number[][]
  /** 与群元素同序：对 6 个面的置换 */
  facePerms: number[][]
  /** 与群元素同序：对 12 条棱的置换 */
  edgePerms: number[][]
}

interface CubeGeometry {
  vertices: [number, number, number][]
  /** 面：按 (axis, sign) 枚举，每面 4 个顶点索引 */
  faces: number[][]
  /** 棱：相差一个坐标的顶点对 */
  edges: [number, number][]
}

function cubeGeometry(): CubeGeometry {
  const vertices: [number, number, number][] = []
  for (const x of [1, -1]) {
    for (const y of [1, -1]) {
      for (const z of [1, -1]) vertices.push([x, y, z])
    }
  }
  const index = new Map(vertices.map((vertex, i) => [vertex.join(','), i]))
  const faces: number[][] = []
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [1, -1]) {
      const face = vertices
        .map((vertex, i) => ({ vertex, i }))
        .filter(({ vertex }) => vertex[axis] === sign)
        .map(({ i }) => i)
      faces.push(face)
    }
  }
  const edges: [number, number][] = []
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const a = vertices[i]!
      const b = vertices[j]!
      let differs = 0
      for (let axis = 0; axis < 3; axis++) if (a[axis] !== b[axis]) differs++
      if (differs === 1) edges.push([i, j])
    }
  }
  void index
  return { vertices, faces, edges }
}

/** 24 个旋转对应的顶点置换（确定性顺序：矩阵按坐标轴置换与符号枚举） */
function rotationVertexPerms(): number[][] {
  const geometry = cubeGeometry()
  const index = new Map(geometry.vertices.map((vertex, i) => [vertex.join(','), i]))
  const permutations: number[][] = []
  const seen = new Set<string>()
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]
  for (const perm of orders) {
    for (const signs of [
      [1, 1, 1],
      [1, 1, -1],
      [1, -1, 1],
      [1, -1, -1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, 1],
      [-1, -1, -1],
    ]) {
      let inversions = 0
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) if (perm[i]! > perm[j]!) inversions++
      }
      const det = signs[0]! * signs[1]! * signs[2]! * (inversions % 2 === 0 ? 1 : -1)
      if (det !== 1) continue
      const images: number[] = []
      for (const vertex of geometry.vertices) {
        const image: [number, number, number] = [0, 0, 0]
        for (let row = 0; row < 3; row++) {
          image[row] = signs[row]! * vertex[perm[row]!]!
        }
        const found = index.get(image.join(','))
        if (found === undefined) throw new Error('立方体旋转：顶点映射越界')
        images.push(found)
      }
      const key = images.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      permutations.push(images)
    }
  }
  return permutations
}

let cachedAction: CubeAction | null = null

export function cubeAction(): CubeAction {
  if (cachedAction) return cachedAction
  const geometry = cubeGeometry()
  const vertexPerms = rotationVertexPerms()
  const group = createPermutationGroup(
    'cube24',
    '立方体旋转群（24 阶）',
    '立方体的 24 个旋转（≅ S₄）：Burnside 着色计数的标准样例',
    vertexPerms,
  )
  const permuteSet = (set: number[], perm: number[]): number[] =>
    set.map((point) => perm[point]!).sort((a, b) => a - b)
  const lookup = (sets: number[][], key: string): number => {
    const index = sets.findIndex((set) => set.join(',') === key)
    if (index < 0) throw new Error('立方体旋转：集合映射失败')
    return index
  }
  const faceKeys = geometry.faces.map((face) => [...face].sort((a, b) => a - b).join(','))
  const edgeKeys = geometry.edges.map(([a, b]) => [a, b].sort((x, y) => x - y).join(','))
  const facePerms = vertexPerms.map((perm) =>
    geometry.faces.map((face) => lookup(geometry.faces, permuteSet(face, perm).join(','))),
  )
  const edgePerms = vertexPerms.map((perm) =>
    geometry.edges.map(([a, b]) => {
      const mapped = [perm[a]!, perm[b]!].sort((x, y) => x - y)
      return lookup(geometry.edges, mapped.join(','))
    }),
  )
  void faceKeys
  void edgeKeys
  cachedAction = { group, vertexPerms, facePerms, edgePerms }
  return cachedAction
}

/** 置换的循环数 */
export function cycleCount(permutation: number[]): number {
  const seen = new Array<boolean>(permutation.length).fill(false)
  let cycles = 0
  for (let i = 0; i < permutation.length; i++) {
    if (seen[i]) continue
    cycles++
    let current = i
    while (!seen[current]) {
      seen[current] = true
      current = permutation[current]!
    }
  }
  return cycles
}

/** Burnside 引理：轨道数 = (1/|G|)·Σ k^{c(g)} */
export function burnsideCount(permutations: number[][], colorCount: number): number {
  if (permutations.length === 0) return 0
  let total = 0
  for (const permutation of permutations) total += colorCount ** cycleCount(permutation)
  return Math.round(total / permutations.length)
}

export type CubeTarget = 'faces' | 'vertices' | 'edges'

export const CUBE_TARGET_LABELS: Record<CubeTarget, string> = {
  faces: '面（6 个）',
  vertices: '顶点（8 个）',
  edges: '棱（12 条）',
}

export function cubeBurnside(target: CubeTarget, colorCount: number): number {
  const action = cubeAction()
  const permutations =
    target === 'faces'
      ? action.facePerms
      : target === 'vertices'
        ? action.vertexPerms
        : action.edgePerms
  return burnsideCount(permutations, colorCount)
}
