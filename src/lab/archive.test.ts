import { describe, expect, it } from 'vitest'
import {
  experimentFromGraphSearch,
  experimentFromHyperSearch,
  LAB_ARCHIVE_KEY,
  LabArchiveStore,
  parseArchive,
  type StorageLike,
} from './archive'
import { DEFAULT_GRAPH_SPEC, validateGraphSpec } from './spec'
import { runGraphSearch } from './search'
import { normalizeHypergraph } from './hypergraph'

function memoryStorage(): StorageLike & { dump: Map<string, string> } {
  const dump = new Map<string, string>()
  return {
    dump,
    getItem: (key) => dump.get(key) ?? null,
    setItem: (key, value) => {
      dump.set(key, value)
    },
    removeItem: (key) => {
      dump.delete(key)
    },
  }
}

describe('实验台档案', () => {
  it('实验入档 / 笔记 / 删除 / 持久化', () => {
    const storage = memoryStorage()
    const store = new LabArchiveStore(storage)
    const result = runGraphSearch(validateGraphSpec({ ...DEFAULT_GRAPH_SPEC, nMin: 4, nMax: 4 }))
    const record = store.addExperiment(experimentFromGraphSearch(result))
    expect(record.title).toBe(result.spec.title)
    expect(record.kind).toBe('graph')
    expect(record.orders.length).toBeGreaterThan(0)

    store.updateExperimentNotes(record.id, '第一次实验：K₃-free 4 阶')
    const reloaded = new LabArchiveStore(storage)
    expect(reloaded.snapshot().experiments[0]!.notes).toContain('第一次实验')

    reloaded.removeExperiment(record.id)
    expect(reloaded.snapshot().experiments).toHaveLength(0)
    expect(storage.dump.get(LAB_ARCHIVE_KEY)).toBeTruthy()
  })

  it('损坏数据返回空档案', () => {
    expect(parseArchive('not json').experiments).toHaveLength(0)
    expect(parseArchive('{"experiments": 3}').experiments).toHaveLength(0)
    expect(parseArchive(null).constructions).toHaveLength(0)
  })

  it('构造库与比较档案', () => {
    const store = new LabArchiveStore(memoryStorage())
    const h = normalizeHypergraph({ n: 4, edges: [[0, 1, 2]] })
    const construction = store.addConstruction('单边 012', h)
    expect(construction.title).toBe('单边 012')
    const comparison = store.addComparison('对照', h, h, true, true)
    expect(comparison.identical).toBe(true)
    expect(store.snapshot().comparisons).toHaveLength(1)
    store.removeComparison(comparison.id)
    store.removeConstruction(construction.id)
    expect(store.snapshot().comparisons).toHaveLength(0)
    expect(store.snapshot().constructions).toHaveLength(0)
  })

  it('导出与导入合并', () => {
    const a = new LabArchiveStore(memoryStorage())
    a.addConstruction('A', normalizeHypergraph({ n: 3, edges: [[0, 1]] }))
    const text = a.exportText()

    const b = new LabArchiveStore(memoryStorage())
    b.addConstruction('B', normalizeHypergraph({ n: 3, edges: [[1, 2]] }))
    const merged = b.importArchive(text)
    expect(merged.constructions).toBe(1)
    const titles = b.snapshot().constructions.map((entry) => entry.title)
    expect(titles).toContain('A')
    expect(titles).toContain('B')
  })

  it('超图搜索结果入档', () => {
    const store = new LabArchiveStore(memoryStorage())
    const hyperResult = {
      spec: { title: '超图测试' },
      algorithm: 'x',
      complete: true,
      termination: 'exhausted',
      evidence: 'finite_exhaustive',
      candidateCount: 0,
      violations: 0,
      checked: 0,
      feasible: 0,
      nodes: 0,
      elapsed: 0,
      orders: [],
    } as unknown as Parameters<typeof experimentFromHyperSearch>[0]
    const record = store.addExperiment(experimentFromHyperSearch(hyperResult))
    expect(record.kind).toBe('hypergraph')
    expect(record.title).toBe('超图测试')
  })
})
