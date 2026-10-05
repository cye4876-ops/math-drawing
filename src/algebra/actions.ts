/**
 * 群作用、共轭类、陪集与 Sylow 计算（v3.0）。
 *
 * 教学规模算法（|G| ≤ 60：S₃、A₄、S₄、A₅、D₄、Q₈、循环群等）：
 * - 共轭作用：Cl(g) = {xgx⁻¹}、中心化子 C_G(g)，验证 |Cl(g)| = [G:C_G(g)]；
 * - 陪集作用：H = ⟨g⟩（循环子群），左/右陪集对照；H 正规时构造商群乘法表；
 * - Sylow：用**生成封闭算法**（不做子群幂集扫描）找出全部极大 p-子群；
 *   验证 n_p | |G|/pᵃ、n_p ≡ 1 (mod p)、n_p = [G:N_G(P)]，并给出共轭见证元；
 * - Burnside 计数：置换群元素的不动点计数（k^轮换数）与轨道数（着色/项链例子）。
 *
 * 约定：子群一律用成员索引的升序数组表示；相等判定用去重键。
 */

import {
  cyclicSubgroup,
  inverseOf,
  labelOf,
  mult,
  type FiniteGroup,
  type FiniteTable,
} from './groups'

// ---------- 基础工具 ----------

/** 子群/集合的确定性键 */
function setKey(members: number[]): string {
  return [...members].sort((a, b) => a - b).join(',')
}

function sortUnique(members: number[]): number[] {
  return [...new Set(members)].sort((a, b) => a - b)
}

/** 由生成元集合封闭出的子群（BFS 乘法封闭；教学规模直接两两相乘） */
export function closureOfGenerators(group: FiniteGroup, generators: number[]): number[] {
  const set = new Set<number>([group.identity, ...generators])
  let changed = true
  while (changed) {
    changed = false
    for (const a of [...set]) {
      for (const b of [...set]) {
        const product = mult(group, a, b)
        if (!set.has(product)) {
          set.add(product)
          changed = true
        }
      }
    }
  }
  return sortUnique([...set])
}

/** 判断 n 是否为 p 的幂（含 p⁰ = 1） */
export function isPowerOf(n: number, p: number): boolean {
  if (n < 1) return false
  let current = n
  while (current % p === 0) current /= p
  return current === 1
}

/** n 中素数 p 的指数 a（pᵃ || n；p ∤ n 时为 0） */
export function primeExponent(n: number, p: number): number {
  let exponent = 0
  let current = n
  while (current % p === 0) {
    current /= p
    exponent++
  }
  return exponent
}

/** n 的质因数分解（升序） */
export function primeFactorization(n: number): { prime: number; exponent: number }[] {
  const factors: { prime: number; exponent: number }[] = []
  let rest = Math.abs(n)
  for (let p = 2; p * p <= rest; p++) {
    if (rest % p !== 0) continue
    let exponent = 0
    while (rest % p === 0) {
      rest /= p
      exponent++
    }
    factors.push({ prime: p, exponent })
  }
  if (rest > 1) factors.push({ prime: rest, exponent: 1 })
  return factors
}

/** |G| 的全部素因子 */
export function primeDivisors(order: number): number[] {
  return primeFactorization(order).map((item) => item.prime)
}

function divisors(n: number): number[] {
  const result: number[] = []
  for (let d = 1; d <= n; d++) {
    if (n % d === 0) result.push(d)
  }
  return result
}

// ---------- 共轭作用：共轭类与中心化子 ----------

/** x·a·x⁻¹ */
export function conjugateElement(group: FiniteGroup, x: number, a: number): number {
  return mult(group, mult(group, x, a), inverseOf(group, x))
}

/** 共轭类 Cl(a) = {xax⁻¹ : x ∈ G}（升序索引） */
export function conjugacyClassOf(group: FiniteGroup, a: number): number[] {
  const members = new Set<number>()
  for (let x = 0; x < group.order; x++) members.add(conjugateElement(group, x, a))
  return sortUnique([...members])
}

/** 中心化子 C_G(a) = {x : xa = ax}（升序索引） */
export function centralizerOf(group: FiniteGroup, a: number): number[] {
  const members: number[] = []
  for (let x = 0; x < group.order; x++) {
    if (mult(group, x, a) === mult(group, a, x)) members.push(x)
  }
  return members
}

export interface ConjugacyClassInfo {
  /** 代表元索引（取类中最小索引） */
  representative: number
  /** 类成员索引（升序） */
  members: number[]
  /** 中心化子索引（升序） */
  centralizer: number[]
}

/** 全群共轭类分解（含中心：大小为 1 的类之并） */
export function conjugacyClasses(group: FiniteGroup): ConjugacyClassInfo[] {
  const visited = new Set<number>()
  const result: ConjugacyClassInfo[] = []
  for (let a = 0; a < group.order; a++) {
    if (visited.has(a)) continue
    const members = conjugacyClassOf(group, a)
    for (const member of members) visited.add(member)
    result.push({
      representative: Math.min(...members),
      members,
      centralizer: centralizerOf(group, a),
    })
  }
  return result
}

/** 类方程各部分：|G| = Σ |Clᵢ|，并给出中心 Z(G) */
export function classEquation(group: FiniteGroup): {
  classes: ConjugacyClassInfo[]
  center: number[]
  sizes: number[]
  centerSize: number
} {
  const classes = conjugacyClasses(group)
  const center = classes
    .filter((item) => item.members.length === 1)
    .map((item) => item.representative)
  return {
    classes,
    center,
    sizes: classes.map((item) => item.members.length),
    centerSize: center.length,
  }
}

// ---------- 子群共轭与正规化子 ----------

/** xPx⁻¹（子群元素的共轭像集，升序） */
export function conjugateSubgroup(group: FiniteGroup, subgroup: number[], x: number): number[] {
  return sortUnique(subgroup.map((h) => conjugateElement(group, x, h)))
}

/** 正规化子 N_G(P) = {x : xPx⁻¹ = P}（升序索引） */
export function normalizerOfSubgroup(group: FiniteGroup, subgroup: number[]): number[] {
  const key = setKey(subgroup)
  const members: number[] = []
  for (let x = 0; x < group.order; x++) {
    if (setKey(conjugateSubgroup(group, subgroup, x)) === key) members.push(x)
  }
  return members
}

/** 子群是否正规（等价于 xPx⁻¹ = P 对所有 x） */
export function isNormal(group: FiniteGroup, subgroup: number[]): boolean {
  return normalizerOfSubgroup(group, subgroup).length === group.order
}

/** 寻找把 P 共轭到 Q 的见证元 x（即 xPx⁻¹ = Q）；找不到返回 null */
export function findConjugator(group: FiniteGroup, p: number[], q: number[]): number | null {
  const target = setKey(q)
  for (let x = 0; x < group.order; x++) {
    if (setKey(conjugateSubgroup(group, p, x)) === target) return x
  }
  return null
}

// ---------- Sylow 工作台 ----------

export interface SylowSubgroupInfo {
  /** 成员索引（升序） */
  members: number[]
  /** 与 elements 对齐的成员标签 */
  labels: string[]
  /** 正规化子 N_G(P)（升序索引） */
  normalizer: number[]
  /** 是否正规（N_G(P) = G ⇔ n_p = 1） */
  normal: boolean
  /** 从第一个 Sylow 子群到它自己的共轭见证元（P₁ 为自身取 e） */
  conjugatorFromFirst: number | null
}

export interface SylowReport {
  prime: number
  /** pᵃ || |G| */
  exponent: number
  /** pᵃ */
  pPart: number
  /** m = |G|/pᵃ */
  cofactor: number
  /** 实际 Sylow p-子群（极大 p-子群），按首元素排序 */
  subgroups: SylowSubgroupInfo[]
  /** 实际数量 n_p */
  count: number
  /** 算术允许的数量：d | m 且 d ≡ 1 (mod p) */
  allowedCounts: number[]
  /** 每条 Sylow 定理约束的核验结果 */
  checks: { label: string; detail: string; ok: boolean }[]
}

/**
 * 计算全部 Sylow p-子群：从循环 p-子群出发，用生成封闭反复合并，
 * 最后取极大 p-子群。|G| ≤ 60 时完全可行（S₄/A₅ 不需要子群幂集扫描）。
 */
export function sylowSubgroups(group: FiniteGroup, p: number): number[][] {
  const exponent = primeExponent(group.order, p)
  if (exponent === 0) return []
  const target = p ** exponent

  const seen = new Map<string, number[]>()
  const add = (members: number[]): boolean => {
    const sorted = sortUnique(members)
    if (sorted.length === 0 || sorted.length > target) return false
    if (!isPowerOf(sorted.length, p)) return false
    const key = setKey(sorted)
    if (seen.has(key)) return false
    seen.set(key, sorted)
    return true
  }

  add([group.identity])
  for (let a = 0; a < group.order; a++) {
    add(cyclicSubgroup(group, a))
  }

  let changed = true
  while (changed) {
    changed = false
    const current = [...seen.values()]
    for (let i = 0; i < current.length; i++) {
      for (let j = i; j < current.length; j++) {
        const joined = closureOfGenerators(group, [...(current[i] ?? []), ...(current[j] ?? [])])
        if (add(joined)) changed = true
      }
    }
  }

  const all = [...seen.values()]
  const maximal = all.filter(
    (candidate) =>
      !all.some(
        (other) => other.length > candidate.length && candidate.every((m) => other.includes(m)),
      ),
  )
  return maximal.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0) || a.length - b.length)
}

/** Sylow 工作台完整报告：数量、约束核验、正规化子与共轭见证 */
export function sylowReport(group: FiniteGroup, p: number): SylowReport {
  const exponent = primeExponent(group.order, p)
  const pPart = p ** exponent
  const cofactor = group.order / pPart
  const subgroupsRaw = sylowSubgroups(group, p)
  const first = subgroupsRaw[0]

  const subgroups: SylowSubgroupInfo[] = subgroupsRaw.map((members) => {
    const normalizer = normalizerOfSubgroup(group, members)
    return {
      members,
      labels: members.map((index) => labelOf(group, index)),
      normalizer,
      normal: normalizer.length === group.order,
      conjugatorFromFirst: first ? findConjugator(group, first, members) : null,
    }
  })

  const count = subgroups.length
  const allowedCounts = divisors(cofactor).filter((d) => d % p === 1)
  const normalizerOrder = subgroups[0]?.normalizer.length ?? 0
  const index = normalizerOrder > 0 ? group.order / normalizerOrder : 0

  const checks = [
    {
      label: `|P| = pᵃ = ${p}${exponent > 1 ? `^${exponent}` : ''}`,
      detail: `实际子群阶 ${subgroups[0]?.members.length ?? 0}（pᵃ = ${pPart}）`,
      ok: (subgroups[0]?.members.length ?? 0) === pPart,
    },
    {
      label: `n_p ∣ |G|/pᵃ = ${cofactor}`,
      detail: `${count} ${cofactor % count === 0 ? '整除' : '不整除'} ${cofactor}`,
      ok: cofactor % count === 0,
    },
    {
      label: `n_p ≡ 1 (mod ${p})`,
      detail: `${count} mod ${p} = ${count % p}`,
      ok: count % p === 1,
    },
    {
      label: `n_p = [G : N_G(P)]`,
      detail: `|N_G(P)| = ${normalizerOrder}，指数 = ${index}（n_p = ${count}）`,
      ok: index === count,
    },
    {
      label: 'Sylow 子群两两共轭',
      detail: subgroups.slice(1).every((item) => item.conjugatorFromFirst !== null)
        ? '每个子群都能写成 xP₁x⁻¹'
        : '存在无法共轭到的子群（异常）',
      ok: subgroups.slice(1).every((item) => item.conjugatorFromFirst !== null),
    },
  ]

  return { prime: p, exponent, pPart, cofactor, subgroups, count, allowedCounts, checks }
}

/** 算术允许但未必实现的 Sylow 数量（提醒学习者区分必要条件与实际存在） */
export function sylowAllowedCounts(group: FiniteGroup, p: number): number[] {
  const exponent = primeExponent(group.order, p)
  if (exponent === 0) return []
  const cofactor = group.order / p ** exponent
  return divisors(cofactor).filter((d) => d % p === 1)
}

// ---------- 陪集作用与商群 ----------

export interface CosetInfo {
  /** 左陪集：gH（代表元 → 成员集合） */
  left: { representative: number; members: number[] }[]
  /** 右陪集：Hg */
  right: { representative: number; members: number[] }[]
  /** 左陪集与右陪集是否逐一同集合 */
  normal: boolean
  index: number
}

/** 计算子群的全部左/右陪集（去重，按代表元排序） */
export function cosets(group: FiniteGroup, subgroup: number[]): CosetInfo {
  const collect = (multiply: (g: number, h: number) => number): CosetInfo['left'] => {
    const seen = new Map<string, { representative: number; members: number[] }>()
    for (let g = 0; g < group.order; g++) {
      const members = sortUnique(subgroup.map((h) => multiply(g, h)))
      const key = setKey(members)
      if (!seen.has(key)) seen.set(key, { representative: g, members })
    }
    return [...seen.values()].sort((a, b) => a.representative - b.representative)
  }
  const left = collect((g, h) => mult(group, g, h))
  const right = collect((g, h) => mult(group, h, g))
  const leftKeys = new Set(left.map((coset) => setKey(coset.members)))
  const normal = right.every((coset) => leftKeys.has(setKey(coset.members)))
  return { left, right, normal, index: left.length }
}

/**
 * 商群 G/H（要求 H 正规）：陪集作为元素，乘法由代表元诱导。
 * 返回可直接交给 CayleyTable 的 FiniteTable；H 不正规时返回 null。
 */
export function quotientGroup(group: FiniteGroup, subgroup: number[]): FiniteTable | null {
  const info = cosets(group, subgroup)
  if (!info.normal) return null
  const cosetList = info.left
  const indexOf = new Map<string, number>()
  cosetList.forEach((coset, index) => indexOf.set(setKey(coset.members), index))

  const table = cosetList.map((row) =>
    cosetList.map((col) => {
      const product = mult(group, row.representative, col.representative)
      // 找包含该乘积的陪集
      for (const coset of cosetList) {
        if (coset.members.includes(product)) return indexOf.get(setKey(coset.members)) ?? -1
      }
      return -1
    }),
  )
  if (table.some((row) => row.some((entry) => entry < 0))) return null

  const identityCoset = indexOf.get(setKey(sortUnique([group.identity, ...subgroup]))) ?? 0
  const label = (coset: { representative: number }): string =>
    `${labelOf(group, coset.representative)}H`
  return {
    id: `${group.id}/${subgroup.map((h) => labelOf(group, h)).join('')}`,
    name: `${group.name} / ⟨${subgroup.map((h) => labelOf(group, h)).join(', ')}⟩`,
    description: `商群：${cosetList.length} 个陪集；H ${info.normal ? '正规' : '不正规'}`,
    elements: cosetList.map(label),
    table,
    identity: identityCoset,
  }
}

// ---------- Burnside 计数（置换群作用在顶点着色上） ----------

export interface BurnsideReport {
  /** 每个元素的轮换数与不动着色数 k^{c(g)} */
  rows: { element: string; cycles: number; fixed: number }[]
  /** 轨道数（本质上不同的着色数） */
  orbits: number
  /** (1/|G|)·Σ k^{c(g)} 的分母核验 */
  total: number
}

/**
 * Burnside 引理：群作用在“k 色顶点着色”上的轨道数。
 * 仅适用于置换群（V₄/C₄ 等表构造群无 perms 字段，返回 null）。
 */
export function burnsideColoring(group: FiniteGroup, colors: number): BurnsideReport | null {
  if (!group.perms) return null
  const rows = group.perms.map((perm, index) => {
    const cycleCount = countCycles(perm)
    return {
      element: labelOf(group, index),
      cycles: cycleCount,
      fixed: colors ** cycleCount,
    }
  })
  const total = rows.reduce((sum, row) => sum + row.fixed, 0)
  return {
    rows,
    orbits: total / group.order,
    total,
  }
}

function countCycles(perm: number[]): number {
  const seen = new Array<boolean>(perm.length).fill(false)
  let cycles = 0
  for (let start = 0; start < perm.length; start++) {
    if (seen[start]) continue
    cycles++
    let current = start
    while (!seen[current]) {
      seen[current] = true
      current = perm[current] ?? current
    }
  }
  return cycles
}
