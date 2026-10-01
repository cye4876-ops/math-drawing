<script lang="ts">
  /**
   * 算法播放器（v0.5 阶段 5b）：
   * 选择算法与起点 → 生成器收集步骤 → 单步 / 播放（可调速）/ 回退 / 到末尾 / 重置；
   * 当前步骤经 onHighlight 叠加到画布（节点/边琥珀高亮），note 实时显示；
   * 结果摘要按类型展示（访问顺序 / 距离表 / 拓扑序 / 着色色块 / MST 总权重 / 错误）。
   * 图结构变化（增删点边）自动重置；拖动坐标不影响。
   */
  import { onDestroy } from 'svelte'
  import type { GraphObject } from '../graph/model'
  import type { SceneHighlight } from '../render/element-registry'
  import { setMatrixFocus } from '../state/matrix-focus.svelte'
  import {
    ALGORITHMS,
    reconstructPath,
    runAlgorithm,
    type AlgorithmResult,
  } from '../graph/algorithms'
  import type { AlgorithmStep } from '../graph/algorithms/types'
  import { computeTrail } from '../graph/algorithms/trail'
  import { structuralKey } from '../graph/structural-key'

  let {
    graph,
    onHighlight,
  }: {
    graph: GraphObject | null
    onHighlight: (highlight: SceneHighlight | null) => void
  } = $props()

  /** 着色色块（与曲线调色环一致的固定 8 色） */
  const COLOR_SWATCHES = [
    '#c32222',
    '#2563eb',
    '#16a34a',
    '#d97706',
    '#7c3aed',
    '#0891b2',
    '#db2777',
    '#65a30d',
  ]

  let algorithmId = $state('bfs')
  let startId = $state('')
  let endId = $state('')
  let steps = $state<AlgorithmStep[]>([])
  let result = $state<AlgorithmResult | null>(null)
  let index = $state(-1)
  let playing = $state(false)
  let speedMs = $state(600)
  let timer: ReturnType<typeof setInterval> | undefined

  const info = $derived(ALGORITHMS.find((item) => item.id === algorithmId))
  const currentStep = $derived(index >= 0 ? (steps[index] ?? null) : null)
  const finished = $derived(steps.length > 0 && index >= steps.length - 1)

  /** 着色结果 → 节点填充色（运行后直接上画布） */
  const coloringFills = $derived.by(() => {
    const current = result
    if (!current || !('colors' in current) || !('count' in current)) return undefined
    const fills: Record<string, string> = {}
    for (const [id, color] of Object.entries(current.colors)) {
      fills[id] = COLOR_SWATCHES[color % COLOR_SWATCHES.length]!
    }
    return fills
  })

  function stopPlayback(): void {
    playing = false
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  // 当前步骤变化 → 画布高亮联动（当前步骤琥珀 + 累积轨迹玫红 + 着色结果节点填充）
  $effect(() => {
    const step = currentStep
    const fills = coloringFills
    // Floyd 单步播放 → 谱面板矩阵行列焦点（当前中间点 k）；重播结束/重置时清空
    if (algorithmId === 'floyd' && !finished && step?.node && result && 'labels' in result) {
      setMatrixFocus(step.node)
    } else {
      setMatrixFocus(null)
    }
    if (!step && !fills) {
      onHighlight(null)
      return
    }
    const nodes = step?.node ? [step.node] : []
    const edges = step?.edge ? [{ source: step.edge.source, target: step.edge.target }] : []
    const trail = step ? computeTrail(steps, index) : { nodes: [], edges: [] }
    onHighlight({
      nodes,
      edges,
      trailNodes: trail.nodes,
      trailEdges: trail.edges,
      fills,
    })
  })

  // 结构变化 → 重置运行（拖动坐标不触发）
  let lastKey: string | null = null
  const structureKeyValue = $derived(graph ? structuralKey(graph) : '')
  $effect(() => {
    const key = structureKeyValue
    if (key === lastKey) return
    lastKey = key
    stopPlayback()
    steps = []
    result = null
    index = -1
    onHighlight(null)
  })

  function runSelected(): void {
    if (!graph) return
    stopPlayback()
    const output = runAlgorithm(algorithmId, graph, startId || undefined, endId || undefined)
    steps = output.steps
    result = output.result
    index = steps.length > 0 ? 0 : -1
    if (!startId && graph.nodes[0]) startId = graph.nodes[0].id
  }

  function tick(): void {
    if (index < steps.length - 1) index += 1
    else stopPlayback()
  }

  function stepForward(): void {
    if (steps.length === 0) return
    if (index < steps.length - 1) index += 1
    else stopPlayback()
  }

  function stepBackward(): void {
    if (index > 0) {
      index -= 1
      stopPlayback()
    }
  }

  function toEnd(): void {
    if (steps.length === 0) return
    stopPlayback()
    index = steps.length - 1
  }

  function togglePlay(): void {
    if (steps.length === 0) return
    if (playing) {
      stopPlayback()
      return
    }
    if (index >= steps.length - 1) index = 0
    playing = true
    timer = setInterval(tick, speedMs)
  }

  function setSpeed(value: number): void {
    speedMs = value
    if (playing) {
      if (timer !== undefined) clearInterval(timer)
      timer = setInterval(tick, value)
    }
  }

  function resetRun(): void {
    stopPlayback()
    steps = []
    result = null
    index = -1
  }

  /** 结果摘要（按类型判别字段） */
  function summarize(res: AlgorithmResult): {
    title: string
    items: string[]
    chips?: { label: string; color: string; text: string }[]
  } {
    const label = (id: string): string => graph?.nodes.find((node) => node.id === id)?.label ?? id
    if ('error' in res) return { title: '错误', items: [res.error] }
    if ('bipartite' in res) {
      return {
        title: '二分判定',
        items: [res.bipartite ? '是二分图（二着色可行）' : '非二分图（含奇环）'],
      }
    }
    if ('colors' in res && 'count' in res) {
      const chips = Object.entries(res.colors).map(([id, color]) => ({
        label: label(id),
        color: COLOR_SWATCHES[color % COLOR_SWATCHES.length]!,
        text: String(color),
      }))
      return { title: `着色结果：${res.count} 色`, items: [], chips }
    }
    if ('totalWeight' in res) {
      return {
        title: `生成树总权重 ${res.totalWeight}`,
        items: [
          res.connected ? '连通图：完整生成树' : '不连通：生成森林',
          `选中边数：${res.edges.length}`,
        ],
      }
    }
    if ('remaining' in res) {
      if (res.order) return { title: '拓扑排序', items: [res.order.map(label).join(' → ')] }
      return {
        title: '检测到环（无法拓扑排序）',
        items: [`剩余节点：${(res.remaining ?? []).map(label).join('、')}`],
      }
    }
    if ('maxFlow' in res) {
      const items = [
        `源 ${label(res.start)} → 汇 ${label(res.end)}`,
        ...res.flows.map(
          (edge) =>
            `${label(edge.source)} → ${label(edge.target)}：${edge.flow} / ${edge.capacity}`,
        ),
      ]
      return { title: `最大流 = ${res.maxFlow}`, items }
    }
    if ('componentOf' in res) {
      return {
        title: `强连通分量（${res.count} 个）`,
        items: res.components.map(
          (component, index) => `#${index + 1}：${component.map(label).join('、')}`,
        ),
      }
    }
    if ('pairs' in res) {
      return {
        title: `最大匹配（${res.size} 对）`,
        items: res.pairs.map((pair) => `${label(pair.left)} ↔ ${label(pair.right)}`),
      }
    }
    if ('negativeCycle' in res) {
      const items = res.labels.map((item, i) => {
        const row = res.matrix[i]!.map((value) => (value === null ? '∞' : String(value))).join('　')
        return `${item.label}：${row}`
      })
      return {
        title: res.negativeCycle ? '全对最短路（检测到负环）' : '全对最短路矩阵',
        items,
      }
    }
    if ('start' in res) {
      const items = Object.entries(res.distance).map(([id, distance]) => {
        const text = distance === null ? '∞' : String(distance)
        return `${label(id)}：${text}`
      })
      const itemLines = [items.join('　')]
      // 到最远可达点的路径示例
      let farthest: string | null = null
      let farthestDistance = -Infinity
      for (const [id, distance] of Object.entries(res.distance)) {
        if (distance !== null && distance > farthestDistance) {
          farthest = id
          farthestDistance = distance
        }
      }
      if (farthest !== null) {
        const path = reconstructPath(res, farthest)
        if (path && path.length > 1) {
          itemLines.push(`最远可达 ${label(farthest)} 的路径：${path.map(label).join(' → ')}`)
        }
      }
      return { title: '最短距离', items: itemLines }
    }
    // 遍历类（TraversalResult）
    const order = 'order' in res ? res.order : []
    return { title: '访问顺序', items: [order.map(label).join(' → ')] }
  }

  const summary = $derived(result ? summarize(result) : null)
  // 无步骤算法（着色/二分）运行即显示结果；有步骤算法到末尾（或报错）后显示
  const showResult = $derived(
    result !== null && (steps.length === 0 || finished || 'error' in result),
  )

  onDestroy(() => {
    stopPlayback()
  })
</script>

<aside class="algorithm" data-testid="algorithm-panel">
  <div class="section-title">算法</div>
  {#if !graph}
    <div class="hint">暂无图：先创建图再运行算法</div>
  {:else}
    <div class="row">
      <select
        data-testid="algorithm-select"
        value={algorithmId}
        onchange={(event) => {
          algorithmId = (event.currentTarget as HTMLSelectElement).value
          resetRun()
        }}
      >
        {#each ALGORITHMS as item (item.id)}
          <option value={item.id}>{item.name}</option>
        {/each}
      </select>
    </div>
    {#if info && !info.requiresStart}
      <div class="hint">{info.description}</div>
    {/if}
    {#if info?.requiresStart}
      <div class="row">
        <label class="start-label">
          起点
          <select
            data-testid="algorithm-start"
            value={startId}
            onchange={(event) => (startId = (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">（第一个顶点）</option>
            {#each graph.nodes as node (node.id)}
              <option value={node.id}>{node.label}</option>
            {/each}
          </select>
        </label>
      </div>
    {/if}
    {#if info?.requiresEnd}
      <div class="row">
        <label class="start-label">
          汇点
          <select
            data-testid="algorithm-end-select"
            value={endId}
            onchange={(event) => (endId = (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">（最后一个顶点）</option>
            {#each graph.nodes as node (node.id)}
              <option value={node.id}>{node.label}</option>
            {/each}
          </select>
        </label>
      </div>
    {/if}
    <div class="row">
      <button type="button" data-testid="algorithm-run" onclick={runSelected}>运行</button>
      <button
        type="button"
        data-testid="algorithm-reset"
        disabled={steps.length === 0 && result === null}
        onclick={resetRun}>重置</button
      >
    </div>

    {#if steps.length > 0}
      <div class="row controls">
        <button
          type="button"
          data-testid="algorithm-back"
          disabled={index <= 0}
          title="回退一步"
          onclick={stepBackward}>◀</button
        >
        <button
          type="button"
          data-testid="algorithm-step"
          disabled={finished}
          title="单步前进"
          onclick={stepForward}>单步 ▶</button
        >
        <button type="button" data-testid="algorithm-play" onclick={togglePlay}>
          {playing ? '暂停 ⏸' : '播放 ▶▶'}
        </button>
        <button type="button" data-testid="algorithm-end" disabled={finished} onclick={toEnd}>
          到末尾 ▶▶|
        </button>
      </div>
      <div class="row speeds">
        <span class="dim">速度</span>
        {#each [1200, 600, 220] as speed, i (speed)}
          <button
            type="button"
            class:active={speedMs === speed}
            data-testid={`algorithm-speed-${i}`}
            onclick={() => setSpeed(speed)}
          >
            {['慢', '中', '快'][i]}
          </button>
        {/each}
        <span class="progress" data-testid="algorithm-progress">{index + 1} / {steps.length}</span>
      </div>
      <div class="note" data-testid="algorithm-note">{currentStep?.note ?? '（未开始）'}</div>
    {/if}

    {#if showResult && summary}
      <div class="result" data-testid="algorithm-result">
        <div class="result-title">{summary.title}</div>
        {#if summary.chips}
          <div class="chips">
            {#each summary.chips as chip (chip.label)}
              <span class="chip">
                <i class="swatch" style={`background:${chip.color}`}></i>
                {chip.label}
                <span class="dim">#{chip.text}</span>
              </span>
            {/each}
          </div>
        {/if}
        {#each summary.items as item, i (i)}
          <div class="result-line">{item}</div>
        {/each}
      </div>
    {/if}
  {/if}
</aside>

<style>
  .algorithm {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-title {
    font-size: 12px;
    color: var(--text-dim);
  }

  .hint {
    font-size: 12px;
    color: var(--text-dim);
  }

  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .start-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }

  .controls button {
    min-width: 34px;
  }

  .speeds {
    font-size: 12px;
  }

  .speeds button.active {
    border-color: var(--accent);
    color: var(--accent);
  }

  .progress {
    margin-left: auto;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    color: var(--text-dim);
  }

  .note {
    font-size: 12px;
    min-height: 32px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: rgba(37, 99, 235, 0.04);
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
  }

  .result-title {
    font-weight: 600;
  }

  .result-line {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    word-break: break-all;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  .dim {
    color: var(--text-dim);
  }
</style>
