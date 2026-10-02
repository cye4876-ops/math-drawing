/**
 * Notebook → 自包含 HTML（v1.0）：
 * - 单文件：页面样式 + KaTeX 样式（字体指向 CDN，离线降级系统字体）全部内联；
 * - 文本格：Markdown 预渲染（公式 KaTeX 转 HTML）；
 * - 图形格：曲线/图/散点数据以数学坐标内嵌，配轻量 viewer 脚本（滚轮缩放 + 拖拽平移，可交互）；
 *   非直角坐标（对数/极坐标网格）图退化为静态 PNG；含 3D 对象时给出提示；
 * - 计算/数据格：静态渲染执行结果快照（不重新执行）。
 * - print 模式：白底高 DPI 静态渲染（PDF 打印用，无交互脚本）。
 */
import katexCss from 'katex/dist/katex.min.css?inline'
import { renderFrame } from '../export/frame'
import { getCurveSample } from '../render/curve-renderer'
import { toLatex } from '../symbolic/latex'
import { parse } from '../expr'
import type { DocState, SceneObject, Size, ViewTransform } from '../state/types'
import { escapeHtml, renderMarkdown, ensureKatex, type KatexLike } from './markdown'
import {
  formatResult,
  type CellExecutionResult,
  type NotebookRunResult,
  type NotebookCell,
  type Notebook,
} from './model'

const FIGURE_SIZE: Size = { width: 760, height: 400 }

interface FigureCurve {
  color: string
  dash: number[]
  /** 扁平点数组 [x1,y1,x2,y2,...]（数学坐标） */
  lines: number[][]
}

interface FigureData {
  cx: number
  cy: number
  sx: number
  sy: number
  rect: boolean
  curves: FigureCurve[]
  markers: number[][]
  nodes: (number | string)[][]
  edges: (number | string)[][]
  points: number[][]
  staticImage?: string
  note?: string
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function flatten(
  polyline: { segments: { x: number; y: number }[][] },
  view: ViewTransform,
  size: Size,
): number[][] {
  const toMathX = (px: number): number => view.centerX + (px - size.width / 2) / view.scaleX
  const toMathY = (py: number): number => view.centerY - (py - size.height / 2) / view.scaleY
  return polyline.segments.map((segment) => {
    const flat: number[] = []
    for (const point of segment) {
      flat.push(round(toMathX(point.x)), round(toMathY(point.y)))
    }
    return flat
  })
}

function renderStaticPng(doc: DocState, view: ViewTransform, scale = 2): string {
  const canvas = document.createElement('canvas')
  canvas.width = FIGURE_SIZE.width * scale
  canvas.height = FIGURE_SIZE.height * scale
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, FIGURE_SIZE.width, FIGURE_SIZE.height)
  const mode = inferDocMode(doc)
  renderFrame(context, doc, mode, view, FIGURE_SIZE, { theme: 'light', withGrid: true })
  return canvas.toDataURL('image/png')
}

function inferDocMode(doc: DocState): 'plot' | 'graph' | 'stats' {
  if (doc.objects.some((object) => object.type === 'graph')) return 'graph'
  if (doc.objects.some((object) => object.type === 'dataset')) return 'stats'
  return 'plot'
}

const SPACE_TYPES = new Set(['surface3d', 'curve3d', 'field3d', 'ode2d'])

function collectFigureData(doc: DocState, view: ViewTransform): FigureData {
  const data: FigureData = {
    cx: view.centerX,
    cy: view.centerY,
    sx: view.scaleX,
    sy: view.scaleY,
    rect: view.coordType === 'rect',
    curves: [],
    markers: [],
    nodes: [],
    edges: [],
    points: [],
  }
  let hasSpace = false
  for (const object of doc.objects as SceneObject[]) {
    if (object.type === 'curve') {
      if (!object.visible) continue
      const sample = getCurveSample(object, view, FIGURE_SIZE)
      if (sample) {
        data.curves.push({
          color: object.color,
          dash:
            object.lineStyle === 'solid' ? [] : object.lineStyle === 'dashed' ? [8, 5] : [1.5, 3.5],
          lines: flatten(sample, view, FIGURE_SIZE),
        })
      }
    } else if (object.type === 'marker') {
      data.markers.push([round(object.x), round(object.y)])
    } else if (object.type === 'graph') {
      const byId = new Map(object.nodes.map((node) => [node.id, node]))
      for (const node of object.nodes) {
        data.nodes.push([round(node.x), round(node.y), node.color, node.label])
      }
      for (const edge of object.edges) {
        const source = byId.get(edge.source)
        const target = byId.get(edge.target)
        if (source && target) {
          data.edges.push([
            round(source.x),
            round(source.y),
            round(target.x),
            round(target.y),
            edge.color,
          ])
        }
      }
    } else if (object.type === 'dataset') {
      const chart = object.chart
      if (chart.kind === 'scatter') {
        for (const row of object.rows) {
          const x = row[chart.xColumn]
          const y = row[chart.yColumn]
          if (x !== null && x !== undefined && y !== null && y !== undefined) {
            data.points.push([round(x), round(y)])
          }
        }
      } else {
        data.note = '该数据集的图表类型未在导出中重建（可在工具中查看）。'
      }
    } else if (SPACE_TYPES.has(object.type)) {
      hasSpace = true
    }
  }
  if (hasSpace) {
    data.note = (data.note ?? '') + '含 3D 对象：导出 HTML 中仅显示 2D 部分。'
  }
  if (!data.rect) {
    // 非直角坐标：viewer 无法线性重映射 → 静态 PNG 保真
    data.staticImage = renderStaticPng(doc, view, 2)
  }
  return data
}

/** 轻量交互 viewer（内嵌脚本的运行时部分；无模板字符串以免导出转义冲突） */
const VIEWER_SCRIPT = [
  'function mdCreateViewer(canvas, data) {',
  '  var ctx = canvas.getContext("2d");',
  '  var view = { cx: data.cx, cy: data.cy, sx: data.sx, sy: data.sy };',
  '  var dpr = window.devicePixelRatio || 1;',
  '  function sx(mx) { return canvas.width / 2 + (mx - view.cx) * view.sx * dpr; }',
  '  function sy(my) { return canvas.height / 2 - (my - view.cy) * view.sy * dpr; }',
  '  function niceStep(target) {',
  '    var p = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));',
  '    var n = target / p;',
  '    return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;',
  '  }',
  '  function draw() {',
  '    var w = canvas.width, h = canvas.height;',
  '    ctx.setTransform(1, 0, 0, 1, 0, 0);',
  '    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);',
  '    var stepX = niceStep(90 / (view.sx * dpr));',
  '    var stepY = niceStep(90 / (view.sy * dpr));',
  '    var minX = view.cx - w / 2 / (view.sx * dpr), maxX = view.cx + w / 2 / (view.sx * dpr);',
  '    var minY = view.cy - h / 2 / (view.sy * dpr), maxY = view.cy + h / 2 / (view.sy * dpr);',
  '    ctx.strokeStyle = "#e6ebf4"; ctx.lineWidth = 1;',
  '    for (var x = Math.ceil(minX / stepX) * stepX; x <= maxX; x += stepX) {',
  '      var px = sx(x);',
  '      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();',
  '    }',
  '    for (var y = Math.ceil(minY / stepY) * stepY; y <= maxY; y += stepY) {',
  '      var py = sy(y);',
  '      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();',
  '    }',
  '    ctx.strokeStyle = "#9fb0cc";',
  '    if (minX <= 0 && maxX >= 0) { var ax = sx(0); ctx.beginPath(); ctx.moveTo(ax, 0); ctx.lineTo(ax, h); ctx.stroke(); }',
  '    if (minY <= 0 && maxY >= 0) { var ay = sy(0); ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(w, ay); ctx.stroke(); }',
  '    for (var c = 0; c < data.curves.length; c++) {',
  '      var curve = data.curves[c];',
  '      ctx.strokeStyle = curve.color; ctx.lineWidth = 2 * dpr;',
  '      ctx.setLineDash(curve.dash || []);',
  '      for (var l = 0; l < curve.lines.length; l++) {',
  '        var pts = curve.lines[l];',
  '        ctx.beginPath();',
  '        for (var i = 0; i < pts.length; i += 2) {',
  '          var X = sx(pts[i]), Y = sy(pts[i + 1]);',
  '          if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);',
  '        }',
  '        ctx.stroke();',
  '      }',
  '      ctx.setLineDash([]);',
  '    }',
  '    for (var g = 0; g < data.edges.length; g++) {',
  '      var e = data.edges[g];',
  '      ctx.strokeStyle = e[4]; ctx.lineWidth = 1.6 * dpr;',
  '      ctx.beginPath(); ctx.moveTo(sx(e[0]), sy(e[1])); ctx.lineTo(sx(e[2]), sy(e[3])); ctx.stroke();',
  '    }',
  '    for (var n = 0; n < data.nodes.length; n++) {',
  '      var node = data.nodes[n];',
  '      ctx.fillStyle = node[2];',
  '      ctx.beginPath(); ctx.arc(sx(node[0]), sy(node[1]), 8 * dpr, 0, Math.PI * 2); ctx.fill();',
  '      ctx.fillStyle = "#ffffff"; ctx.font = (9 * dpr) + "px sans-serif";',
  '      ctx.textAlign = "center"; ctx.textBaseline = "middle";',
  '      ctx.fillText(String(node[3]), sx(node[0]), sy(node[1]));',
  '    }',
  '    ctx.fillStyle = "#e11d48";',
  '    for (var m = 0; m < data.markers.length; m++) {',
  '      ctx.beginPath(); ctx.arc(sx(data.markers[m][0]), sy(data.markers[m][1]), 4 * dpr, 0, Math.PI * 2); ctx.fill();',
  '    }',
  '    ctx.fillStyle = "#31507c";',
  '    for (var p = 0; p < data.points.length; p++) {',
  '      ctx.beginPath(); ctx.arc(sx(data.points[p][0]), sy(data.points[p][1]), 2.6 * dpr, 0, Math.PI * 2); ctx.fill();',
  '    }',
  '  }',
  '  function resize() {',
  '    canvas.width = canvas.clientWidth * dpr;',
  '    canvas.height = canvas.clientHeight * dpr;',
  '    draw();',
  '  }',
  '  canvas.addEventListener("wheel", function (event) {',
  '    event.preventDefault();',
  '    var rect = canvas.getBoundingClientRect();',
  '    var factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;',
  '    var ox = (event.clientX - rect.left - rect.width / 2) / view.sx;',
  '    var oy = -(event.clientY - rect.top - rect.height / 2) / view.sy;',
  '    view.cx += ox * (1 - 1 / factor);',
  '    view.cy += oy * (1 - 1 / factor);',
  '    view.sx *= factor; view.sy *= factor;',
  '    draw();',
  '  }, { passive: false });',
  '  var dragging = null;',
  '  canvas.addEventListener("pointerdown", function (event) {',
  '    dragging = { x: event.clientX, y: event.clientY };',
  '    canvas.setPointerCapture(event.pointerId);',
  '    canvas.style.cursor = "grabbing";',
  '  });',
  '  canvas.addEventListener("pointermove", function (event) {',
  '    if (!dragging) return;',
  '    view.cx -= (event.clientX - dragging.x) / view.sx;',
  '    view.cy += (event.clientY - dragging.y) / view.sy;',
  '    dragging = { x: event.clientX, y: event.clientY };',
  '    draw();',
  '  });',
  '  canvas.addEventListener("pointerup", function () {',
  '    dragging = null; canvas.style.cursor = "grab";',
  '  });',
  '  window.addEventListener("resize", resize);',
  '  canvas.style.cursor = "grab";',
  '  resize();',
  '}',
].join('\n')

const PAGE_STYLE = [
  ':root { color-scheme: light; }',
  'body { margin: 0; background: #eef1f7; color: #1d2b42;',
  '  font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans SC", sans-serif; }',
  'header { background: #ffffff; border-bottom: 1px solid #d8dfeb; padding: 18px 28px; }',
  'header h1 { margin: 0 0 4px 0; font-size: 22px; }',
  'header .meta { margin: 0; color: #7a8aa8; font-size: 12px; }',
  'main { max-width: 900px; margin: 0 auto; padding: 18px 16px 60px 16px; }',
  '.cell { background: #ffffff; border: 1px solid #d8dfeb; border-radius: 10px;',
  '  margin: 0 0 12px 0; padding: 14px 18px; box-shadow: 0 1px 2px rgba(20,30,50,.05); }',
  '.cell .kind { font-size: 11px; color: #7a8aa8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }',
  '.cell pre { background: #f3f6fb; padding: 10px 12px; border-radius: 8px; overflow-x: auto; }',
  '.cell blockquote { border-left: 3px solid #c4d2e8; margin: .4em 0; padding-left: 10px; color: #4a5d80; }',
  '.cell table { border-collapse: collapse; font-size: 13px; font-family: ui-monospace, monospace; }',
  '.cell th, .cell td { border: 1px solid #e3e9f3; padding: 3px 10px; text-align: right; }',
  '.cell th { background: #f3f6fb; }',
  '.figure-caption { margin: 8px 2px 0 2px; color: #4a5d80; font-size: 13px; }',
  'canvas.figure-canvas { width: 100%; height: 380px; display: block; border: 1px solid #e3e9f3; border-radius: 8px; }',
  'img.figure-static { width: 100%; display: block; border: 1px solid #e3e9f3; border-radius: 8px; }',
  '.note { color: #7a8aa8; font-size: 12px; margin-top: 6px; }',
  '.result { color: #143a66; }',
  '.error { color: #b3261e; background: #fdecea; border: 1px solid #f6c9c4; border-radius: 8px; padding: 6px 10px; }',
  '@media print { body { background: #ffffff; } .cell { box-shadow: none; break-inside: avoid; } }',
].join('\n')

function fixKatexFonts(css: string): string {
  return css.replace(/url\(fonts\//g, 'url(https://cdn.jsdelivr.net/npm/katex@0.18.9/dist/fonts/')
}

function renderCellHtml(
  cell: NotebookCell,
  result: CellExecutionResult | undefined,
  katex: KatexLike | null,
  print: boolean,
  viewerIndex: { count: number },
): string {
  if (cell.type === 'markdown') {
    return `<section class="cell md"><div class="kind">文本</div>${renderMarkdown(cell.text, katex ? { katex } : {})}</section>`
  }
  if (cell.type === 'compute') {
    const parts: string[] = [`<section class="cell compute"><div class="kind">计算</div>`]
    let latex: string | null
    try {
      latex = toLatex(parse(cell.source))
    } catch {
      latex = null
    }
    parts.push(`<pre>${escapeHtml(cell.source)}</pre>`)
    if (latex && katex) {
      try {
        parts.push(
          `<div class="result">${katex.renderToString(latex, { throwOnError: false, displayMode: true })}</div>`,
        )
      } catch {
        // 忽略
      }
    }
    const execution = result
    if (execution?.status === 'error') {
      parts.push(`<div class="error">${escapeHtml(execution.error ?? '执行失败')}</div>`)
    } else if (execution?.defined) {
      parts.push(
        `<div class="result">已定义 ${escapeHtml(execution.defined.name)} = ${escapeHtml(formatResult(execution.defined.value))}</div>`,
      )
    } else if (execution?.symbolic) {
      for (const line of execution.symbolic.latex) {
        if (katex) {
          try {
            parts.push(
              `<div class="result">${katex.renderToString(line, { throwOnError: false, displayMode: true })}</div>`,
            )
          } catch {
            parts.push(`<div class="result">${escapeHtml(line)}</div>`)
          }
        } else {
          parts.push(`<div class="result">${escapeHtml(line)}</div>`)
        }
      }
      for (const line of execution.symbolic.text) {
        parts.push(`<div class="note">${escapeHtml(line)}</div>`)
      }
    } else if (execution?.status === 'ok' && execution.value !== undefined) {
      parts.push(
        `<div class="result">= ${escapeHtml(execution.text ?? formatResult(execution.value))}</div>`,
      )
    }
    parts.push('</section>')
    return parts.join('')
  }
  if (cell.type === 'data') {
    const parts: string[] = [`<section class="cell data"><div class="kind">数据</div>`]
    if (result?.table) {
      const table = result.table
      parts.push(`<div class="note">${table.columns.length} 列 × ${table.rowCount} 行</div>`)
      parts.push('<table><thead><tr>')
      for (const column of table.columns) parts.push(`<th>${escapeHtml(column)}</th>`)
      parts.push('</tr></thead><tbody>')
      for (const row of table.preview) {
        parts.push('<tr>')
        for (const value of row)
          parts.push(`<td>${value === null ? '—' : escapeHtml(formatResult(value))}</td>`)
        parts.push('</tr>')
      }
      parts.push('</tbody></table>')
      if (table.rowCount > table.preview.length) {
        parts.push(`<div class="note">（仅显示前 ${table.preview.length} 行）</div>`)
      }
    } else {
      parts.push(`<pre>${escapeHtml(cell.csv)}</pre>`)
    }
    parts.push('</section>')
    return parts.join('')
  }
  if (cell.type === 'figure') {
    const parts: string[] = [`<section class="cell figure"><div class="kind">图形</div>`]
    if (!cell.doc || !cell.view) {
      parts.push('<div class="note">（空图形格）</div>')
    } else if (print || cell.view.coordType !== 'rect') {
      const image = renderStaticPng(cell.doc, cell.view, print ? 3 : 2)
      parts.push(
        `<img class="figure-static" src="${image}" alt="${escapeHtml(cell.caption || '图形')}" />`,
      )
    } else {
      const data = collectFigureData(cell.doc, cell.view)
      const viewerId = `viewer-${viewerIndex.count++}`
      parts.push(
        `<canvas class="figure-canvas" id="${viewerId}" data-figure='${JSON.stringify(data).replace(/'/g, '&#39;')}'></canvas>`,
      )
      if (data.note) parts.push(`<div class="note">${escapeHtml(data.note)}</div>`)
    }
    if (cell.caption) parts.push(`<div class="figure-caption">${escapeHtml(cell.caption)}</div>`)
    parts.push('</section>')
    return parts.join('')
  }
  // plugin 格：静态提示
  return `<section class="cell plugin"><div class="kind">插件</div><div class="note">插件单元格「${escapeHtml(cell.pluginType)}」需在应用内查看。</div></section>`
}

export interface HtmlExportOptions {
  /** 打印模式：白底、静态高 DPI 图、无交互脚本（用于 PDF 打印） */
  print?: boolean
}

/** 构建自包含 Notebook HTML（单文件） */
export async function buildNotebookHtml(
  notebook: Notebook,
  runResult: NotebookRunResult,
  options: HtmlExportOptions = {},
): Promise<string> {
  const katex = await ensureKatex()
  const print = options.print === true
  const viewerIndex = { count: 0 }
  const sections: string[] = []
  for (const cell of notebook.cells) {
    sections.push(renderCellHtml(cell, runResult.cells.get(cell.id), katex, print, viewerIndex))
  }
  const script = print
    ? ''
    : `<script>${VIEWER_SCRIPT}
document.querySelectorAll('canvas[data-figure]').forEach(function (canvas) {
  try {
    mdCreateViewer(canvas, JSON.parse(canvas.getAttribute('data-figure')));
  } catch (error) {
    canvas.parentElement.insertAdjacentHTML('beforeend', '<div class="note">图形初始化失败：' + String(error) + '</div>');
  }
});</script>`
  const interactHint = print ? '' : '<div class="note">图形支持滚轮缩放与拖拽平移。</div>'
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapeHtml(notebook.title)}</title>`,
    `<style>${fixKatexFonts(katexCss as string)}</style>`,
    `<style>${PAGE_STYLE}</style>`,
    '</head>',
    '<body>',
    `<header><h1>${escapeHtml(notebook.title)}</h1><p class="meta">Math Drawing v1.0 导出 · ${new Date().toLocaleString('zh-CN')}</p></header>`,
    `<main>${interactHint}${sections.join('\n')}</main>`,
    script,
    '</body>',
    '</html>',
  ].join('\n')
}
