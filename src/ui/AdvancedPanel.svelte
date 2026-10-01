<script lang="ts">
  import {
    getModule,
    setModule,
    getComplexMode,
    setComplexMode,
    getComplexExpr,
    setComplexExpr,
    getComplexSpan,
    setComplexSpan,
    getComplexResolution,
    setComplexResolution,
    getComplexColormap,
    setComplexColormap,
    getComplexGrids,
    setComplexGrids,
    getMobiusPreset,
    setMobiusPreset,
    getMobiusExtent,
    setMobiusExtent,
    getBranchKind,
    setBranchKind,
    getBranchIndex,
    setBranchIndex,
    getContourExpr,
    setContourExpr,
    getContourRadius,
    setContourRadius,
    getNumberViz,
    setNumberViz,
    getUlamSize,
    setUlamSize,
    getSacksCount,
    setSacksCount,
    getModularN,
    setModularN,
    getModularMode,
    setModularMode,
    getCollatzLimit,
    setCollatzLimit,
    getPrimeLimit,
    setPrimeLimit,
    getAutomataViz,
    setAutomataViz,
    getLifeSpeed,
    setLifeSpeed,
    getLifeDensity,
    setLifeDensity,
    isLifePlaying,
    setLifePlaying,
    getFractalIter,
    setFractalIter,
    getFractalColormap,
    setFractalColormap,
    getJuliaC,
    setJuliaC,
    stepLifeOnce,
    randomizeLife,
    clearLife,
    placeLifePattern,
    resetFractalView,
    getSymbolicInput,
    setSymbolicInput,
    getSymbolicLimitPoint,
    setSymbolicLimitPoint,
    runSymbolicOperation,
    type AdvancedModule,
    type ComplexViewMode,
    type NumberViz,
    type AutomataViz,
  } from '../state/advanced-state.svelte'
  import { MOBIUS_PRESETS } from '../complex/mobius'
  import { BRANCH_INFO } from '../complex/riemann-surface'
  import { COLORMAP_NAMES } from '../render3d/colormaps'

  function numberFrom(event: Event): number {
    return Number((event.currentTarget as HTMLInputElement).value)
  }

  function textFrom(event: Event): string {
    return (event.currentTarget as HTMLInputElement).value
  }

  const MODULES: { id: AdvancedModule; label: string }[] = [
    { id: 'complex', label: '复变' },
    { id: 'numbertheory', label: '数论' },
    { id: 'automata', label: '自动机' },
    { id: 'symbolic', label: '符号' },
  ]
  const COMPLEX_MODES: { id: ComplexViewMode; label: string }[] = [
    { id: 'domain', label: '域着色' },
    { id: 'mobius', label: 'Möbius 变换' },
    { id: 'branch', label: '分支示意（黎曼面）' },
    { id: 'contour', label: '围道积分' },
  ]
  const NUMBER_VIZ: { id: NumberViz; label: string }[] = [
    { id: 'ulam', label: 'Ulam 螺旋' },
    { id: 'sacks', label: 'Sacks 螺旋' },
    { id: 'modular', label: '模运算图案' },
    { id: 'collatz', label: 'Collatz' },
    { id: 'primes', label: 'π(x) 素数分布' },
  ]
  const AUTOMATA_VIZ: { id: AutomataViz; label: string }[] = [
    { id: 'life', label: '生命游戏' },
    { id: 'mandelbrot', label: 'Mandelbrot 集' },
    { id: 'julia', label: 'Julia 集' },
  ]
</script>

<aside class="advanced-panel" data-testid="advanced-panel">
  <div class="section-title">进阶（v0.9）</div>

  <div class="mode-tabs" role="tablist">
    {#each MODULES as item (item.id)}
      <button
        type="button"
        class:active={getModule() === item.id}
        data-testid={`adv-tab-${item.id}`}
        onclick={() => setModule(item.id)}>{item.label}</button
      >
    {/each}
  </div>

  {#if getModule() === 'complex'}
    <div class="section">
      <div class="row">
        <span class="dim">视图</span>
        <select
          data-testid="adv-complex-mode"
          value={getComplexMode()}
          onchange={(event) => setComplexMode(event.currentTarget.value as ComplexViewMode)}
        >
          {#each COMPLEX_MODES as item (item.id)}
            <option value={item.id}>{item.label}</option>
          {/each}
        </select>
      </div>

      {#if getComplexMode() === 'domain'}
        <div class="row">
          <span class="dim">f(z)</span>
          <input
            class="expr"
            data-testid="adv-complex-expr"
            value={getComplexExpr()}
            oninput={(event) => setComplexExpr(textFrom(event))}
          />
        </div>
        <div class="row">
          <span class="dim">色图</span>
          <select
            data-testid="adv-complex-colormap"
            value={getComplexColormap()}
            onchange={(event) =>
              setComplexColormap(event.currentTarget.value as 'standard' | 'highcontrast')}
          >
            <option value="standard">标准色轮</option>
            <option value="highcontrast">高对比</option>
          </select>
        </div>
      {/if}

      {#if getComplexMode() === 'domain' || getComplexMode() === 'branch'}
        <div class="row">
          <span class="dim">视野</span>
          <input
            type="range"
            min="1"
            max="20"
            step="0.2"
            value={getComplexSpan()}
            data-testid="adv-complex-span"
            oninput={(event) => setComplexSpan(numberFrom(event))}
          />
          <span class="value">{getComplexSpan().toFixed(1)}</span>
        </div>
        <div class="row">
          <span class="dim">分辨率</span>
          <select
            data-testid="adv-complex-resolution"
            value={String(getComplexResolution())}
            onchange={(event) => setComplexResolution(numberFrom(event))}
          >
            <option value="256">256</option>
            <option value="512">512</option>
            <option value="1024">1024</option>
          </select>
        </div>
        <div class="row">
          <label class="check">
            <input
              type="checkbox"
              checked={getComplexGrids()}
              data-testid="adv-complex-grids"
              onchange={(event) => setComplexGrids(event.currentTarget.checked)}
            />
            等相位 / 等模网格线
          </label>
        </div>
        {#if getComplexMode() === 'branch'}
          <div class="row">
            <span class="dim">函数</span>
            <select
              data-testid="adv-branch-kind"
              value={getBranchKind()}
              onchange={(event) => setBranchKind(event.currentTarget.value as 'sqrt' | 'log')}
            >
              <option value="sqrt">√z（两分支）</option>
              <option value="log">ln z（三层）</option>
            </select>
          </div>
          <div class="row">
            <span class="dim">分支</span>
            <select
              data-testid="adv-branch-index"
              value={String(getBranchIndex())}
              onchange={(event) => setBranchIndex(numberFrom(event))}
            >
              {#each Array.from({ length: BRANCH_INFO[getBranchKind()].count }, (_, k) => k) as k (k)}
                <option value={String(k)}>{BRANCH_INFO[getBranchKind()].labels[k]}</option>
              {/each}
            </select>
          </div>
        {/if}
      {/if}

      {#if getComplexMode() === 'mobius'}
        <div class="row">
          <span class="dim">变换</span>
          <select
            data-testid="adv-mobius-preset"
            value={getMobiusPreset()}
            onchange={(event) => setMobiusPreset(event.currentTarget.value)}
          >
            {#each MOBIUS_PRESETS as item (item.id)}
              <option value={item.id}>{item.label}</option>
            {/each}
          </select>
        </div>
        <div class="row">
          <span class="dim">范围</span>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.1"
            value={getMobiusExtent()}
            data-testid="adv-mobius-extent"
            oninput={(event) => setMobiusExtent(numberFrom(event))}
          />
          <span class="value">{getMobiusExtent().toFixed(1)}</span>
        </div>
        <div class="hint">网格像保持正交（保角性）；橙线为单位圆的像。</div>
      {/if}

      {#if getComplexMode() === 'contour'}
        <div class="row">
          <span class="dim">f(z)</span>
          <input
            class="expr"
            data-testid="adv-contour-expr"
            value={getContourExpr()}
            oninput={(event) => setContourExpr(textFrom(event))}
          />
        </div>
        <div class="row">
          <span class="dim">路径半径</span>
          <input
            type="range"
            min="0.2"
            max="5"
            step="0.1"
            value={getContourRadius()}
            data-testid="adv-contour-radius"
            oninput={(event) => setContourRadius(numberFrom(event))}
          />
          <span class="value">{getContourRadius().toFixed(1)}</span>
        </div>
        <div class="hint">沿圆心在原点的圆 ∮ f dz；极点在内时结果 ≈ 2πi·留数。</div>
      {/if}
    </div>
  {:else if getModule() === 'numbertheory'}
    <div class="section">
      <div class="row">
        <span class="dim">视图</span>
        <select
          data-testid="adv-number-viz"
          value={getNumberViz()}
          onchange={(event) => setNumberViz(event.currentTarget.value as NumberViz)}
        >
          {#each NUMBER_VIZ as item (item.id)}
            <option value={item.id}>{item.label}</option>
          {/each}
        </select>
      </div>
      {#if getNumberViz() === 'ulam'}
        <div class="row">
          <span class="dim">边长</span>
          <input
            type="range"
            min="50"
            max="1000"
            step="50"
            value={getUlamSize()}
            data-testid="adv-ulam-size"
            oninput={(event) => setUlamSize(numberFrom(event))}
          />
          <span class="value">{getUlamSize()}</span>
        </div>
        <div class="hint">质数（金色）在对角线上聚集，是经典的二次多项式质数现象。</div>
      {:else if getNumberViz() === 'sacks'}
        <div class="row">
          <span class="dim">点数</span>
          <input
            type="range"
            min="200"
            max="50000"
            step="200"
            value={getSacksCount()}
            data-testid="adv-sacks-count"
            oninput={(event) => setSacksCount(numberFrom(event))}
          />
          <span class="value">{getSacksCount()}</span>
        </div>
        <div class="hint">k 位于 (√k·cos 2π√k, √k·sin 2π√k)，颜色为约数个数。</div>
      {:else if getNumberViz() === 'modular'}
        <div class="row">
          <span class="dim">模数 n</span>
          <input
            type="range"
            min="4"
            max="256"
            step="1"
            value={getModularN()}
            data-testid="adv-modular-n"
            oninput={(event) => setModularN(numberFrom(event))}
          />
          <span class="value">{getModularN()}</span>
        </div>
        <div class="row">
          <span class="dim">运算</span>
          <select
            data-testid="adv-modular-mode"
            value={getModularMode()}
            onchange={(event) =>
              setModularMode(event.currentTarget.value as 'product' | 'power' | 'gcd')}
          >
            <option value="product">i·j mod n</option>
            <option value="power">i^j mod n</option>
            <option value="gcd">gcd(i, j)</option>
          </select>
        </div>
      {:else if getNumberViz() === 'collatz'}
        <div class="row">
          <span class="dim">范围 N</span>
          <input
            type="range"
            min="100"
            max="50000"
            step="100"
            value={getCollatzLimit()}
            data-testid="adv-collatz-limit"
            oninput={(event) => setCollatzLimit(numberFrom(event))}
          />
          <span class="value">{getCollatzLimit()}</span>
        </div>
        <div class="hint">横轴 n、纵轴总停止时间（到 1 的步数）；27 需要 111 步。</div>
      {:else}
        <div class="row">
          <span class="dim">范围 x ≤</span>
          <input
            type="range"
            min="500"
            max="50000"
            step="500"
            value={getPrimeLimit()}
            data-testid="adv-prime-limit"
            oninput={(event) => setPrimeLimit(numberFrom(event))}
          />
          <span class="value">{getPrimeLimit()}</span>
        </div>
        <div class="hint">金色阶梯为 π(x)（不超过 x 的质数个数），蓝色为 x/ln x 近似曲线。</div>
      {/if}
    </div>
  {:else if getModule() === 'automata'}
    <div class="section">
      <div class="row">
        <span class="dim">视图</span>
        <select
          data-testid="adv-automata-viz"
          value={getAutomataViz()}
          onchange={(event) => setAutomataViz(event.currentTarget.value as AutomataViz)}
        >
          {#each AUTOMATA_VIZ as item (item.id)}
            <option value={item.id}>{item.label}</option>
          {/each}
        </select>
      </div>
      {#if getAutomataViz() === 'life'}
        <div class="row wrap">
          <button
            type="button"
            data-testid="adv-life-play"
            onclick={() => setLifePlaying(!isLifePlaying())}
            >{isLifePlaying() ? '暂停' : '播放'}</button
          >
          <button type="button" data-testid="adv-life-step" onclick={() => stepLifeOnce()}
            >单步</button
          >
          <button type="button" data-testid="adv-life-random" onclick={() => randomizeLife()}
            >随机</button
          >
          <button type="button" data-testid="adv-life-clear" onclick={() => clearLife()}
            >清空</button
          >
        </div>
        <div class="row wrap">
          <button
            type="button"
            data-testid="adv-life-glider"
            onclick={() => placeLifePattern('glider')}
          >
            放滑翔机
          </button>
          <button
            type="button"
            data-testid="adv-life-pulsar"
            onclick={() => placeLifePattern('pulsar')}
          >
            放脉冲星
          </button>
        </div>
        <div class="row">
          <span class="dim">速度</span>
          <input
            type="range"
            min="2"
            max="30"
            step="1"
            value={getLifeSpeed()}
            data-testid="adv-life-speed"
            oninput={(event) => setLifeSpeed(numberFrom(event))}
          />
          <span class="value">{getLifeSpeed()}/s</span>
        </div>
        <div class="row">
          <span class="dim">密度</span>
          <input
            type="range"
            min="0.05"
            max="0.6"
            step="0.05"
            value={getLifeDensity()}
            data-testid="adv-life-density"
            oninput={(event) => setLifeDensity(numberFrom(event))}
          />
          <span class="value">{getLifeDensity().toFixed(2)}</span>
        </div>
        <div class="hint">点击画布切换细胞；「随机」按密度重新播种。</div>
      {:else}
        <div class="row">
          <span class="dim">迭代上限</span>
          <input
            type="range"
            min="50"
            max="400"
            step="10"
            value={getFractalIter()}
            data-testid="adv-fractal-iter"
            oninput={(event) => setFractalIter(numberFrom(event))}
          />
          <span class="value">{getFractalIter()}</span>
        </div>
        <div class="row">
          <span class="dim">色图</span>
          <select
            data-testid="adv-fractal-colormap"
            value={getFractalColormap()}
            onchange={(event) =>
              setFractalColormap(event.currentTarget.value as (typeof COLORMAP_NAMES)[number])}
          >
            {#each COLORMAP_NAMES as name (name)}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </div>
        {#if getAutomataViz() === 'julia'}
          <div class="row">
            <span class="dim">c.re</span>
            <input
              type="range"
              min="-1.5"
              max="1.5"
              step="0.01"
              value={getJuliaC().re}
              data-testid="adv-julia-cre"
              oninput={(event) => setJuliaC(Number(event.currentTarget.value), getJuliaC().im)}
            />
            <span class="value">{getJuliaC().re.toFixed(2)}</span>
          </div>
          <div class="row">
            <span class="dim">c.im</span>
            <input
              type="range"
              min="-1.5"
              max="1.5"
              step="0.01"
              value={getJuliaC().im}
              data-testid="adv-julia-cim"
              oninput={(event) => setJuliaC(getJuliaC().re, Number(event.currentTarget.value))}
            />
            <span class="value">{getJuliaC().im.toFixed(2)}</span>
          </div>
        {/if}
        <div class="row">
          <button type="button" data-testid="adv-fractal-reset" onclick={() => resetFractalView()}>
            重置视图
          </button>
        </div>
        <div class="hint">滚轮缩放（以鼠标为中心）、双击还原。</div>
      {/if}
    </div>
  {:else}
    <div class="section">
      <div class="row">
        <span class="dim">输入</span>
        <input
          class="expr"
          data-testid="adv-symbolic-input"
          value={getSymbolicInput()}
          oninput={(event) => setSymbolicInput(textFrom(event))}
          onkeydown={(event) => {
            if (event.key === 'Enter') runSymbolicOperation('solve')
          }}
        />
      </div>
      <div class="row wrap">
        <button
          type="button"
          data-testid="adv-op-simplify"
          onclick={() => runSymbolicOperation('simplify')}
        >
          化简
        </button>
        <button
          type="button"
          data-testid="adv-op-expand"
          onclick={() => runSymbolicOperation('expand')}
        >
          展开
        </button>
        <button
          type="button"
          data-testid="adv-op-solve"
          onclick={() => runSymbolicOperation('solve')}
        >
          解方程
        </button>
        <button
          type="button"
          data-testid="adv-op-integrate"
          onclick={() => runSymbolicOperation('integrate')}
        >
          积分
        </button>
        <button
          type="button"
          data-testid="adv-op-inequality"
          onclick={() => runSymbolicOperation('inequality')}
        >
          解不等式
        </button>
        <button
          type="button"
          data-testid="adv-op-latex"
          onclick={() => runSymbolicOperation('latex')}
        >
          LaTeX
        </button>
      </div>
      <div class="row">
        <span class="dim">极限点 x→</span>
        <input
          class="limit"
          data-testid="adv-limit-point"
          value={getSymbolicLimitPoint()}
          oninput={(event) => setSymbolicLimitPoint(textFrom(event))}
        />
        <button
          type="button"
          data-testid="adv-op-limit"
          onclick={() => runSymbolicOperation('limit')}
        >
          求极限
        </button>
      </div>
      <div class="row wrap">
        <button type="button" onclick={() => setSymbolicInput('sin(x)^2 + cos(x)^2')}
          >示例·化简</button
        >
        <button type="button" onclick={() => setSymbolicInput('x^3 - 6*x^2 + 11*x - 6 = 0')}
          >示例·方程</button
        >
        <button type="button" onclick={() => setSymbolicInput('x^2')}>示例·积分</button>
        <button type="button" onclick={() => setSymbolicInput('sin(x)/x')}>示例·极限</button>
        <button type="button" onclick={() => setSymbolicInput('x^2 - 1 < 0')}>示例·不等式</button>
      </div>
      <div class="hint">
        支持：多项式展开/因式分解解析求解、sin²x+cos²x
        等恒等式化简、有限规则集不定积分、标准极限模式。
      </div>
    </div>
  {/if}
</aside>

<style>
  .advanced-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    overflow-y: auto;
    min-width: 0;
  }
  .section-title {
    font-size: 12px;
    letter-spacing: 2px;
    color: #8fa3c2;
    text-transform: uppercase;
  }
  .mode-tabs {
    display: flex;
    gap: 4px;
  }
  .mode-tabs button {
    flex: 1;
    padding: 5px 0;
    font-size: 12px;
  }
  .mode-tabs button.active {
    background: #2c4a7c;
    color: #fff;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row.wrap {
    flex-wrap: wrap;
  }
  .row .dim {
    color: #8fa3c2;
    font-size: 12px;
    min-width: 56px;
  }
  .row .value {
    font-size: 12px;
    font-family: ui-monospace, monospace;
    color: #c7d4ea;
    min-width: 40px;
    text-align: right;
  }
  .row input[type='range'] {
    flex: 1;
    min-width: 0;
  }
  .row input.expr {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, monospace;
  }
  .row input.limit {
    width: 64px;
    font-family: ui-monospace, monospace;
  }
  .row select {
    flex: 1;
    min-width: 0;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #c7d4ea;
  }
  .hint {
    font-size: 11px;
    color: #6f819f;
    line-height: 1.5;
  }
</style>
