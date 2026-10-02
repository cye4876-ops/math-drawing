/**
 * 近世代数模块示意图（v2.2）：canvas 2D 绘制，深色主题与进阶模式画布一致（#0b0e14）。
 *
 * - unit-roots：单位根群 μ（每个元素有限阶，但群无限）；
 * - sqrt-minus-5：ℤ[√−5] 格点上的两种分解 6 = 2·3 = (1+√−5)(1−√−5)；
 * - ordered-field：ℂ 上的乘法旋转 i² = −1 与有序域矛盾；
 * - drawSubgroupLattice：子群格 Hasse 图（布局由 lattice.ts 计算）。
 */

import type { SubgroupLattice } from './lattice'

export type AlgebraDiagramKind = 'unit-roots' | 'sqrt-minus-5' | 'ordered-field'

const COLORS = {
  bg: '#0b0e14',
  grid: '#1c2740',
  axis: '#33415c',
  text: '#c7d4ea',
  dim: '#8fa3c2',
  faint: '#5c6b8a',
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  violet: '#a78bfa',
}

const FONT = '12px ui-monospace, Consolas, monospace'

function arrowHead(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
): void {
  const size = 7
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.fillStyle = color
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(-size, size * 0.44)
  context.lineTo(-size, -size * 0.44)
  context.closePath()
  context.fill()
  context.restore()
}

export function drawAlgebraDiagram(
  kind: AlgebraDiagramKind,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.clearRect(0, 0, width, height)
  context.fillStyle = COLORS.bg
  context.fillRect(0, 0, width, height)
  if (kind === 'unit-roots') drawUnitRoots(context, width, height)
  else if (kind === 'sqrt-minus-5') drawSqrtMinus5(context, width, height)
  else drawOrderedField(context, width, height)
}

// ---------- 单位根群 ----------

function drawUnitRoots(context: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2
  const cy = height / 2 + 6
  const radius = Math.min(width / 2 - 150, height / 2 - 58)
  const r = Math.max(60, radius)

  context.font = FONT
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillStyle = COLORS.text
  context.fillText('μ = ∪ₙ μₙ：平面上的全部单位根（圆群）', 16, 16)
  context.fillStyle = COLORS.dim
  context.fillText('每个元素 z 都满足 zⁿ = 1（n 有限），即阶有限', 16, 34)

  // 单位圆
  context.strokeStyle = COLORS.axis
  context.lineWidth = 1.5
  context.beginPath()
  context.arc(cx, cy, r, 0, Math.PI * 2)
  context.stroke()

  // 全部 12 次单位根（蓝点）
  context.fillStyle = COLORS.blue
  for (let k = 0; k < 12; k++) {
    const angle = (2 * Math.PI * k) / 12
    context.beginPath()
    context.arc(cx + r * Math.cos(angle), cy - r * Math.sin(angle), 3, 0, Math.PI * 2)
    context.fill()
  }

  // 高亮：−1（阶 2）、i（阶 4）、ω₃（阶 3）、ζ₁₂（阶 12）
  const highlights: { angle: number; color: string; label: string }[] = [
    { angle: Math.PI, color: COLORS.red, label: '−1（阶 2）' },
    { angle: Math.PI / 2, color: COLORS.green, label: 'i（阶 4）' },
    { angle: (2 * Math.PI) / 3, color: COLORS.amber, label: 'ω₃（阶 3）' },
    { angle: Math.PI / 6, color: COLORS.violet, label: 'ζ₁₂（阶 12）' },
  ]
  for (const item of highlights) {
    const x = cx + r * Math.cos(item.angle)
    const y = cy - r * Math.sin(item.angle)
    context.fillStyle = item.color
    context.beginPath()
    context.arc(x, y, 5.2, 0, Math.PI * 2)
    context.fill()
    // 标签沿径向朝外放置
    const lx = cx + (r + 16) * Math.cos(item.angle)
    const ly = cy - (r + 16) * Math.sin(item.angle)
    context.textAlign = lx < cx ? 'right' : 'left'
    context.fillText(item.label, lx, ly - 6)
  }

  context.textAlign = 'left'
  context.fillStyle = COLORS.dim
  context.fillText('n 可以任意大（ζₙ 阶为 n）⇒ μ 是无限群', 16, height - 30)
  context.fillStyle = COLORS.faint
  context.fillText('「挠群 ⇒ 有限群」不成立；需额外条件（如有限生成）', 16, height - 14)
}

// ---------- ℤ[√−5] 格点分解 ----------

function drawSqrtMinus5(context: CanvasRenderingContext2D, width: number, height: number): void {
  const padLeft = 48
  const padRight = 32
  const padTop = 62
  const padBottom = 58
  const xMin = -0.6
  const xMax = 3.6
  const yMin = -1.9
  const yMax = 1.9
  const plotW = width - padLeft - padRight
  const plotH = height - padTop - padBottom
  const toX = (a: number): number => padLeft + ((a - xMin) / (xMax - xMin)) * plotW
  const toY = (b: number): number => padTop + ((yMax - b) / (yMax - yMin)) * plotH

  context.font = FONT
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillStyle = COLORS.text
  context.fillText('6 = 2 × 3 = (1+√−5) × (1−√−5)：两种本质不同的分解', 16, 14)
  context.fillStyle = COLORS.dim
  context.fillText('每点 (a, b) 代表代数整数 a + b√−5', 16, 34)

  // 网格
  context.strokeStyle = COLORS.grid
  context.lineWidth = 1
  for (let a = 0; a <= 3; a++) {
    context.beginPath()
    context.moveTo(toX(a), toY(yMin))
    context.lineTo(toX(a), toY(yMax))
    context.stroke()
  }
  for (let b = -1; b <= 1; b++) {
    context.beginPath()
    context.moveTo(toX(xMin), toY(b))
    context.lineTo(toX(xMax), toY(b))
    context.stroke()
  }
  // 实轴（b = 0）加粗
  context.strokeStyle = COLORS.axis
  context.beginPath()
  context.moveTo(toX(xMin), toY(0))
  context.lineTo(toX(xMax), toY(0))
  context.stroke()
  context.beginPath()
  context.moveTo(toX(0), toY(yMin))
  context.lineTo(toX(0), toY(yMax))
  context.stroke()

  // 分解 ①：2 与 3（蓝）
  const points: { a: number; b: number; text: string; color: string }[] = [
    { a: 2, b: 0, text: '2（N=4）', color: COLORS.blue },
    { a: 3, b: 0, text: '3（N=9）', color: COLORS.blue },
    { a: 1, b: 1, text: '1+√−5（N=6）', color: COLORS.green },
    { a: 1, b: -1, text: '1−√−5（N=6）', color: COLORS.green },
  ]
  for (const point of points) {
    const x = toX(point.a)
    const y = toY(point.b)
    context.fillStyle = point.color
    context.beginPath()
    context.arc(x, y, 5, 0, Math.PI * 2)
    context.fill()
    context.textAlign = 'center'
    context.fillText(point.text, x, point.b >= 0 ? y - 22 : y + 12)
  }

  // 虚线框：{2, 3} 与 {1±√−5}
  context.save()
  context.setLineDash([5, 4])
  context.lineWidth = 1.3
  context.strokeStyle = COLORS.blue
  context.strokeRect(toX(1.62), toY(0.5), toX(3.38) - toX(1.62), toY(-0.5) - toY(0.5))
  context.strokeStyle = COLORS.green
  context.strokeRect(toX(0.62), toY(1.5), toX(1.38) - toX(0.62), toY(-1.5) - toY(1.5))
  context.restore()
  context.textAlign = 'center'
  context.fillStyle = COLORS.blue
  context.fillText('① 2 × 3', toX(2.5), toY(0.62) - 20)
  context.fillStyle = COLORS.green
  context.fillText('② (1+√−5)(1−√−5)', toX(1), toY(1.72) - 20)

  context.textAlign = 'left'
  context.fillStyle = COLORS.dim
  context.fillText('N(a+b√−5) = a²+5b²：无 N=2 或 N=3 的元素', 16, height - 44)
  context.fillStyle = COLORS.faint
  context.fillText('⇒ 2、3、1±√−5 都不可约，且 2、3 与 1±√−5 不互为伴', 16, height - 28)
  context.fillText('⇒ ℤ[√−5] 不是唯一分解整环（UFD）', 16, height - 12)
}

// ---------- ℂ 与有序域矛盾 ----------

function drawOrderedField(context: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2
  const cy = height / 2 + 10
  const r = Math.max(70, Math.min(width / 2 - 150, height / 2 - 46))

  context.font = FONT
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillStyle = COLORS.text
  context.fillText('乘以 i = 逆时针旋转 90°：1 → i → −1', 16, 16)

  // 实轴 / 虚轴
  context.strokeStyle = COLORS.axis
  context.lineWidth = 1.2
  context.beginPath()
  context.moveTo(cx - r - 52, cy)
  context.lineTo(cx + r + 52, cy)
  context.stroke()
  context.beginPath()
  context.moveTo(cx, cy + r + 40)
  context.lineTo(cx, cy - r - 40)
  context.stroke()
  context.fillStyle = COLORS.faint
  context.fillText('Re', cx + r + 10, cy + 6)
  context.textAlign = 'center'
  context.fillText('Im', cx, cy - r - 54)

  // 单位圆（虚线）
  context.save()
  context.setLineDash([4, 5])
  context.strokeStyle = COLORS.faint
  context.beginPath()
  context.arc(cx, cy, r, 0, Math.PI * 2)
  context.stroke()
  context.restore()

  // 旋转弧 1：1 → i（逆时针，画布上为从 0 到 −π/2）
  context.strokeStyle = COLORS.blue
  context.lineWidth = 1.8
  context.beginPath()
  context.arc(cx, cy, r * 0.72, 0, -Math.PI / 2, true)
  context.stroke()
  arrowHead(context, cx, cy - r * 0.72, -Math.PI / 2, COLORS.blue)
  // 旋转弧 2：i → −1
  context.beginPath()
  context.arc(cx, cy, r * 0.72, -Math.PI / 2, -Math.PI, true)
  context.stroke()
  arrowHead(context, cx - r * 0.72, cy, Math.PI, COLORS.blue)

  context.fillStyle = COLORS.blue
  context.textAlign = 'center'
  context.fillText('×i', cx + r * 0.55, cy - r * 0.62)
  context.fillText('×i', cx - r * 0.55, cy - r * 0.62)

  // 三个关键点
  const dots: { x: number; y: number; color: string; label: string }[] = [
    { x: cx + r, y: cy, color: COLORS.green, label: '1（> 0）' },
    { x: cx, y: cy - r, color: COLORS.blue, label: 'i' },
    { x: cx - r, y: cy, color: COLORS.red, label: '−1（< 0）' },
  ]
  for (const dot of dots) {
    context.fillStyle = dot.color
    context.beginPath()
    context.arc(dot.x, dot.y, 5.4, 0, Math.PI * 2)
    context.fill()
    context.fillText(dot.label, dot.x, dot.y - 22)
  }

  context.textAlign = 'left'
  context.fillStyle = COLORS.amber
  context.fillText('i² = −1', cx + 8, cy + 14)
  context.fillStyle = COLORS.dim
  context.fillText('有序域要求 ∀x: x² ≥ 0（且 1 > 0 ⇒ −1 < 0）', 16, height - 44)
  context.fillStyle = COLORS.faint
  context.fillText('但 i² = −1 < 0 ⇒ 矛盾：ℂ 无法成为有序域', 16, height - 28)
  context.fillText('（对比：ℝ 可有序；ℂ 只能作为域，不能作为有序域）', 16, height - 12)
}

// ---------- 子群格（Hasse 图） ----------

export function drawSubgroupLattice(
  context: CanvasRenderingContext2D,
  lattice: SubgroupLattice,
  width: number,
  height: number,
): void {
  context.clearRect(0, 0, width, height)
  context.fillStyle = COLORS.bg
  context.fillRect(0, 0, width, height)
  context.font = FONT
  const nodes = lattice.nodes
  if (nodes.length === 0) return

  const padX = 52
  const padTop = 48
  const padBottom = 40
  const maxLevel = Math.max(...nodes.map((node) => node.level))
  const plotW = width - padX * 2
  const plotH = height - padTop - padBottom

  // 每层水平均布（层内按最小元素索引稳定排序）
  const byLevel = new Map<number, number[]>()
  for (const node of nodes) {
    const list = byLevel.get(node.level) ?? []
    list.push(node.index)
    byLevel.set(node.level, list)
  }
  const posX = new Map<number, number>()
  const posY = new Map<number, number>()
  for (const [level, indices] of byLevel) {
    indices.sort((a, b) => (nodes[a]?.subgroup[0] ?? 0) - (nodes[b]?.subgroup[0] ?? 0) || a - b)
    const y = maxLevel === 0 ? height / 2 : padTop + plotH - (level / maxLevel) * plotH
    indices.forEach((index, i) => {
      posX.set(index, padX + ((i + 0.5) / indices.length) * plotW)
      posY.set(index, y)
    })
  }

  // 覆盖关系边
  context.strokeStyle = COLORS.grid
  context.lineWidth = 1.3
  for (const [from, to] of lattice.edges) {
    const x1 = posX.get(from)
    const y1 = posY.get(from)
    const x2 = posX.get(to)
    const y2 = posY.get(to)
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
  }

  // 节点（圆内为子群阶；绿 = 正规，橙 = 非正规）
  const radius = 16
  const fullSize = Math.max(...nodes.map((node) => node.size))
  for (const node of nodes) {
    const x = posX.get(node.index)
    const y = posY.get(node.index)
    if (x === undefined || y === undefined) continue
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fillStyle = '#131b2c'
    context.fill()
    context.lineWidth = 2
    context.strokeStyle = node.normal ? COLORS.green : COLORS.amber
    context.stroke()
    context.fillStyle = COLORS.text
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(node.size === fullSize ? 'G' : String(node.size), x, y + 0.5)
  }

  // 图例
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.fillStyle = COLORS.text
  context.fillText(`子群格（共 ${nodes.length} 个子群）`, 14, 12)
  context.fillStyle = COLORS.faint
  context.fillText('圈内数字 = 子群阶；绿 = 正规，橙 = 非正规；底 = {e}，顶 = G', 14, 30)
}
