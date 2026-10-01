<script lang="ts">
  /**
   * 边列表（v0.5）：列出全部边并**直接编辑权重**（给边赋权的主入口之一；另一种是 DSL `A-B:3`）。
   * 输入为草稿态（oninput 只改草稿），回车/失焦时一次性提交（单步撤销）；
   * ✕ 清除权重（回到无权边）；权重修改会触发 DSL 文本回写（结构签名含权重）。
   */
  import type { AppStore } from '../state/store'
  import type { GraphEdgeData, GraphObject } from '../graph/model'

  let {
    store,
    graph,
  }: {
    store: AppStore
    graph: GraphObject | null
  } = $props()

  /** 权重草稿（边 id → 输入框文本）；空 = 无草稿（显示文档值） */
  let drafts = $state<Record<string, string>>({})

  function labelOf(id: string): string {
    return graph?.nodes.find((node) => node.id === id)?.label ?? id
  }

  function draftOf(edge: GraphEdgeData): string {
    const draft = drafts[edge.id]
    if (draft !== undefined) return draft
    return edge.weight === null ? '' : String(edge.weight)
  }

  function setDraft(edgeId: string, value: string): void {
    drafts = { ...drafts, [edgeId]: value }
  }

  function clearDraft(edgeId: string): void {
    const next = { ...drafts }
    delete next[edgeId]
    drafts = next
  }

  /** 解析草稿为权重（空 = null 无权）；非法输入返回 undefined（不提交） */
  function parseWeight(raw: string): number | null | undefined {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : undefined
  }

  function commitWeight(edge: GraphEdgeData): void {
    const current = graph
    if (!current) return
    const weight = parseWeight(draftOf(edge))
    if (weight === undefined) return // 非法输入：保留草稿待修正
    if (weight === (edge.weight ?? null)) {
      clearDraft(edge.id)
      return
    }
    const edges = current.edges.map((item) => (item.id === edge.id ? { ...item, weight } : item))
    store.updateGraph(current.id, { edges })
    clearDraft(edge.id)
  }

  function clearWeight(edge: GraphEdgeData): void {
    const current = graph
    if (!current) return
    const edges = current.edges.map((item) =>
      item.id === edge.id ? { ...item, weight: null } : item,
    )
    store.updateGraph(current.id, { edges })
    clearDraft(edge.id)
  }
</script>

<div class="edge-list" data-testid="edge-panel">
  <div class="section-title">边（{graph?.edges.length ?? 0}）</div>
  {#if !graph || graph.edges.length === 0}
    <div class="hint">暂无边：用「图编辑」连边，或 DSL 输入（如 A-B:3）</div>
  {:else}
    <div class="edges">
      {#each graph.edges as edge, index (edge.id)}
        <div class="edge-row" data-testid="edge-item">
          <span
            class="pair"
            title={`${labelOf(edge.source)} ${edge.directed ? '→' : '—'} ${labelOf(edge.target)}`}
          >
            {labelOf(edge.source)}
            {edge.directed ? '→' : '—'}
            {labelOf(edge.target)}
          </span>
          <input
            class="weight"
            data-testid={`edge-weight-${index}`}
            type="number"
            step="any"
            placeholder="无权"
            value={draftOf(edge)}
            oninput={(event) => setDraft(edge.id, (event.currentTarget as HTMLInputElement).value)}
            onblur={() => commitWeight(edge)}
            onkeydown={(event) => {
              if (event.key === 'Enter') commitWeight(edge)
            }}
          />
          <button
            type="button"
            class="clear"
            data-testid={`edge-clear-${index}`}
            title="清除权重（回到无权边）"
            disabled={edge.weight === null && draftOf(edge) === ''}
            onclick={() => clearWeight(edge)}>✕</button
          >
        </div>
      {/each}
    </div>
    <div class="hint">回车或失焦提交；权重将用于最短路/MST/最大流等算法</div>
  {/if}
</div>

<style>
  .edge-list {
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

  .edges {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 160px;
    overflow-y: auto;
  }

  .edge-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pair {
    flex: 1;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .weight {
    width: 64px;
    font-size: 12px;
  }

  .clear {
    min-width: 24px;
    padding: 0 4px;
    font-size: 11px;
  }
</style>
