/**
 * 实验台档案与构造库（v2.7）：浏览器本地持久化（localStorage）。
 * 对应原实验台的 SQLite 实验库的可移植子集：
 * - 实验档案：图/超图搜索结果 + 笔记 + 算法版本标记（“冻结复算”在 UI 层执行同一算法）；
 * - 构造库：保存的超图构造（可再次分析 / 加入比较 / 加入自定义禁图）；
 * - 比较档案：保存的超图比较记录；
 * - 导出/导入 JSON（可跨设备迁移）。
 * 存储形态稳定（version 字段），读取时做防御性校验；损坏数据不抛错，返回空档案。
 */
import type { GraphSearchResult, OrderRecord, SearchResumeSeed } from './search'
import type { HyperSearchResult } from './hyper-search'
import type { GraphSpec } from './spec'
import type { HyperSpec } from './hyper-spec'
import type { LabHypergraph } from './hypergraph'
import { parseGraph6 } from './graph6'
import { fingerprint } from './iso'
import { orderPlan } from './planner'

export const LAB_ARCHIVE_KEY = 'md.lab.archive.v1'
export const LAB_ARCHIVE_VERSION = 1 as const
/** 实验档案上限（超出时提示清理最早的记录） */
export const LAB_MAX_EXPERIMENTS = 60
export const LAB_MAX_CONSTRUCTIONS = 60
export const LAB_MAX_COMPARISONS = 60

export interface StoredCandidateGraph {
  n: number
  m: number
  graph6: string
  degrees: number[]
  edges: Array<[number, number]>
  rho: number | null
  /** v3.1：非谱目标值（ν/α/ω；旧档案缺省为 null） */
  objectiveValue?: number | null
  claimHolds: boolean | null
  checks: Array<{ label: string; passed: boolean }>
}

export interface StoredCandidateHyper {
  n: number
  m: number
  edges: number[][]
  degrees: number[]
  nu: number
  tau: number
  alpha: number
  claimHolds: boolean | null
  checks: Array<{ label: string; passed: boolean; vertexMap?: number[]; edgeMap?: number[] }>
}

export interface StoredOrder<T> {
  n: number
  best: number | null
  candidateCount: number
  coverage: string
  complete: boolean
  candidates: T[]
  /** v3.1：该阶消耗的生成节点数（续算时合并统计用；旧档案缺省为 0） */
  nodes?: number
}

export interface LabExperiment {
  id: string
  kind: 'graph' | 'hypergraph'
  title: string
  createdAt: string
  algorithm: string
  spec: GraphSpec | HyperSpec
  complete: boolean
  termination: string
  evidence: string
  candidateCount: number
  violations: number
  checked: number
  feasible: number
  nodes: number
  elapsed: number
  orders: Array<StoredOrder<StoredCandidateGraph> | StoredOrder<StoredCandidateHyper>>
  notes: string
}

export interface LabConstruction {
  id: string
  title: string
  createdAt: string
  hypergraph: LabHypergraph
  notes: string
}

export interface LabComparisonRecord {
  id: string
  title: string
  createdAt: string
  left: LabHypergraph
  right: LabHypergraph
  identical: boolean
  cospectral: boolean
  notes: string
}

export interface LabArchive {
  version: typeof LAB_ARCHIVE_VERSION
  experiments: LabExperiment[]
  constructions: LabConstruction[]
  comparisons: LabComparisonRecord[]
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function emptyArchive(): LabArchive {
  return { version: LAB_ARCHIVE_VERSION, experiments: [], constructions: [], comparisons: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 转纯数据（界面层的 $state 代理不可 structuredClone/跨线程；JSON 往返保证脱离代理） */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 防御性解析：损坏时返回空档案（不抛错） */
export function parseArchive(text: string | null): LabArchive {
  if (!text) return emptyArchive()
  try {
    const data = JSON.parse(text) as unknown
    if (!isRecord(data)) return emptyArchive()
    const experiments = Array.isArray(data.experiments) ? (data.experiments as LabExperiment[]) : []
    const constructions = Array.isArray(data.constructions)
      ? (data.constructions as LabConstruction[])
      : []
    const comparisons = Array.isArray(data.comparisons)
      ? (data.comparisons as LabComparisonRecord[])
      : []
    return {
      version: LAB_ARCHIVE_VERSION,
      experiments: experiments.filter((entry) => isRecord(entry) && typeof entry.id === 'string'),
      constructions: constructions.filter(
        (entry) => isRecord(entry) && typeof entry.id === 'string',
      ),
      comparisons: comparisons.filter((entry) => isRecord(entry) && typeof entry.id === 'string'),
    }
  } catch {
    return emptyArchive()
  }
}

export function serializeArchive(archive: LabArchive): string {
  return JSON.stringify(archive)
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `lab-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export class LabArchiveStore {
  private readonly storage: StorageLike
  private archive: LabArchive

  constructor(storage: StorageLike) {
    this.storage = storage
    this.archive = parseArchive(storage.getItem(LAB_ARCHIVE_KEY))
  }

  snapshot(): LabArchive {
    return plain(this.archive)
  }

  private persist(): void {
    this.storage.setItem(LAB_ARCHIVE_KEY, serializeArchive(this.archive))
  }

  /** 新实验入档（超出上限时提示调用方先清理） */
  addExperiment(
    experiment: Omit<LabExperiment, 'id' | 'createdAt' | 'notes'> & { notes?: string },
  ): LabExperiment {
    if (this.archive.experiments.length >= LAB_MAX_EXPERIMENTS) {
      throw new Error(`实验档案已达上限（${LAB_MAX_EXPERIMENTS} 条），请先删除较早的记录`)
    }
    const record: LabExperiment = plain({
      ...experiment,
      notes: experiment.notes ?? '',
      id: newId(),
      createdAt: new Date().toISOString(),
    })
    this.archive.experiments.unshift(record)
    this.persist()
    return record
  }

  updateExperimentNotes(id: string, notes: string): void {
    const record = this.archive.experiments.find((entry) => entry.id === id)
    if (!record) return
    record.notes = notes
    this.persist()
  }

  removeExperiment(id: string): void {
    this.archive.experiments = this.archive.experiments.filter((entry) => entry.id !== id)
    this.persist()
  }

  addConstruction(title: string, hypergraph: LabHypergraph, notes = ''): LabConstruction {
    if (this.archive.constructions.length >= LAB_MAX_CONSTRUCTIONS) {
      throw new Error(`构造库已达上限（${LAB_MAX_CONSTRUCTIONS} 条），请先删除较早的记录`)
    }
    const record: LabConstruction = plain({
      id: newId(),
      title,
      createdAt: new Date().toISOString(),
      hypergraph,
      notes,
    })
    this.archive.constructions.unshift(record)
    this.persist()
    return record
  }

  removeConstruction(id: string): void {
    this.archive.constructions = this.archive.constructions.filter((entry) => entry.id !== id)
    this.persist()
  }

  addComparison(
    title: string,
    left: LabHypergraph,
    right: LabHypergraph,
    identical: boolean,
    cospectral: boolean,
    notes = '',
  ): LabComparisonRecord {
    if (this.archive.comparisons.length >= LAB_MAX_COMPARISONS) {
      throw new Error(`比较档案已达上限（${LAB_MAX_COMPARISONS} 条），请先删除较早的记录`)
    }
    const record: LabComparisonRecord = plain({
      id: newId(),
      title,
      createdAt: new Date().toISOString(),
      left,
      right,
      identical,
      cospectral,
      notes,
    })
    this.archive.comparisons.unshift(record)
    this.persist()
    return record
  }

  removeComparison(id: string): void {
    this.archive.comparisons = this.archive.comparisons.filter((entry) => entry.id !== id)
    this.persist()
  }

  /** 导入替换（合并策略：按 id 去重，导入记录优先） */
  importArchive(text: string): { experiments: number; constructions: number; comparisons: number } {
    const incoming = parseArchive(text)
    const merge = <T extends { id: string }>(current: T[], next: T[]): T[] => {
      const seen = new Map(current.map((entry) => [entry.id, entry]))
      for (const entry of next) seen.set(entry.id, entry)
      return [...seen.values()].sort((a, b) =>
        String((b as { createdAt?: string }).createdAt ?? '').localeCompare(
          String((a as { createdAt?: string }).createdAt ?? ''),
        ),
      )
    }
    this.archive = {
      version: LAB_ARCHIVE_VERSION,
      experiments: merge(this.archive.experiments, incoming.experiments).slice(
        0,
        LAB_MAX_EXPERIMENTS,
      ),
      constructions: merge(this.archive.constructions, incoming.constructions).slice(
        0,
        LAB_MAX_CONSTRUCTIONS,
      ),
      comparisons: merge(this.archive.comparisons, incoming.comparisons).slice(
        0,
        LAB_MAX_COMPARISONS,
      ),
    }
    this.persist()
    return {
      experiments: incoming.experiments.length,
      constructions: incoming.constructions.length,
      comparisons: incoming.comparisons.length,
    }
  }

  exportText(): string {
    return JSON.stringify(this.archive, null, 1)
  }

  clear(): void {
    this.archive = emptyArchive()
    this.persist()
  }
}

/**
 * v3.1 续算：把档案中已保存（未完成）的图搜索实验恢复为续算种子。
 * 只恢复 complete 的阶；候选图由 graph6 重建（指纹重算，校验用）。
 */
export function resumeSeedFromGraphExperiment(experiment: LabExperiment): SearchResumeSeed | null {
  if (experiment.kind !== 'graph') return null
  const spec = experiment.spec as GraphSpec
  const orders: OrderRecord[] = []
  for (const stored of experiment.orders as StoredOrder<StoredCandidateGraph>[]) {
    if (!stored.complete) continue
    const candidates = stored.candidates.map((candidate) => {
      const graph = parseGraph6(candidate.graph6)
      return {
        n: candidate.n,
        m: candidate.m,
        graph,
        graph6: candidate.graph6,
        fingerprint: fingerprint(graph),
        degrees: candidate.degrees,
        edges: candidate.edges,
        rho: candidate.rho,
        objectiveValue: candidate.objectiveValue ?? null,
        checks: candidate.checks,
        claimHolds: candidate.claimHolds,
      }
    })
    orders.push({
      n: stored.n,
      checked: 0,
      feasible: 0,
      violations: 0,
      uncertainViolations: 0,
      complete: true,
      best: stored.best,
      candidateCount: stored.candidateCount,
      candidates,
      layers: [],
      nodes: stored.nodes ?? 0,
      coverage: stored.coverage as OrderRecord['coverage'],
      spectralEvaluations: 0,
      spectralPruned: 0,
      plan: orderPlan(stored.n, spec),
    })
  }
  if (orders.length === 0) return null
  return {
    orders,
    checked: 0,
    feasible: 0,
    violations: 0,
    uncertainViolations: 0,
    nodes: 0,
    spectralEvaluations: 0,
    spectralPruned: 0,
  }
}

/** 由搜索结果生成档案记录（裁剪为可持久化的精简形态） */
export function experimentFromGraphSearch(
  result: GraphSearchResult,
  notes = '',
): Omit<LabExperiment, 'id' | 'createdAt'> {
  return {
    kind: 'graph',
    title: result.spec.title,
    algorithm: result.algorithm,
    spec: result.spec,
    complete: result.complete,
    termination: result.termination,
    evidence: result.evidence,
    candidateCount: result.candidateCount,
    violations: result.violations,
    checked: result.checked,
    feasible: result.feasible,
    nodes: result.nodes,
    elapsed: result.elapsed,
    orders: result.orders.map((order) => ({
      n: order.n,
      best: order.best,
      candidateCount: order.candidateCount,
      coverage: order.coverage,
      complete: order.complete,
      nodes: order.nodes,
      candidates: order.candidates.map((candidate) => ({
        n: candidate.n,
        m: candidate.m,
        graph6: candidate.graph6,
        degrees: candidate.degrees,
        edges: candidate.edges,
        rho: candidate.rho,
        objectiveValue: candidate.objectiveValue,
        claimHolds: candidate.claimHolds,
        checks: candidate.checks,
      })),
    })),
    notes,
  }
}

export function experimentFromHyperSearch(
  result: HyperSearchResult,
  notes = '',
): Omit<LabExperiment, 'id' | 'createdAt'> {
  return {
    kind: 'hypergraph',
    title: result.spec.title,
    algorithm: result.algorithm,
    spec: result.spec,
    complete: result.complete,
    termination: result.termination,
    evidence: result.evidence,
    candidateCount: result.candidateCount,
    violations: result.violations,
    checked: result.checked,
    feasible: result.feasible,
    nodes: result.nodes,
    elapsed: result.elapsed,
    orders: result.orders.map((order) => ({
      n: order.n,
      best: order.best,
      candidateCount: order.candidateCount,
      coverage: order.coverage,
      complete: order.complete,
      candidates: order.candidates.map((candidate) => ({
        n: candidate.n,
        m: candidate.m,
        edges: candidate.edges,
        degrees: candidate.degrees,
        nu: candidate.nu,
        tau: candidate.tau,
        alpha: candidate.alpha,
        claimHolds: candidate.claimHolds,
        checks: candidate.checks,
      })),
    })),
    notes,
  }
}
