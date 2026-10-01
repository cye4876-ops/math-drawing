/**
 * 数学绘图工具 v1.0 —— 示例插件（覆盖全部 6 类扩展点）
 *
 * 加载方式（任选其一）：
 * 1. 在「Notebook → 插件」区输入 /plugins/example-logistic.js 并加载；
 * 2. 用文件选择框加载本文件。
 *
 * 扩展点全景：
 * ① registerFunction —— logistic(x) 表达式函数（可在曲线与计算格直接使用）
 * ② registerElement  —— 'polygon' 图形元素（多边形绘制 + 包围盒命中）
 * ③ registerTool     —— 多边形放置工具（点击加点，Enter/双击完成）
 * ④ registerView     —— 侧栏插件面板（放置示例图形）
 * ⑤ registerExporter —— 曲线采样 CSV 导出
 * ⑥ registerCellType —— logistic 表格单元格（Notebook）
 */
export const name = 'example-logistic'
export const version = '1.0.0'

const logistic = (x) => 1 / (1 + Math.exp(-x))

export function activate(api) {
  api.log('example-logistic 已激活（6 类扩展点演示）')

  // ① 表达式函数
  api.registerFunction({
    name: 'logistic',
    minArgs: 1,
    maxArgs: 1,
    signature: 'logistic(x)',
    differentiable: false,
    fn: logistic,
  })

  // ② 图形元素：按 data.points（数学坐标）绘制闭合多边形
  function polygonPoints(element) {
    const points =
      element && element.data && Array.isArray(element.data.points) ? element.data.points : []
    return points.filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
  }

  api.registerElement({
    type: 'polygon',
    draw(ctx, element, viewport) {
      if (!element.visible) return
      const points = polygonPoints(element)
      if (points.length < 2) return
      const view = viewport.view
      const size = viewport.size
      ctx.save()
      ctx.beginPath()
      points.forEach((point, index) => {
        const x = size.width / 2 + (point.x - view.centerX) * view.scaleX
        const y = size.height / 2 - (point.y - view.centerY) * view.scaleY
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.fillStyle = 'rgba(124, 58, 237, 0.18)'
      ctx.fill()
      ctx.strokeStyle = '#7c3aed'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    },
    hitTest(element, screen, viewport) {
      const points = polygonPoints(element)
      if (points.length === 0) return null
      const view = viewport.view
      const size = viewport.size
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const point of points) {
        const x = size.width / 2 + (point.x - view.centerX) * view.scaleX
        const y = size.height / 2 - (point.y - view.centerY) * view.scaleY
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      const margin = 4
      const inside =
        screen.x >= minX - margin &&
        screen.x <= maxX + margin &&
        screen.y >= minY - margin &&
        screen.y <= maxY + margin
      if (!inside) return null
      return { elementId: element.id, part: 'polygon', targetId: element.id, distancePx: 0 }
    },
  })

  // ③ 工具：多边形放置
  let pending = []

  api.registerTool({
    id: 'plugin-polygon',
    label: '多边形（示例插件）',
    create(context) {
      const commit = () => {
        if (pending.length >= 3) {
          context.store.addSceneObject({
            type: 'plugin',
            pluginType: 'polygon',
            name: '示例多边形',
            data: { points: pending.map((point) => ({ x: point.x, y: point.y })) },
            visible: true,
          })
        }
        pending = []
        context.requestRender()
      }
      return {
        id: 'plugin-polygon',
        name: '多边形',
        group: 'plot',
        activate() {
          pending = []
        },
        deactivate() {
          pending = []
          context.requestRender()
        },
        onPointerDown(event) {
          // 双击（detail = 2）完成；单击加点
          if (event.pointer.detail >= 2) {
            commit()
            return true
          }
          pending.push({ x: event.math.x, y: event.math.y })
          context.requestRender()
          return true
        },
        onKeyDown(event) {
          if (event.key === 'Enter') {
            commit()
            return true
          }
          return false
        },
        drawOverlay(canvasCtx) {
          if (pending.length === 0) return
          const view = context.getView()
          const size = context.getSize()
          const toX = (mx) => size.width / 2 + (mx - view.centerX) * view.scaleX
          const toY = (my) => size.height / 2 - (my - view.centerY) * view.scaleY
          canvasCtx.save()
          canvasCtx.strokeStyle = '#7c3aed'
          canvasCtx.fillStyle = '#7c3aed'
          canvasCtx.setLineDash([6, 4])
          canvasCtx.beginPath()
          pending.forEach((point, index) => {
            const x = toX(point.x)
            const y = toY(point.y)
            if (index === 0) canvasCtx.moveTo(x, y)
            else canvasCtx.lineTo(x, y)
          })
          canvasCtx.stroke()
          canvasCtx.setLineDash([])
          for (const point of pending) {
            canvasCtx.beginPath()
            canvasCtx.arc(toX(point.x), toY(point.y), 4, 0, Math.PI * 2)
            canvasCtx.fill()
          }
          canvasCtx.restore()
        },
      }
    },
  })

  // ④ 视图：侧栏插件面板
  api.registerView({
    id: 'example-logistic-view',
    title: '示例插件面板',
    render(container, context) {
      container.textContent = ''
      const info = document.createElement('div')
      info.style.cssText = 'font-size:12px;color:#4a5d80;line-height:1.6;'
      info.textContent = 'logistic(x) = 1/(1+e^−x)；工具「多边形」可交互放置；导出器在导出面板。'
      const triangle = document.createElement('button')
      triangle.type = 'button'
      triangle.dataset.testid = 'plugin-add-triangle'
      triangle.textContent = '放置示例三角形'
      triangle.style.cssText = 'font-size:12px;padding:4px 10px;margin-top:6px;'
      triangle.addEventListener('click', () => {
        context.store.addSceneObject({
          type: 'plugin',
          pluginType: 'polygon',
          name: '示例三角形',
          data: {
            points: [
              { x: -2, y: -1 },
              { x: 2, y: -1 },
              { x: 0, y: 2 },
            ],
          },
          visible: true,
        })
      })
      container.append(info, triangle)
      return () => {
        container.textContent = ''
      }
    },
  })

  // ⑤ 导出格式：曲线采样 CSV
  api.registerExporter({
    id: 'example-csv-samples',
    label: '示例：曲线采样 CSV',
    export({ doc, view, size }) {
      const curves = doc.objects.filter(
        (object) => object.type === 'curve' && object.kind === 'explicit',
      )
      if (curves.length === 0) return null
      const minX = view.centerX - size.width / 2 / view.scaleX
      const maxX = view.centerX + size.width / 2 / view.scaleX
      const rows = [
        'x,' +
          curves
            .map((curve) => '"' + (curve.name || curve.expr).replace(/"/g, '""') + '"')
            .join(','),
      ]
      const steps = 120
      for (let index = 0; index <= steps; index++) {
        const x = minX + ((maxX - minX) * index) / steps
        const cells = [x.toFixed(6)]
        for (const curve of curves) {
          const value = api.evaluate(curve.expr, 'x', x)
          cells.push(value === null ? '' : value.toFixed(6))
        }
        rows.push(cells.join(','))
      }
      return {
        filename: 'curve-samples.csv',
        blob: new Blob([rows.join('\n')], { type: 'text/csv' }),
      }
    },
  })

  // ⑥ Notebook 单元格类型：logistic 表格
  api.registerCellType({
    id: 'example-logistic-table',
    label: 'logistic 表格（示例）',
    createData() {
      return { from: -3, to: 3, rows: 9 }
    },
    render(container, cell, cellContext) {
      const settings =
        cell.data && typeof cell.data === 'object' ? cell.data : { from: -3, to: 3, rows: 9 }
      const from = Number(settings.from ?? -3)
      const to = Number(settings.to ?? 3)
      const rows = Math.max(2, Math.min(40, Math.round(Number(settings.rows ?? 9))))
      container.textContent = ''
      const table = document.createElement('table')
      table.style.cssText =
        'border-collapse:collapse;font-size:13px;font-family:ui-monospace,monospace;'
      const header = document.createElement('tr')
      for (const label of ['x', 'logistic(x)']) {
        const th = document.createElement('th')
        th.textContent = label
        th.style.cssText = 'border:1px solid #e3e9f3;padding:3px 10px;background:#f3f6fb;'
        header.append(th)
      }
      table.append(header)
      for (let index = 0; index < rows; index++) {
        const x = from + ((to - from) * index) / (rows - 1)
        const row = document.createElement('tr')
        for (const text of [x.toFixed(3), logistic(x).toFixed(6)]) {
          const td = document.createElement('td')
          td.textContent = text
          td.style.cssText = 'border:1px solid #e3e9f3;padding:3px 10px;text-align:right;'
          row.append(td)
        }
        table.append(row)
      }
      container.append(table)
      void cellContext
      return () => {
        container.textContent = ''
      }
    },
  })
}
