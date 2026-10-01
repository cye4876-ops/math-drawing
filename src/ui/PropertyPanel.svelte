<script lang="ts">
  /**
   * 图的性质面板（v0.5）：连通性 / 二分性 / 欧拉路 / 平面性（K5、K3,3 禁用子图检测）。
   * 非平面且找到禁用子图证据时，可一键在画布上高亮证据顶点（琥珀）。
   * 计算缓存：仅在图结构变化时重算（拖动坐标不触发）。
   */
  import type { GraphObject } from '../graph/model'
  import type { SceneHighlight } from '../render/element-registry'
  import { computeProperties, type GraphProperties } from '../graph/properties'
  import { structuralKey } from '../graph/structural-key'

  let {
    graph,
    onHighlight,
  }: {
    graph: GraphObject | null
    onHighlight: (highlight: SceneHighlight | null) => void
  } = $props()

  let properties = $state<GraphProperties | null>(null)
  let highlightOn = $state(false)
  let lastKey: string | null = null

  const structureKeyValue = $derived(graph ? structuralKey(graph) : '')

  $effect(() => {
    const key = structureKeyValue
    if (key === lastKey) return
    lastKey = key
    highlightOn = false
    onHighlight(null)
    properties = graph ? computeProperties(graph) : null
  })

  function toggleEvidence(): void {
    const evidence = properties?.planar.evidence
    if (!evidence) return
    if (highlightOn) {
      highlightOn = false
      onHighlight(null)
      return
    }
    highlightOn = true
    onHighlight({ nodes: evidence })
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
    {#if properties.planar.evidence}
      <div class="row">
        <button
          type="button"
          data-testid="property-highlight"
          class:active={highlightOn}
          onclick={toggleEvidence}
        >
          {highlightOn ? '取消高亮' : '高亮禁用子图证据'}
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
