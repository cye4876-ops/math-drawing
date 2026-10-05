/**
 * 近世代数经典反例（v2.2 反例实验室）。
 *
 * 每条案例 = 被反驳的命题 + 具体反例对象 + 可视化证据（乘法表 / 子群报告 / 格点图 / 说明）。
 * 数据只描述「展示什么」；交互与计算在 UI 组件与 groups.ts 中完成。
 */

import type { AlgebraDiagramKind } from './diagrams'
import { GROUPS, type FiniteTable } from './groups'

export type CounterexamplePanel =
  | {
      kind: 'table'
      title?: string
      groupId: string
      markNonCommuting?: boolean
      markCenter?: boolean
      highlightRows?: string[]
      highlightCols?: string[]
      note?: string
    }
  | { kind: 'table-compare'; title?: string; groupIds: string[]; note?: string }
  | {
      kind: 'subgroup-report'
      title?: string
      groupId: string
      missingOrder?: number
      note?: string
    }
  | {
      kind: 'subgroup-product'
      title?: string
      groupId: string
      generatorA: string
      generatorB: string
      note?: string
    }
  | { kind: 'diagram'; title?: string; diagram: AlgebraDiagramKind; note?: string }
  | { kind: 'text'; title?: string; lines: string[]; note?: string }

export interface CounterexampleCase {
  id: string
  field: '群论' | '环论' | '域论'
  title: string
  claim: string
  object: string
  explanation: string
  panels: CounterexamplePanel[]
}

// ---------- GF(4)（其余域表在 groups.ts） ----------

/** GF(4) = {0, 1, ω, ω+1}（ω² = ω+1）：素特征 2，元素按 (a, b) 表示 a + bω */
function gf4Mul(a: number, b: number): number {
  const a1 = a & 1
  const b1 = (a >> 1) & 1
  const a2 = b & 1
  const b2 = (b >> 1) & 1
  const c = (a1 * a2 + b1 * b2) & 1
  const d = (a1 * b2 + a2 * b1 + b1 * b2) & 1
  return c + 2 * d
}

export const GF4_ADDITION: FiniteTable = {
  id: 'gf4-add',
  name: 'GF(4) 加法表',
  description: '特征 2：每元素自逆，加法群同构于 V₄',
  elements: ['0', '1', 'ω', 'ω+1'],
  table: Array.from({ length: 4 }, (_, a) => Array.from({ length: 4 }, (_, b) => a ^ b)),
  identity: 0,
}

export const GF4_MULTIPLICATION: FiniteTable = {
  id: 'gf4-mul',
  name: 'GF(4) 乘法表',
  description: 'ω² = ω+1；去掉 0 后乘法群为 C₃',
  elements: ['0', '1', 'ω', 'ω+1'],
  table: Array.from({ length: 4 }, (_, a) => Array.from({ length: 4 }, (_, b) => gf4Mul(a, b))),
  identity: 1,
}

// ---------- 案例 ----------

export const COUNTEREXAMPLE_CASES: CounterexampleCase[] = [
  {
    id: 'q8-all-normal',
    field: '群论',
    title: '子群全正规 ⇒ 交换',
    claim: '若群 G 的每个子群都是正规子群，则 G 必是交换群。',
    object: '四元数群 Q₈（8 阶）',
    explanation:
      'Q₈ 的 6 个子群全部正规（这类群称为「哈密顿群」），但 i·j = k ≠ −k = j·i，非交换。正规性（共轭不变）比交换性弱得多。',
    panels: [
      {
        kind: 'table',
        groupId: 'q8',
        markNonCommuting: true,
        note: '红框为首个非交换对的两个对称格：i·j = k，而 j·i = −k（点击任意格查看乘积）。',
      },
      { kind: 'subgroup-report', groupId: 'q8', note: '注意：全部子群正规，但群非交换。' },
      {
        kind: 'text',
        lines: [
          '哈密顿群：非交换但所有子群都正规的群，最小例子正是 Q₈。',
          'Q₈ 的中心是 {±1}；三个 4 阶子群 ⟨i⟩、⟨j⟩、⟨k⟩ 全都正规（含中心而指数为 2）。',
        ],
      },
    ],
  },
  {
    id: 'a4-lagrange-converse',
    field: '群论',
    title: '拉格朗日定理之逆',
    claim: '若 m 整除群 G 的阶，则 G 必有 m 阶子群。',
    object: '交错群 A₄（12 阶）',
    explanation:
      '6 整除 12，但 A₄ 没有 6 阶子群——它的子群阶只有 1、2、3、4、12。拉格朗日定理只保证「子群阶整除群阶」，反过来不成立。',
    panels: [
      {
        kind: 'subgroup-report',
        groupId: 'a4',
        missingOrder: 6,
        note: '遍历全部子群：不存在 6 阶子群。',
      },
      {
        kind: 'text',
        lines: [
          'A₄ 的子群结构：1 个平凡子群、3 个 2 阶、4 个 3 阶（A₃ 共轭类）、1 个 4 阶（V₄）、群自身。',
          '经典证明思路（共轭类）：A₄ 中任何 6 阶子群指数为 2，必正规；而正规子群须是若干共轭类的并——A₄ 的共轭类大小为 1、3、4、4，能凑出的子群阶只有 1、4、12，凑不出 6，矛盾。',
          '注意：A₄ 并不是单群——V₄ = {e, (12)(34), (13)(24), (14)(23)} 就是它唯一的非平凡真正规子群（共轭类 1+3 之并）。',
          '对比：S₄（24 阶）有 6 阶子群（如固定一个点的 S₃），可见「是否有」取决于群本身。',
        ],
      },
    ],
  },
  {
    id: 'c4-v4-same-order',
    field: '群论',
    title: '同阶 ⇒ 同构',
    claim: '阶相同的群必同构。',
    object: 'C₄ 与 V₄（均为 4 阶）',
    explanation:
      'C₄ 是循环群（存在 4 阶元 g），V₄ 的每个非单位元都是 2 阶。元素阶分布不同（{1,2,4,4} vs {1,2,2,2}），两群不可能同构。',
    panels: [
      {
        kind: 'table-compare',
        groupIds: ['c4', 'v4'],
        note: '两张乘法表结构截然不同：4 阶群恰好有两个同构类（C₄、V₄）。',
      },
      {
        kind: 'text',
        lines: [
          '阶是最粗的不变量；进一步的不变量还有：是否循环、元素阶分布、子群个数（C₄ 有 3 个子群，V₄ 有 5 个）。',
          'C₄ ≅ ℤ/4ℤ；V₄ ≅ ℤ/2ℤ × ℤ/2ℤ。',
        ],
      },
    ],
  },
  {
    id: 's3-subgroup-product',
    field: '群论',
    title: '子群之积仍是子群',
    claim: '若 H、K 都是 G 的子群，则 HK = {h·k} 也一定是 G 的子群。',
    object: 'S₃ 中 H = ⟨(12)⟩ 与 K = ⟨(13)⟩',
    explanation:
      '|H| = |K| = 2，H∩K = {e}，故 |HK| = 4。但 4 不整除 6 = |S₃|，由拉格朗日定理 HK 不可能是子群——实际它连封闭性都破坏（如 (12)·(13) = (132) 的逆不在其中）。',
    panels: [
      {
        kind: 'subgroup-product',
        groupId: 's3',
        generatorA: '(12)',
        generatorB: '(13)',
        note: '左侧高亮 H 的行、K 的列；乘积集合中的元素都在表中。',
      },
      {
        kind: 'table',
        groupId: 's3',
        highlightRows: ['e', '(12)'],
        highlightCols: ['e', '(13)'],
        note: '（12）行与（13）列的全部交叉格即为 HK。',
      },
      {
        kind: 'text',
        lines: [
          '一般结论：HK 是子群 ⟺ HK = KH（当 H 正规时总成立）。',
          'S₃ 中取 H 正规（A₃）时，A₃·⟨(12)⟩ 恰好等于 S₃ 本身，是子群——对比可见条件的必要性。',
        ],
      },
    ],
  },
  {
    id: 's3-trivial-center',
    field: '群论',
    title: '非交换群中心非平凡',
    claim: '非交换群的中心 Z(G) 一定含有非单位元。',
    object: 'S₃（6 阶）',
    explanation:
      'Z(S₃) = {e}：没有任何非单位元与所有元素交换。中心可以为平凡群，「群越大中心越大」的直觉不成立。',
    panels: [
      {
        kind: 'table',
        groupId: 's3',
        markCenter: true,
        note: '中心元素标签带下划线——只有 e。对第 (12) 行：与第 (13) 列的积 (132) ≠ (123)。',
      },
      {
        kind: 'text',
        lines: [
          '中心 Z(G) 衡量「交换程度」：Z(G) = G ⟺ G 交换。',
          '对比：Q₈ 中心 {±1}、D₄ 中心 {e, r²} 都非平凡；S₃ 是「中心平凡」的最小非交换群。',
        ],
      },
    ],
  },
  {
    id: 'unit-roots-torsion',
    field: '群论',
    title: '有限阶元素 ⇒ 有限群',
    claim: '若群中每个元素的阶都有限，则群本身有限。',
    object: '全体单位根 μ = ∪ₙ μₙ（圆群）',
    explanation:
      '每个单位根 z 都满足 zⁿ = 1（n 有限），故阶有限；但 n 可以任意大——ζₙ 的阶恰为 n，所以 μ 是无限群。',
    panels: [
      {
        kind: 'diagram',
        diagram: 'unit-roots',
        note: '圆上的点全在 μ 内；ζₙ 逼近每个方向的极限点不在 μ 内。',
      },
      {
        kind: 'text',
        lines: [
          'μ 是 ℂ* 的子群（乘法封闭、逆元封闭），常写作 μ∞。',
          '「挠群（torsion group）」即每个元素有限阶的群；μ 说明挠 + 无限可以并存。',
          '附加「有限生成」后成立：有限生成挠群必有限。',
        ],
      },
    ],
  },
  {
    id: 'z-sqrt-5-not-ufd',
    field: '环论',
    title: '整环 ⇒ 唯一分解',
    claim: '任何整环都是唯一分解整环（UFD）。',
    object: 'ℤ[√−5] = {a + b√−5 : a, b ∈ ℤ}',
    explanation:
      '6 = 2·3 = (1+√−5)(1−√−5) 是两种本质不同的分解。范数 N(a+b√−5) = a²+5b² 取不到 2 或 3，故 2、3、1±√−5 全都不可约；且 2、3 与 1±√−5 互不为伴。唯一分解失败。',
    panels: [
      {
        kind: 'diagram',
        diagram: 'sqrt-minus-5',
        note: 'N 可乘：N(2)N(3) = 4·9 = 36 = 6·6 = N(1+√−5)N(1−√−5)，两条分解链的范数账本都平。',
      },
      {
        kind: 'text',
        lines: [
          'ℤ[√−5] 是整环（ℂ 的子环，无零因子），说明「整环」离「唯一分解」还差很远。',
          '补救：理想论——在 Dedekind 整环中，理想有唯一素理想分解；(6) = (2, 1+√−5)²(3, 1+√−5)(3, 1−√−5)。',
          '对比 UFD 例子：ℤ、ℤ[i]（高斯整数）、ℤ[√−2] 等都满足唯一分解。',
        ],
      },
    ],
  },
  {
    id: 'gf4-field-order',
    field: '域论',
    title: '域的元素个数是素数',
    claim: '有限域的元素个数一定是素数。',
    object: 'GF(4) = {0, 1, ω, ω+1}（ω² = ω+1）',
    explanation:
      'GF(4) 恰有 4 = 2² 个元素。有限域（Galois 域）元素个数必为素数幂 pⁿ；只有 n = 1 时才恰好是素数。',
    panels: [
      {
        kind: 'table',
        title: '加法表',
        groupId: 'gf4-add',
        note: '★ 表中元素指 GF(4) 的表；加法群 ≅ V₄（特征 2，每元素自逆）。',
      },
      {
        kind: 'table',
        title: '乘法表',
        groupId: 'gf4-mul',
        note: '乘法群（去 0）= C₃：ω·ω = ω+1、ω³ = 1。',
      },
      {
        kind: 'text',
        lines: [
          '常用构造：GF(pⁿ) = 𝔽p[x]/(不可约多项式)。GF(4) = 𝔽₂[x]/(x²+x+1)，ω 即 x 的类。',
          '非素数的素数幂也是合法域阶：GF(8)、GF(9)、GF(16)…；反之 6、10 等非素数幂阶不存在有限域。',
        ],
      },
    ],
  },
  {
    id: 'complex-not-orderable',
    field: '域论',
    title: '复数域可全序化',
    claim: 'ℂ 上存在某种全序，使其成为有序域。',
    object: '虚数单位 i（i² = −1）',
    explanation:
      '有序域要求任意元素的平方 ≥ 0（且 1 > 0 ⇒ −1 < 0）。若 ℂ 有序，则 −1 = i² ≥ 0，与 −1 < 0 矛盾。任何把 ℂ 全序化的尝试都必失败。',
    panels: [
      {
        kind: 'diagram',
        diagram: 'ordered-field',
        note: '几何视角：乘 i 是旋转 90°，i 转过两次变成 −1（落在负实轴）。',
      },
      {
        kind: 'text',
        lines: [
          '有序域基本事实：a ≥ 0 ∧ b ≥ 0 ⇒ ab ≥ 0；对任意 x：x² = x·x ≥ 0。又 1 = 1² > 0（因 1 ≠ 0，且 0 ≠ 1·1）。',
          '推理链：1 > 0 ⇒ 0 − 1 > −1 ⇒ −1 < 0；若 i² ≥ 0 则 −1 ≥ 0，矛盾。',
          '对比：ℝ 是可序域；ℚ、ℚ(√2) 亦然。ℂ 是代数闭域但不是有序域——「代数闭」与「可序」互斥的著名奇观。',
        ],
      },
    ],
  },
]

export const DEFAULT_CASE_ID = 'q8-all-normal'

export function getCounterexampleCase(id: string): CounterexampleCase {
  const found = COUNTEREXAMPLE_CASES.find((item) => item.id === id)
  return found ?? COUNTEREXAMPLE_CASES[0]!
}

/** 按 id 解析展示用运算表：先查有限群，再查 GF(4) 两张表 */
export function getAlgebraTable(id: string): FiniteTable {
  const group = GROUPS[id]
  if (group) return group
  if (id === GF4_ADDITION.id) return GF4_ADDITION
  if (id === GF4_MULTIPLICATION.id) return GF4_MULTIPLICATION
  throw new Error(`未知运算表：${id}`)
}
