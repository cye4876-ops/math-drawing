/**
 * 数据集模型（v0.7 统计与数据）：
 * - 数据是**独立图层**（type: 'dataset'）——不进曲线列表，随文档序列化/撤销；
 * - rows 中缺失值为 null（文本列同样存 null 并在导入时统计）；
 * - chart 保存图表配置（散点/直方图/分布/模拟），渲染器与面板据此绘制与交互。
 */
export type RegressionKind =
  'linear' | 'polynomial' | 'exponential' | 'logarithmic' | 'power' | 'custom'

export type KdeKernel = 'gaussian' | 'epanechnikov'

export type SimulationKind = 'lln' | 'clt' | 'montecarlo-pi' | 'bootstrap' | 'random-walk'

export type DistributionId =
  | 'normal'
  | 'student-t'
  | 'chi2'
  | 'f'
  | 'binomial'
  | 'poisson'
  | 'uniform'
  | 'exponential'
  | 'beta'
  | 'gamma'

export interface ScatterChart {
  kind: 'scatter'
  xColumn: number
  yColumn: number
  regression: RegressionKind
  /** polynomial 阶数（1..8） */
  degree: number
  /** custom 模型（f(x, a, b, …) 形式由面板解析；缺省空串） */
  modelExpr: string
  showResiduals: boolean
}

export interface HistogramChart {
  kind: 'histogram'
  column: number
  /** 'auto' = Freedman-Diaconis / Sturges 规则自动选择 */
  bins: number | 'auto'
  kde: boolean
  kernel: KdeKernel
}

export interface DistributionChart {
  kind: 'distribution'
  dist: DistributionId
  params: Record<string, number>
  /** 第二分布叠加对比（可选） */
  compare: { dist: DistributionId; params: Record<string, number> } | null
  /** 探针位置（P(X ≤ probeX) 高亮区域右边界） */
  probeX: number
}

export interface SimulationChart {
  kind: 'simulation'
  simulation: SimulationKind
  /** 动画速度（每次推进的试验数/步长倍率，1..100） */
  speed: number
  /** 目标样本量（LLN/CLT 总试验数、MC 点数上限等） */
  samples: number
}

export type DatasetChart = ScatterChart | HistogramChart | DistributionChart | SimulationChart

export interface Dataset {
  id: string
  type: 'dataset'
  name: string
  columns: string[]
  /** 数据行：缺失/非数值为 null */
  rows: (number | null)[][]
  chart: DatasetChart
  visible: boolean
}

/** 图表类型默认配置 */
export function defaultChart(kind: DatasetChart['kind']): DatasetChart {
  switch (kind) {
    case 'scatter':
      return {
        kind: 'scatter',
        xColumn: 0,
        yColumn: 1,
        regression: 'linear',
        degree: 2,
        modelExpr: '',
        showResiduals: false,
      }
    case 'histogram':
      return { kind: 'histogram', column: 0, bins: 'auto', kde: true, kernel: 'gaussian' }
    case 'distribution':
      return {
        kind: 'distribution',
        dist: 'normal',
        params: { mu: 0, sigma: 1 },
        compare: null,
        probeX: 1,
      }
    default:
      return { kind: 'simulation', simulation: 'lln', speed: 10, samples: 2000 }
  }
}

export function createDataset(
  name: string,
  columns: string[],
  rows: (number | null)[][],
  chart: DatasetChart = defaultChart('scatter'),
): Dataset {
  return {
    id: crypto.randomUUID(),
    type: 'dataset',
    name,
    columns,
    rows,
    chart,
    visible: true,
  }
}

const CHART_KINDS: readonly DatasetChart['kind'][] = [
  'scatter',
  'histogram',
  'distribution',
  'simulation',
]
const REGRESSION_KINDS: readonly RegressionKind[] = [
  'linear',
  'polynomial',
  'exponential',
  'logarithmic',
  'power',
  'custom',
]
const DIST_IDS: readonly DistributionId[] = [
  'normal',
  'student-t',
  'chi2',
  'f',
  'binomial',
  'poisson',
  'uniform',
  'exponential',
  'beta',
  'gamma',
]
const SIM_KINDS: readonly SimulationKind[] = [
  'lln',
  'clt',
  'montecarlo-pi',
  'bootstrap',
  'random-walk',
]

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const v = num(value, fallback)
  return Math.min(max, Math.max(min, Math.round(v)))
}

function paramsRecord(raw: unknown, dist: DistributionId): Record<string, number> {
  const out: Record<string, number> = {}
  if (raw !== null && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    }
  }
  void dist
  return out
}

function normalizeChart(raw: unknown): DatasetChart {
  const r = (raw ?? {}) as Record<string, unknown>
  const kind = CHART_KINDS.includes(r['kind'] as DatasetChart['kind'])
    ? (r['kind'] as DatasetChart['kind'])
    : 'scatter'
  switch (kind) {
    case 'scatter': {
      const regression = REGRESSION_KINDS.includes(r['regression'] as RegressionKind)
        ? (r['regression'] as RegressionKind)
        : 'linear'
      return {
        kind: 'scatter',
        xColumn: int(r['xColumn'], 0, 0, 1e6),
        yColumn: int(r['yColumn'], 1, 0, 1e6),
        regression,
        degree: int(r['degree'], 2, 1, 8),
        modelExpr: typeof r['modelExpr'] === 'string' ? r['modelExpr'] : '',
        showResiduals: r['showResiduals'] === true,
      }
    }
    case 'histogram':
      return {
        kind: 'histogram',
        column: int(r['column'], 0, 0, 1e6),
        bins:
          r['bins'] === 'auto'
            ? 'auto'
            : typeof r['bins'] === 'number' && Number.isFinite(r['bins'])
              ? int(r['bins'], 20, 1, 500)
              : 'auto',
        kde: r['kde'] !== false,
        kernel: r['kernel'] === 'epanechnikov' ? 'epanechnikov' : 'gaussian',
      }
    case 'distribution': {
      const dist = DIST_IDS.includes(r['dist'] as DistributionId)
        ? (r['dist'] as DistributionId)
        : 'normal'
      const compareRaw = r['compare'] as Record<string, unknown> | null | undefined
      let compare: DistributionChart['compare'] = null
      if (compareRaw !== null && compareRaw !== undefined && typeof compareRaw === 'object') {
        const cDist = DIST_IDS.includes(compareRaw['dist'] as DistributionId)
          ? (compareRaw['dist'] as DistributionId)
          : null
        if (cDist) {
          compare = { dist: cDist, params: paramsRecord(compareRaw['params'], cDist) }
        }
      }
      return {
        kind: 'distribution',
        dist,
        params: paramsRecord(r['params'], dist),
        compare,
        probeX: num(r['probeX'], 0),
      }
    }
    default: {
      const simulation = SIM_KINDS.includes(r['simulation'] as SimulationKind)
        ? (r['simulation'] as SimulationKind)
        : 'lln'
      return {
        kind: 'simulation',
        simulation,
        speed: int(r['speed'], 10, 1, 100),
        samples: int(r['samples'], 2000, 10, 200_000),
      }
    }
  }
}

/** 序列化校验与默认值补齐（导入/分享链接时使用） */
export function normalizeDataset(raw: unknown): Dataset {
  if (raw === null || typeof raw !== 'object') throw new Error('不是有效对象')
  const r = raw as Record<string, unknown>
  const columnsRaw = r['columns']
  if (!Array.isArray(columnsRaw) || columnsRaw.length === 0) throw new Error('缺少列名')
  const columns = columnsRaw.map((value) => String(value))
  const rowsRaw = r['rows']
  if (!Array.isArray(rowsRaw)) throw new Error('缺少数据行')
  const rows: (number | null)[][] = rowsRaw.slice(0, 1_000_000).map((row) => {
    if (!Array.isArray(row)) return columns.map(() => null)
    return columns.map((_, i) => {
      const value = row[i]
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    })
  })
  return {
    id: typeof r['id'] === 'string' && r['id'] !== '' ? r['id'] : crypto.randomUUID(),
    type: 'dataset',
    name: typeof r['name'] === 'string' && r['name'] !== '' ? r['name'] : '数据集',
    columns,
    rows,
    chart: normalizeChart(r['chart']),
    visible: typeof r['visible'] === 'boolean' ? r['visible'] : true,
  }
}

/** 提取某列的非缺失数值（长度对齐的 [x, y] 配对由调用方过滤） */
export function columnValues(dataset: Dataset, column: number): number[] {
  const out: number[] = []
  for (const row of dataset.rows) {
    const value = row[column]
    if (typeof value === 'number' && Number.isFinite(value)) out.push(value)
  }
  return out
}

/** 提取两列配对（任一侧缺失则跳过该行） */
export function pairedValues(
  dataset: Dataset,
  xColumn: number,
  yColumn: number,
): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (const row of dataset.rows) {
    const a = row[xColumn]
    const b = row[yColumn]
    if (
      typeof a === 'number' &&
      Number.isFinite(a) &&
      typeof b === 'number' &&
      Number.isFinite(b)
    ) {
      x.push(a)
      y.push(b)
    }
  }
  return { x, y }
}
