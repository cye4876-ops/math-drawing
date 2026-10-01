/**
 * LaTeX TikZ / PGFPlots 导出（v0.6 核心）。
 *
 * - 函数曲线 → `\addplot {…};` 符号形式（AST → PGFPlots 数学，不经坐标点列表）；
 * - 参数方程 → parametric；极坐标 → parametric + (r·cos, r·sin) 列（弧度语义用 deg() 桥接）；
 * - 图 → 纯 TikZ 的 \node / \draw（节点形状/颜色、有向箭头、权重、自环）；
 * - 可选独立可编译文档（standalone + pgfplots），含分节注释与缩进。
 *
 * 函数映射要点（PGFPlots 三角函数按度数计算）：
 *   sin(u) → sin(deg(u))；asin(u) → rad(asin(u))（其余同理）；
 *   log(x)=ln(x)；log(x,b)=ln(x)/ln(b)；log2/log10 展开；pow → ^；mod(a,b) → mod(a,b)。
 * 已知限制：隐函数不导出（PGFPlots 无隐式绘图）；factorial/gamma/erf/gcd 等无对应函数，逐条跳过并注明。
 */
import { compile, parse } from '../expr'
import type { Expr } from '../expr/ast'
import { viewBounds } from '../core/transform'
import { sampleImplicit } from '../render/samplers/implicit'
import { objectsOfMode, resolveView, type ExportRange } from './frame'
import type { Curve, DocState, GraphObject, Point2, Size, ViewTransform } from '../state/types'

export interface TikzExportOptions {
  /** 数学范围基准（view/content/region 解析；显式曲线 domain 即其 x 范围） */
  range: ExportRange
  size: Size
  /** true = 输出可独立编译的最小文档；false = 仅片段 */
  standalone: boolean
  /** \addplot 采样数（默认 200） */
  samples?: number
}

export interface TikzSkipped {
  name: string
  reason: string
}

export interface TikzResult {
  tex: string
  skipped: TikzSkipped[]
}

const DEFAULT_SAMPLES = 200

// ---------- 表达式 AST → PGFPlots 数学 ----------

/** 三角函数（PGF 按度计算；输入为弧度语义 → deg() 桥接） */
const DEG_FUNCS = new Set(['sin', 'cos', 'tan'])
/** 反三角（PGF 返回度；项目语义为弧度 → rad() 桥接） */
const RAD_FUNCS = new Set(['asin', 'acos', 'atan'])
/** 同名直通函数（PGFPlots 同名存在，语义一致） */
const PLAIN_FUNCS = new Set([
  'sinh',
  'cosh',
  'tanh',
  'exp',
  'ln',
  'sqrt',
  'abs',
  'floor',
  'ceil',
  'round',
  'sign',
])

const BINARY_PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 }

interface PgfNode {
  text: string
  prec: number
}

/**
 * 转换表达式；variable 为视为自变量的名字（x / t / theta，输出统一为 PGF 的 `x`）。
 * 返回 null 表示不支持（显示层给出跳过原因）。
 */
export function exprToPgf(node: Expr, variable: string): string | null {
  const result = convert(node, variable)
  return result ? result.text : null
}

function convert(node: Expr, variable: string): PgfNode | null {
  switch (node.type) {
    case 'number': {
      if (!Number.isFinite(node.value)) return null
      return { text: String(node.value), prec: 5 }
    }
    case 'constant': {
      if (node.name === 'pi') return { text: 'pi', prec: 5 }
      if (node.name === 'e') return { text: 'e', prec: 5 }
      if (node.name === 'tau') return { text: '2*pi', prec: 2 }
      return { text: '(1+sqrt(5))/2', prec: 1 } // phi
    }
    case 'variable': {
      if (node.name === variable) return { text: 'x', prec: 5 }
      // 其他字母变量（用户自定义参数）：原样保留，需用户在导言区自行定义
      return { text: node.name, prec: 5 }
    }
    case 'unary': {
      const operand = convert(node.operand, variable)
      if (!operand) return null
      if (node.op === '+') return { text: operand.text, prec: operand.prec }
      return { text: `-${operand.prec < 3 ? `(${operand.text})` : operand.text}`, prec: 4 }
    }
    case 'binary':
      return convertBinary(node, variable)
    case 'call':
      return convertCall(node, variable)
    // factorial / piecewise / assignment 无 PGFPlots 对应形式
    default:
      return null
  }
}

function convertBinary(node: Extract<Expr, { type: 'binary' }>, variable: string): PgfNode | null {
  const op = node.op
  if (op === '=' || op === '!=' || op === '<' || op === '<=' || op === '>' || op === '>=') {
    return null
  }
  const left = convert(node.left, variable)
  const right = convert(node.right, variable)
  if (!left || !right) return null

  if (op === '%') {
    return { text: `mod(${left.text}, ${right.text})`, prec: 5 }
  }
  if (op === '^') {
    const l = left.prec <= 4 ? `(${left.text})` : left.text
    const r = right.prec <= 4 ? `(${right.text})` : right.text
    return { text: `${l}^${r}`, prec: 4 }
  }
  const prec = BINARY_PREC[op]
  if (prec === undefined) return null
  const l = left.prec < prec ? `(${left.text})` : left.text
  const r =
    right.prec <= prec && (op === '-' || op === '/')
      ? `(${right.text})`
      : right.prec < prec
        ? `(${right.text})`
        : right.text
  return { text: `${l} ${op} ${r}`, prec }
}

function convertCall(node: Extract<Expr, { type: 'call' }>, variable: string): PgfNode | null {
  const args = node.args.map((arg) => convert(arg, variable))
  if (args.some((arg) => arg === null)) return null
  const a = args as PgfNode[]

  if (DEG_FUNCS.has(node.name) && a.length === 1) {
    return { text: `${node.name}(deg(${a[0]!.text}))`, prec: 5 }
  }
  if (RAD_FUNCS.has(node.name) && a.length === 1) {
    return { text: `rad(${node.name}(${a[0]!.text}))`, prec: 5 }
  }
  if (PLAIN_FUNCS.has(node.name) && a.length === 1) {
    return { text: `${node.name}(${a[0]!.text})`, prec: 5 }
  }
  switch (node.name) {
    case 'log': {
      if (a.length === 1) return { text: `ln(${a[0]!.text})`, prec: 5 }
      if (a.length === 2) return { text: `ln(${a[0]!.text})/ln(${a[1]!.text})`, prec: 2 }
      return null
    }
    case 'log2':
      return a.length === 1 ? { text: `ln(${a[0]!.text})/ln(2)`, prec: 2 } : null
    case 'log10':
      return a.length === 1 ? { text: `ln(${a[0]!.text})/ln(10)`, prec: 2 } : null
    case 'pow':
      return a.length === 2 ? { text: `(${a[0]!.text})^(${a[1]!.text})`, prec: 5 } : null
    case 'cbrt':
      return a.length === 1 ? { text: `(${a[0]!.text})^(1/3)`, prec: 5 } : null
    case 'mod':
      return a.length === 2 ? { text: `mod(${a[0]!.text}, ${a[1]!.text})`, prec: 5 } : null
    case 'min':
    case 'max': {
      if (a.length < 1) return null
      let text = a[0]!.text
      for (let i = 1; i < a.length; i++) text = `${node.name}(${text}, ${a[i]!.text})`
      return { text, prec: 5 }
    }
    case 'clamp':
      return a.length === 3
        ? { text: `min(max(${a[0]!.text}, ${a[1]!.text}), ${a[2]!.text})`, prec: 5 }
        : null
    default:
      // factorial / gamma / erf / gcd / lcm / binomial / atan2…：无对应
      return null
  }
}

// ---------- 颜色与文本工具 ----------

function hexToPgf(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return 'black'
  const value = match[1]!
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `{rgb,255:red,${r};green,${g};blue,${b}}`
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash ')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde ')
    .replace(/\^/g, '\\textasciicircum ')
}

function fmtNumber(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toPrecision(6)))
}

function lineStyleOptions(curve: Curve): string {
  if (curve.lineStyle === 'dashed') return ', dashed'
  if (curve.lineStyle === 'dotted') return ', dotted'
  return ''
}

/** 折线抽稀：相邻输出点距离小于 epsilon 时跳过（保留端点） */
function thinSegment(points: Point2[], epsilon: number): Point2[] {
  if (points.length <= 2) return [...points]
  const out: Point2[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1]!
    const p = points[i]!
    if (Math.hypot(p.x - last.x, p.y - last.y) >= epsilon) out.push(p)
  }
  out.push(points[points.length - 1]!)
  return out
}

// ---------- 曲线 → \addplot ----------

function curveAddplot(
  curve: Curve,
  range: { xMin: number; xMax: number; yMin: number; yMax: number; tRange: [number, number] },
  size: Size,
  samples: number,
  skipped: TikzSkipped[],
): string[] | null {
  if (!curve.visible) return null
  const color = hexToPgf(curve.color)
  const styleOpts = `color=${color}, line width=0.8pt, samples=${samples}${lineStyleOptions(curve)}`

  const convertOrSkip = (source: string, variable: string): string | null => {
    let ast: Expr
    try {
      ast = parse(source)
    } catch (error) {
      skipped.push({
        name: curve.name,
        reason: `表达式解析失败：${error instanceof Error ? error.message : String(error)}`,
      })
      return null
    }
    const result = convert(ast, variable)
    if (!result) {
      skipped.push({ name: curve.name, reason: '含 PGFPlots 无法表达的运算（如 factorial/gamma）' })
      return null
    }
    return result.text
  }

  switch (curve.kind) {
    case 'explicit': {
      const pgf = convertOrSkip(curve.expr, 'x')
      if (!pgf) return null
      return [
        `\\addplot[${styleOpts}, domain=${fmtNumber(range.xMin)}:${fmtNumber(range.xMax)}] {${pgf}};`,
      ]
    }
    case 'parametric': {
      if (curve.expr2 === undefined) {
        skipped.push({ name: curve.name, reason: '参数方程缺少 y(t) 表达式' })
        return null
      }
      const fx = convertOrSkip(curve.expr, 't')
      if (!fx) return null
      const fy = convertOrSkip(curve.expr2, 't')
      if (!fy) return null
      const [tMin, tMax] = range.tRange
      return [
        `\\addplot[${styleOpts}, parametric, domain=${fmtNumber(tMin)}:${fmtNumber(tMax)}] ({${fx}}, {${fy}});`,
      ]
    }
    case 'polar': {
      const fr = convertOrSkip(curve.expr, 'theta')
      if (!fr) return null
      const [tMin, tMax] = range.tRange
      return [
        `\\addplot[${styleOpts}, parametric, domain=${fmtNumber(tMin)}:${fmtNumber(tMax)}] ({(${fr})*cos(deg(x))}, {(${fr})*sin(deg(x))});`,
      ]
    }
    case 'implicit': {
      // PGFPlots 无隐式绘图：以 marching squares 采样（与屏幕几何一致）输出折线坐标列
      let fn: ReturnType<typeof compile> | null = null
      try {
        fn = compile(parse(curve.expr))
      } catch (error) {
        skipped.push({
          name: curve.name,
          reason: `表达式解析失败：${error instanceof Error ? error.message : String(error)}`,
        })
        return null
      }
      const scope: Record<string, number> = { x: 0, y: 0 }
      const F = (x: number, y: number): number => {
        scope['x'] = x
        scope['y'] = y
        return fn!(scope)
      }
      const sampled = sampleImplicit(F, {
        xMin: range.xMin,
        xMax: range.xMax,
        yMin: range.yMin,
        yMax: range.yMax,
        widthPx: size.width,
        heightPx: size.height,
        quality: 5,
      })
      const epsilon = Math.max(1e-9, (range.xMax - range.xMin) / 800)
      const lines: string[] = []
      for (const segment of sampled.segments) {
        const points = thinSegment(segment, epsilon)
        if (points.length < 2) continue
        const coords = points.map((p) => `(${fmtNumber(p.x)}, ${fmtNumber(p.y)})`).join(' ')
        lines.push(
          `\\draw[color=${color}, line width=0.8pt${lineStyleOptions(curve)}] plot[smooth] coordinates {${coords}};`,
        )
      }
      if (lines.length === 0) {
        skipped.push({ name: curve.name, reason: '隐函数在给定范围内无可绘制分支' })
        return null
      }
      return lines
    }
    default:
      return null
  }
}

// ---------- 图 → TikZ ----------

function graphTikz(graph: GraphObject): string {
  if (!graph.visible) return ''
  const idOf = (nodeId: string): string => `n${nodeId.replace(/[^A-Za-z0-9]/g, '')}`
  const lines: string[] = []
  lines.push('    % 节点')
  for (const node of graph.nodes) {
    lines.push(
      `    \\node[circle, fill=${hexToPgf(node.color)}, draw=white, line width=1pt, inner sep=0pt, minimum size=14pt, label={[font=\\small]below:${escapeLatex(node.label)}}] (${idOf(node.id)}) at (${fmtNumber(node.x)}, ${fmtNumber(node.y)}) {};`,
    )
  }
  lines.push('    % 边')
  for (const edge of graph.edges) {
    const arrow = edge.directed ? '[->, ' : '['
    const weight =
      edge.weight !== null
        ? ` node[midway, auto, font=\\scriptsize, fill=white, inner sep=1pt] {${fmtNumber(edge.weight)}}`
        : ''
    if (edge.source === edge.target) {
      const loopDir = edge.directed ? 'loop above' : 'loop above'
      lines.push(
        `    \\draw${arrow}color=${hexToPgf(edge.color)}, line width=0.8pt] (${idOf(edge.source)}) edge [${loopDir}]${weight} ();`,
      )
    } else {
      lines.push(
        `    \\draw${arrow}color=${hexToPgf(edge.color)}, line width=0.8pt] (${idOf(edge.source)}) --${weight} (${idOf(edge.target)});`,
      )
    }
  }
  return lines.join('\n')
}

// ---------- 文档装配 ----------

export function buildTikz(
  doc: DocState,
  mode: 'plot' | 'graph',
  baseView: ViewTransform,
  options: TikzExportOptions,
): TikzResult {
  const samples = options.samples ?? DEFAULT_SAMPLES
  const objects = objectsOfMode(doc, mode)
  const view = resolveView(options.range, baseView, options.size, objects)
  const bounds = viewBounds(view, options.size)
  const skipped: TikzSkipped[] = []

  const body: string[] = []
  if (mode === 'graph') {
    body.push('  % ---- 图 ----')
    body.push('  \\begin{tikzpicture}')
    for (const object of objects) {
      if (object.type === 'graph') body.push(graphTikz(object))
    }
    body.push('  \\end{tikzpicture}')
  } else {
    const plots: string[] = []
    for (const object of objects) {
      if (object.type !== 'curve') continue
      const addplot = curveAddplot(
        object,
        {
          xMin: bounds.minX,
          xMax: bounds.maxX,
          yMin: bounds.minY,
          yMax: bounds.maxY,
          tRange: [0, 2 * Math.PI],
        },
        options.size,
        samples,
        skipped,
      )
      if (addplot) {
        plots.push(`    % 曲线：${object.name}`)
        for (const line of addplot) plots.push(`    ${line}`)
      }
    }
    if (plots.length > 0) {
      body.push('  % ---- 函数曲线 ----')
      body.push('  \\begin{tikzpicture}')
      body.push('    \\begin{axis}[')
      body.push('      axis lines=middle,')
      body.push('      xlabel={$x$}, ylabel={$y$},')
      body.push(`      xmin=${fmtNumber(bounds.minX)}, xmax=${fmtNumber(bounds.maxX)},`)
      body.push(`      ymin=${fmtNumber(bounds.minY)}, ymax=${fmtNumber(bounds.maxY)},`)
      body.push('    ]')
      body.push(...plots)
      body.push('    \\end{axis}')
      body.push('  \\end{tikzpicture}')
    }
  }

  const commentLines = [
    `% 由「Math Drawing」导出（v0.6）`,
    `% 模式：${mode === 'graph' ? '图论' : '函数绘图'}；范围：${options.range.kind}`,
  ]
  for (const item of skipped) {
    commentLines.push(`% [跳过] ${item.name}：${item.reason}`)
  }

  const tex = options.standalone
    ? [
        '\\documentclass[tikz,border=6pt]{standalone}',
        '\\usepackage{pgfplots}',
        '\\pgfplotsset{compat=1.18}',
        ...commentLines,
        '\\begin{document}',
        ...body,
        '\\end{document}',
        '',
      ].join('\n')
    : [...commentLines, ...body, ''].join('\n')

  return { tex, skipped }
}
