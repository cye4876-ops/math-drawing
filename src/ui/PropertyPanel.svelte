<script lang="ts">
  /**
   * 图的性质面板（v0.5）：连通性 / 二分性 / 欧拉路 / 平面性；色数 χ / 点覆盖 τ / 二分化 b。
   * 平面性证据、二分化需删边、最小点覆盖可一键在画布上高亮（琥珀，三者互斥）。
   * 计算缓存：仅在图结构变化时重算（拖动坐标不触发）。
   */
  import type { GraphObject } from '../graph/model'
  import type { SceneHighlight } from '../render/element-registry'
  import { computeProperties, type GraphProperties } from '../graph/properties'
  import { bipartizationNumber, type BipartizationResult } from '../graph/bipartization'
  import { structuralKey } from '../graph/structural-key'

  let {
    graph,
    onHighlight,
  }: {
    graph: GraphObject | null
    onHighlight: (highlight: SceneHighlight | null) => void
  } = $props()

  type HighlightMode = 'none' | 'planar' | 'bipart' | 'cover'

  let properties = $state<GraphProperties | null>(null)
  let bipartization = $state<BipartizationResult | null>(null)
  let highlightMode = $state<HighlightMode>('none')
  let lastKey: string | null = null

  const structureKeyValue = $derived(graph ? structuralKey(graph) : '')

  $effect(() => {
    const key = structureKeyValue
    if (key === lastKey) return
    lastKey = key
    highlightMode = 'none'
    onHighlight(null)
    properties = graph ? computeProperties(graph) : null
    bipartization = graph ? bipartizationNumber(graph) : null
  })

  function clearHighlight(): void {
    highlightMode = 'none'
    onHighlight(null)
  }

  function toggleEvidence(): void {
    if (highlightMode === 'planar') return clearHighlight()
    const evidence = properties?.planar.evidence
    if (!evidence) return
    highlightMode = 'planar'
    onHighlight({ nodes: evidence })
  }

  /** 高亮「删除后可得二部图」的边（琥珀） */
  function toggleBipartHighlight(): void {
    if (highlightMode === 'bipart') return clearHighlight()
    const result = bipartization
    if (!graph || !result || result.edgeIds.length === 0) return
    highlightMode = 'bipart'
    const edges = graph.edges
      .filter((edge) => result.edgeIds.includes(edge.id))
      .map((edge) => ({ source: edge.source, target: edge.target }))
    onHighlight({ edges })
  }

  /** 高亮一个最小点覆盖（琥珀顶点） */
  function toggleCoverHighlight(): void {
    if (highlightMode === 'cover') return clearHighlight()
    const vertices = properties?.vertexCover.vertices
    if (!vertices || vertices.length === 0) return
    highlightMode = 'cover'
    onHighlight({ nodes: vertices })
  }
</script>

<div class="properties" data-testid="property-panel">
  <div class="section-title">图的性质</div>
  {#if !graph || !properties}
    <div class="hint">暂无图：用图族或 DSL 创建</div>
  {:else}
    <div class="line" data-testid="property-connected">
      连通性：{properties.connected ? '连通' : `不连通（${properties.components} 个分量）`}
    </div>
    <div class="line" data-testid="property-bipartite">
      二分性：{properties.bipartite ? '二分图' : '非二分图（含奇环）'}
    </div>
    <div class="line" data-testid="property-euler">
      欧拉：{properties.euler === 'circuit'
        ? '存在欧拉回路'
        : properties.euler === 'path'
          ? '存在欧拉路径'
          : '不存在'}
    </div>
    <div class="line" data-testid="property-planar">
      平面性：{properties.planar.planar === false
        ? '确定非平面'
        : properties.planar.planar === true
          ? '未发现冲突（可能平面）'
          : '未完整判定'}
    </div>
    <div class="hint" data-testid="property-planar-reason">{properties.planar.reason}</div>
    <div class="line" data-testid="property-bipartization">
      二分化 b(G)：{bipartization === null
        ? '—'
        : bipartization.count === 0
          ? '删除 0 条边（已是二分图）'
          : `删除 ${bipartization.count} 条边可得二分图（${bipartization.exact ? '精确' : '近似'}）`}
    </div>
    {#if bipartization && bipartization.count > 0}
      <div class="row">
        <button
          type="button"
          data-testid="property-bipart-highlight"
          class:active={highlightMode === 'bipart'}
          onclick={toggleBipartHighlight}
        >
          {highlightMode === 'bipart' ? '取消高亮' : '高亮需删除的边'}
        </button>
      </div>
    {/if}
    {#if properties.planar.evidence}
      <div class="row">
        <button
          type="button"
          data-testid="property-highlight"
          class:active={highlightMode === 'planar'}
          onclick={toggleEvidence}
        >
          {highlightMode === 'planar' ? '取消高亮' : '高亮禁用子图证据'}
        </button>
      </div>
    {/if}
    <div class="line" data-testid="property-chromatic">
      色数 χ(G)：{properties.chromatic.hasLoop
        ? '含自环，无正常着色'
        : properties.chromatic.value !== null
          ? `χ = ${properties.chromatic.value}`
          : `χ ∈ [${properties.chromatic.lower}, ${properties.chromatic.upper}]（贪心上下界）`}
    </div>
    <div class="line" data-testid="property-vertex-cover">
      点覆盖数 τ(G)：{properties.vertexCover.exact
        ? properties.vertexCover.size === 0
          ? 'τ = 0（无边）'
          : `τ = ${properties.vertexCover.size}`
        : `τ ≤ ${properties.vertexCover.size}（近似）`}
    </div>
    {#if properties.vertexCover.vertices.length > 0}
      <div class="row">
        <button
          type="button"
          data-testid="property-cover-highlight"
          class:active={highlightMode === 'cover'}
          onclick={toggleCoverHighlight}
        >
          {highlightMode === 'cover' ? '取消高亮' : '高亮最小点覆盖'}
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .properties {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section-title {
    font-size: 12px;
    color: var(--text-dim);
  }

  .line {
    font-size: 12px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-dim);
  }

  .row {
    display: flex;
    gap: 6px;
  }

  .row button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
