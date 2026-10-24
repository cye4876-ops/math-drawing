<script lang="ts">
  /**
   * 极值计算台 · 结果检查器（v3.11）：
   * 把搜索结论、证书、极图画廊与饱和图从左侧长表单移到右侧检查器。
   */
  import {
    hyperLab,
    EXTREMAL_GALLERY_PAGE_SIZE,
    setGalleryPage,
    showExtremalGraph,
    showSaturationGraph,
  } from '../state/hyper-state.svelte'
  import { atlasEdgeList } from '../extremal/atlas'
  import { graphInvariants } from '../extremal/analysis'

  let {
    onOpenGraph,
  }: {
    onOpenGraph?: (payload: { name: string; n: number; edges: Array<[number, number]> }) => void
  } = $props()

  const extremal = $derived(hyperLab.extremal)
  const selectedCandidate = $derived(extremal.result?.extremal[extremal.selectedExtremal] ?? null)
  const selectedInvariants = $derived(selectedCandidate ? graphInvariants(selectedCandidate) : null)
  const galleryPageCount = $derived(
    Math.max(1, Math.ceil((extremal.result?.extremal.length ?? 0) / EXTREMAL_GALLERY_PAGE_SIZE)),
  )
  const galleryPageStart = $derived(extremal.galleryPage * EXTREMAL_GALLERY_PAGE_SIZE)
  const galleryCandidates = $derived(
    extremal.result?.extremal.slice(
      galleryPageStart,
      galleryPageStart + EXTREMAL_GALLERY_PAGE_SIZE,
    ) ?? [],
  )
  const previewSelectionInfo = $derived.by(() => {
    const preview = extremal.preview
    const selection = extremal.previewSelection
    if (!preview || !selection) return null
    if (selection.kind === 'vertex') {
      const incident = preview.edges
        .map(([u, v], index) => ({ u, v, index }))
        .filter((edge) => edge.u === selection.index || edge.v === selection.index)
      return {
        title: `顶点 ${selection.index}`,
        lines: [
          `度 = ${incident.length}`,
          `关联边：${incident.map((edge) => `${edge.u}–${edge.v}`).join('、') || '无'}`,
        ],
      }
    }
    const edge = preview.edges[selection.index]
    if (!edge) return null
    return { title: `边 ${edge[0]}–${edge[1]}`, lines: [`在预览中的边下标 = ${selection.index}`] }
  })

  function loadSelectedToGraph(): void {
    if (!selectedCandidate || !onOpenGraph) return
    onOpenGraph({
      name: `极值图 · ${extremal.result?.patternLabel ?? 'ex(n,F)'}`,
      n: selectedCandidate.n,
      edges: atlasEdgeList(selectedCandidate),
    })
  }
</script>

<section class="result-panel" data-testid="extremal-results" aria-label="极值结果">
  <div class="panel-title">
    <strong>极值结果</strong>
    <span>ex(n, F)</span>
  </div>

  {#if extremal.result}
    <div class="selection" data-testid="extremal-certificate">
      <strong>证书卡片</strong>
      {#if extremal.result.known}
        <div>定理：{extremal.result.known.formula}</div>
        <div>
          {extremal.result.known.kind === 'mantel'
            ? 'Mantel 证明思路：取一条边 uv，其余顶点不能同时邻接 u、v；按 d(u)+d(v) ≤ n 计数即可得上界，T₂(n) 达到。'
            : 'Turán 证明思路：对 K_{k}-free 图按边数归纳，取最大团/非邻接关系，构造完全 (k−1) 部图达到上界。'}
        </div>
        <div>
          精确搜索 {extremal.result.maxEdges} vs 公式 {extremal.result.known.value}：
          {extremal.result.maxEdges === extremal.result.known.value
            ? '一致'
            : '不一致（请检查语义/结构约束）'}。
        </div>
      {:else if extremal.result.lowerBound}
        <div>
          Turán 构造下界：T{extremal.result.lowerBound.parts}(n) 有
          {extremal.result.lowerBound.edges} 条边，且同时不含所有选中禁图。
        </div>
      {:else if extremal.result.patternCount > 1}
        <div>多禁图没有单一 Turán 闭式；下面的下界只来自实际检查过的 Turán 构造。</div>
      {:else}
        <div>当前禁图没有内置闭式；精确值以图集穷举为准。</div>
      {/if}
      {#if selectedCandidate}
        <div>
          极图 #{extremal.selectedExtremal + 1}：
          {selectedCandidate.maximality.maximal
            ? `结构约束内极大，${selectedCandidate.maximality.addableEdges} 条可加入边全部产生禁图`
            : `非极大，反例边 (${selectedCandidate.maximality.witnessEdge?.join(',') ?? '?'})`}。
        </div>
        {#if selectedCandidate.stability}
          <div>与 Turán 构造：{selectedCandidate.stability.note}</div>
        {/if}
      {/if}
    </div>

    {#if selectedCandidate}
      <div class="line" data-testid="extremal-maximality">
        {#if selectedCandidate.maximality.maximal}
          极大性证书：<b>通过</b>（结构约束内 {selectedCandidate.maximality.addableEdges}
          条可加入边都会产生禁图
          {#if selectedCandidate.maximality.blockedByFilters > 0}
            ；另有 {selectedCandidate.maximality.blockedByFilters} 条被约束阻止
          {/if}）
        {:else}
          非极大：缺失边 ({selectedCandidate.maximality.witnessEdge?.join(',') ?? '?'})
          加入后仍不含禁图
        {/if}
      </div>
      {#if selectedCandidate.stability}
        <div class="hint" data-testid="extremal-stability">
          稳定性：χ = {selectedCandidate.stability.chromatic}，{selectedCandidate.stability.note}
        </div>
      {/if}
    {/if}

    <div class="hint">{extremal.previewNote}</div>
    <div class="hint" data-testid="extremal-preview-title">
      当前预览：{extremal.preview?.title ?? '无'}
    </div>
    {#if previewSelectionInfo}
      <div class="selection" data-testid="extremal-canvas-selection">
        <strong>{previewSelectionInfo.title}</strong>
        {#each previewSelectionInfo.lines as line (line)}
          <div>{line}</div>
        {/each}
      </div>
    {:else}
      <div class="hint">悬停 / 点击画布上的顶点或边可查看局部信息。</div>
    {/if}

    {#if extremal.result.extremal.length > 0}
      <div class="gallery-head">
        <strong>极图画廊</strong>
        <span
          >第 {extremal.galleryPage + 1} / {galleryPageCount} 页 · 共
          {extremal.result.extremal.length} 个</span
        >
      </div>
      <div class="row wrap">
        <button
          type="button"
          data-testid="extremal-gallery-prev"
          disabled={extremal.galleryPage <= 0}
          onclick={() => setGalleryPage(extremal.galleryPage - 1)}>上一页</button
        >
        <button
          type="button"
          data-testid="extremal-gallery-next"
          disabled={extremal.galleryPage >= galleryPageCount - 1}
          onclick={() => setGalleryPage(extremal.galleryPage + 1)}>下一页</button
        >
      </div>
      <div class="row wrap">
        {#each galleryCandidates as graph, offset (graph.graph6)}
          {@const index = galleryPageStart + offset}
          <button
            type="button"
            class:active={extremal.selectedExtremal === index}
            data-testid={`extremal-graph-${index}`}
            onclick={() => showExtremalGraph(index)}>极图 #{index + 1}</button
          >
        {/each}
      </div>
      {#if selectedCandidate}
        <div class="selection" data-testid="extremal-graph-info">
          <strong>极图 #{extremal.selectedExtremal + 1}</strong>
          <div>
            n = {selectedCandidate.n} · m = {selectedCandidate.m} · graph6
            <code>{selectedCandidate.graph6}</code>
          </div>
          <div>
            度序列 [{selectedCandidate.degrees.join(', ')}] · χ =
            {selectedInvariants?.chromatic ?? '—'} · ω =
            {selectedInvariants?.clique ?? '—'} · α =
            {selectedInvariants?.independence ?? '—'}
          </div>
        </div>
        <button
          type="button"
          class="primary"
          data-testid="extremal-load-graph"
          disabled={!onOpenGraph}
          onclick={loadSelectedToGraph}>载入图论画布</button
        >
      {/if}
    {/if}

    {#if extremal.result.saturation}
      <div class="line" data-testid="extremal-saturation">
        sat({extremal.result.n}, {extremal.result.patternLabel}) =
        {#if extremal.result.saturation.value === null}
          <b>未找到</b>
        {:else}
          <b>{extremal.result.saturation.value}</b>
        {/if}
        · {extremal.result.saturation.count} 个最小饱和图
      </div>
      <div class="hint">{extremal.result.saturation.note}</div>
      {#if extremal.result.saturation.examples.length > 0}
        <div class="row wrap">
          {#each extremal.result.saturation.examples as graph, index (graph.graph6)}
            <button
              type="button"
              data-testid={`extremal-sat-${index}`}
              onclick={() => showSaturationGraph(index)}>饱和图 #{index + 1}（{graph.m} 边）</button
            >
          {/each}
        </div>
      {/if}
    {/if}
  {:else}
    <p class="hint">
      在左侧设置 n 与禁图，点击「计算 ex」后，结果、证书、极图画廊与饱和图会显示在这里。
    </p>
  {/if}
</section>

<style>
  .result-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-panel);
  }

  .panel-title,
  .gallery-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .panel-title {
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }

  .panel-title strong,
  .gallery-head strong {
    font-size: 13px;
  }

  .panel-title span,
  .gallery-head span {
    color: var(--text-dim);
    font-size: 10px;
  }

  .line {
    font-size: 11px;
    line-height: 1.55;
  }

  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: 10.5px;
    line-height: 1.55;
  }

  .selection {
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    background: var(--accent-soft);
    border-radius: 8px;
    padding: 7px 8px;
    font-size: 11px;
    line-height: 1.6;
  }

  .selection strong {
    display: block;
    margin-bottom: 3px;
  }

  .selection code {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 10px;
    word-break: break-all;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .row.wrap {
    flex-wrap: wrap;
  }

  .row button,
  .primary {
    font: inherit;
    font-size: 10.5px;
    padding: 3px 7px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
  }

  .row button:hover:not(:disabled),
  .primary:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  .row button.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 650;
  }

  .row button:disabled,
  .primary:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .primary {
    align-self: flex-start;
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  .primary:hover:not(:disabled) {
    color: #fff;
    filter: brightness(1.08);
  }
</style>
