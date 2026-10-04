import { describe, expect, it } from 'vitest'
import {
  completeBipartiteGraph,
  completeGraph,
  cycleGraph,
  edgeCount,
  fromEdges,
  pathGraph,
  permuteGraph,
  petersenGraph,
  turanGraph,
  emptyGraph,
  addEdgeAt,
} from './graph'
import { parseGraph6, toGraph6, Graph6Error } from './graph6'
import { areIsomorphic, fingerprint } from './iso'
import { GraphInvariants, maxClique, maxMatching } from './invariants'
import { charPolyCoefficients, adjacencyIntMatrix, laplacianIntMatrix } from './charpoly'
import {
  evaluateClaim,
  ClaimError,
  parseClaim,
  rat,
  ratFromDecimalString,
  ratToNumber,
} from './claims'
import { findPattern, patternInfo, containsPatternWithEdge } from './containment'
import { builtinPattern, DEFAULT_GRAPH_SPEC, validateGraphSpec } from './spec'
import { hereditaryEdgeUpper, orderPlan } from './planner'

describe('graph6', () => {
  it('编码已知图（K4 = C~、C5 由 Sage 校验）', () => {
    expect(toGraph6(completeGraph(4))).toBe('C~')
    expect(toGraph6(cycleGraph(5))).toBe('Dhc')
  })

  it('往返一致（含随机置换）', () => {
    const graphs = [
      completeGraph(6),
      petersenGraph(),
      completeBipartiteGraph(3, 4),
      turanGraph(7, 3),
    ]
    for (const g of graphs) {
      const text = toGraph6(g)
      const back = parseGraph6(text)
      expect(edgeCount(back)).toBe(edgeCount(g))
      expect(areIsomorphic(back, g).isomorphic).toBe(true)
      expect(toGraph6(back)).toBe(text)
    }
  })

  it('拒绝非法输入', () => {
    expect(() => parseGraph6('')).toThrow(Graph6Error)
    expect(() => parseGraph6('C')).toThrow(Graph6Error) // 长度不足
    expect(() => parseGraph6('~~')).toThrow(Graph6Error) // 顶点数超限
  })

  it('剥离 >>graph6<< 前缀', () => {
    expect(toGraph6(parseGraph6('>>graph6<<C~'))).toBe('C~')
  })
})

describe('同构', () => {
  it('随机置换保持同构', () => {
    const g = petersenGraph()
    const permutation = [...Array(10).keys()]
    // 确定性洗牌
    let seed = 42
    for (let i = permutation.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      const j = seed % (i + 1)
      ;[permutation[i], permutation[j]] = [permutation[j]!, permutation[i]!]
    }
    const shuffled = permuteGraph(g, permutation)
    const result = areIsomorphic(g, shuffled)
    expect(result.isomorphic).toBe(true)
    expect(result.mapping).not.toBeNull()
    // 映射必须保边
    for (let u = 0; u < 10; u++) {
      for (let v = u + 1; v < 10; v++) {
        const mapped = ((shuffled.adj[result.mapping![u]!]! >> result.mapping![v]!) & 1) === 1
        expect(mapped).toBe(((g.adj[u]! >> v) & 1) === 1)
      }
    }
  })

  it('不同构判定', () => {
    const c6 = cycleGraph(6)
    const twoC3 = fromEdges(6, [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 4],
      [4, 5],
      [5, 3],
    ])
    expect(areIsomorphic(c6, twoC3).isomorphic).toBe(false)
    expect(areIsomorphic(completeBipartiteGraph(4, 4), fromEdges(8, [[0, 1]])).isomorphic).toBe(
      false,
    )
  })

  it('指纹是必要的同构不变量', () => {
    const g = cycleGraph(6)
    const h = permuteGraph(g, [3, 0, 1, 2, 5, 4])
    expect(fingerprint(g)).toBe(fingerprint(h))
  })
})

describe('不变量', () => {
  it('团数/独立数/匹配', () => {
    expect(maxClique(completeGraph(5))).toBe(5)
    expect(maxClique(cycleGraph(5))).toBe(2)
    const values = new GraphInvariants(cycleGraph(5))
    expect(values.get('omega')).toBe(2)
    expect(values.get('alpha')).toBe(2)
    expect(values.get('nu')).toBe(2)
    expect(maxMatching(completeBipartiteGraph(4, 4))).toBe(4)
    expect(maxMatching(pathGraph(4))).toBe(2)
  })

  it('结构布尔量', () => {
    const values = new GraphInvariants(
      fromEdges(6, [
        [0, 1],
        [1, 2],
        [2, 0],
        [3, 4],
      ]),
    )
    expect(values.get('connected')).toBe(false)
    expect(values.get('bipartite')).toBe(false) // 含三角形
    expect(values.get('regular')).toBe(false)
    const empty = new GraphInvariants(emptyGraph(4))
    expect(empty.get('regular')).toBe(true)
    expect(empty.get('connected')).toBe(false)
  })

  it('谱半径与代数连通度', () => {
    const k44 = new GraphInvariants(completeBipartiteGraph(4, 4))
    expect(k44.rho()).toBeCloseTo(4, 6)
    expect(k44.lambda2()).toBeCloseTo(4, 6)
    const c5 = new GraphInvariants(cycleGraph(5))
    expect(c5.rho()).toBeCloseTo(2, 6)
    // C₅ 的代数连通度 λ₂ = 2 − 2cos(2π/5) ≈ 1.381966（与 Sage 一致）
    expect(c5.lambda2()).toBeCloseTo(1.381966, 5)
  })
})

describe('精确特征多项式', () => {
  it('K4 的 A 特征多项式 (λ+1)³(λ−3)', () => {
    const coeffs = charPolyCoefficients(adjacencyIntMatrix(completeGraph(4)))
    expect(coeffs.map(String)).toEqual(['1', '0', '-6', '-8', '-3'])
  })

  it('K4 的 L 特征多项式 λ(λ−4)³', () => {
    const coeffs = charPolyCoefficients(laplacianIntMatrix(completeGraph(4)))
    expect(coeffs.map(String)).toEqual(['1', '-12', '48', '-64', '0'])
  })
})

describe('claim 表达式', () => {
  const context = {
    variables: new Set(['n', 'm', 'delta', 'alpha', 'rho', 'bipartite', 'connected', 'regular']),
    booleans: new Set(['bipartite', 'connected', 'regular']),
  }
  const getter = (values: Record<string, number | boolean>) => (name: string) => {
    const value = values[name]!
    return typeof value === 'boolean' ? value : rat(BigInt(value))
  }

  it('整数与有理数比较（精确）', () => {
    const tree = parseClaim('m <= n**2/4', context)
    expect(evaluateClaim(tree, getter({ n: 6, m: 9 }))).toBe(true)
    expect(evaluateClaim(tree, getter({ n: 7, m: 12 }))).toBe(true)
    expect(evaluateClaim(tree, getter({ n: 7, m: 13 }))).toBe(false)
  })

  it('逻辑与布尔变量', () => {
    const tree = parseClaim('bipartite and not regular', context)
    expect(evaluateClaim(tree, getter({ bipartite: true, regular: false }))).toBe(true)
    expect(evaluateClaim(tree, getter({ bipartite: true, regular: true }))).toBe(false)
  })

  it('函数与链式比较', () => {
    const tree = parseClaim('min(m, n) <= delta < max(m, n)', context)
    expect(evaluateClaim(tree, getter({ n: 5, m: 2, delta: 3 }))).toBe(true)
    expect(evaluateClaim(tree, getter({ n: 5, m: 2, delta: 8 }))).toBe(false)
  })

  it('拒绝非法表达式', () => {
    expect(() => parseClaim('unknown <= n', context)).toThrow(ClaimError)
    expect(() => parseClaim('m <= n**9', context)).toThrow(ClaimError)
    expect(() => parseClaim('m + 1', context)).toThrow(ClaimError)
    expect(() => parseClaim('m <= abs()', context)).toThrow(ClaimError)
    expect(() => parseClaim('m <= n and 3', context)).toThrow(ClaimError)
    expect(() => parseClaim('exec("x")', context)).toThrow(ClaimError)
  })

  it('有理数辅助函数', () => {
    const value = ratFromDecimalString('12.25')
    expect(ratToNumber(value)).toBeCloseTo(12.25, 12)
    expect(value.n).toBe(49n)
    expect(value.d).toBe(4n)
  })
})

describe('禁图包含', () => {
  it('普通包含', () => {
    const k3 = patternInfo('K3', builtinPattern('K3'))
    expect(findPattern(completeGraph(4), k3, 'subgraph')).not.toBeNull()
    expect(findPattern(cycleGraph(5), k3, 'subgraph')).toBeNull()
    const c4 = patternInfo('C4', builtinPattern('C4'))
    expect(findPattern(completeBipartiteGraph(2, 2), c4, 'subgraph')).not.toBeNull()
    expect(findPattern(cycleGraph(5), c4, 'subgraph')).toBeNull()
    // 普通包含允许额外边：K₄ 中任取一个顶点及其 3 个邻居即含 K₁,₃ 子图
    const claw = patternInfo('claw', builtinPattern('claw'))
    expect(findPattern(completeGraph(4), claw, 'subgraph')).not.toBeNull()
    expect(findPattern(cycleGraph(6), claw, 'subgraph')).toBeNull()
  })

  it('诱导包含与普通包含的差别', () => {
    const c4 = patternInfo('C4', builtinPattern('C4'))
    // K4 的 4 点子集诱导 K4，不含诱导 C4
    expect(findPattern(completeGraph(4), c4, 'induced')).toBeNull()
    // 2×K2 的补图 = C4：C4 的 4 点子集恰为 C4
    expect(findPattern(cycleGraph(4), c4, 'induced')).not.toBeNull()
    // 阶乘级例：P4 在 C5 中的诱导（取 4 个连续点）
    const p4 = patternInfo('P4', builtinPattern('P4'))
    expect(findPattern(cycleGraph(5), p4, 'induced')).not.toBeNull()
  })

  it('增量检查（新边是否立即产生普通禁图）', () => {
    const k3 = patternInfo('K3', builtinPattern('K3'))
    const g = fromEdges(4, [
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    expect(containsPatternWithEdge(g, k3, 2, 3)).toBe(false)
    const g2 = fromEdges(4, [
      [0, 1],
      [1, 2],
    ])
    addEdgeAt(g2, 0, 2)
    expect(containsPatternWithEdge(g2, k3, 0, 2)).toBe(true)
  })
})

describe('规格校验与计划器', () => {
  it('默认规格', () => {
    const spec = validateGraphSpec(DEFAULT_GRAPH_SPEC)
    expect(spec.nMin).toBe(6)
    expect(() => validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, nMin: 9, nMax: 6 })).toThrow()
    expect(() => validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, forbidden: ['K9'] })).toThrow()
    expect(() =>
      validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, customForbidden: 'not-graph6!' }),
    ).toThrow()
  })

  it('Mantel 界（无三角形 n=6/8）', () => {
    const spec = validateGraphSpec(DEFAULT_GRAPH_SPEC)
    expect(orderPlan(6, spec).edgeMax).toBe(9)
    const spec8 = validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, nMin: 8, nMax: 8 })
    expect(orderPlan(8, spec8).edgeMax).toBe(16)
  })

  it('无普通 C4 的公共邻点计数界（n=7）', () => {
    const spec = validateGraphSpec({
      ...DEFAULT_GRAPH_SPEC,
      nMin: 7,
      nMax: 7,
      forbidden: ['C4'],
    })
    const plan = orderPlan(7, spec)
    // 公式界 10（ex(7, C₄) = 9 由搜索在下一层发现，公式本身不下探）
    expect(plan.edgeMax).toBe(10)
    expect(hereditaryEdgeUpper(6, spec)).toBeGreaterThanOrEqual(6)
  })

  it('claw（普通）蕴含 Δ≤2', () => {
    const spec = validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, nMin: 6, nMax: 6, forbidden: ['claw'] })
    expect(orderPlan(6, spec).edgeMax).toBe(6)
  })

  it('逐图枚举模式', () => {
    const spec = validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, strategy: 'enumerate' })
    expect(orderPlan(6, spec).mode).toBe('enumerate')
    expect(orderPlan(6, spec).deletionUpper).toBeNull()
  })

  it('度序列约束的握手界', () => {
    const spec = validateGraphSpec({
      ...DEFAULT_GRAPH_SPEC,
      nMin: 4,
      nMax: 4,
      forbidden: [],
      degreeSequence: [3, 3, 2, 2],
    })
    const plan = orderPlan(4, spec)
    expect(plan.edgeMax).toBe(5)
    expect(plan.edgeMin).toBe(5)
    // 叠加默认的 K₃ 禁图后上界收紧到 ⌊n²/4⌋ = 4，低于握手下界 → 不可行
    const withK3 = orderPlan(
      4,
      validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, nMin: 4, nMax: 4, degreeSequence: [3, 3, 2, 2] }),
    )
    expect(withK3.edgeMax).toBe(4)
    expect(withK3.impossible).toBe(true)
  })
})
