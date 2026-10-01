<script lang="ts">
  /**
   * 统计面板（v0.7）：数据导入（粘贴/文件/生成）、数据表预览、描述统计（含箱线）、
   * 图表配置（散点+回归 / 直方图+KDE / 分布+探针 / 模拟动画）与运行时控制。
   * 滑块类参数走 preview-提交模式（拖动不入历史，松手一步撤销）。
   */
  import { parseDelimitedAsync, tableToDataset } from '../stats/parse'
  import {
    columnValues,
    createDataset,
    defaultChart,
    pairedValues,
    type Dataset,
    type DatasetChart,
    type DistributionId,
    type RegressionKind,
    type SimulationKind,
  } from '../stats/model'
  import { boxPlot, describe as describeStats, pearson, spearman } from '../stats/describe'
  import { fitRegression } from '../stats/regression'
  import { DISTRIBUTIONS, getDistribution } from '../stats/distributions'
  import { chartAutoView } from '../stats/chart-view'
  import {
    advanceSimulation,
    createRuntime,
    getSimRuntime,
    isSimPlaying,
    setSimPlaying,
    setSimRuntime,
  } from '../stats/stats-state.svelte'
  import { compile, parse } from '../expr'
  import { createGauss, createRng } from '../stats/simulation'
  import type { AppStore } from '../state/store'
  import type { AppState, DocState, Size } from '../state/types'

  let {
    store,
    getStageSize,
    requestRender,
  }: {
    store: AppStore
    getStageSize: () => Size
    requestRender: () => void
  } = $props()

  // store 为普通类（非 runes）：响应性由订阅驱动（同 GraphPanel 模式）
  let appState = $state<AppState | null>(null)
  $effect(() => {
    appState = store.getState()
    return store.subscribe((state) => {
      appState = state
    })
  })

  const dataset = $derived(
    appState?.doc.objects.find((object): object is Dataset => object.type === 'dataset') ?? null,
  )

  // --- 导入 ---
  let pasted = $state('')
  let importStatus = $state('')
  let importing = $state(false)
  let fileInput: HTMLInputElement | undefined = $state()

  // --- 生成 ---
  let genExpr = $state('sin(x)')
  let genCount = $state(200)
  let genNoise = $state(0.1)
  let genXMin = $state(-5)
  let genXMax = $state(5)

  // --- 描述统计列 ---
  let describeColumn = $state(0)

  // --- 模拟 ---
  const simPlaying = $derived(isSimPlaying())

  // 视图自适应：数据/图表配置变化时重算（模拟帧版本不触发）
  let lastViewKey = ''
  $effect(() => {
    const ds = dataset
    if (!ds) return
    const key = `${ds.id}|${JSON.stringify(ds.chart)}|${ds.rows.length}|${ds.columns.join(',')}`
    if (key === lastViewKey) return
    lastViewKey = key
    store.setView(chartAutoView(ds, getStageSize(), getSimRuntime()))
    requestRender()
  })

  // 模拟推进 rAF（仅 playing 时）
  $effect(() => {
    if (!simPlaying) return
    let raf = 0
    const step = (): void => {
      const ds = store.getDatasets()[0]
      if (!ds || ds.chart.kind !== 'simulation') {
        setSimPlaying(false)
        return
      }
      const keep = advanceSimulation({
        speed: ds.chart.speed,
        samples: ds.chart.samples,
        bootstrapData: ds.chart.simulation === 'bootstrap' ? columnValues(ds, 0) : undefined,
      })
      requestRender()
      if (keep && isSimPlaying()) raf = requestAnimationFrame(step)
      else setSimPlaying(false)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  })

  // 切换数据集或模拟类型时重置运行时
  let lastRuntimeKey = ''
  $effect(() => {
    const ds = dataset
    const key = ds && ds.chart.kind === 'simulation' ? `${ds.id}|${ds.chart.simulation}` : ''
    if (key === lastRuntimeKey) return
    lastRuntimeKey = key
    setSimPlaying(false)
    if (ds && ds.chart.kind === 'simulation') {
      setSimRuntime(createRuntime(ds.chart.simulation, Math.floor(Math.random() * 1e9)))
      requestRender()
    }
  })

  // ---------- 导入/生成 ----------

  async function importText(text: string, name: string): Promise<void> {
    importing = true
    importStatus = '解析中…'
    try {
      const table = await parseDelimitedAsync(text, 4000, (fraction) => {
        importStatus = `解析中… ${(fraction * 100).toFixed(0)}%`
      })
      if (table.columns.length === 0) {
        importStatus = '未识别到有效数据'
        return
      }
      const ds = tableToDataset(table, name)
      store.addDataset(ds)
      describeColumn = 0
      importStatus = `已导入 ${table.rowCount} 行 × ${table.columns.length} 列${table.warnings.length > 0 ? `；${table.warnings.join('；')}` : ''}`
    } catch (error) {
      importStatus = `导入失败：${error instanceof Error ? error.message : String(error)}`
    } finally {
      importing = false
    }
  }

  async function importPasted(): Promise<void> {
    if (pasted.trim() === '') {
      importStatus = '请先粘贴 CSV/TSV 数据'
      return
    }
    await importText(pasted, '粘贴数据')
  }

  async function importFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      await importText(text, file.name.replace(/\.[^.]+$/, ''))
    } finally {
      input.value = ''
    }
  }

  function generateData(): void {
    let fn: (scope: Record<string, number>) => number
    try {
      fn = compile(parse(genExpr))
    } catch (error) {
      importStatus = `表达式解析失败：${error instanceof Error ? error.message : String(error)}`
      return
    }
    const n = Math.min(100_000, Math.max(2, Math.round(genCount)))
    const rng = createRng(42)
    const gauss = createGauss(rng)
    const scope: Record<string, number> = { x: 0 }
    const rows: (number | null)[][] = []
    for (let i = 0; i < n; i++) {
      const x = genXMin + ((genXMax - genXMin) * i) / (n - 1)
      scope['x'] = x
      const base = fn(scope)
      const y = Number.isFinite(base) ? base + genNoise * gauss() : null
      rows.push([x, y])
    }
    const ds = createDataset(`y = ${genExpr} + 噪声`, ['x', 'y'], rows, defaultChart('scatter'))
    store.addDataset(ds)
    importStatus = `已生成 ${n} 个数据点`
  }

  function removeDataset(): void {
    if (!dataset) return
    store.removeDataset(dataset.id)
    setSimPlaying(false)
    setSimRuntime(null)
    importStatus = '已删除数据集'
  }

  // ---------- 图表配置（select/checkbox 直改；滑块 preview） ----------

  let pendingBefore: DocState | null = null

  function chartApply(patch: Partial<DatasetChart>): void {
    const ds = dataset
    if (!ds) return
    store.updateDataset(ds.id, { chart: { ...ds.chart, ...patch } as DatasetChart })
    requestRender()
  }

  function chartPreview(patch: Partial<DatasetChart>): void {
    const ds = dataset
    if (!ds) return
    if (pendingBefore === null) pendingBefore = store.getDoc()
    store.preview((doc) => ({
      objects: doc.objects.map((object) =>
        object.type === 'dataset' && object.id === ds.id
          ? { ...object, chart: { ...object.chart, ...patch } as DatasetChart }
          : object,
      ),
    }))
    requestRender()
  }

  function chartCommit(): void {
    if (pendingBefore !== null) {
      store.commitPreview(pendingBefore)
      pendingBefore = null
    }
  }

  // ---------- 派生数据 ----------

  const describeValues = $derived.by(() => {
    const ds = dataset
    if (!ds) return []
    return columnValues(ds, Math.min(describeColumn, ds.columns.length - 1))
  })

  const stats = $derived(describeValues.length > 0 ? describeStats(describeValues) : null)
  const box = $derived(describeValues.length > 0 ? boxPlot(describeValues) : null)

  const scatterInfo = $derived.by(() => {
    const ds = dataset
    if (!ds || ds.chart.kind !== 'scatter') return null
    const { x, y } = pairedValues(ds, ds.chart.xColumn, ds.chart.yColumn)
    if (x.length < 2) return null
    const regression = fitRegression(ds.chart.regression, x, y, {
      degree: ds.chart.degree,
      modelExpr: ds.chart.modelExpr,
    })
    return {
      n: x.length,
      pearson: pearson(x, y),
      spearman: spearman(x, y),
      regression,
    }
  })

  function formatSci(value: number): string {
    if (!Number.isFinite(value)) return '—'
    if (Math.abs(value) < 1e5) return value.toPrecision(5)
    return value.toExponential(3)
  }

  /** LaTeX 方程 → 面板纯文本近似 */
  function plainEquation(latex: string): string {
    return latex
      .replace(/\\,/g, ' ')
      .replace(/\\ln/g, 'ln')
      .replace(/\\times/g, '×')
      .replace(/\\cdot/g, '·')
      .replace(/\^\{([^}]*)\}/g, '^$1')
  }
</script>

<aside class="stats-panel" aria-label="统计与数据" data-testid="stats-panel">
  <div class="section-title">统计与数据</div>

  {#if dataset}
    <div class="row dataset-head">
      <b data-testid="dataset-name">{dataset.name}</b>
      <span class="dim" data-testid="dataset-size"
        >{dataset.rows.length} 行 × {dataset.columns.length} 列</span
      >
      <button type="button" data-testid="dataset-remove" onclick={removeDataset}>删除</button>
    </div>
  {:else}
    <div class="hint">暂无数据：粘贴 CSV/TSV、导入文件或从函数生成</div>
  {/if}

  <!-- ---------- 导入 ---------- -->
  <div class="section">
    <div class="section-title">导入数据</div>
    <textarea
      rows="3"
      placeholder="粘贴 CSV/TSV，如：&#10;x,y&#10;1,2.5&#10;2,4.1"
      data-testid="stats-paste"
      bind:value={pasted}></textarea>
    <div class="row">
      <button
        type="button"
        data-testid="stats-import-paste"
        disabled={importing}
        onclick={importPasted}>解析粘贴内容</button
      >
      <button type="button" data-testid="stats-import-file" onclick={() => fileInput?.click()}
        >导入文件…</button
      >
      <input
        class="hidden-file"
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        data-testid="stats-file"
        bind:this={fileInput}
        onchange={importFile}
      />
    </div>
    <div class="row">
      <span class="dim">生成 y =</span>
      <input class="expr" data-testid="stats-gen-expr" bind:value={genExpr} />
      <span class="dim">n</span>
      <input
        type="number"
        min="2"
        max="100000"
        step="1"
        data-testid="stats-gen-count"
        bind:value={genCount}
      />
    </div>
    <div class="row">
      <span class="dim">x ∈</span>
      <input type="number" step="any" data-testid="stats-gen-xmin" bind:value={genXMin} />
      <span>~</span>
      <input type="number" step="any" data-testid="stats-gen-xmax" bind:value={genXMax} />
      <span class="dim">噪声 σ</span>
      <input type="number" min="0" step="any" data-testid="stats-gen-noise" bind:value={genNoise} />
      <button type="button" data-testid="stats-generate" onclick={generateData}>生成</button>
    </div>
    {#if importStatus !== ''}
      <div class="status" data-testid="stats-import-status">{importStatus}</div>
    {/if}
  </div>

  {#if dataset}
    <!-- ---------- 数据表预览 ---------- -->
    <div class="section">
      <div class="section-title">数据预览（前 40 行）</div>
      <div class="table-wrap">
        <table class="data-table" data-testid="stats-table">
          <thead>
            <tr>
              {#each dataset.columns as column, index (index)}
                <th>{column}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each dataset.rows.slice(0, 40) as row, rowIndex (rowIndex)}
              <tr>
                {#each row as cell, cellIndex (cellIndex)}
                  <td>{cell === null ? '—' : formatSci(cell)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- ---------- 图表类型 ---------- -->
    <div class="section">
      <div class="section-title">图表</div>
      <select
        data-testid="stats-chart-kind"
        value={dataset.chart.kind}
        onchange={(e) =>
          chartApply(
            defaultChart((e.currentTarget as HTMLSelectElement).value as DatasetChart['kind']),
          )}
      >
        <option value="scatter">散点图 + 回归</option>
        <option value="histogram">直方图 + KDE</option>
        <option value="distribution">分布曲线</option>
        <option value="simulation">模拟动画</option>
      </select>

      {#if dataset.chart.kind === 'scatter'}
        {@const chart = dataset.chart}
        <div class="row">
          <span class="dim">x 列</span>
          <select
            data-testid="scatter-x"
            value={chart.xColumn}
            onchange={(e) =>
              chartApply({ xColumn: Number((e.currentTarget as HTMLSelectElement).value) })}
          >
            {#each dataset.columns as column, index (index)}
              <option value={index}>{column}</option>
            {/each}
          </select>
          <span class="dim">y 列</span>
          <select
            data-testid="scatter-y"
            value={chart.yColumn}
            onchange={(e) =>
              chartApply({ yColumn: Number((e.currentTarget as HTMLSelectElement).value) })}
          >
            {#each dataset.columns as column, index (index)}
              <option value={index}>{column}</option>
            {/each}
          </select>
        </div>
        <div class="row">
          <span class="dim">回归</span>
          <select
            data-testid="scatter-regression"
            value={chart.regression}
            onchange={(e) =>
              chartApply({
                regression: (e.currentTarget as HTMLSelectElement).value as RegressionKind,
              })}
          >
            <option value="linear">线性</option>
            <option value="polynomial">多项式</option>
            <option value="exponential">指数</option>
            <option value="logarithmic">对数</option>
            <option value="power">幂</option>
            <option value="custom">自定义</option>
          </select>
          {#if chart.regression === 'polynomial'}
            <span class="dim">阶数</span>
            <input
              type="number"
              min="1"
              max="8"
              step="1"
              data-testid="scatter-degree"
              value={chart.degree}
              onchange={(e) =>
                chartApply({ degree: Number((e.currentTarget as HTMLInputElement).value) })}
            />
          {/if}
          <label class="check">
            <input
              type="checkbox"
              data-testid="scatter-residuals"
              checked={chart.showResiduals}
              onchange={(e) =>
                chartApply({ showResiduals: (e.currentTarget as HTMLInputElement).checked })}
            />
            残差图
          </label>
        </div>
        {#if chart.regression === 'custom'}
          <div class="row">
            <span class="dim">模型 f(x)</span>
            <input
              class="expr"
              placeholder="a*exp(b*x)+c"
              data-testid="scatter-model"
              value={chart.modelExpr}
              onchange={(e) =>
                chartApply({ modelExpr: (e.currentTarget as HTMLInputElement).value })}
            />
          </div>
        {/if}
        {#if scatterInfo}
          <div class="result-lines" data-testid="scatter-result">
            <div>
              n = {scatterInfo.n} · Pearson r = {formatSci(scatterInfo.pearson)} · Spearman ρ = {formatSci(
                scatterInfo.spearman,
              )}
            </div>
            {#if 'error' in scatterInfo.regression}
              <div class="error">{scatterInfo.regression.error}</div>
            {:else}
              <div class="equation" data-testid="regression-equation">
                {plainEquation(scatterInfo.regression.equationLatex)}
              </div>
              <div>
                R² = {formatSci(scatterInfo.regression.r2)} · 调整 R² = {formatSci(
                  scatterInfo.regression.adjustedR2,
                )} · 残差标准误 = {formatSci(scatterInfo.regression.residualStandardError)}
              </div>
            {/if}
          </div>
        {/if}
      {:else if dataset.chart.kind === 'histogram'}
        {@const chart = dataset.chart}
        <div class="row">
          <span class="dim">列</span>
          <select
            data-testid="histogram-column"
            value={chart.column}
            onchange={(e) =>
              chartApply({ column: Number((e.currentTarget as HTMLSelectElement).value) })}
          >
            {#each dataset.columns as column, index (index)}
              <option value={index}>{column}</option>
            {/each}
          </select>
          <span class="dim">分箱</span>
          <select
            data-testid="histogram-bins"
            value={typeof chart.bins === 'number' ? 'manual' : 'auto'}
            onchange={(e) => {
              const value = (e.currentTarget as HTMLSelectElement).value
              chartApply({ bins: value === 'auto' ? 'auto' : 20 })
            }}
          >
            <option value="auto">自动（FD/Sturges）</option>
            <option value="manual">手动</option>
          </select>
          {#if typeof chart.bins === 'number'}
            <input
              type="number"
              min="1"
              max="200"
              step="1"
              data-testid="histogram-bins-manual"
              value={chart.bins}
              onchange={(e) =>
                chartApply({
                  bins: Math.max(1, Number((e.currentTarget as HTMLInputElement).value)),
                })}
            />
          {/if}
        </div>
        <div class="row">
          <label class="check">
            <input
              type="checkbox"
              data-testid="histogram-kde"
              checked={chart.kde}
              onchange={(e) => chartApply({ kde: (e.currentTarget as HTMLInputElement).checked })}
            />
            叠加 KDE
          </label>
          <span class="dim">核</span>
          <select
            data-testid="histogram-kernel"
            value={chart.kernel}
            onchange={(e) =>
              chartApply({
                kernel: (e.currentTarget as HTMLSelectElement).value as 'gaussian' | 'epanechnikov',
              })}
          >
            <option value="gaussian">高斯</option>
            <option value="epanechnikov">Epanechnikov</option>
          </select>
        </div>
      {:else if dataset.chart.kind === 'distribution'}
        {@const chart = dataset.chart}
        {@const def = getDistribution(chart.dist)}
        <div class="row">
          <span class="dim">分布</span>
          <select
            data-testid="distribution-select"
            value={chart.dist}
            onchange={(e) => {
              const id = (e.currentTarget as HTMLSelectElement).value as DistributionId
              const next = getDistribution(id)
              const params: Record<string, number> = {}
              for (const p of next.params) params[p.key] = p.default
              chartApply({ dist: id, params })
            }}
          >
            {#each DISTRIBUTIONS as item (item.id)}
              <option value={item.id}>{item.name}</option>
            {/each}
          </select>
          <span class="dim" data-testid="distribution-probe">
            P(X ≤ {chart.probeX.toPrecision(4)}) = {def
              .cdf(chart.probeX, chart.params)
              .toPrecision(5)}
          </span>
        </div>
        {#each def.params as p (p.key)}
          <div class="row">
            <span class="param-label">{p.label}</span>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              data-testid={`dist-param-${p.key}`}
              value={chart.params[p.key] ?? p.default}
              oninput={(e) =>
                chartPreview({
                  params: {
                    ...chart.params,
                    [p.key]: Number((e.currentTarget as HTMLInputElement).value),
                  },
                })}
              onchange={chartCommit}
            />
            <span class="param-value">{(chart.params[p.key] ?? p.default).toPrecision(4)}</span>
          </div>
        {/each}
        <div class="row">
          <label class="check">
            <input
              type="checkbox"
              data-testid="distribution-compare"
              checked={chart.compare !== null}
              onchange={(e) => {
                if ((e.currentTarget as HTMLInputElement).checked) {
                  const cdef = getDistribution('normal')
                  const params: Record<string, number> = {}
                  for (const p of cdef.params) params[p.key] = p.default
                  chartApply({ compare: { dist: 'normal', params } })
                } else {
                  chartApply({ compare: null })
                }
              }}
            />
            对比第二分布
          </label>
          {#if chart.compare}
            <select
              data-testid="distribution-compare-select"
              value={chart.compare.dist}
              onchange={(e) => {
                const id = (e.currentTarget as HTMLSelectElement).value as DistributionId
                const next = getDistribution(id)
                const params: Record<string, number> = {}
                for (const p of next.params) params[p.key] = p.default
                chartApply({ compare: { dist: id, params } })
              }}
            >
              {#each DISTRIBUTIONS as item (item.id)}
                <option value={item.id}>{item.name}</option>
              {/each}
            </select>
          {/if}
        </div>
        {#if chart.compare}
          {#each getDistribution(chart.compare.dist).params as p (p.key)}
            <div class="row">
              <span class="param-label">对比 {p.label}</span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                data-testid={`dist-compare-param-${p.key}`}
                value={chart.compare.params[p.key] ?? p.default}
                oninput={(e) =>
                  chartPreview({
                    compare: {
                      dist: chart.compare!.dist,
                      params: {
                        ...chart.compare!.params,
                        [p.key]: Number((e.currentTarget as HTMLInputElement).value),
                      },
                    } as NonNullable<typeof chart.compare>,
                  })}
                onchange={chartCommit}
              />
              <span class="param-value"
                >{(chart.compare.params[p.key] ?? p.default).toPrecision(4)}</span
              >
            </div>
          {/each}
        {/if}
      {:else}
        {@const chart = dataset.chart}
        <div class="row">
          <span class="dim">演示</span>
          <select
            data-testid="simulation-select"
            value={chart.simulation}
            onchange={(e) =>
              chartApply({
                simulation: (e.currentTarget as HTMLSelectElement).value as SimulationKind,
              })}
          >
            <option value="lln">大数定律（抛硬币）</option>
            <option value="clt">中心极限定理</option>
            <option value="montecarlo-pi">蒙特卡洛求 π</option>
            <option value="bootstrap">自助法（Bootstrap）</option>
            <option value="random-walk">二维随机游走</option>
          </select>
        </div>
        <div class="row">
          <span class="dim">速度</span>
          <select
            data-testid="simulation-speed"
            value={chart.speed}
            onchange={(e) =>
              chartApply({ speed: Number((e.currentTarget as HTMLSelectElement).value) })}
          >
            <option value={1}>慢</option>
            <option value={5}>中</option>
            <option value={10}>快</option>
            <option value={20}>极快</option>
          </select>
          <span class="dim">目标样本</span>
          <select
            data-testid="simulation-samples"
            value={chart.samples}
            onchange={(e) =>
              chartApply({ samples: Number((e.currentTarget as HTMLSelectElement).value) })}
          >
            <option value={500}>500</option>
            <option value={2000}>2000</option>
            <option value={10000}>10000</option>
            <option value={100000}>100000</option>
          </select>
        </div>
        <div class="row">
          <button
            type="button"
            data-testid="simulation-toggle"
            onclick={() => setSimPlaying(!isSimPlaying())}
          >
            {simPlaying ? '暂停' : '播放'}
          </button>
          <button
            type="button"
            data-testid="simulation-reset"
            onclick={() => {
              setSimPlaying(false)
              const ds = dataset
              if (ds && ds.chart.kind === 'simulation') {
                setSimRuntime(createRuntime(ds.chart.simulation, Math.floor(Math.random() * 1e9)))
                requestRender()
              }
            }}>重置</button
          >
          {#if dataset.chart.simulation === 'bootstrap'}
            <span class="dim">（对第 1 列做重抽样）</span>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ---------- 描述统计 ---------- -->
    <div class="section">
      <div class="section-title">描述统计</div>
      <div class="row">
        <span class="dim">列</span>
        <select
          data-testid="describe-column"
          value={describeColumn}
          onchange={(e) => (describeColumn = Number((e.currentTarget as HTMLSelectElement).value))}
        >
          {#each dataset.columns as column, index (index)}
            <option value={index}>{column}</option>
          {/each}
        </select>
      </div>
      {#if stats}
        <div class="stats-grid" data-testid="describe-stats">
          <span>n：{stats.count}</span>
          <span>均值：{formatSci(stats.mean)}</span>
          <span>中位数：{formatSci(stats.median)}</span>
          <span>众数：{stats.mode === null ? '—' : formatSci(stats.mode)}</span>
          <span>标准差：{formatSci(stats.std)}</span>
          <span>方差：{formatSci(stats.variance)}</span>
          <span>最小：{formatSci(stats.min)}</span>
          <span>最大：{formatSci(stats.max)}</span>
          <span>Q1：{formatSci(stats.q1)}</span>
          <span>Q3：{formatSci(stats.q3)}</span>
          <span>偏度：{formatSci(stats.skewness)}</span>
          <span>峰度：{formatSci(stats.kurtosis)}</span>
        </div>
        {#if box}
          <div class="boxplot" data-testid="describe-boxplot">
            <svg viewBox="0 0 240 44" width="240" height="44" role="img" aria-label="箱线图">
              {#if Number.isFinite(box.min) && box.max > box.min + Number.EPSILON}
                {@const scale = (v: number) => 12 + ((v - box.min) / (box.max - box.min)) * 216}
                <line
                  x1={scale(box.min)}
                  y1="22"
                  x2={scale(box.q1)}
                  y2="22"
                  stroke="#6b7280"
                  stroke-width="1.5"
                />
                <line
                  x1={scale(box.q3)}
                  y1="22"
                  x2={scale(box.max)}
                  y2="22"
                  stroke="#6b7280"
                  stroke-width="1.5"
                />
                <line
                  x1={scale(box.min)}
                  y1="14"
                  x2={scale(box.min)}
                  y2="30"
                  stroke="#6b7280"
                  stroke-width="1.5"
                />
                <line
                  x1={scale(box.max)}
                  y1="14"
                  x2={scale(box.max)}
                  y2="30"
                  stroke="#6b7280"
                  stroke-width="1.5"
                />
                <rect
                  x={scale(box.q1)}
                  y="10"
                  width={Math.max(1, scale(box.q3) - scale(box.q1))}
                  height="24"
                  fill="rgba(37, 99, 235, 0.15)"
                  stroke="#2563eb"
                  stroke-width="1.5"
                />
                <line
                  x1={scale(box.median)}
                  y1="10"
                  x2={scale(box.median)}
                  y2="34"
                  stroke="#dc2626"
                  stroke-width="2"
                />
              {/if}
            </svg>
            {#if box.outliers.length > 0}
              <span class="dim">离群 {box.outliers.length} 个</span>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</aside>

<style>
  .stats-panel {
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
    font-size: 13px;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-title {
    font-size: 12px;
    color: var(--text-dim);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .dim {
    color: var(--text-dim);
    font-size: 12px;
  }

  .hint {
    font-size: 12px;
    color: var(--text-dim);
  }

  .dataset-head {
    justify-content: space-between;
  }

  textarea {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
    resize: vertical;
  }

  .expr {
    width: 120px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .hidden-file {
    display: none;
  }

  .status {
    font-size: 12px;
    color: var(--accent);
  }

  .table-wrap {
    max-height: 180px;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  .data-table {
    border-collapse: collapse;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .data-table th,
  .data-table td {
    padding: 2px 6px;
    border-bottom: 1px solid var(--border);
    text-align: right;
    white-space: nowrap;
  }

  .data-table th {
    position: sticky;
    top: 0;
    background: var(--panel);
    color: var(--text-dim);
  }

  .check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }

  .param-label {
    width: 40px;
    color: var(--text-dim);
    font-size: 12px;
  }

  .param-value {
    width: 52px;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
  }

  input[type='range'] {
    flex: 1;
    min-width: 80px;
  }

  .result-lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
  }

  .equation {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    color: #b91c1c;
  }

  .error {
    color: #b91c1c;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 10px;
    font-size: 12px;
  }

  .boxplot {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
