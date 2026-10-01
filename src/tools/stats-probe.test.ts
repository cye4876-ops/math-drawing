import { beforeEach, describe, expect, it } from 'vitest'
import { createStore, type AppStore } from '../state/store'
import { createSceneRenderer } from '../render/scene'
import { mathToScreen } from '../core/transform'
import { createDataset, defaultChart, type DatasetChart } from '../stats/model'
import { getPointSelection, setPointSelection } from '../stats/stats-state.svelte'
import { ToolRegistry, type ToolContext, type ToolPointerEvent } from './tool-registry'
import { createStatsProbeTool } from './stats-probe'

const SIZE = { width: 800, height: 600 }

interface Fixture {
  store: AppStore
  registry: ToolRegistry
  ctx: ToolContext
  renders: { count: number }
}

function createFixture(): Fixture {
  const store = createStore()
  const scene = createSceneRenderer()
  const renders = { count: 0 }
  const ctx: ToolContext = {
    store,
    getView: () => store.getView(),
    getSize: () => SIZE,
    requestRender: () => {
      renders.count++
    },
    notify: () => registry.notify(),
    hitTest: (screen, maxDistancePx) =>
      scene.hitTest(
        store.getState().doc.objects,
        screen,
        { view: store.getView(), size: SIZE },
        maxDistancePx,
      ),
  }
  const registry = new ToolRegistry(ctx)
  registry.register(createStatsProbeTool())
  return { store, registry, ctx, renders }
}

/** 构造指针事件：数学坐标 → 屏幕 */
function pe(store: AppStore, x: number, y: number): ToolPointerEvent {
  return {
    screen: mathToScreen(store.getView(), SIZE, { x, y }),
    math: { x, y },
    pointer: { button: 0 } as PointerEvent,
  }
}

/** 构造分布图表配置（避免联合类型 spread 带来的多余属性问题） */
function distributionChart(probeX: number): DatasetChart {
  return {
    kind: 'distribution',
    dist: 'normal',
    params: { mu: 0, sigma: 1 },
    compare: null,
    probeX,
  }
}

/** 添加一个数据集 */
function add(store: AppStore, chart: ReturnType<typeof defaultChart>): string {
  const dataset = createDataset(
    'data',
    ['x', 'y'],
    [
      [0, 0],
      [2, 0],
      [4, 0],
    ],
    chart,
  )
  store.addDataset(dataset)
  return dataset.id
}

let f: Fixture

beforeEach(() => {
  setPointSelection(null)
  f = createFixture()
  f.registry.activate('stats-probe')
})

describe('tools/stats-probe: 分布探针', () => {
  it('拖动设置 probeX，松手一步撤销', () => {
    add(f.store, distributionChart(0))

    expect(f.registry.handlePointerDown(pe(f.store, 2, 0))).toBe(true)
    let ds = f.store.getDatasets()[0]!
    expect(ds.chart.kind).toBe('distribution')
    if (ds.chart.kind === 'distribution') expect(ds.chart.probeX).toBeCloseTo(2, 6)

    f.registry.handlePointerMove(pe(f.store, 3, 0))
    ds = f.store.getDatasets()[0]!
    if (ds.chart.kind === 'distribution') expect(ds.chart.probeX).toBeCloseTo(3, 6)

    expect(f.registry.handlePointerUp(pe(f.store, 3, 0))).toBe(true)
    // 一步撤销回到拖动前的探针位置
    f.store.undo()
    ds = f.store.getDatasets()[0]!
    if (ds.chart.kind === 'distribution') expect(ds.chart.probeX).toBeCloseTo(0, 6)
  })

  it('拖动中 deactivate 追认为一步撤销', () => {
    add(f.store, distributionChart(0))
    f.registry.handlePointerDown(pe(f.store, 5, 0))
    f.registry.activate('stats-probe') // 切走再切回等价于 deactivate + activate
    f.registry.activate(null)
    f.store.undo()
    const ds = f.store.getDatasets()[0]!
    if (ds.chart.kind === 'distribution') expect(ds.chart.probeX).toBeCloseTo(0, 6)
  })

  it('无数据集时不消费事件并提示导入', () => {
    expect(f.registry.handlePointerDown(pe(f.store, 1, 1))).toBe(false)
    const readout = f.registry.getReadout()
    expect(readout?.note).toContain('导入')
  })

  it('读数包含探针位置', () => {
    add(f.store, distributionChart(1.5))
    const readout = f.registry.getReadout()
    expect(readout?.rows[0]?.label).toBe('探针')
    expect(readout?.rows[0]?.value).toContain('1.5')
  })
})

describe('tools/stats-probe: 散点点选', () => {
  it('点击最近点选中，再次点击取消，点击空白清空', () => {
    add(f.store, defaultChart('scatter'))

    // 点击 (2,0) 处的数据点
    expect(f.registry.handlePointerDown(pe(f.store, 2, 0))).toBe(true)
    expect(getPointSelection()).toBe(1)
    expect(f.registry.getReadout()?.rows[0]?.value).toBe('#2')

    // 再次点击同一点 → 取消选中
    f.registry.handlePointerDown(pe(f.store, 2, 0))
    expect(getPointSelection()).toBeNull()

    // 先选中，再点击远处空白 → 清空
    f.registry.handlePointerDown(pe(f.store, 4, 0))
    expect(getPointSelection()).toBe(2)
    f.registry.handlePointerDown(pe(f.store, 50, 50))
    expect(getPointSelection()).toBeNull()
  })

  it('点选不产生撤销步（撤销一次即移除数据集）', () => {
    add(f.store, defaultChart('scatter'))
    f.registry.handlePointerDown(pe(f.store, 0, 0))
    expect(getPointSelection()).toBe(0)
    // 点选不入撤销历史：撤销一步回到添加数据集之前
    f.store.undo()
    expect(f.store.getDatasets()).toHaveLength(0)
  })
})

describe('tools/stats-probe: 其他图表', () => {
  it('直方图不消费事件，读数为无探针提示', () => {
    add(f.store, defaultChart('histogram'))
    expect(f.registry.handlePointerDown(pe(f.store, 1, 1))).toBe(false)
    expect(f.registry.getReadout()?.note).toContain('无探针交互')
  })

  it('模拟动画读数为无探针提示（面板控制）', () => {
    add(f.store, defaultChart('simulation'))
    expect(f.registry.handlePointerDown(pe(f.store, 1, 1))).toBe(false)
    expect(f.registry.getReadout()?.note).toContain('模拟动画由面板控制')
  })

  it('请求渲染被调用（探针交互后）', () => {
    add(f.store, distributionChart(0))
    const before = f.renders.count
    f.registry.handlePointerDown(pe(f.store, 1, 0))
    f.registry.handlePointerUp(pe(f.store, 1, 0))
    expect(f.renders.count).toBeGreaterThan(before)
  })
})
