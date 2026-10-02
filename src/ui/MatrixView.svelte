<script lang="ts">
  /**
   * 矩阵视图（v2.3）：
   * - 画布：实时显示当前矩阵（左上 2×2 块）对单位正方形 / 基向量的变换；
   *   相似对角化完成后叠加特征方向（虚线 + λ 标注）；
   * - 右侧结果卡：KaTeX 渲染分解矩阵（Q/R、P/D/P⁻¹、L/U/P）与验证残差。
   */
  import { onMount } from 'svelte'
  import katex from 'katex'
  import 'katex/dist/katex.min.css'
  import {
    getMatrixOutput,
    getMatrixRevision,
    toMatrix,
    type MatrixOutput,
  } from '../state/matrix-state.svelte'
  import { characteristicPolynomial, cleanNumber, inverse, type Matrix } from '../matrix/linalg'

  let { active = false }: { active?: boolean } = $props()

  let containerEl: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let resultsEl: HTMLDivElement | undefined = $state()

  // ---------- 格式化 ----------

  function fmt(value: number): string {
    const cleaned = cleanNumber(value, 1e-9)
    const abs = Math.abs(cleaned)
    if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return cleaned.toExponential(2)
    return String(Number(cleaned.toFixed(4)))
  }

  function fmtAbs(value: number): string {
    return fmt(Math.abs(value))
  }

  function pmatrix(m: Matrix): string {
    const rows = m.map((row) => row.map((value) => fmt(value)).join(' & ')).join(' \\\\ ')
    return `\\begin{pmatrix}${rows}\\end{pmatrix}`
  }

  function polyLatex(matrix: Matrix): string {
    const coeffs = characteristicPolynomial(matrix)
    const n = coeffs.length - 1
    const parts: string[] = []
    coeffs.forEach((coef, i) => {
      const cleaned = cleanNumber(coef, 1e-9)
      if (cleaned === 0) return
      const power = n - i
      const body = Math.abs(cleaned) === 1 && power > 0 ? '' : `${fmtAbs(cleaned)}`
      const term =
        power === 0
          ? `${fmtAbs(cleaned)}`
          : power === 1
            ? `${body}\\lambda`
            : `${body}\\lambda^{${power}}`
      if (parts.length === 0) parts.push(cleaned < 0 ? `-${term}` : term)
      else parts.push(`${cleaned < 0 ? '-' : '+'} ${term}`)
    })
    return parts.join(' ') || '1'
  }

  function fmtComplex(re: number, im: number): string {
    const reText = fmt(re)
    if (Math.abs(im) < 1e-8) return reText
    const imText = `${fmtAbs(im)}i`
    if (Math.abs(re) < 1e-8) return `${im < 0 ? '-' : ''}${imText}`
    return `${reText} ${im < 0 ? '-' : '+'} ${imText}`
  }

  function residualText(value: number): string {
    if (!Number.isFinite(value)) return '—'
    return value < 1e-9 ? '0（机器精度）' : value.toExponential(2)
  }

  // ---------- 结果文本 ----------

  type ResultLine =
    { kind: 'latex'; value: string } | { kind: 'text'; value: string; tone?: 'ok' | 'warn' | 'dim' }

  const lines = $derived.by<ResultLine[]>(() => {
    void getMatrixRevision()
    const output = getMatrixOutput()
    if (!output) {
      return [
        {
          kind: 'text',
          value: '点击「计算」查看分解结果；画布实时显示 A 对单位正方形与基向量的变换。',
          tone: 'dim',
        },
      ]
    }
    return buildLines(output)
  })

  function buildLines(output: MatrixOutput): ResultLine[] {
    const result: ResultLine[] = []
    if (output.op === 'qr' && output.qr) {
      result.push({ kind: 'text', value: 'QR 分解：A = Q·R（Householder 反射；R 对角取正）' })
      result.push({ kind: 'latex', value: `Q = ${pmatrix(output.qr.q)}` })
      result.push({ kind: 'latex', value: `R = ${pmatrix(output.qr.r)}` })
      result.push({
        kind: 'text',
        value: `验证 ‖A − QR‖∞ = ${residualText(output.qr.residual)}`,
        tone: output.qr.residual < 1e-9 ? 'ok' : 'warn',
      })
      result.push({ kind: 'text', value: 'Q 正交（QᵀQ = I）、R 上三角（对角非负）。', tone: 'dim' })
    } else if (output.op === 'lu' && output.lu) {
      result.push({ kind: 'text', value: 'LU 分解（部分主元）：P·A = L·U' })
      result.push({ kind: 'latex', value: `P = ${pmatrix(output.lu.p)}` })
      result.push({ kind: 'latex', value: `L = ${pmatrix(output.lu.l)}` })
      result.push({ kind: 'latex', value: `U = ${pmatrix(output.lu.u)}` })
      result.push({
        kind: 'text',
        value: output.lu.singular
          ? '⚠ 主元接近 0：矩阵奇异，U 对角存在零元。'
          : `验证 ‖P·A − L·U‖∞ = ${residualText(output.lu.residual)}`,
        tone: output.lu.singular ? 'warn' : 'ok',
      })
    } else if (output.op === 'eigen' && output.eigen) {
      const eigen = output.eigen
      result.push({ kind: 'text', value: '相似对角化：A = P·D·P⁻¹' })
      result.push({
        kind: 'latex',
        value: `${polyLatex(output.input)} = 0`,
        // 特征多项式 = 0
      })
      const valuesText = eigen.eigenvalues.map((z) => fmtComplex(z.re, z.im)).join('，')
      result.push({ kind: 'text', value: `特征值：${valuesText}` })
      if (eigen.diagonalizable && eigen.p && eigen.d) {
        result.push({ kind: 'latex', value: `P = ${pmatrix(eigen.p)}` })
        result.push({ kind: 'latex', value: `D = ${pmatrix(eigen.d)}` })
        const pinv = inverse(eigen.p)
        if (pinv) result.push({ kind: 'latex', value: `P^{-1} = ${pmatrix(pinv)}` })
        result.push({
          kind: 'text',
          value: `验证 ‖A − P·D·P⁻¹‖∞ = ${residualText(eigen.residual)}`,
          tone: eigen.residual < 1e-8 ? 'ok' : 'warn',
        })
      } else if (eigen.hasComplex) {
        result.push({
          kind: 'text',
          value: '存在复特征值：在 ℝ 上没有特征向量基，不能实对角化（复数域上仍可对角化）。',
          tone: 'warn',
        })
      } else {
        result.push({
          kind: 'text',
          value: '几何重数 < 代数重数（缺陷矩阵）：特征向量不足 n 个，不可对角化。',
          tone: 'warn',
        })
      }
      const multText = eigen.distinctRealValues
        .map(
          (value, i) =>
            `λ=${fmt(value)}：代数重数 ${eigen.algebraicMultiplicities[i] ?? 0}、几何重数 ${eigen.geometricMultiplicities[i] ?? 0}`,
        )
        .join('；')
      if (multText) result.push({ kind: 'text', value: multText, tone: 'dim' })
    } else if (output.op === 'summary' && output.summary) {
      const { det, trace, rank: rk, inverse: inv } = output.summary
      result.push({ kind: 'text', value: '行列式 · 迹 · 秩 · 逆矩阵' })
      result.push({
        kind: 'text',
        value: `det A = ${fmt(det)}；tr A = ${fmt(trace)}；rank A = ${rk}`,
      })
      if (inv) {
        result.push({ kind: 'latex', value: `A^{-1} = ${pmatrix(inv)}` })
        result.push({ kind: 'text', value: '验证：A·A⁻¹ = I（数值精度内）。', tone: 'ok' })
      } else {
        result.push({ kind: 'text', value: '矩阵不可逆（det = 0 / 秩亏）。', tone: 'warn' })
      }
    }
    return result
  }

  // ---------- 画布绘制 ----------

  function drawArrow(
    context: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
  ): void {
    context.strokeStyle = color
    context.fillStyle = color
    context.lineWidth = 1.8
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const size = 7
    context.beginPath()
    context.moveTo(x2, y2)
    context.lineTo(x2 - size * Math.cos(angle - 0.42), y2 - size * Math.sin(angle - 0.42))
    context.lineTo(x2 - size * Math.cos(angle + 0.42), y2 - size * Math.sin(angle + 0.42))
    context.closePath()
    context.fill()
  }

  function draw(): void {
    const canvas = canvasEl
    if (!canvas) return
    const width = Math.max(64, canvas.clientWidth)
    const height = Math.max(64, canvas.clientHeight)
    if (width < 4 || height < 4) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.fillStyle = '#0b0e14'
    context.fillRect(0, 0, width, height)

    const matrix = toMatrix()
    const a11 = matrix[0]?.[0] ?? 0
    const a12 = matrix[0]?.[1] ?? 0
    const a21 = matrix[1]?.[0] ?? 0
    const a22 = matrix[1]?.[1] ?? 0
    const extent = Math.max(
      2,
      1.4 * Math.max(Math.abs(a11), Math.abs(a12), Math.abs(a21), Math.abs(a22)),
    )
    const scale = Math.min(width / (2 * extent + 1), height / (2 * extent + 1))
    const cx = width / 2
    const cy = height / 2
    const toX = (x: number): number => cx + x * scale
    const toY = (y: number): number => cy - y * scale

    // 网格
    context.lineWidth = 1
    const gridExtent = Math.ceil(extent) + 1
    for (let g = -gridExtent; g <= gridExtent; g++) {
      context.strokeStyle = g === 0 ? '#33415c' : '#1c2740'
      context.beginPath()
      context.moveTo(toX(g), 0)
      context.lineTo(toX(g), height)
      context.stroke()
      context.beginPath()
      context.moveTo(0, toY(g))
      context.lineTo(width, toY(g))
      context.stroke()
    }

    // 单位正方形（原始）
    context.fillStyle = 'rgba(148, 163, 184, 0.08)'
    context.strokeStyle = '#475569'
    context.setLineDash([4, 4])
    context.beginPath()
    context.moveTo(toX(0), toY(0))
    context.lineTo(toX(1), toY(0))
    context.lineTo(toX(1), toY(1))
    context.lineTo(toX(0), toY(1))
    context.closePath()
    context.fill()
    context.stroke()
    context.setLineDash([])

    // 变换后的平行四边形（列向量 a₁、a₂ 张成）
    context.fillStyle = 'rgba(59, 130, 246, 0.16)'
    context.strokeStyle = '#3b82f6'
    context.lineWidth = 1.6
    context.beginPath()
    context.moveTo(toX(0), toY(0))
    context.lineTo(toX(a11), toY(a21))
    context.lineTo(toX(a11 + a12), toY(a21 + a22))
    context.lineTo(toX(a12), toY(a22))
    context.closePath()
    context.fill()
    context.stroke()

    // 基向量（暗）与列向量（亮）
    drawArrow(context, toX(0), toY(0), toX(1), toY(0), 'rgba(148,163,184,0.5)')
    drawArrow(context, toX(0), toY(0), toX(0), toY(-1), 'rgba(148,163,184,0.5)')
    drawArrow(context, toX(0), toY(0), toX(a11), toY(a21), '#3b82f6')
    drawArrow(context, toX(0), toY(0), toX(a12), toY(a22), '#22c55e')

    // 特征方向叠加（相似对角化结果）
    const output = getMatrixOutput()
    if (output?.op === 'eigen' && output.eigen) {
      const eigen = output.eigen
      context.font = '12px ui-monospace, Consolas, monospace'
      context.textAlign = 'left'
      context.textBaseline = 'bottom'
      if (eigen.diagonalizable && eigen.p && eigen.d) {
        const p = eigen.p
        const d = eigen.d
        for (let col = 0; col < Math.min(2, p[0]?.length ?? 0); col++) {
          const vx = p[0]?.[col] ?? 0
          const vy = p[1]?.[col] ?? 0
          const lambda = d[col]?.[col] ?? 0
          const len = Math.hypot(vx, vy)
          if (len < 1e-12) continue
          const ux = vx / len
          const uy = vy / len
          context.strokeStyle = 'rgba(245, 158, 11, 0.85)'
          context.lineWidth = 1.4
          context.setLineDash([6, 5])
          context.beginPath()
          context.moveTo(toX(-extent * ux), toY(-extent * uy))
          context.lineTo(toX(extent * ux), toY(extent * uy))
          context.stroke()
          context.setLineDash([])
          context.fillStyle = '#f59e0b'
          context.fillText(
            `λ=${fmt(lambda)}`,
            toX(extent * 0.72 * ux) + 6,
            toY(extent * 0.72 * uy) - 2,
          )
        }
      } else if (eigen.hasComplex) {
        context.fillStyle = '#f59e0b'
        context.fillText('复特征值：无实特征方向（几何上体现为旋转分量）', 14, height - 14)
      }
    }

    // 说明文字
    context.font = '12px ui-monospace, Consolas, monospace'
    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.fillStyle = '#8fa3c2'
    context.fillText(
      `A 作用于单位正方形（${matrix.length > 2 ? '几何示意：左上 2×2 块' : '矩阵 → 平行四边形'}）`,
      14,
      12,
    )
    context.fillStyle = '#5c6b8a'
    context.fillText('蓝 = 列向量 a₁（A·e₁）；绿 = 列向量 a₂（A·e₂）；橙虚线 = 特征方向', 14, 30)
  }

  // ---------- 生命周期 ----------

  $effect(() => {
    getMatrixRevision()
    if (!active) return
    draw()
  })

  // 结果卡 → KaTeX 渲染（DOM API，避免 {@html}）
  $effect(() => {
    const container = resultsEl
    const currentLines = lines
    if (!container) return
    container.textContent = ''
    for (const line of currentLines) {
      const div = document.createElement('div')
      if (line.kind === 'latex') {
        div.className = 'mv-latex'
        try {
          katex.render(line.value, div, { throwOnError: false, displayMode: true })
        } catch {
          div.textContent = line.value
        }
      } else {
        div.className = line.tone ? `mv-text ${line.tone}` : 'mv-text'
        div.textContent = line.value
      }
      container.append(div)
    }
  })

  onMount(() => {
    const resize = (): void => {
      if (active) draw()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(containerEl)
    draw()
    return () => observer.disconnect()
  })
</script>

<div class="matrix-view" class:hidden={!active} bind:this={containerEl} data-testid="matrix-view">
  <canvas bind:this={canvasEl} class="matrix-canvas" data-testid="matrix-canvas"></canvas>
  <div class="matrix-results" data-testid="matrix-results" bind:this={resultsEl}></div>
</div>

<style>
  .matrix-view {
    position: relative;
    width: 100%;
    height: 100%;
    background: #0b0e14;
    overflow: hidden;
  }
  .matrix-view.hidden {
    visibility: hidden;
    pointer-events: none;
  }
  .matrix-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  .matrix-results {
    position: absolute;
    top: 12px;
    right: 12px;
    width: min(430px, 46%);
    max-height: calc(100% - 24px);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: rgba(16, 23, 37, 0.92);
    border: 1px solid #26324a;
    border-radius: 10px;
    color: #c7d4ea;
  }
  /* 结果行为动态创建（KaTeX/DOM API），样式需 :global 作用域 */
  .matrix-results :global(.mv-text) {
    font-size: 12px;
    line-height: 1.65;
    color: #a9b8d4;
  }
  .matrix-results :global(.mv-text.ok) {
    color: #86efac;
  }
  .matrix-results :global(.mv-text.warn) {
    color: #fcd34d;
  }
  .matrix-results :global(.mv-text.dim) {
    color: #6f819f;
  }
  .matrix-results :global(.mv-latex) {
    font-size: 13px;
    overflow-x: auto;
    color: #e8ecf5;
  }
</style>
