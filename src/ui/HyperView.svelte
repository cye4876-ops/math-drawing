<script lang="ts">
  /**
   * 超图与彩虹实验室画布（v3.4 / v3.5）：
   * - 超图：集合视图 / 关联二部图 / 2-截面 / 线图；点击顶点或超边联动面板；
   * - 彩虹：边着色完全图（或导入的图）与选中彩虹副本高亮。
   */
  import { onMount } from 'svelte'
  import { hyperLab, selectHyper } from '../state/hyper-state.svelte'
  import { analyzeHypergraphDoc } from '../hypergraph/analysis'
  import { memberIndices } from '../hypergraph/model'

  let { active = false }: { active?: boolean } = $props()

  interface Point {
    x: number
    y: number
  }

  type Hit =
    | { kind: 'vertex'; index: number; x: number; y: number; radius: number }
    | { kind: 'edge'; index: number; x: number; y: number; radius: number }

  let containerEl: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let hits: Hit[] = []

  const BG = '#0b0e14'
  const VERTEX_STROKE = '#e2e8f0'
  const SELECTED = '#fbbf24'

  function withAlpha(hex: string, alpha: number): string {
    const value = hex.replace('#', '')
    if (value.length !== 6) return hex
    const r = Number.parseInt(value.slice(0, 2), 16)
    const g = Number.parseInt(value.slice(2, 4), 16)
    const b = Number.parseInt(value.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  function circleLayout(count: number, center: Point, radius: number): Point[] {
    if (count === 0) return []
    if (count === 1) return [{ ...center }]
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / count
      return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
    })
  }

  function centroid(points: Point[]): Point {
    if (points.length === 0) return { x: 0, y: 0 }
    let x = 0
    let y = 0
    for (const point of points) {
      x += point.x
      y += point.y
    }
    return { x: x / points.length, y: y / points.length }
  }

  function convexHull(points: Point[]): Point[] {
    if (points.length <= 2) return [...points]
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
    const cross = (o: Point, a: Point, b: Point): number =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
    const lower: Point[] = []
    for (const point of sorted) {
      while (
        lower.length >= 2 &&
        cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0
      ) {
        lower.pop()
      }
      lower.push(point)
    }
    const upper: Point[] = []
    for (let index = sorted.length - 1; index >= 0; index--) {
      const point = sorted[index]!
      while (
        upper.length >= 2 &&
        cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0
      ) {
        upper.pop()
      }
      upper.push(point)
    }
    lower.pop()
    upper.pop()
    return [...lower, ...upper]
  }

  function inflatedHull(points: Point[], pad: number): Point[] {
    const center = centroid(points)
    return convexHull(points).map((point) => {
      const dx = point.x - center.x
      const dy = point.y - center.y
      const length = Math.hypot(dx, dy) || 1
      return { x: point.x + (dx / length) * pad, y: point.y + (dy / length) * pad }
    })
  }

  function drawBlob(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color: string,
    emphasis: boolean,
  ): void {
    if (points.length === 0) return
    if (points.length === 1) {
      const point = points[0]!
      ctx.beginPath()
      ctx.arc(point.x, point.y, emphasis ? 30 : 24, 0, Math.PI * 2)
      ctx.fillStyle = withAlpha(color, emphasis ? 0.32 : 0.16)
      ctx.fill()
      ctx.lineWidth = emphasis ? 3 : 1.6
      ctx.strokeStyle = color
      ctx.stroke()
      return
    }
    if (points.length === 2) {
      const [a, b] = points as [Point, Point]
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = withAlpha(color, emphasis ? 0.4 : 0.18)
      ctx.lineWidth = emphasis ? 30 : 24
      ctx.stroke()
      ctx.strokeStyle = emphasis ? SELECTED : color
      ctx.lineWidth = emphasis ? 3 : 1.6
      ctx.stroke()
      return
    }
    const hull = inflatedHull(points, emphasis ? 22 : 16)
    ctx.beginPath()
    hull.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.lineJoin = 'round'
    ctx.fillStyle = withAlpha(color, emphasis ? 0.3 : 0.13)
    ctx.fill()
    ctx.lineWidth = emphasis ? 3 : 1.6
    ctx.strokeStyle = emphasis ? SELECTED : color
    ctx.stroke()
  }

  function labelBox(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    strong = false,
  ): void {
    ctx.font = '11px ui-monospace, Consolas, monospace'
    const width = ctx.measureText(text).width + 10
    const height = 16
    ctx.beginPath()
    ctx.roundRect(x - width / 2, y - height / 2, width, height, 4)
    ctx.fillStyle = strong ? withAlpha(color, 0.92) : 'rgba(17, 24, 39, 0.78)'
    ctx.fill()
    ctx.strokeStyle = withAlpha(color, 0.8)
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = strong ? '#0b0e14' : '#dbeafe'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }

  function drawVertex(
    ctx: CanvasRenderingContext2D,
    point: Point,
    label: string,
    color: string,
    selected: boolean,
    witness: boolean,
  ): void {
    const radius = 13
    ctx.beginPath()
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.lineWidth = selected || witness ? 3.5 : 2
    ctx.strokeStyle = selected ? SELECTED : witness ? '#fef3c7' : VERTEX_STROKE
    ctx.stroke()
    ctx.fillStyle = '#0b0e14'
    ctx.font = '600 11px ui-monospace, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, point.x, point.y)
  }

  function drawTitle(ctx: CanvasRenderingContext2D, title: string, subtitle: string): void {
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#dbeafe'
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(title, 18, 14)
    ctx.fillStyle = '#6f819f'
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(subtitle, 18, 34)
  }

  function drawHypergraph(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    hits = []
    const doc = hyperLab.doc
    const edges = memberIndices(doc)
    const selected = hyperLab.selected
    const witness = hyperLab.witness
    const witnessEdges = new Set(witness.edges)
    const witnessVertices = new Set(witness.vertices)
    const coloring = hyperLab.coloring
    const view = hyperLab.view
    const center: Point = { x: width / 2, y: height / 2 }
    const radius = Math.max(80, Math.min(width, height) * 0.33)
    const vertexPoints = circleLayout(doc.vertices.length, center, radius)
    const edgeColor = (index: number): string => doc.edges[index]?.color ?? '#94a3b8'
    const vertexColor = (index: number): string =>
      coloring?.[index] === 0
        ? '#f87171'
        : coloring?.[index] === 1
          ? '#60a5fa'
          : (doc.vertices[index]?.color ?? '#38bdf8')

    if (view === 'bipartite') {
      drawTitle(ctx, '关联二部图', '左：顶点 · 右：超边 · 连线 = 关联')
      const margin = 46
      const leftX = Math.max(90, width * 0.22)
      const rightX = Math.min(width - 120, width * 0.78)
      const vertexPositions = Array.from({ length: doc.vertices.length }, (_, index) => ({
        x: leftX,
        y:
          doc.vertices.length <= 1
            ? height / 2
            : margin + ((height - margin * 2) * index) / Math.max(1, doc.vertices.length - 1),
      }))
      const edgePositions = Array.from({ length: doc.edges.length }, (_, index) => ({
        x: rightX,
        y:
          doc.edges.length <= 1
            ? height / 2
            : margin + ((height - margin * 2) * index) / Math.max(1, doc.edges.length - 1),
      }))
      edges.forEach((members, edgeIndex) => {
        const color = edgeColor(edgeIndex)
        const emphasized =
          (selected?.kind === 'edge' && selected.index === edgeIndex) || witnessEdges.has(edgeIndex)
        members.forEach((vertex) => {
          const from = vertexPositions[vertex]
          const to = edgePositions[edgeIndex]
          if (!from || !to) return
          ctx.beginPath()
          ctx.moveTo(from.x + 13, from.y)
          ctx.lineTo(to.x - 10, to.y)
          ctx.strokeStyle = withAlpha(color, emphasized ? 0.95 : 0.45)
          ctx.lineWidth = emphasized ? 2.4 : 1.1
          ctx.stroke()
        })
      })
      doc.vertices.forEach((vertex, index) => {
        const point = vertexPositions[index]!
        drawVertex(
          ctx,
          point,
          vertex.label,
          vertexColor(index),
          selected?.kind === 'vertex' && selected.index === index,
          witnessVertices.has(index),
        )
        hits.push({ kind: 'vertex', index, x: point.x, y: point.y, radius: 16 })
      })
      doc.edges.forEach((edge, index) => {
        const point = edgePositions[index]!
        const emphasized =
          (selected?.kind === 'edge' && selected.index === index) || witnessEdges.has(index)
        ctx.beginPath()
        ctx.roundRect(point.x - 11, point.y - 11, 22, 22, 4)
        ctx.fillStyle = edgeColor(index)
        ctx.fill()
        ctx.lineWidth = emphasized ? 3.5 : 1.5
        ctx.strokeStyle = emphasized ? SELECTED : VERTEX_STROKE
        ctx.stroke()
        ctx.fillStyle = '#0b0e14'
        ctx.font = '600 10px ui-monospace, Consolas, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(edge.label.replace('e', ''), point.x, point.y)
        ctx.textAlign = 'left'
        ctx.fillStyle = '#a9b8d4'
        ctx.font = '11px ui-monospace, Consolas, monospace'
        ctx.fillText(edge.label, point.x + 18, point.y)
        hits.push({ kind: 'edge', index, x: point.x, y: point.y, radius: 18 })
      })
      return
    }

    if (view === 'line') {
      drawTitle(ctx, '线图 L(H)', '节点 = 超边；相交即连边')
      const edgePoints = circleLayout(doc.edges.length, center, radius)
      const analysis = analyzeHypergraphDoc(doc)
      for (const [a, b] of analysis.lineGraphEdges) {
        const from = edgePoints[a]
        const to = edgePoints[b]
        if (!from || !to) continue
        const emphasized =
          (selected?.kind === 'edge' && (selected.index === a || selected.index === b)) ||
          (witnessEdges.has(a) && witnessEdges.has(b))
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.strokeStyle = emphasized ? 'rgba(251, 191, 36, 0.9)' : 'rgba(148, 163, 184, 0.35)'
        ctx.lineWidth = emphasized ? 2.4 : 1.1
        ctx.stroke()
      }
      doc.edges.forEach((edge, index) => {
        const point = edgePoints[index]!
        const emphasized =
          (selected?.kind === 'edge' && selected.index === index) || witnessEdges.has(index)
        const incident =
          selected?.kind === 'vertex' &&
          doc.edges[index]!.members.includes(doc.vertices[selected.index]?.id ?? '')
        ctx.beginPath()
        ctx.arc(point.x, point.y, 15, 0, Math.PI * 2)
        ctx.fillStyle = edgeColor(index)
        ctx.fill()
        ctx.lineWidth = emphasized || incident ? 3.5 : 1.5
        ctx.strokeStyle = emphasized ? SELECTED : incident ? '#fde68a' : VERTEX_STROKE
        ctx.stroke()
        ctx.fillStyle = '#0b0e14'
        ctx.font = '600 10px ui-monospace, Consolas, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(edge.label, point.x, point.y)
        hits.push({ kind: 'edge', index, x: point.x, y: point.y, radius: 18 })
      })
      return
    }

    // 集合视图 / 2-截面：共用顶点圆环，超边用凸包气泡包围成员
    drawTitle(
      ctx,
      view === 'section' ? '2-截面（2-section）' : '集合视图（超边气泡）',
      view === 'section' ? '灰线 = 共超边的顶点对；气泡 = 原超边' : '点击顶点或超边查看详情',
    )
    if (view === 'section') {
      const analysis = analyzeHypergraphDoc(doc)
      for (const [a, b] of analysis.twoSectionPairs) {
        const from = vertexPoints[a]
        const to = vertexPoints[b]
        if (!from || !to) continue
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
    const order = doc.edges
      .map((edge, index) => ({ edge, index }))
      .sort((a, b) => b.edge.members.length - a.edge.members.length)
    for (const { index } of order) {
      const members = edges[index] ?? []
      const points = members
        .map((vertex) => vertexPoints[vertex])
        .filter((point): point is Point => !!point)
      const emphasized =
        (selected?.kind === 'edge' && selected.index === index) || witnessEdges.has(index)
      drawBlob(ctx, points, edgeColor(index), emphasized)
    }
    // 超边标签（质心）
    doc.edges.forEach((edge, index) => {
      const members = edges[index] ?? []
      const points = members
        .map((vertex) => vertexPoints[vertex])
        .filter((point): point is Point => !!point)
      if (points.length === 0) return
      const position = centroid(points)
      const emphasized =
        (selected?.kind === 'edge' && selected.index === index) || witnessEdges.has(index)
      if (doc.edges.length <= 16 || emphasized) {
        labelBox(ctx, edge.label, position.x, position.y, edgeColor(index), emphasized)
      }
      hits.push({ kind: 'edge', index, x: position.x, y: position.y, radius: 17 })
    })
    // 顶点最后绘制，保证可点击
    doc.vertices.forEach((vertex, index) => {
      const point = vertexPoints[index]!
      drawVertex(
        ctx,
        point,
        vertex.label,
        vertexColor(index),
        selected?.kind === 'vertex' && selected.index === index,
        witnessVertices.has(index),
      )
      hits.push({ kind: 'vertex', index, x: point.x, y: point.y, radius: 16 })
    })
    if (coloring) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = '#f87171'
      ctx.fillText('● 颜色 0', 18, height - 30)
      ctx.fillStyle = '#60a5fa'
      ctx.fillText('● 颜色 1', 78, height - 30)
    }
  }

  function drawRainbow(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const state = hyperLab.rainbow
    const graph = state.graph
    const center: Point = { x: width / 2, y: height / 2 + 6 }
    const radius = Math.max(90, Math.min(width, height) * 0.34)
    const points = circleLayout(graph.n, center, radius)
    const copy = state.copies[state.selectedCopy]
    const selectedEdges = new Set(copy?.edges ?? [])
    const selectedVertices = new Set(copy?.vertices ?? [])
    drawTitle(
      ctx,
      '彩虹子图 / 反拉姆齐',
      `${graph.n} 个顶点 · ${graph.edges.length} 条边 · ${new Set(graph.edges.map((edge) => edge.color)).size} 种颜色`,
    )
    graph.edges.forEach((edge, index) => {
      const from = points[edge.u]
      const to = points[edge.v]
      if (!from || !to) return
      const emphasized = selectedEdges.has(index)
      if (emphasized) {
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.strokeStyle = edge.color
      ctx.lineWidth = emphasized ? 3.4 : 1.8
      ctx.stroke()
    })
    graph.labels.forEach((label, index) => {
      const point = points[index]!
      const selected = selectedVertices.has(index)
      ctx.beginPath()
      ctx.arc(point.x, point.y, 13, 0, Math.PI * 2)
      ctx.fillStyle = '#16203a'
      ctx.fill()
      ctx.lineWidth = selected ? 3.5 : 1.5
      ctx.strokeStyle = selected ? SELECTED : '#64748b'
      ctx.stroke()
      ctx.fillStyle = '#dbeafe'
      ctx.font = '600 11px ui-monospace, Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, point.x, point.y)
    })
    if (copy) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = '#fbbf24'
      const sequence = copy.vertices.map((index) => graph.labels[index]).join(' → ')
      ctx.fillText(`选中：${sequence}`, 18, height - 16)
    }
  }

  function draw(): void {
    const canvas = canvasEl
    const container = containerEl
    if (!canvas || !container) return
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.fillStyle = BG
    context.fillRect(0, 0, width, height)
    // 细点阵背景
    context.fillStyle = 'rgba(148, 163, 184, 0.08)'
    for (let x = 24; x < width; x += 32) {
      for (let y = 60; y < height; y += 32) {
        context.beginPath()
        context.arc(x, y, 1, 0, Math.PI * 2)
        context.fill()
      }
    }
    if (hyperLab.tab === 'hypergraph') drawHypergraph(context, width, height)
    else drawRainbow(context, width, height)
  }

  function handlePointerDown(event: PointerEvent): void {
    // 阻止舞台层的拖拽/缩放手势捕获指针（否则 click 会被重定向到 stage）
    event.stopPropagation()
    if (event.button !== 0 || hyperLab.tab !== 'hypergraph') return
    const canvas = canvasEl
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let best: Hit | null = null
    let bestDistance = Infinity
    for (const hit of hits) {
      const distance = Math.hypot(hit.x - x, hit.y - y)
      if (distance > hit.radius) continue
      // 顶点优先
      if (!best || (hit.kind === 'vertex' && best.kind === 'edge') || distance < bestDistance) {
        best = hit
        bestDistance = distance
      }
    }
    if (best) selectHyper({ kind: best.kind, index: best.index })
  }

  onMount(() => {
    const observer = new ResizeObserver(() => {
      if (active) draw()
    })
    observer.observe(containerEl)
    draw()
    return () => observer.disconnect()
  })

  $effect(() => {
    // 追踪共享状态（深读取发生在 draw 内）
    void hyperLab.tab
    void hyperLab.view
    void hyperLab.selected
    void hyperLab.witness
    void hyperLab.coloring
    void hyperLab.doc
    void hyperLab.rainbow.graph
    void hyperLab.rainbow.copies
    void hyperLab.rainbow.selectedCopy
    void hyperLab.rainbow.anti
    if (active) draw()
  })
</script>

<div class="hyper-view" class:hidden={!active} bind:this={containerEl} data-testid="hyper-view">
  <canvas
    bind:this={canvasEl}
    class="hyper-canvas"
    data-testid="hyper-canvas"
    onpointerdown={handlePointerDown}
    onwheel={(event) => event.stopPropagation()}
  ></canvas>
</div>

<style>
  .hyper-view {
    position: relative;
    width: 100%;
    height: 100%;
    background: #0b0e14;
    overflow: hidden;
  }
  .hyper-view.hidden {
    visibility: hidden;
    pointer-events: none;
  }
  .hyper-canvas {
    position: absolute;
    inset: 0;
    display: block;
    cursor: pointer;
  }
</style>
