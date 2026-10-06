/**
 * v3.1 Sage 转交测试：导出数据构造与脚本内容（脚本已在 WSL Sage 实机运行验证）。
 */
import { describe, expect, it } from 'vitest'
import { experimentFromGraphSearch, type LabExperiment } from './archive'
import { DEFAULT_GRAPH_SPEC, validateGraphSpec } from './spec'
import { runGraphSearch } from './search'
import {
  buildSageVerificationScript,
  sageInputFromExperiment,
  sageInputFromResult,
} from './sage-export'

describe('v3.1 Sage 复算脚本导出', () => {
  const result = runGraphSearch(validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, timeLimit: 60 }))

  it('由结果构造导出数据：cases 含 graph6 与 expected（max_edges → 边数）', () => {
    const input = sageInputFromResult(result)
    expect(input.objective).toBe('max_edges')
    expect(input.cases.length).toBeGreaterThan(0)
    const first = input.cases[0]!
    expect(first.graph6.length).toBeGreaterThan(0)
    expect(first.expected).toBe(first.m)
    expect(input.bestPerOrder[0]?.best).toBe(9)
  })

  it('脚本内容自包含：JSON 注入 + Sage 复算逻辑 + 对照输出', () => {
    const script = buildSageVerificationScript(sageInputFromResult(result))
    expect(script).toContain('from sage.all import Graph')
    expect(script).toContain('json.loads')
    expect(script).toContain('def objective_value(graph, objective)')
    expect(script).toContain('graph.is_planar()')
    expect(script).toContain('graph.chromatic_number()')
    expect(script).toContain('全部一致')
    // 内嵌了候选 graph6（JSON 转义后匹配）
    const first = sageInputFromResult(result).cases[0]!
    expect(script).toContain(JSON.stringify(first.graph6))
  })

  it('由档案构造导出数据；超图档案返回 null', () => {
    const experiment: LabExperiment = {
      id: 'e1',
      createdAt: '2026-10-06T00:00:00.000Z',
      ...experimentFromGraphSearch(result, ''),
    }
    const input = sageInputFromExperiment(experiment)
    expect(input?.title).toBe(experiment.title)
    expect(input?.cases.length).toBe(sageInputFromResult(result).cases.length)
    const hyper: LabExperiment = { ...experiment, kind: 'hypergraph' }
    expect(sageInputFromExperiment(hyper)).toBeNull()
  })

  it('ν 目标脚本：objective_value 分支包含 matching()', () => {
    const nuResult = runGraphSearch(
      validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, objective: 'max_matching', timeLimit: 60 }),
    )
    const input = sageInputFromResult(nuResult)
    expect(input.cases[0]?.expected).toBe(3)
    const script = buildSageVerificationScript(input)
    expect(script).toContain('graph.matching()')
    expect(script).toContain('"max_matching"')
  })
})
