/**
 * 有限群构造与结构计算（v2.2 反例实验室）。
 *
 * - 构造：置换群（由轮换记号生成，构造时校验封闭性与元素唯一性）与显式乘法表
 *   （循环群、Klein 四元群、四元数群、GF(4) 加法/乘法表）；
 * - 结构查询：元素阶、交换性、子群枚举（幂集扫描，|G| ≤ 12 可接受）、正规性、
 *   中心、循环性、生成子群与子集乘积；
 * - 全部为教学规模（|G| ≤ 12）；子群枚举结果按群 id 缓存（纯函数语义，无副作用泄漏）。
 */

export interface FiniteTable {
  id: string
  name: string
  description: string
  /** 元素标签（含单位元） */
  elements: string[]
  /** table[a][b] = a·b 的元素索引 */
  table: number[][]
  /** 单位元索引（GF(4) 乘法表等单位元可为 index 1；可选） */
  identity?: number
}

export interface FiniteGroup extends FiniteTable {
  identity: number
  order: number
}

// ---------- 构造：置换群 ----------

/** 由轮换记号（1 起点的点编号）构造置换：perm[i] = i 的像 */
export function permFromCycles(pointCount: number, cycles: number[][]): number[] {
  const perm = Array.from({ length: pointCount }, (_, i) => i)
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length; i++) {
      const from = (cycle[i] ?? 1) - 1
      const to = (cycle[(i + 1) % cycle.length] ?? 1) - 1
      perm[from] = to
    }
  }
  return perm
}

/** (p∘q)(i) = p(q(i))：先作用 q，再作用 p */
export function composePerm(p: number[], q: number[]): number[] {
  return q.map((qi) => p[qi] ?? qi)
}

function buildPermutationGroup(
  id: string,
  name: string,
  description: string,
  labels: string[],
  perms: number[][],
): FiniteGroup {
  const pointCount = perms[0]?.length ?? 0
  const keyOf = (perm: number[]): string => perm.join(',')
  const indexByKey = new Map(perms.map((perm, index) => [keyOf(perm), index]))
  if (indexByKey.size !== perms.length) throw new Error(`群 ${id}：元素重复`)
  const identity = indexByKey.get(keyOf(Array.from({ length: pointCount }, (_, i) => i)))
  if (identity === undefined) throw new Error(`群 ${id}：缺少单位元`)
  const table = perms.map((p) =>
    perms.map((q) => {
      const index = indexByKey.get(keyOf(composePerm(p, q)))
      if (index === undefined) throw new Error(`群 ${id}：对置换合成不封闭`)
      return index
    }),
  )
  return { id, name, description, elements: labels, table, identity, order: perms.length }
}

// ---------- 构造：显式表 ----------

const SUP = ['', '', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']

/** 循环群 Cₙ：元素 e, g, g², ... */
function buildCyclicGroup(id: string, name: string, n: number): FiniteGroup {
  const elements = ['e', ...Array.from({ length: n - 1 }, (_, i) => `g${SUP[i + 1] ?? ''}`)]
  const table = Array.from({ length: n }, (_, a) =>
    Array.from({ length: n }, (_, b) => (a + b) % n),
  )
  return {
    id,
    name,
    description: `循环群 C${n > 9 ? `_${n}` : (SUP[n] ?? '')}：由单个元素生成`,
    elements,
    table,
    identity: 0,
    order: n,
  }
}

/** Klein 四元群 V₄ = C₂×C₂（逐分量 XOR） */
function buildV4(): FiniteGroup {
  return {
    id: 'v4',
    name: 'V₄（Klein 四元群）',
    description: 'V₄ = C₂×C₂：每个非单位元都是 2 阶，不循环',
    elements: ['e', 'a', 'b', 'ab'],
    table: Array.from({ length: 4 }, (_, a) => Array.from({ length: 4 }, (_, b) => a ^ b)),
    identity: 0,
    order: 4,
  }
}

/** 四元数群 Q₈ = {±1, ±i, ±j, ±k} */
function buildQ8(): FiniteGroup {
  // 元素索引：e = 2·unit + sign；unit: 0=1, 1=i, 2=j, 3=k；sign: 0=+1, 1=−1
  // 顺序：1, −1, i, −i, j, −j, k, −k
  /** unitMul[u][v] = [结果单位, 结果符号]（两侧符号均为 +） */
  const unitMul: [number, number][][] = [
    [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    [
      [1, 1],
      [0, -1],
      [3, 1],
      [2, -1],
    ],
    [
      [2, 1],
      [3, -1],
      [0, -1],
      [1, 1],
    ],
    [
      [3, 1],
      [2, 1],
      [1, -1],
      [0, -1],
    ],
  ]
  const table = Array.from({ length: 8 }, (_, a) =>
    Array.from({ length: 8 }, (_, b) => {
      const ua = a >> 1
      const ub = b >> 1
      const sa = (a & 1) === 1 ? -1 : 1
      const sb = (b & 1) === 1 ? -1 : 1
      const entry = unitMul[ua]?.[ub] ?? [0, 1]
      const sign = sa * sb * entry[1]
      return entry[0] * 2 + (sign < 0 ? 1 : 0)
    }),
  )
  return {
    id: 'q8',
    name: 'Q₈（四元数群）',
    description: 'Q₈ = {±1, ±i, ±j, ±k}：i·j = k、j·i = −k，中心 {±1}',
    elements: ['1', '−1', 'i', '−i', 'j', '−j', 'k', '−k'],
    table,
    identity: 0,
    order: 8,
  }
}

// ---------- 预置群 ----------

const s3Perms = [
  permFromCycles(3, []),
  permFromCycles(3, [[1, 2]]),
  permFromCycles(3, [[1, 3]]),
  permFromCycles(3, [[2, 3]]),
  permFromCycles(3, [[1, 2, 3]]),
  permFromCycles(3, [[1, 3, 2]]),
]

const d4Gen = {
  r: permFromCycles(4, [[1, 2, 3, 4]]),
  s: permFromCycles(4, [[2, 4]]),
}
const d4R2 = composePerm(d4Gen.r, d4Gen.r)
const d4R3 = composePerm(d4R2, d4Gen.r)
const d4Perms = [
  permFromCycles(4, []),
  d4Gen.r,
  d4R2,
  d4R3,
  d4Gen.s,
  composePerm(d4Gen.r, d4Gen.s),
  composePerm(d4R2, d4Gen.s),
  composePerm(d4R3, d4Gen.s),
]

const a4Cycles: number[][][] = [
  [],
  [[1, 2, 3]],
  [[1, 3, 2]],
  [[1, 2, 4]],
  [[1, 4, 2]],
  [[1, 3, 4]],
  [[1, 4, 3]],
  [[2, 3, 4]],
  [[2, 4, 3]],
  [
    [1, 2],
    [3, 4],
  ],
  [
    [1, 3],
    [2, 4],
  ],
  [
    [1, 4],
    [2, 3],
  ],
]

export const GROUP_C4 = buildCyclicGroup('c4', 'C₄（循环群）', 4)
export const GROUP_V4 = buildV4()
export const GROUP_C6 = buildCyclicGroup('c6', 'C₆（循环群）', 6)
export const GROUP_S3 = buildPermutationGroup(
  's3',
  'S₃（3 次对称群）',
  'S₃：3 个点的全部置换；最小的非交换群',
  ['e', '(12)', '(13)', '(23)', '(123)', '(132)'],
  s3Perms,
)
export const GROUP_D4 = buildPermutationGroup(
  'd4',
  'D₄（正方形对称群）',
  'D₄：正方形 8 个对称（4 旋转 + 4 反射）',
  ['e', 'r', 'r²', 'r³', 's', 'rs', 'r²s', 'r³s'],
  d4Perms,
)
export const GROUP_Q8 = buildQ8()
export const GROUP_A4 = buildPermutationGroup(
  'a4',
  'A₄（交错群）',
  'A₄：4 个点的偶置换，12 阶；无 6 阶子群',
  [
    'e',
    '(123)',
    '(132)',
    '(124)',
    '(142)',
    '(134)',
    '(143)',
    '(234)',
    '(243)',
    '(12)(34)',
    '(13)(24)',
    '(14)(23)',
  ],
  a4Cycles.map((cycles) => permFromCycles(4, cycles)),
)

export const GROUPS: Record<string, FiniteGroup> = {
  [GROUP_C4.id]: GROUP_C4,
  [GROUP_V4.id]: GROUP_V4,
  [GROUP_C6.id]: GROUP_C6,
  [GROUP_S3.id]: GROUP_S3,
  [GROUP_D4.id]: GROUP_D4,
  [GROUP_Q8.id]: GROUP_Q8,
  [GROUP_A4.id]: GROUP_A4,
}

export function getGroup(id: string): FiniteGroup {
  const group = GROUPS[id]
  if (!group) throw new Error(`未知群：${id}`)
  return group
}

// ---------- 结构计算 ----------

export function mult(group: FiniteGroup, a: number, b: number): number {
  return group.table[a]?.[b] ?? group.identity
}

/** 元素阶（返回首个使 aⁿ = e 的 n；理论上恒有限） */
export function elementOrder(group: FiniteGroup, a: number): number {
  let current = a
  for (let n = 1; n <= group.order; n++) {
    if (current === group.identity) return n
    current = mult(group, current, a)
  }
  return Infinity
}

export function isAbelian(group: FiniteGroup): boolean {
  for (let a = 0; a < group.order; a++) {
    for (let b = a + 1; b < group.order; b++) {
      if (mult(group, a, b) !== mult(group, b, a)) return false
    }
  }
  return true
}

/** 首个非交换对（a < b 且 a·b ≠ b·a）；交换群返回 null */
export function firstNonCommutingPair(group: FiniteGroup): [number, number] | null {
  for (let a = 0; a < group.order; a++) {
    for (let b = a + 1; b < group.order; b++) {
      if (mult(group, a, b) !== mult(group, b, a)) return [a, b]
    }
  }
  return null
}

export function inverseOf(group: FiniteGroup, a: number): number {
  for (let b = 0; b < group.order; b++) {
    if (mult(group, a, b) === group.identity && mult(group, b, a) === group.identity) return b
  }
  return a
}

export function isCyclic(group: FiniteGroup): boolean {
  for (let a = 0; a < group.order; a++) {
    if (elementOrder(group, a) === group.order) return true
  }
  return false
}

/** 中心 Z(G)：与所有元素交换的元素索引 */
export function centerElements(group: FiniteGroup): number[] {
  const center: number[] = []
  for (let a = 0; a < group.order; a++) {
    let central = true
    for (let b = 0; b < group.order; b++) {
      if (mult(group, a, b) !== mult(group, b, a)) {
        central = false
        break
      }
    }
    if (central) center.push(a)
  }
  return center
}

/** 元素阶分布：阶 → 个数 */
export function elementOrderStats(group: FiniteGroup): Map<number, number> {
  const stats = new Map<number, number>()
  for (let a = 0; a < group.order; a++) {
    const order = elementOrder(group, a)
    stats.set(order, (stats.get(order) ?? 0) + 1)
  }
  return stats
}

/** 由单元素生成的循环子群 ⟨a⟩（含单位元） */
export function cyclicSubgroup(group: FiniteGroup, a: number): number[] {
  const members = new Set<number>([group.identity])
  let current = a
  while (!members.has(current)) {
    members.add(current)
    current = mult(group, current, a)
  }
  return [...members].sort((x, y) => x - y)
}

/** 两个子集的乘积集 H·K = {h·k}（去重、排序） */
export function subsetProduct(group: FiniteGroup, subA: number[], subB: number[]): number[] {
  const set = new Set<number>()
  for (const a of subA) {
    for (const b of subB) set.add(mult(group, a, b))
  }
  return [...set].sort((x, y) => x - y)
}

function isClosedSubset(group: FiniteGroup, mask: number): boolean {
  const identityBit = 1 << group.identity
  if ((mask & identityBit) === 0) return false
  for (let a = 0; a < group.order; a++) {
    if ((mask & (1 << a)) === 0) continue
    for (let b = 0; b < group.order; b++) {
      if ((mask & (1 << b)) === 0) continue
      if ((mask & (1 << mult(group, a, b))) === 0) return false
    }
  }
  return true
}

const subgroupCache = new Map<string, number[][]>()

/**
 * 枚举全部子群（幂集扫描 + 封闭性检查；含平凡子群与群自身）。
 * |G| ≤ 12 时最多 2¹² = 4096 个子集，教学规模可接受。结果按群 id 缓存。
 */
export function allSubgroups(group: FiniteGroup): number[][] {
  const cached = subgroupCache.get(group.id)
  if (cached) return cached
  const result: number[][] = []
  for (let mask = 1; mask < 1 << group.order; mask++) {
    if (!isClosedSubset(group, mask)) continue
    const members: number[] = []
    for (let i = 0; i < group.order; i++) {
      if (mask & (1 << i)) members.push(i)
    }
    result.push(members)
  }
  result.sort((x, y) => x.length - y.length || (x[0] ?? 0) - (y[0] ?? 0))
  subgroupCache.set(group.id, result)
  return result
}

/** H 是否正规子群：对每个 x，x·h·x⁻¹ ∈ H */
export function isNormalSubgroup(group: FiniteGroup, subgroup: number[]): boolean {
  const set = new Set(subgroup)
  for (let x = 0; x < group.order; x++) {
    const inv = inverseOf(group, x)
    for (const h of subgroup) {
      if (!set.has(mult(group, mult(group, x, h), inv))) return false
    }
  }
  return true
}

/** 元素标签快捷方式 */
export function labelOf(group: FiniteGroup, index: number): string {
  return group.elements[index] ?? '?'
}

export function labelsOf(group: FiniteGroup, indices: number[]): string {
  return `{${indices.map((index) => labelOf(group, index)).join(', ')}}`
}
