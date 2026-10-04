<script lang="ts">
  /**
   * 图论实验台面板（v2.7）：
   * 搜索（普通图条件搜索）/ 超图（构造·分析·搜索·禁超图）/ 比较 / 档案。
   * 结果在舞台的 LabView 呈现；搜索在 Worker 中运行。
   */
  import type { AppStore } from '../../state/store'
  import {
    labState,
    runGraphSearchAction,
    cancelGraphSearch,
    runHyperSearchAction,
    cancelHyperSearch,
    analyzeAction,
    compareAction,
    saveGraphResultToArchive,
    saveHyperResultToArchive,
    saveAnalysisAsConstruction,
    saveCompareToArchive,
    exportArchiveAction,
    importArchiveAction,
    deleteExperiment,
    deleteConstruction,
    deleteComparison,
    recomputeExperiment,
    updateExperimentNotes,
    sendHypergraphToCustomForbidden,
    getArchive,
  } from '../../state/lab-state.svelte'
  import { FORBIDDEN_KEYS, FORBIDDEN_NAMES, searchPlanRows } from './lab-helpers'
  import type { GraphSpec } from '../../lab/spec'
  import { hyperOrderPlan, type HyperSpec } from '../../lab/hyper-spec'
  import type { LabExperiment } from '../../lab/archive'
  import { toGraph6 } from '../../lab/graph6'
  import { addEdgeAt, emptyGraph } from '../../lab/graph'
  import { constructHypergraph } from '../../lab/hypergraph'
  import type { GraphObject } from '../../graph/model'

  let { store }: { store: AppStore } = $props()

  let degreeSeqText = $state('')
  let archiveFileInput = $state<HTMLInputElement | null>(null)
  let experiments = $derived.by(() => {
    void labState.archiveVersion
    return getArchive().snapshot().experiments
  })
  let constructions = $derived.by(() => {
    void labState.archiveVersion
    return getArchive().snapshot().constructions
  })
  let comparisons = $derived.by(() => {
    void labState.archiveVersion
    return getArchive().snapshot().comparisons
  })
  let notesEditing = $state('')
  let notesEditingId = $state('')

  const graphPlan = $derived.by(() => {
    try {
      return searchPlanRows(labState.graphSpec)
    } catch {
      return null
    }
  })

  function currentGraphObject(): GraphObject | null {
    return (
      store
        .getState()
        .doc.objects.find((object): object is GraphObject => object.type === 'graph') ?? null
    )
  }

  /** 把画布上的图转成 graph6（要求无向、无自环、无重边、≤16 点） */
  function currentGraphAsGraph6(): string | null {
    const graph = currentGraphObject()
    if (!graph || graph.nodes.length === 0 || graph.nodes.length > 16) return null
    const index = new Map(graph.nodes.map((node, i) => [node.id, i]))
    const lab = emptyGraph(graph.nodes.length)
    for (const edge of graph.edges) {
      const u = index.get(edge.source)
      const v = index.get(edge.target)
      if (u === undefined || v === undefined || u === v) return null
      if (edge.directed) return null
      addEdgeAt(lab, Math.min(u, v), Math.max(u, v))
    }
    return toGraph6(lab)
  }

  function useCurrentGraphAsForbidden(): void {
    const text = currentGraphAsGraph6()
    if (!text || (currentGraphObject()?.nodes.length ?? 0) > 10) {
      labState.graphError = '当前图需为无向简单图且不超过 10 个顶点，才能作为自定义禁图'
      return
    }
    labState.graphSpec.customForbidden = text
    labState.graphError = ''
  }

  function applyGraphTemplate(template: 'edges' | 'spectral' | 'counter' | 'c4' | 'n8'): void {
    const base: GraphSpec = {
      ...labState.graphSpec,
      forbidden: ['K3'],
      forbiddenMode: 'subgraph',
      customForbidden: '',
      connected: 'any',
      bipartite: 'any',
      minDegree: null,
      maxDegree: null,
      minEdges: null,
      maxEdges: null,
      degreeSequence: [],
      strategy: 'auto',
    }
    if (template === 'edges') {
      labState.graphSpec = {
        ...base,
        title: '无三角形图的边数极值',
        nMin: 6,
        nMax: 6,
        objective: 'max_edges',
        claim: 'bipartite',
      }
    } else if (template === 'spectral') {
      labState.graphSpec = {
        ...base,
        title: '无三角形图的谱极值',
        nMin: 6,
        nMax: 6,
        objective: 'max_spectral_radius',
        claim: 'bipartite',
      }
    } else if (template === 'counter') {
      labState.graphSpec = {
        ...base,
        title: '寻找一个反例',
        nMin: 3,
        nMax: 7,
        objective: 'counterexample',
        claim: 'bipartite',
      }
    } else if (template === 'c4') {
      labState.graphSpec = {
        ...base,
        title: '无普通 C₄ 的边数极值',
        nMin: 7,
        nMax: 7,
        forbidden: ['C4'],
        objective: 'max_edges',
        claim: 'bipartite',
      }
    } else {
      labState.graphSpec = {
        ...base,
        title: '无三角形图的边数极值（8 阶）',
        nMin: 8,
        nMax: 8,
        objective: 'max_edges',
        claim: 'bipartite',
      }
    }
    degreeSeqText = ''
  }

  function applyHyperTemplate(template: 'linear6' | 'linear7' | 'tau' | 'tauLinear'): void {
    const base: HyperSpec = {
      ...labState.hyperSpec,
      r: 3,
      forbidden: [],
      customForbidden: [],
      forbiddenMode: 'subgraph',
      connected: 'any',
      minEdges: null,
      maxEdges: null,
      minDegree: null,
      maxDegree: null,
      maxCodegree: null,
      strategy: 'auto',
    }
    if (template === 'linear6') {
      labState.hyperSpec = {
        ...base,
        title: '线性 3 一致超图的边数极值（六点）',
        nMin: 6,
        nMax: 6,
        linear: 'yes',
        objective: 'max_edges',
      }
    } else if (template === 'linear7') {
      labState.hyperSpec = {
        ...base,
        title: '线性 3 一致超图的边数极值（七点）',
        nMin: 7,
        nMax: 7,
        linear: 'yes',
        objective: 'max_edges',
      }
    } else if (template === 'tau') {
      labState.hyperSpec = {
        ...base,
        title: '检验 τ ≤ ν（三一致）',
        nMin: 3,
        nMax: 6,
        linear: 'any',
        objective: 'counterexample',
        claim: 'tau <= nu',
      }
    } else {
      labState.hyperSpec = {
        ...base,
        title: '线性 τ ≤ ν（三一致）',
        nMin: 3,
        nMax: 6,
        linear: 'yes',
        objective: 'counterexample',
        claim: 'tau <= nu',
      }
    }
  }

  function commitDegreeSequence(): void {
    const raw = degreeSeqText.trim()
    if (!raw) {
      labState.graphSpec.degreeSequence = []
      return
    }
    const values = raw
      .split(/[\s,，]+/)
      .filter(Boolean)
      .map((part) => Number(part))
    if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 15)) {
      labState.graphError = '度序列须为 0–15 的整数列表'
      return
    }
    labState.graphSpec.degreeSequence = values
    labState.graphError = ''
  }

  function hyperPlanRows(spec: HyperSpec): Array<{ n: number; min: number; max: number }> | null {
    try {
      const rows: Array<{ n: number; min: number; max: number }> = []
      for (let n = spec.nMin; n <= spec.nMax; n++) {
        const plan = hyperOrderPlan(n, spec)
        rows.push({ n, min: plan.edgeMin, max: plan.edgeMax })
      }
      return rows
    } catch {
      return null
    }
  }

  const hyperPlan = $derived.by(() => hyperPlanRows(labState.hyperSpec))

  function toggleForbidden(key: (typeof FORBIDDEN_KEYS)[number]): void {
    const list = labState.graphSpec.forbidden
    labState.graphSpec.forbidden = list.includes(key)
      ? list.filter((item) => item !== key)
      : [...list, key]
  }

  function toggleHyperForbidden(key: 'K4_3' | 'loose_triangle'): void {
    const list = labState.hyperSpec.forbidden
    labState.hyperSpec.forbidden = list.includes(key)
      ? list.filter((item) => item !== key)
      : [...list, key]
  }

  function addCustomHyperPattern(title: string, n: number, text: string): boolean {
    try {
      const edges = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) =>
          line
            .split(/[\s,，]+/)
            .filter(Boolean)
            .map(Number),
        )
      if (labState.hyperSpec.customForbidden.length >= 3) return false
      labState.hyperSpec.customForbidden = [
        ...labState.hyperSpec.customForbidden,
        {
          title: title || `自定义禁超图 ${labState.hyperSpec.customForbidden.length + 1}`,
          n,
          edges,
        },
      ]
      return true
    } catch {
      return false
    }
  }

  function removeCustomHyperPattern(index: number): void {
    labState.hyperSpec.customForbidden = labState.hyperSpec.customForbidden.filter(
      (_, i) => i !== index,
    )
  }

  function addForbiddenFromAnalysis(): void {
    if (!labState.analysis) return
    sendHypergraphToCustomForbidden(
      { n: labState.analysis.n, edges: labState.analysis.edges },
      `分析结果 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`,
    )
  }

  function fillCompareFromAnalysis(side: 'left' | 'right'): void {
    if (!labState.analysis) return
    const text = labState.analysis.edges.map((edge) => edge.join(' ')).join('\n')
    if (side === 'left') {
      labState.compareLeftN = labState.analysis.n
      labState.compareLeftEdges = text
    } else {
      labState.compareRightN = labState.analysis.n
      labState.compareRightEdges = text
    }
  }

  function openExperiment(experiment: LabExperiment): void {
    labState.tab = experiment.kind === 'graph' ? 'search' : 'hyper'
    labState.archiveNotice = `查看档案：${experiment.title}（${new Date(experiment.createdAt).toLocaleString('zh-CN', { hour12: false })}）`
    labState.viewingExperimentId = experiment.id
  }

  let customPatternTitle = $state('')
  let customPatternN = $state(4)
  let customPatternEdges = $state('')
  let customPatternError = $state('')

  function submitCustomPattern(): void {
    const ok = addCustomHyperPattern(customPatternTitle, customPatternN, customPatternEdges)
    if (!ok) customPatternError = '无法添加：需 ≤3 个、顶点 1–7、每行一条非空超边'
    else {
      customPatternError = ''
      customPatternTitle = ''
      customPatternEdges = ''
      labState.tab = 'hyper'
    }
  }
</script>

<div class="lab-panel" data-testid="lab-panel">
  <div class="lab-tabs" role="tablist" aria-label="实验台分区">
    <button
      type="button"
      class:active={labState.tab === 'search'}
      data-testid="lab-tab-search"
      onclick={() => (labState.tab = 'search')}>搜索</button
    >
    <button
      type="button"
      class:active={labState.tab === 'hyper'}
      data-testid="lab-tab-hyper"
      onclick={() => (labState.tab = 'hyper')}>超图</button
    >
    <button
      type="button"
      class:active={labState.tab === 'compare'}
      data-testid="lab-tab-compare"
      onclick={() => (labState.tab = 'compare')}>比较</button
    >
    <button
      type="button"
      class:active={labState.tab === 'archive'}
      data-testid="lab-tab-archive"
      onclick={() => (labState.tab = 'archive')}>档案</button
    >
  </div>

  {#if labState.tab === 'search'}
    <div class="lab-section">
      <div class="lab-templates">
        <span class="templates-label">入门模板</span>
        <button type="button" onclick={() => applyGraphTemplate('edges')}
          >无三角形 · 边数极值</button
        >
        <button type="button" onclick={() => applyGraphTemplate('spectral')}
          >无三角形 · 谱极值</button
        >
        <button type="button" onclick={() => applyGraphTemplate('counter')}>寻找一个反例</button>
        <button type="button" onclick={() => applyGraphTemplate('c4')}>无 C₄ · 边数极值</button>
        <button type="button" onclick={() => applyGraphTemplate('n8')}>8 阶无三角形</button>
      </div>

      <label class="field">
        <span>实验名称</span>
        <input type="text" data-testid="lab-graph-title" bind:value={labState.graphSpec.title} />
      </label>

      <div class="row">
        <label class="field small">
          <span>顶点数下限</span>
          <input type="number" min="1" max="16" bind:value={labState.graphSpec.nMin} />
        </label>
        <label class="field small">
          <span>顶点数上限</span>
          <input type="number" min="1" max="16" bind:value={labState.graphSpec.nMax} />
        </label>
      </div>

      <div class="row">
        <label class="field">
          <span>搜索目标</span>
          <select bind:value={labState.graphSpec.objective}>
            <option value="max_edges">最大边数</option>
            <option value="max_spectral_radius">最大邻接谱半径</option>
            <option value="counterexample">寻找反例（猜想为假）</option>
          </select>
        </label>
        <label class="field">
          <span>搜索方式</span>
          <select bind:value={labState.graphSpec.strategy}>
            <option value="auto">智能精确搜索</option>
            <option value="enumerate">逐图枚举</option>
          </select>
        </label>
      </div>

      {#if labState.graphSpec.objective === 'counterexample'}
        <label class="field">
          <span>猜想（返回真/假）</span>
          <input
            type="text"
            data-testid="lab-graph-claim"
            placeholder="如 m <= n**2/4 或 bipartite"
            bind:value={labState.graphSpec.claim}
          />
          <em class="hint"
            >变量：n m delta Delta omega alpha nu rho q lambda2 triangles bipartite connected
            regular</em
          >
        </label>
      {/if}

      <details class="details">
        <summary>禁图与图性质</summary>
        <div class="chips">
          {#each FORBIDDEN_KEYS as key (key)}
            <button
              type="button"
              class="chip"
              class:active={labState.graphSpec.forbidden.includes(key)}
              onclick={() => toggleForbidden(key)}>{FORBIDDEN_NAMES[key]}</button
            >
          {/each}
        </div>
        <div class="row">
          <label class="field">
            <span>禁图含义</span>
            <select bind:value={labState.graphSpec.forbiddenMode}>
              <option value="subgraph">普通子图（允许额外边）</option>
              <option value="induced">顶点诱导子图（恰等）</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>自定义禁图（graph6，≤10 点）</span>
          <div class="inline">
            <input
              type="text"
              placeholder="如 C~"
              bind:value={labState.graphSpec.customForbidden}
            />
            <button type="button" title="把画布中的图设为禁图" onclick={useCurrentGraphAsForbidden}>
              用画布图
            </button>
          </div>
        </label>
        <div class="row">
          <label class="field">
            <span>连通性</span>
            <select bind:value={labState.graphSpec.connected}>
              <option value="any">不限</option>
              <option value="yes">要求连通</option>
              <option value="no">要求不连通</option>
            </select>
          </label>
          <label class="field">
            <span>二部性</span>
            <select bind:value={labState.graphSpec.bipartite}>
              <option value="any">不限</option>
              <option value="yes">要求二部</option>
              <option value="no">要求非二部</option>
            </select>
          </label>
        </div>
      </details>

      <details class="details">
        <summary>度与边数条件</summary>
        <div class="row">
          <label class="field small">
            <span>最小度 δ ≥</span>
            <input type="number" min="0" max="15" bind:value={labState.graphSpec.minDegree} />
          </label>
          <label class="field small">
            <span>最大度 Δ ≤</span>
            <input type="number" min="0" max="15" bind:value={labState.graphSpec.maxDegree} />
          </label>
        </div>
        <div class="row">
          <label class="field small">
            <span>边数 ≥</span>
            <input type="number" min="0" max="120" bind:value={labState.graphSpec.minEdges} />
          </label>
          <label class="field small">
            <span>边数 ≤</span>
            <input type="number" min="0" max="120" bind:value={labState.graphSpec.maxEdges} />
          </label>
        </div>
        <label class="field">
          <span>固定度序列（降序，逗号分隔）</span>
          <input
            type="text"
            placeholder="如 3, 3, 2, 2"
            bind:value={degreeSeqText}
            onchange={commitDegreeSequence}
          />
        </label>
      </details>

      <details class="details">
        <summary>预算</summary>
        <div class="row">
          <label class="field small">
            <span>时间预算（秒）</span>
            <input type="number" min="1" max="1800" bind:value={labState.graphSpec.timeLimit} />
          </label>
          <label class="field small">
            <span>生成预算（节点）</span>
            <input
              type="number"
              min="10000"
              max="200000000"
              step="1000000"
              bind:value={labState.graphSpec.nodeBudget}
            />
          </label>
        </div>
        <em class="hint">
          浏览器版在本地穷举标号图；建议 ≤8
          阶（预算内未完成会标注“未完成”）。更大规模请使用原实验台（Sage/nauty）。
        </em>
      </details>

      {#if graphPlan}
        <div class="plan" data-testid="lab-graph-plan">
          <span class="plan-title">计划预览（数学界）</span>
          {#each graphPlan as row (row.n)}
            <div class="plan-row">
              <span>n = {row.n}</span>
              <span class={row.min > row.max ? 'plan-bad' : ''}>
                {row.min > row.max ? '不可行（边界冲突）' : `边数 ${row.min} … ${row.max}`}
              </span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="actions">
        {#if labState.graphRunning}
          <button
            type="button"
            class="btn-primary"
            data-testid="lab-graph-stop"
            onclick={cancelGraphSearch}>停止</button
          >
        {:else}
          <button
            type="button"
            class="btn-primary"
            data-testid="lab-graph-run"
            onclick={runGraphSearchAction}
          >
            开始搜索
          </button>
        {/if}
        {#if labState.graphResult}
          <button type="button" data-testid="lab-graph-archive" onclick={saveGraphResultToArchive}
            >保存到档案</button
          >
        {/if}
      </div>

      {#if labState.graphRunning && labState.graphProgress}
        <div class="progress" data-testid="lab-graph-progress">
          n={labState.graphProgress.n}{labState.graphProgress.currentM !== null
            ? ` · m=${labState.graphProgress.currentM}`
            : ''}
          · 检查 {labState.graphProgress.checked} · 可行 {labState.graphProgress.feasible} · 节点 {labState.graphProgress.nodes.toLocaleString()}
          · {labState.graphProgress.elapsed}s
        </div>
      {/if}
      {#if labState.graphError}
        <div class="error" data-testid="lab-graph-error">{labState.graphError}</div>
      {/if}
    </div>
  {:else if labState.tab === 'hyper'}
    <div class="lab-section">
      <div class="lab-templates">
        <span class="templates-label">入门模板</span>
        <button type="button" onclick={() => applyHyperTemplate('linear6')}>六点线性极值</button>
        <button type="button" onclick={() => applyHyperTemplate('linear7')}>七点线性极值</button>
        <button type="button" onclick={() => applyHyperTemplate('tau')}>检验 τ≤ν</button>
        <button type="button" onclick={() => applyHyperTemplate('tauLinear')}>线性 τ≤ν</button>
      </div>

      <h3>构造与分析</h3>
      <div class="row">
        <label class="field small">
          <span>顶点数 n</span>
          <input type="number" min="1" max="20" bind:value={labState.analysisN} />
        </label>
        <label class="field small">
          <span>构造</span>
          <select
            onchange={(event) => {
              const value = (event.currentTarget as HTMLSelectElement).value
              if (!value) return
              const r = labState.hyperSpec.r
              try {
                const h = constructHypergraph(
                  value as 'empty' | 'complete' | 'star' | 'matching' | 'fano',
                  labState.analysisN,
                  Math.min(r, labState.analysisN),
                )
                labState.analysisEdges = h.edges.map((edge) => edge.join(' ')).join('\n')
                analyzeAction()
              } catch (error) {
                labState.analysisError = error instanceof Error ? error.message : String(error)
              }
              ;(event.currentTarget as HTMLSelectElement).value = ''
            }}
          >
            <option value="">选择内置构造…</option>
            <option value="fano">Fano 平面</option>
            <option value="complete">完全 r 一致</option>
            <option value="star">含顶点 0 的星</option>
            <option value="matching">不交超边</option>
            <option value="empty">空超图</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span>超边列表（每行一条，如 0 1 2）</span>
        <textarea rows="6" data-testid="lab-analysis-edges" bind:value={labState.analysisEdges}
        ></textarea>
      </label>
      <div class="actions">
        <button
          type="button"
          class="btn-primary"
          data-testid="lab-analysis-run"
          onclick={analyzeAction}>分析</button
        >
        {#if labState.analysis}
          <button type="button" data-testid="lab-analysis-save" onclick={saveAnalysisAsConstruction}
            >保存构造</button
          >
          <button type="button" onclick={addForbiddenFromAnalysis}>加入禁超图</button>
        {/if}
      </div>
      {#if labState.analysisError}
        <div class="error" data-testid="lab-analysis-error">{labState.analysisError}</div>
      {/if}

      <h3>极值与反例搜索</h3>
      <label class="field">
        <span>实验名称</span>
        <input type="text" bind:value={labState.hyperSpec.title} />
      </label>
      <div class="row">
        <label class="field small">
          <span>顶点数下限</span>
          <input type="number" min="2" max="12" bind:value={labState.hyperSpec.nMin} />
        </label>
        <label class="field small">
          <span>顶点数上限</span>
          <input type="number" min="2" max="12" bind:value={labState.hyperSpec.nMax} />
        </label>
        <label class="field small">
          <span>一致阶数 r</span>
          <select bind:value={labState.hyperSpec.r}>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label class="field">
          <span>搜索目标</span>
          <select bind:value={labState.hyperSpec.objective}>
            <option value="max_edges">最大超边数</option>
            <option value="counterexample">寻找反例</option>
          </select>
        </label>
        <label class="field">
          <span>搜索方式</span>
          <select bind:value={labState.hyperSpec.strategy}>
            <option value="auto">智能精确搜索</option>
            <option value="enumerate">逐层扩展</option>
          </select>
        </label>
      </div>
      {#if labState.hyperSpec.objective === 'counterexample'}
        <label class="field">
          <span>猜想</span>
          <input
            type="text"
            data-testid="lab-hyper-claim"
            placeholder="如 tau <= nu"
            bind:value={labState.hyperSpec.claim}
          />
          <em class="hint"
            >变量：n m r rank delta Delta nu tau alpha codegree linear connected regular</em
          >
        </label>
      {/if}
      <div class="row">
        <label class="field">
          <span>线性</span>
          <select bind:value={labState.hyperSpec.linear}>
            <option value="any">不限</option>
            <option value="yes">要求线性</option>
            <option value="no">要求非线性</option>
          </select>
        </label>
        <label class="field">
          <span>连通</span>
          <select bind:value={labState.hyperSpec.connected}>
            <option value="any">不限</option>
            <option value="yes">要求连通</option>
            <option value="no">要求不连通</option>
          </select>
        </label>
      </div>
      {#if labState.hyperSpec.r === 3}
        <div class="chips">
          <button
            type="button"
            class="chip"
            class:active={labState.hyperSpec.forbidden.includes('K4_3')}
            onclick={() => toggleHyperForbidden('K4_3')}>禁 K₄³</button
          >
          <button
            type="button"
            class="chip"
            class:active={labState.hyperSpec.forbidden.includes('loose_triangle')}
            onclick={() => toggleHyperForbidden('loose_triangle')}>禁松三角形</button
          >
        </div>
      {/if}
      <div class="row">
        <label class="field small">
          <span>超边数上限</span>
          <input type="number" min="0" max="80" bind:value={labState.hyperSpec.maxEdges} />
        </label>
        <label class="field small">
          <span>最大度 Δ</span>
          <input type="number" min="0" max="80" bind:value={labState.hyperSpec.maxDegree} />
        </label>
        <label class="field small">
          <span>最大共度</span>
          <input type="number" min="0" max="80" bind:value={labState.hyperSpec.maxCodegree} />
        </label>
      </div>

      <details class="details">
        <summary>自定义禁超图（最多 3 个，≤7 点）</summary>
        {#each labState.hyperSpec.customForbidden as pattern, index (index)}
          <div class="pattern-row">
            <span>{pattern.title}（n={pattern.n}，{pattern.edges.length} 条边）</span>
            <button type="button" onclick={() => removeCustomHyperPattern(index)}>删除</button>
          </div>
        {/each}
        <div class="row">
          <label class="field small">
            <span>名称</span>
            <input type="text" bind:value={customPatternTitle} placeholder="如 单边 012" />
          </label>
          <label class="field small">
            <span>顶点数</span>
            <input type="number" min="2" max="7" bind:value={customPatternN} />
          </label>
        </div>
        <label class="field">
          <span>超边（每行一条）</span>
          <textarea rows="3" bind:value={customPatternEdges} placeholder="0 1 2"></textarea>
        </label>
        <button type="button" onclick={submitCustomPattern}>添加</button>
        {#if customPatternError}<div class="error">{customPatternError}</div>{/if}
        <div class="row">
          <label class="field">
            <span>禁图含义</span>
            <select bind:value={labState.hyperSpec.forbiddenMode}>
              <option value="subgraph">普通包含</option>
              <option value="induced">顶点诱导包含</option>
            </select>
          </label>
        </div>
      </details>

      <details class="details">
        <summary>预算</summary>
        <div class="row">
          <label class="field small">
            <span>时间预算（秒）</span>
            <input type="number" min="1" max="1800" bind:value={labState.hyperSpec.timeLimit} />
          </label>
          <label class="field small">
            <span>生成预算（节点）</span>
            <input
              type="number"
              min="10000"
              max="200000000"
              step="1000000"
              bind:value={labState.hyperSpec.nodeBudget}
            />
          </label>
        </div>
        <em class="hint"
          >浏览器版逐层扩展；建议 r=2/3 且 n ≤ 6–7。原实验台智能搜索（genbg）可到 12 点。</em
        >
      </details>

      {#if hyperPlan}
        <div class="plan" data-testid="lab-hyper-plan">
          <span class="plan-title">计划预览（数学界）</span>
          {#each hyperPlan as row (row.n)}
            <div class="plan-row">
              <span>n = {row.n} · r = {labState.hyperSpec.r}</span>
              <span class={row.min > row.max ? 'plan-bad' : ''}>
                {row.min > row.max ? '不可行（边界冲突）' : `超边 ${row.min} … ${row.max}`}
              </span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="actions">
        {#if labState.hyperRunning}
          <button
            type="button"
            class="btn-primary"
            data-testid="lab-hyper-stop"
            onclick={cancelHyperSearch}>停止</button
          >
        {:else}
          <button
            type="button"
            class="btn-primary"
            data-testid="lab-hyper-run"
            onclick={runHyperSearchAction}
          >
            开始搜索
          </button>
        {/if}
        {#if labState.hyperResult}
          <button type="button" data-testid="lab-hyper-archive" onclick={saveHyperResultToArchive}
            >保存到档案</button
          >
        {/if}
      </div>

      {#if labState.hyperRunning && labState.hyperProgress}
        <div class="progress" data-testid="lab-hyper-progress">
          n={labState.hyperProgress.n}{labState.hyperProgress.currentM !== null
            ? ` · m=${labState.hyperProgress.currentM}`
            : ''}
          · 检查 {labState.hyperProgress.checked} · 可行 {labState.hyperProgress.feasible} · 节点 {labState.hyperProgress.nodes.toLocaleString()}
          · {labState.hyperProgress.elapsed}s
        </div>
      {/if}
      {#if labState.hyperError}
        <div class="error" data-testid="lab-hyper-error">{labState.hyperError}</div>
      {/if}
    </div>
  {:else if labState.tab === 'compare'}
    <div class="lab-section">
      <h3>超图比较</h3>
      <label class="field">
        <span>A · 顶点数</span>
        <input type="number" min="1" max="20" bind:value={labState.compareLeftN} />
      </label>
      <label class="field">
        <span>A · 超边（每行一条）</span>
        <textarea rows="4" bind:value={labState.compareLeftEdges}></textarea>
      </label>
      <button type="button" class="mini" onclick={() => fillCompareFromAnalysis('left')}
        >用分析结果填充 A</button
      >
      <label class="field">
        <span>B · 顶点数</span>
        <input type="number" min="1" max="20" bind:value={labState.compareRightN} />
      </label>
      <label class="field">
        <span>B · 超边（每行一条）</span>
        <textarea rows="4" bind:value={labState.compareRightEdges}></textarea>
      </label>
      <button type="button" class="mini" onclick={() => fillCompareFromAnalysis('right')}
        >用分析结果填充 B</button
      >
      <div class="actions">
        <button
          type="button"
          class="btn-primary"
          data-testid="lab-compare-run"
          onclick={compareAction}>比较</button
        >
        {#if labState.compareResult}
          <button type="button" data-testid="lab-compare-save" onclick={saveCompareToArchive}
            >保存比较档案</button
          >
        {/if}
      </div>
      {#if labState.compareError}
        <div class="error" data-testid="lab-compare-error">{labState.compareError}</div>
      {/if}
    </div>
  {:else}
    <div class="lab-section">
      <div class="row">
        <button type="button" data-testid="lab-archive-export" onclick={exportArchiveAction}
          >导出 JSON</button
        >
        <button
          type="button"
          data-testid="lab-archive-import"
          onclick={() => archiveFileInput?.click()}>导入 JSON</button
        >
        <input
          type="file"
          accept="application/json"
          bind:this={archiveFileInput}
          class="hidden-file"
          onchange={(event) => {
            const file = (event.currentTarget as HTMLInputElement).files?.[0]
            if (file) void importArchiveAction(file)
            ;(event.currentTarget as HTMLInputElement).value = ''
          }}
        />
      </div>
      {#if labState.archiveNotice}
        <div class="notice" data-testid="lab-archive-notice">{labState.archiveNotice}</div>
      {/if}

      <h3>实验档案（{experiments.length}）</h3>
      {#if experiments.length === 0}
        <em class="hint">暂无实验。运行搜索后点击“保存到档案”。</em>
      {/if}
      {#each experiments as experiment (experiment.id)}
        <div class="archive-item" data-testid="lab-archive-item">
          <div class="archive-head">
            <strong>{experiment.title}</strong>
            <span class="badge" class:ok={experiment.complete}
              >{experiment.complete ? '完整' : '未完成'}</span
            >
          </div>
          <div class="archive-meta">
            {experiment.kind === 'graph' ? '普通图' : '超图'} · {new Date(
              experiment.createdAt,
            ).toLocaleString('zh-CN', { hour12: false })}
            · 候选 {experiment.candidateCount}
          </div>
          <div class="archive-actions">
            <button type="button" onclick={() => openExperiment(experiment)}>查看</button>
            <button type="button" onclick={() => recomputeExperiment(experiment)}>复算</button>
            <button
              type="button"
              onclick={() => {
                notesEditingId = notesEditingId === experiment.id ? '' : experiment.id
                notesEditing = experiment.notes
              }}>笔记</button
            >
            <button type="button" onclick={() => deleteExperiment(experiment.id)}>删除</button>
          </div>
          {#if notesEditingId === experiment.id}
            <textarea
              rows="2"
              bind:value={notesEditing}
              placeholder="实验笔记…"
              onchange={() => updateExperimentNotes(experiment.id, notesEditing)}></textarea>
          {/if}
        </div>
      {/each}

      <h3>构造库（{constructions.length}）</h3>
      {#each constructions as construction (construction.id)}
        <div class="archive-item">
          <div class="archive-head">
            <strong>{construction.title}</strong>
          </div>
          <div class="archive-actions">
            <button
              type="button"
              onclick={() => {
                labState.analysisN = construction.hypergraph.n
                labState.analysisEdges = construction.hypergraph.edges
                  .map((edge) => edge.join(' '))
                  .join('\n')
                labState.tab = 'hyper'
                analyzeAction()
              }}>分析</button
            >
            <button
              type="button"
              onclick={() => {
                labState.compareLeftN = construction.hypergraph.n
                labState.compareLeftEdges = construction.hypergraph.edges
                  .map((edge) => edge.join(' '))
                  .join('\n')
                labState.tab = 'compare'
              }}>填 A</button
            >
            <button
              type="button"
              onclick={() => {
                labState.compareRightN = construction.hypergraph.n
                labState.compareRightEdges = construction.hypergraph.edges
                  .map((edge) => edge.join(' '))
                  .join('\n')
                labState.tab = 'compare'
              }}>填 B</button
            >
            <button
              type="button"
              onclick={() =>
                sendHypergraphToCustomForbidden(construction.hypergraph, construction.title)}
              >入禁图</button
            >
            <button type="button" onclick={() => deleteConstruction(construction.id)}>删除</button>
          </div>
        </div>
      {/each}

      <h3>比较档案（{comparisons.length}）</h3>
      {#each comparisons as record (record.id)}
        <div class="archive-item">
          <div class="archive-head">
            <strong>{record.title}</strong>
            <span class="badge" class:ok={record.identical}
              >{record.identical ? '同构' : record.cospectral ? '仅同谱' : '不同'}</span
            >
          </div>
          <div class="archive-actions">
            <button
              type="button"
              onclick={() => {
                labState.compareLeftN = record.left.n
                labState.compareLeftEdges = record.left.edges
                  .map((edge) => edge.join(' '))
                  .join('\n')
                labState.compareRightN = record.right.n
                labState.compareRightEdges = record.right.edges
                  .map((edge) => edge.join(' '))
                  .join('\n')
                labState.tab = 'compare'
                compareAction()
              }}>重开</button
            >
            <button type="button" onclick={() => deleteComparison(record.id)}>删除</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .lab-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    overflow-y: auto;
    min-height: 0;
    flex: 1;
    font-size: 13px;
  }
  .lab-tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    position: sticky;
    top: -10px;
    background: var(--card);
    padding: 6px 0 4px;
    z-index: 2;
  }
  .lab-tabs button {
    padding: 5px 0;
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    color: inherit;
  }
  .lab-tabs button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .lab-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 8px 0 0;
    font-size: 13px;
    font-weight: 600;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
  }
  .field > span {
    font-size: 11.5px;
    color: var(--text-dim);
  }
  .field input,
  .field select,
  .field textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel);
    color: inherit;
    font: inherit;
  }
  .field textarea {
    resize: vertical;
    font-family: ui-monospace, monospace;
    font-size: 12px;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .field.small {
    max-width: 120px;
  }
  .inline {
    display: flex;
    gap: 4px;
  }
  .inline input {
    flex: 1;
    min-width: 0;
  }
  .inline button {
    white-space: nowrap;
  }
  button {
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-panel);
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  button:hover {
    border-color: var(--accent);
  }
  .btn-primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  button.mini {
    align-self: flex-start;
    font-size: 11.5px;
    padding: 2px 8px;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .lab-templates {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .templates-label {
    font-size: 11.5px;
    color: var(--text-dim);
    width: 100%;
  }
  .lab-templates button {
    font-size: 11.5px;
    padding: 3px 7px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    font-size: 11.5px;
    padding: 3px 8px;
    border-radius: 999px;
  }
  .chip.active {
    background: var(--accent-soft, rgba(37, 99, 235, 0.12));
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  details.details {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 8px;
  }
  details.details summary {
    cursor: pointer;
    font-size: 12px;
    color: var(--text-dim);
  }
  details.details > *:not(summary) {
    margin-top: 6px;
  }
  .plan {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 11.5px;
    color: var(--text-dim);
  }
  .plan-title {
    font-weight: 600;
  }
  .plan-row {
    display: flex;
    justify-content: space-between;
  }
  .plan-bad {
    color: #dc2626;
  }
  .progress {
    font-size: 11.5px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .error {
    font-size: 12px;
    color: #dc2626;
    white-space: pre-wrap;
  }
  .hint {
    font-size: 11px;
    color: var(--text-dim);
  }
  .notice {
    font-size: 12px;
    color: var(--accent);
  }
  .archive-item {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .archive-head {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    align-items: center;
  }
  .archive-head strong {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .archive-meta {
    font-size: 11px;
    color: var(--text-dim);
  }
  .archive-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .archive-actions button {
    font-size: 11.5px;
    padding: 2px 8px;
  }
  .badge {
    font-size: 11px;
    border-radius: 999px;
    padding: 1px 8px;
    border: 1px solid var(--border);
    color: var(--text-dim);
    white-space: nowrap;
  }
  .badge.ok {
    color: #16a34a;
    border-color: #16a34a;
  }
  .pattern-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    gap: 6px;
  }
  .hidden-file {
    display: none;
  }
</style>
