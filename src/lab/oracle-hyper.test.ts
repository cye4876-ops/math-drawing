/**
 * Oracle 交叉校验（超图，v2.7）：与 WSL Sage 中的原实验台 v5 对照。
 * 参考数据由 tools/lab-oracle/ref_hyper.py 生成（含 README 四个入门实验）：
 *   wsl -d Ubuntu -- /opt/codex-sage/env/bin/python /mnt/e/drawing/tools/lab-oracle/ref_hyper.py
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  hyperAreIsomorphic,
  hyperBBtSpectrum,
  hyperDegrees,
  hyperIsConnected,
  hyperIsLinear,
  hyperIsRegular,
  hyperMatchingNumber,
  hyperMaxCodegree,
  hyperRank,
  hyperUniformity,
  hyperWeakIndependence,
  normalizeHypergraph,
} from './hypergraph'
import { runHyperSearch } from './hyper-search'
import { validateHyperSpec, type HyperSpec } from './hyper-spec'

interface OracleAnalysis {
  n: number
  edges: number[][]
  basic: {
    degrees: number[]
    codegree: number
    rank: number
    uniformity: number | null
    linear: boolean
    connected: boolean
    regular: boolean
  }
  nu: number
  tau: number
  alpha: number
  charpoly: string[]
}

const oracle = JSON.parse(readFileSync('tools/lab-oracle/fixtures/hyper.json', 'utf8')) as {
  analyses: Record<string, OracleAnalysis>
  searches: Record<
    string,
    {
      spec: Record<string, unknown>
      termination: string
      complete: boolean
      candidate_count: number
      violations: number
      orders: Array<{
        n: number
        best: number | null
        candidate_count: number
        coverage: string
        complete: boolean
        candidates: number[][][]
      }>
    }
  >
}

describe('Oracle：超图不变量与原实验台一致', () => {
  const names = Object.keys(oracle.analyses)
  it.each(names)('%s', (name) => {
    const reference = oracle.analyses[name]!
    const h = normalizeHypergraph({ n: reference.n, edges: reference.edges })
    expect(hyperDegrees(h)).toEqual(reference.basic.degrees)
    expect(hyperMaxCodegree(h)).toBe(reference.basic.codegree)
    expect(hyperRank(h)).toBe(reference.basic.rank)
    expect(hyperUniformity(h)).toBe(reference.basic.uniformity)
    expect(hyperIsLinear(h)).toBe(reference.basic.linear)
    expect(hyperIsConnected(h)).toBe(reference.basic.connected)
    expect(hyperIsRegular(h)).toBe(reference.basic.regular)
    expect(hyperMatchingNumber(h).value).toBe(reference.nu)
    const weak = hyperWeakIndependence(h)
    expect(weak.tau).toBe(reference.tau)
    expect(weak.alpha).toBe(reference.alpha)
    expect(hyperBBtSpectrum(h).coefficients.map(String)).toEqual(reference.charpoly)
  })
})

describe('Oracle：超图搜索结果与原实验台一致', () => {
  const specFor = (payload: Record<string, unknown>): HyperSpec => {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      if (key === 'kind') continue
      const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
      mapped[camel] = value
    }
    mapped.nodeBudget = 120_000_000
    mapped.timeLimit = 900
    return validateHyperSpec(mapped)
  }

  const cases = Object.keys(oracle.searches)
  it.each(cases)(
    '%s',
    (name) => {
      const reference = oracle.searches[name]!
      const spec = specFor(reference.spec)
      const result = runHyperSearch(spec)
      expect(result.complete).toBe(reference.complete)
      expect(result.candidateCount).toBe(reference.candidate_count)
      expect(result.violations).toBe(reference.violations)
      for (const refOrder of reference.orders) {
        const order = result.orders.find((entry) => entry.n === refOrder.n)
        if (!order) {
          expect(refOrder.candidate_count).toBe(0)
          continue
        }
        if (refOrder.best !== null) {
          expect(order.best).not.toBeNull()
          expect(order.best).toBe(refOrder.best)
        }
        expect(order.candidateCount).toBe(refOrder.candidate_count)
        // 仅在原版给出目标层覆盖（有候选的阶）时对照；无候选阶默认标注不同实现细节
        if (refOrder.candidate_count > 0 && refOrder.coverage !== 'enumeration') {
          expect(order.coverage).toBe(refOrder.coverage)
        }
        // 候选项两两同构对应
        const theirs = refOrder.candidates.map((edges) =>
          normalizeHypergraph({ n: refOrder.n, edges }),
        )
        const mine = order.candidates.map((candidate) =>
          normalizeHypergraph({ n: candidate.n, edges: candidate.edges }),
        )
        expect(mine.length).toBe(theirs.length)
        const unmatched = [...theirs]
        for (const candidate of mine) {
          const index = unmatched.findIndex(
            (other) => hyperAreIsomorphic(candidate, other).isomorphic,
          )
          expect(index).toBeGreaterThanOrEqual(0)
          unmatched.splice(index, 1)
        }
      }
    },
    300_000,
  )
})
