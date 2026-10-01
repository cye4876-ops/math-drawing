<script lang="ts">
  /**
   * 图论绘图面板（v0.5 阶段 4）：
   * - 图族一键生成（FAMILIES + 参数 → createFamily → specToDoc）；
   * - DSL 双向同步：输入防抖 400ms 应用（有解析错误时不改画布）；画布/工具/撤销导致结构变化时回写文本；
   * - 布局：环形 / 网格（同步）；力导向（WebWorker，避免阻塞主线程）。
   * 同步防循环要点：用户编辑中（focus）永不回写；回写前用 dslMatchesGraph 判断文本与画布是否已一致。
   */
  import { onDestroy } from 'svelte'
  import type { AppStore } from '../state/store'
  import type { AppState } from '../state/types'
  import type { GraphObject } from '../graph/model'
  import type { SceneHighlight } from '../render/element-registry'
  import SpectrumPanel from './SpectrumPanel.svelte'
  import AlgorithmPanel from './AlgorithmPanel.svelte'
  import EdgeListPanel from './EdgeListPanel.svelte'
  import PropertyPanel from './PropertyPanel.svelte'
  import {
    DEFAULT_PARAMS,
    FAMILIES,
    createFamily,
    specToDoc,
    validateFamilyParams,
    type FamilyInfo,
    type FamilyKind,
  } from '../graph/families'
  import { dslMatchesGraph, graphObjectFromDsl, graphToDsl } from '../graph/dsl-to-doc'
  import { parseGraphDsl, type DslError } from '../graph/dsl-parser'
  import { layoutCircular, layoutGrid, layoutLayered } from '../graph/layouts'
  import type { LayoutWorkerResponse } from '../graph/layout-worker'

  let {
    store,
    onHighlight,
  }: {
    store: AppStore
    /** 矩阵↔图联动高亮（转交 App 置入渲染层） */
    onHighlight: (highlight: SceneHighlight | null) => void
  } = $props()

  let appState = $state<AppState | null>(null)
  let dslText = $state('')
  let dslErrors = $state<DslError[]>([])
  let editing = $state(false)
  let layoutBusy = $state(false)
  let layoutError = $state('')
  let familyKind = $state<FamilyKind>('complete')
  let params = $state({
    n: DEFAULT_PARAMS.n,
    m: DEFAULT_PARAMS.m,
    rows: DEFAULT_PARAMS.rows,
    cols: DEFAULT_PARAMS.cols,
  })

  /** 上次已同步到 textarea 的图对象引用（引用相等 = 文档无结构相关变化） */
  let lastGraphRef: GraphObject | null = null

  function firstGraph(state: AppState | null): GraphObject | null {
    if (!state) return null
    return (
      state.doc.objects.find((object): object is GraphObject => object.type === 'graph') ?? null
    )
  }

  /**
   * 文档 → textarea 同步：
   * - 图引用未变（视图/标记点等变化）→ 不动；
   * - 用户聚焦编辑中 → 不回写（输入优先）；
   * - 文本与画布结构已一致 → 不回写（输入刚应用后的回声）。
   */
  function syncTextFromDoc(state: AppState): void {
    const graph = firstGraph(state)
    if (!graph) {
      lastGraphRef = null
      if (!editing && dslText !== '') {
        dslText = ''
        dslErrors = []
      }
      return
    }
    if (graph === lastGraphRef) return
    lastGraphRef = graph
    if (editing) return
    if (dslMatchesGraph(parseGraphDsl(dslText), graph)) return
    dslText = graphToDsl(graph)
    dslErrors = []
  }

  $effect(() => {
    // 注意：不能在本 effect 内「写 appState 后再读它」——getState() 每次返回新对象，
    // 写后读会让 effect 依赖 appState 并无限自我触发（Svelte effect_update_depth_exceeded）。
    // 因此初始同步与订阅回调都只使用局部变量。
    const initial = store.getState()
    appState = initial
    syncTextFromDoc(initial)
    return store.subscribe((state) => {
      appState = state
      syncTextFromDoc(state)
    })
  })

  const graphs = $derived(
    (appState?.doc.objects ?? []).filter(
      (object): object is GraphObject => object.type === 'graph',
    ),
  )
  const graph = $derived(graphs[0] ?? null)
  const familyInfo = $derived<FamilyInfo | undefined>(
    FAMILIES.find((item) => item.kind === familyKind),
  )
  /** 禁用条件：参数越界/非法组合时不充许生成（按钮置灰 + 提示） */
  const familyError = $derived(
    validateFamilyParams(familyKind, {
      n: params.n,
      m: params.m,
      rows: params.rows,
      cols: params.cols,
    }),
  )

  // ------- 图族生成 -------
  function generateFamily(): void {
    if (familyError !== null) return
    const spec = createFamily(familyKind, {
      n: params.n,
      m: params.m,
      rows: params.rows,
      cols: params.cols,
    })
    const doc = specToDoc(spec)
    const current = firstGraph(store.getState())
    if (current) {
      store.updateGraph(current.id, { nodes: doc.nodes, edges: doc.edges })
    } else {
      const name = familyInfo?.name ?? '图'
      store.addGraph(doc.nodes, doc.edges, name)
    }
  }

  // ------- DSL 双向同步 -------
  const APPLY_DEBOUNCE_MS = 400
  const DSL_PLACEHOLDER = '每行一条边或一个孤立点：\nA-B, B-C:3\nC->D（有向）\n# 注释'
  let applyTimer: ReturnType<typeof setTimeout> | undefined

  function scheduleApply(): void {
    if (applyTimer !== undefined) clearTimeout(applyTimer)
    applyTimer = setTimeout(applyDsl, APPLY_DEBOUNCE_MS)
  }

  function applyDsl(): void {
    applyTimer = undefined
    const parsed = parseGraphDsl(dslText)
    dslErrors = parsed.errors
    // 有解析错误：显示提示、不改画布（等用户修正）
    if (parsed.errors.length > 0) return
    const current = firstGraph(store.getState())
    // 结构已一致（如仅重排了书写格式）：无需重建，避免节点 id 变化
    if (current && dslMatchesGraph(parsed, current)) return
    const { graph: next } = graphObjectFromDsl(dslText, current?.name ?? '图', 3, current)
    if (!next) return
    if (current) {
      store.updateGraph(current.id, { nodes: next.nodes, edges: next.edges })
    } else {
      store.addGraph(next.nodes, next.edges, next.name)
    }
  }

  function handleTextInput(event: Event): void {
    dslText = (event.currentTarget as HTMLTextAreaElement).value
    scheduleApply()
  }

  function handleTextBlur(): void {
    editing = false
    // 失焦时立即应用待处理的输入（不等防抖）
    if (applyTimer !== undefined) {
      clearTimeout(applyTimer)
      applyDsl()
    }
  }

  // ------- 布局 -------
  function applyLayoutNodes(nodes: ReturnType<typeof layoutCircular>): void {
    const current = firstGraph(store.getState())
    if (!current) return
    store.updateGraph(current.id, { nodes })
  }

  function runCircularLayout(): void {
    const current = firstGraph(store.getState())
    if (current) applyLayoutNodes(layoutCircular(current))
  }

  function runGridLayout(): void {
    const current = firstGraph(store.getState())
    if (current) applyLayoutNodes(layoutGrid(current))
  }

  function runLayeredLayout(): void {
    const current = firstGraph(store.getState())
    if (current) applyLayoutNodes(layoutLayered(current))
  }

  function runForceLayout(): void {
    const current = firstGraph(store.getState())
    if (!current || layoutBusy) return
    layoutBusy = true
    layoutError = ''
    const worker = new Worker(new URL('../graph/layout-worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>): void => {
      worker.terminate()
      layoutBusy = false
      // 回写时以「当时的图」为准（期间可能有增删顶点）：按 id 合并坐标
      const target = firstGraph(store.getState())
      if (!target || target.id !== current.id) return
      const positions = new Map(event.data.positions.map((position) => [position.id, position]))
      store.updateGraph(target.id, {
        nodes: target.nodes.map((node) => {
          const position = positions.get(node.id)
          return position ? { ...node, x: position.x, y: position.y } : node
        }),
      })
    }
    worker.onerror = (): void => {
      worker.terminate()
      layoutBusy = false
      layoutError = '力导向布局失败（WebWorker 错误）'
    }
    worker.postMessage({
      nodes: current.nodes.map(({ id, x, y }) => ({ id, x, y })),
      edges: current.edges.map(({ source, target, directed }) => ({ source, target, directed })),
      iterations: 300,
    })
  }

  // ------- 其他 -------
  function deleteGraph(): void {
    const current = firstGraph(store.getState())
    if (current) store.removeGraph(current.id)
  }

  onDestroy(() => {
    if (applyTimer !== undefined) clearTimeout(applyTimer)
  })
</script>

<aside class="graph-panel" aria-label="图论绘图" data-testid="graph-panel">
  <div class="panel-header">
    <span>图</span>
    <span class="count" data-testid="graph-count">{graphs.length}</span>
  </div>

  <div class="section">
    <div class="section-title">图族</div>
    <div class="row">
      <select
        data-testid="family-select"
        value={familyKind}
        onchange={(event) =>
          (familyKind = (event.currentTarget as HTMLSelectElement).value as FamilyKind)}
      >
        {#each FAMILIES as family (family.kind)}
          <option value={family.kind}>{family.name}</option>
        {/each}
      </select>
    </div>
    {#if familyInfo && familyInfo.params.length > 0}
      <div class="row params">
        {#if familyInfo.params.includes('n')}
          <label
            >n <input
              data-testid="family-param-n"
              type="number"
              min="1"
              bind:value={params.n}
            /></label
          >
        {/if}
        {#if familyInfo.params.includes('m')}
          <label
            >m <input
              data-testid="family-param-m"
              type="number"
              min="1"
              bind:value={params.m}
            /></label
          >
        {/if}
        {#if familyInfo.params.includes('rows')}
          <label
            >行 <input
              data-testid="family-param-rows"
              type="number"
              min="1"
              bind:value={params.rows}
            /></label
          >
        {/if}
        {#if familyInfo.params.includes('cols')}
          <label
            >列 <input
              data-testid="family-param-cols"
              type="number"
              min="1"
              bind:value={params.cols}
            /></label
          >
        {/if}
      </div>
    {/if}
    <div class="row">
      <button
        type="button"
        data-testid="family-generate"
        disabled={familyError !== null}
        onclick={generateFamily}>生成</button
      >
      {#if familyError}
        <div class="error" data-testid="family-error">{familyError}</div>
      {/if}
    </div>
  </div>

  <div class="section">
    <div class="section-title">DSL</div>
    <textarea
      data-testid="graph-dsl"
      class="dsl-input"
      rows="6"
      spellcheck="false"
      placeholder={DSL_PLACEHOLDER}
      value={dslText}
      oninput={handleTextInput}
      onfocus={() => (editing = true)}
      onblur={handleTextBlur}></textarea>
    {#if dslErrors.length > 0}
      <div class="error" data-testid="graph-dsl-error">
        {#each dslErrors.slice(0, 3) as error, index (index)}
          <div>第 {error.line} 行：{error.message}</div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="section">
    <div class="section-title">布局</div>
    <div class="row">
      <button
        type="button"
        data-testid="layout-circular"
        disabled={!graph}
        onclick={runCircularLayout}
      >
        环形
      </button>
      <button type="button" data-testid="layout-grid" disabled={!graph} onclick={runGridLayout}>
        网格
      </button>
      <button
        type="button"
        data-testid="layout-layered"
        disabled={!graph}
        onclick={runLayeredLayout}
      >
        分层
      </button>
      <button
        type="button"
        data-testid="layout-force"
        disabled={!graph || layoutBusy}
        onclick={runForceLayout}
      >
        {layoutBusy ? '布局中…' : '力导向'}
      </button>
    </div>
    {#if layoutError}
      <div class="error" data-testid="layout-error">{layoutError}</div>
    {/if}
  </div>

  <div class="section meta">
    <div class="stats" data-testid="graph-stats">
      {#if graph}
        顶点 {graph.nodes.length} · 边 {graph.edges.length}
      {:else}
        暂无图：用图族或 DSL 创建
      {/if}
    </div>
    <button type="button" data-testid="graph-delete" disabled={!graph} onclick={deleteGraph}>
      删除此图
    </button>
  </div>

  <div class="section">
    <EdgeListPanel {store} {graph} />
  </div>

  <div class="section">
    <PropertyPanel {graph} {onHighlight} />
  </div>

  <div class="section">
    <SpectrumPanel {graph} {onHighlight} />
  </div>

  <div class="section">
    <AlgorithmPanel {graph} {onHighlight} />
  </div>
</aside>

<style>
  .graph-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
  }

  .count {
    color: var(--text-dim);
    font-weight: 400;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .section-title {
    font-size: 12px;
    color: var(--text-dim);
  }

  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .row.params label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }

  .row.params input {
    width: 56px;
  }

  .dsl-input {
    width: 100%;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
  }

  .error {
    color: var(--danger, #dc2626);
    font-size: 12px;
  }

  .meta {
    margin-top: auto;
  }

  .stats {
    font-size: 12px;
    color: var(--text-dim);
  }
</style>
