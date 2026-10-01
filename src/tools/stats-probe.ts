/**
 * 统计探针工具（v0.7，仅统计模式）：
 * - 分布图：拖动/点击设置探针 x（P(X ≤ x) 高亮区域右边界）；拖动走 preview，松手一步撤销；
 * - 散点图：点击选中最近数据点（散点↔残差联动高亮，不入文档、不产生撤销）。
 */
import { scatterLayout } from '../stats/dataset-renderer'
import { getPointSelection, setPointSelection } from '../stats/stats-state.svelte'
import type { Dataset } from '../stats/model'
import type { DocState, Point2 } from '../state/types'
import type { Tool, ToolContext } from './tool-registry'

const HIT_RADIUS_PX = 12

export function createStatsProbeTool(): Tool {
  let dragging: { datasetId: string; before: DocState } | null = null

  function currentDataset(ctx: ToolContext): Dataset | null {
    return ctx.store.getDatasets()[0] ?? null
  }

  function screenToMathX(ctx: ToolContext, screen: Point2): number {
    const view = ctx.getView()
    const size = ctx.getSize()
    return (screen.x - size.width / 2) / view.scaleX + view.centerX
  }

  /** 预览更新探针位置（不入历史） */
  function probeAt(ctx: ToolContext, datasetId: string, screen: Point2): void {
    const x = screenToMathX(ctx, screen)
    ctx.store.preview((doc) => ({
      objects: doc.objects.map((object) =>
        object.type === 'dataset' && object.id === datasetId && object.chart.kind === 'distribution'
          ? { ...object, chart: { ...object.chart, probeX: x } }
          : object,
      ),
    }))
    ctx.requestRender()
  }

  return {
    id: 'stats-probe',
    name: '统计探针',
    group: 'stats',

    activate(ctx) {
      dragging = null
      ctx.notify()
    },

    deactivate(ctx) {
      // 未完成的拖动追认为一步撤销（与图工具一致）
      if (dragging) ctx.store.commitPreview(dragging.before)
      dragging = null
    },

    onPointerDown(e, ctx) {
      const dataset = currentDataset(ctx)
      if (!dataset) return false
      if (dataset.chart.kind === 'distribution') {
        dragging = { datasetId: dataset.id, before: ctx.store.getDoc() }
        probeAt(ctx, dataset.id, e.screen)
        return true
      }
      if (dataset.chart.kind === 'scatter') {
        const layout = scatterLayout(dataset, ctx.getView(), ctx.getSize())
        let best: number | null = null
        let bestDistance = HIT_RADIUS_PX
        for (const point of layout.points) {
          const distance = Math.hypot(point.screen.x - e.screen.x, point.screen.y - e.screen.y)
          if (distance < bestDistance) {
            bestDistance = distance
            best = point.index
          }
        }
        setPointSelection(best !== null && best === getPointSelection() ? null : best)
        ctx.notify()
        ctx.requestRender()
        return true
      }
      return false
    },

    onPointerMove(e, ctx) {
      if (!dragging) return false
      probeAt(ctx, dragging.datasetId, e.screen)
      return true
    },

    onPointerUp(e, ctx) {
      if (!dragging) return false
      // 点击或拖动结束：把起始快照追认为一步（当前文档即新探针位置）
      ctx.store.commitPreview(dragging.before)
      dragging = null
      ctx.notify()
      ctx.requestRender()
      return true
    },

    getReadout(ctx) {
      const dataset = currentDataset(ctx)
      if (!dataset) {
        return {
          title: '统计探针',
          rows: [],
          note: '请在右侧统计面板导入数据（粘贴 CSV / 文件 / 生成）',
        }
      }
      if (dataset.chart.kind === 'distribution') {
        return {
          title: '统计探针',
          rows: [{ label: '探针', value: `x = ${dataset.chart.probeX.toPrecision(5)}` }],
          note: '拖动设置探针位置；琥珀区域面积 = P(X ≤ x)',
        }
      }
      if (dataset.chart.kind === 'scatter') {
        const selection = getPointSelection()
        return {
          title: '统计探针',
          rows: [
            {
              label: '选中点',
              value: selection === null ? '（未选中）' : `#${selection + 1}`,
            },
          ],
          note: '点击数据点选中；散点与残差图联动高亮',
        }
      }
      return {
        title: '统计探针',
        rows: [],
        note: '该图表无探针交互（模拟动画由面板控制）',
      }
    },
  }
}
