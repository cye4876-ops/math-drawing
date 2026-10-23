/**
 * 群同态枚举（v3.2）：在源的生成元上枚举像，扩展到全群并验证良定义。
 * 返回每个同态的映射、核、像、单/满射标记；第一同构定理 |G| = |ker|·|Im| 可直接核对。
 */
import { elementOrder, mult, type FiniteGroup } from './groups'
import { minimalGenerators } from './subgroups'

export interface GroupHomomorphism {
  /** 与 source 元素索引对齐 */
  mapping: number[]
  /** 映射到目标单位元的源元素 */
  kernel: number[]
  /** 目标中的像（去重、升序） */
  image: number[]
  injective: boolean
  surjective: boolean
}

export interface HomomorphismResult {
  homs: GroupHomomorphism[]
  /** 找到的同态总数（可能大于 homs.length，受 limit 限制） */
  total: number
  complete: boolean
  note: string
}

export function enumerateHomomorphisms(
  source: FiniteGroup,
  target: FiniteGroup,
  limit = 100,
  budget = 2_000_000,
): HomomorphismResult {
  const generators = minimalGenerators(source)
  const sourceOrders = generators.map((generator) => elementOrder(source, generator))
  const targetElements = Array.from({ length: target.order }, (_, i) => i)
  const targetOrders = targetElements.map((element) => elementOrder(target, element))
  const mapping = new Array<number>(source.order).fill(-1)
  const homs: GroupHomomorphism[] = []
  let total = 0
  let used = 0

  const extend = (images: number[]): GroupHomomorphism | null => {
    mapping.fill(-1)
    mapping[source.identity] = target.identity
    const queue = [source.identity]
    for (let head = 0; head < queue.length; head++) {
      const element = queue[head]!
      for (let i = 0; i < generators.length; i++) {
        const generator = generators[i]!
        const product = mult(source, element, generator)
        const expected = mult(target, mapping[element]!, images[i]!)
        if (mapping[product] === -1) {
          mapping[product] = expected
          queue.push(product)
        } else if (mapping[product] !== expected) {
          return null
        }
      }
    }
    if (mapping.some((value) => value === -1)) return null
    const kernel: number[] = []
    const imageSet = new Set<number>()
    mapping.forEach((value, index) => {
      if (value === target.identity) kernel.push(index)
      imageSet.add(value)
    })
    const image = [...imageSet].sort((a, b) => a - b)
    return {
      mapping: [...mapping],
      kernel,
      image,
      injective: kernel.length === 1,
      surjective: image.length === target.order,
    }
  }

  const backtrack = (index: number, images: number[]): void => {
    if (used > budget) return
    if (index === generators.length) {
      used += 20
      const hom = extend(images)
      if (hom) {
        total++
        if (homs.length < limit) homs.push(hom)
      }
      return
    }
    const requiredOrder = sourceOrders[index]!
    for (const candidate of targetElements) {
      used++
      if (requiredOrder % targetOrders[candidate]! !== 0) continue
      images.push(candidate)
      backtrack(index + 1, images)
      images.pop()
      if (used > budget) return
    }
  }
  backtrack(0, [])

  const complete = used <= budget && total <= limit
  return {
    homs,
    total,
    complete,
    note: complete
      ? `共 ${total} 个同态${total > limit ? `（仅显示前 ${limit} 个）` : ''}。第一同构定理：|G| = |核| × |像|。`
      : `搜索预算或显示上限耗尽：已找到 ${total} 个同态（未完成）。`,
  }
}
