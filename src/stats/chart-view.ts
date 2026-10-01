/**
 * 统计图自适应视图（v0.7）：按图表配置与数据计算合适的数学视窗。
 * 面板在「数据/图表配置变化」时调用；用户随后的缩放平移在数据不变时保留。
 */
import { createView } from '../core/transform'
import type { Size, ViewTransform } from '../state/types'
import { pairedValues, type Dataset } from './model'
import { distributionDomain, getDistribution } from './distributions'
import { kdeGrid, silvermanBandwidth } from './kde'
import { autoBinCount } from './histogram'
import type { SimulationRuntime } from './stats-state.svelte'

function fitted(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  size: Size,
  equalAspect = false,
): ViewTransform {
  const spanX = Math.max(1e-9, maxX - minX)
  const spanY = Math.max(1e-9, maxY - minY)
  const base = createView()
  return {
    ...base,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scaleX: size.width / spanX,
    scaleY: size.height / spanY,
    equalAspect,
  }
}

export function chartAutoView(
  dataset: Dataset,
  size: Size,
  runtime: SimulationRuntime | null,
): ViewTransform {
  const chart = dataset.chart
  switch (chart.kind) {
    case 'scatter': {
      const { x, y } = pairedValues(dataset, chart.xColumn, chart.yColumn)
      if (x.length === 0) return createView()
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (let i = 0; i < x.length; i++) {
        if (x[i]! < minX) minX = x[i]!
        if (x[i]! > maxX) maxX = x[i]!
        if (y[i]! < minY) minY = y[i]!
        if (y[i]! > maxY) maxY = y[i]!
      }
      const padX = (maxX - minX) * 0.08 || 1
      const padY = (maxY - minY) * 0.08 || 1
      return fitted(minX - padX, maxX + padX, minY - padY, maxY + padY, size)
    }
    case 'histogram': {
      const values = dataset.rows
        .map((row) => row[chart.column])
        .filter((v): v is number => typeof v === 'number')
      if (values.length === 0) return createView()
      let min = Infinity
      let max = -Infinity
      for (const value of values) {
        if (value < min) min = value
        if (value > max) max = value
      }
      if (!(max > min)) {
        min -= 0.5
        max += 0.5
      }
      const pad = (max - min) * 0.05
      // y 上限：密度尺度（直方图 density×n×width 与 KDE 对齐显示用同一尺度）
      const peak = Math.max(1, kdeMax(values, chart.kernel))
      return fitted(min - pad, max + pad, 0, peak * 1.15, size)
    }
    case 'distribution': {
      const def = getDistribution(chart.dist)
      const domain = distributionDomain(def, chart.params)
      let peak = 0
      for (let i = 0; i <= 200; i++) {
        const x = domain.min + ((domain.max - domain.min) * i) / 200
        const value = def.pdf(x, chart.params)
        if (Number.isFinite(value) && value > peak) peak = value
      }
      if (chart.compare) {
        const cdef = getDistribution(chart.compare.dist)
        for (let i = 0; i <= 200; i++) {
          const x = domain.min + ((domain.max - domain.min) * i) / 200
          const value = cdef.pdf(x, chart.compare.params)
          if (Number.isFinite(value) && value > peak) peak = value
        }
      }
      return fitted(domain.min, domain.max, 0, Math.max(0.1, peak) * 1.2, size)
    }
    default: {
      // 模拟视图
      const sim = chart
      switch (sim.simulation) {
        case 'lln':
          return fitted(0, sim.samples, 0, 1, size)
        case 'montecarlo-pi':
          return fitted(0, 1, 0, 1, size, true)
        case 'clt':
        case 'bootstrap': {
          const means =
            runtime && runtime.kind === (sim.simulation === 'clt' ? 'clt' : 'bootstrap')
              ? runtime.means
              : []
          if (means.length < 20) return fitted(-1, 1, 0, 1, size)
          let min = Infinity
          let max = -Infinity
          for (const value of means) {
            if (value < min) min = value
            if (value > max) max = value
          }
          const pad = (max - min) * 0.15 || 0.5
          return fitted(min - pad, max + pad, 0, 1, size)
        }
        default: {
          const half = Math.max(8, Math.sqrt(Math.max(50, sim.samples)) * 2)
          return fitted(-half, half, -half, half, size, true)
        }
      }
    }
  }
}

/** 直方图 y 尺度：KDE 在数据范围内的峰值（换算到 count 尺度 = density × n × binWidth） */
function kdeMax(values: number[], kernel: 'gaussian' | 'epanechnikov'): number {
  if (values.length === 0) return 1
  const bins = autoBinCount(values)
  let min = Infinity
  let max = -Infinity
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!(max > min)) return 1
  const width = (max - min) / bins
  const grid = kdeGrid(values, 128)
  const h = silvermanBandwidth(values)
  const k =
    kernel === 'epanechnikov'
      ? (u: number) => (Math.abs(u) <= 1 ? 0.75 * (1 - u * u) : 0)
      : (u: number) => Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI)
  let peak = 0
  const sample =
    values.length > 5000
      ? values.filter((_, i) => i % Math.ceil(values.length / 5000) === 0)
      : values
  for (const x of grid) {
    let acc = 0
    for (const value of sample) acc += k((x - value) / h)
    const density = acc / (sample.length * h)
    // 换算到与直方图 count 相同的显示尺度
    const scaled = density * values.length * width
    if (scaled > peak) peak = scaled
  }
  return Math.max(peak, 1)
}
