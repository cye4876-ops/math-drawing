/**
 * 子群枚举（v3.2）：生成闭包 + 子群两两合成（join）迭代。
 *
 * 与 v2.2 的幂集扫描（|G| ≤ 12）相比，本算法对任意 |G| ≤ 60 的小群可行：
 * - 种子 = 全部循环子群 ⟨a⟩；
 * - 反复取现有子群的并生成子群 ⟨H ∪ K⟩（即 join），直到不再新增；
 * - 由「任何子群是其全部循环子群的 join」可得算法完备。
 * Sage 核验：S₄ = 30 个、A₅ = 59 个、A₄ = 10 个子群。
 */
import { cyclicSubgroup, elementOrder, mult, type FiniteGroup } from './groups'

/** 智能枚举规模上限（A₅ = 60 阶为教学上界） */
export const SMART_SUBGROUP_MAX_ORDER = 60

/** 由生成元集合求子群闭包（同时用左乘与右乘扩展） */
export function subgroupClosure(group: FiniteGroup, generators: number[]): number[] {
  const unique = [...new Set(generators)]
  const set = new Set<number>([group.identity])
  const queue: number[] = [group.identity]
  for (const generator of unique) {
    if (!set.has(generator)) {
      set.add(generator)
      queue.push(generator)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const element = queue[head]!
    for (const generator of unique) {
      const right = mult(group, element, generator)
      if (!set.has(right)) {
        set.add(right)
        queue.push(right)
      }
      const left = mult(group, generator, element)
      if (!set.has(left)) {
        set.add(left)
        queue.push(left)
      }
    }
  }
  return [...set].sort((a, b) => a - b)
}

const smartCache = new Map<string, number[][]>()

/** 全部子群（智能枚举；按阶数升序、同阶按最小元素排序）；结果按群 id 缓存 */
export function enumerateSubgroupsSmart(group: FiniteGroup): number[][] {
  if (group.order > SMART_SUBGROUP_MAX_ORDER) {
    throw new Error(
      `群 ${group.id}（|G| = ${group.order}）超出智能子群枚举上限 ${SMART_SUBGROUP_MAX_ORDER}`,
    )
  }
  const cached = smartCache.get(group.id)
  if (cached) return cached
  const byKey = new Map<string, number[]>()
  const add = (subgroup: number[]): boolean => {
    const key = subgroup.join(',')
    if (byKey.has(key)) return false
    byKey.set(key, subgroup)
    return true
  }
  for (let element = 0; element < group.order; element++) {
    add(cyclicSubgroup(group, element))
  }
  let changed = true
  let guard = 0
  while (changed && guard++ < 20) {
    changed = false
    const list = [...byKey.values()]
    for (let i = 0; i < list.length; i++) {
      for (let j = i; j < list.length; j++) {
        const joined = subgroupClosure(group, [...list[i]!, ...list[j]!])
        if (add(joined)) changed = true
      }
    }
  }
  const result = [...byKey.values()].sort(
    (a, b) => a.length - b.length || (a[0] ?? 0) - (b[0] ?? 0),
  )
  smartCache.set(group.id, result)
  return result
}

/** 全部 p-子群（阶为 p 的幂；含平凡子群） */
export function pSubgroups(group: FiniteGroup, prime: number): number[][] {
  return enumerateSubgroupsSmart(group).filter((subgroup) => {
    let order = subgroup.length
    if (order === 1) return true
    while (order % prime === 0) order /= prime
    return order === 1
  })
}

/** 贪心求一个（尽量小的）生成元集合：优先高阶元素（保证 S₄/A₅ 只需 2 个） */
export function minimalGenerators(group: FiniteGroup): number[] {
  const generators: number[] = []
  let generated = new Set<number>([group.identity])
  const candidates = Array.from({ length: group.order }, (_, i) => i).sort(
    (a, b) => elementOrder(group, b) - elementOrder(group, a) || a - b,
  )
  for (const element of candidates) {
    if (generated.has(element)) continue
    generators.push(element)
    generated = new Set(subgroupClosure(group, generators))
    if (generated.size === group.order) break
  }
  return generators
}
