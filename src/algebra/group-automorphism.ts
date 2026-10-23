/**
 * 群自同构（v3.2）：生成元像回溯 + 同态扩展验证。
 * |Aut(G)| = 保乘法的双射数量；内自同构 = |G|/|Z(G)|；外自同构 = |Aut|/|Inn|。
 * 独立核验（WSL Sage 环境 · 生成元像穷举）：C₄ 2、V₄ 6、C₆ 2、S₃ 6、D₄ 8、
 * Q₈ 24、A₄ 24、S₄ 24、A₅ 120。
 */
import { elementOrder, mult, type FiniteGroup } from './groups'
import { minimalGenerators } from './subgroups'

export interface GroupAutomorphismSummary {
  automorphisms: number
  inner: number
  outer: number
  complete: boolean
  note: string
}

const summaryCache = new Map<string, GroupAutomorphismSummary>()

export function groupAutomorphismSummary(
  group: FiniteGroup,
  budget = 2_000_000,
): GroupAutomorphismSummary {
  const cached = summaryCache.get(group.id)
  if (cached) return cached
  const identity = group.identity
  const generators = minimalGenerators(group)
  const elements = Array.from({ length: group.order }, (_, i) => i)
  const orders = elements.map((element) => elementOrder(group, element))
  const mapping = new Array<number>(group.order).fill(-1)
  let count = 0
  let used = 0

  const extend = (images: number[]): boolean => {
    mapping.fill(-1)
    mapping[identity] = identity
    const queue = [identity]
    for (let head = 0; head < queue.length; head++) {
      const element = queue[head]!
      for (let i = 0; i < generators.length; i++) {
        const generator = generators[i]!
        const product = mult(group, element, generator)
        const expected = mult(group, mapping[element]!, images[i]!)
        if (mapping[product] === -1) {
          mapping[product] = expected
          queue.push(product)
        } else if (mapping[product] !== expected) {
          return false
        }
      }
    }
    if (mapping.some((value) => value === -1)) return false
    return new Set(mapping).size === group.order
  }

  const backtrack = (index: number, images: number[], usedImages: Set<number>): void => {
    if (used > budget) return
    if (index === generators.length) {
      used += 20
      if (extend(images)) count++
      return
    }
    const requiredOrder = orders[generators[index]!]!
    for (const candidate of elements) {
      used++
      if (usedImages.has(candidate) || orders[candidate] !== requiredOrder) continue
      images.push(candidate)
      usedImages.add(candidate)
      backtrack(index + 1, images, usedImages)
      images.pop()
      usedImages.delete(candidate)
      if (used > budget) return
    }
  }
  backtrack(0, [], new Set())

  const center = elements.filter((element) =>
    elements.every((other) => mult(group, element, other) === mult(group, other, element)),
  ).length
  const inner = group.order / center
  const complete = used <= budget
  const outer = count % inner === 0 ? count / inner : NaN
  const summary: GroupAutomorphismSummary = {
    automorphisms: count,
    inner,
    outer,
    complete,
    note: complete
      ? `|Aut(G)| = ${count} = 内自同构 ${inner} × 外自同构 ${outer}（|Z(G)| = ${center}）。`
      : `搜索预算耗尽：|Aut(G)| ≥ ${count}（未完成）。`,
  }
  if (complete) summaryCache.set(group.id, summary)
  return summary
}
