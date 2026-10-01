import type { Curve, CurveKind, DocState, LineStyle, SceneObject, ViewTransform } from './types'
import { createView } from '../core/transform'

/** 文档 JSON 格式版本（v0.6 分享链接的基础） */
export const DOC_FORMAT_VERSION = 1

export interface SerializedDocument {
  version: number
  view: ViewTransform
  objects: SceneObject[]
}

/** 文档格式错误（导入失败时抛出，消息面向用户） */
export class DocFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocFormatError'
  }
}

const CURVE_KINDS: readonly CurveKind[] = ['explicit', 'implicit', 'parametric', 'polar']
const LINE_STYLES: readonly LineStyle[] = ['solid', 'dashed', 'dotted']

/** 完整文档状态 → JSON 字符串（曲线 + 标记点 + 视图） */
export function serializeDocument(doc: DocState, view: ViewTransform): string {
  const payload: SerializedDocument = {
    version: DOC_FORMAT_VERSION,
    view,
    objects: doc.objects,
  }
  return JSON.stringify(payload, null, 2)
}

function parseCurve(raw: Record<string, unknown>, position: number): Curve {
  const id = raw['id']
  const kind = raw['kind']
  const name = raw['name']
  const expr = raw['expr']
  const color = raw['color']
  const lineStyle = raw['lineStyle']
  const quality = raw['quality']
  const visible = raw['visible']
  if (typeof id !== 'string' || id === '')
    throw new DocFormatError(`第 ${position} 个对象缺少合法 id`)
  if (typeof kind !== 'string' || !CURVE_KINDS.includes(kind as CurveKind))
    throw new DocFormatError(`第 ${position} 个对象曲线类型无效`)
  if (typeof expr !== 'string') throw new DocFormatError(`第 ${position} 个对象缺少表达式`)
  const curve: Curve = {
    id,
    type: 'curve',
    kind: kind as CurveKind,
    name: typeof name === 'string' && name !== '' ? name : expr,
    expr,
    color: typeof color === 'string' && color !== '' ? color : '#2563eb',
    lineStyle: LINE_STYLES.includes(lineStyle as LineStyle) ? (lineStyle as LineStyle) : 'solid',
    quality:
      typeof quality === 'number' && Number.isFinite(quality)
        ? Math.min(5, Math.max(1, Math.round(quality)))
        : 3,
    visible: typeof visible === 'boolean' ? visible : true,
  }
  const expr2 = raw['expr2']
  if (typeof expr2 === 'string') curve.expr2 = expr2
  return curve
}

function parseMarker(raw: Record<string, unknown>, position: number): SceneObject {
  const id = raw['id']
  const x = raw['x']
  const y = raw['y']
  if (typeof id !== 'string' || id === '')
    throw new DocFormatError(`第 ${position} 个对象缺少合法 id`)
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y))
    throw new DocFormatError(`第 ${position} 个标记点坐标无效`)
  return { id, type: 'marker', x, y }
}

function parseView(raw: unknown): ViewTransform {
  const base = createView()
  if (raw === null || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const view: ViewTransform = { ...base }
  const num = (key: string, fallback: number): number => {
    const value = r[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
  view.centerX = num('centerX', base.centerX)
  view.centerY = num('centerY', base.centerY)
  view.scaleX = num('scaleX', base.scaleX)
  view.scaleY = num('scaleY', base.scaleY)
  view.axisX = num('axisX', base.axisX)
  view.axisY = num('axisY', base.axisY)
  view.equalAspect = typeof r['equalAspect'] === 'boolean' ? r['equalAspect'] : base.equalAspect
  view.axisVisible = typeof r['axisVisible'] === 'boolean' ? r['axisVisible'] : base.axisVisible
  const coordType = r['coordType']
  if (coordType === 'rect' || coordType === 'polar' || coordType === 'log') {
    view.coordType = coordType
  }
  return view
}

/** JSON 字符串 → 文档与视图（严格校验，失败抛出 DocFormatError） */
export function deserializeDocument(json: string): { doc: DocState; view: ViewTransform } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new DocFormatError('不是合法的 JSON 文本')
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new DocFormatError('文档根节点必须是对象')
  }
  const root = parsed as Record<string, unknown>
  const version = root['version']
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    throw new DocFormatError('缺少 version 字段')
  }
  if (version > DOC_FORMAT_VERSION) {
    throw new DocFormatError(`文档版本（${version}）高于当前支持的版本（${DOC_FORMAT_VERSION}）`)
  }
  const rawObjects = root['objects']
  if (!Array.isArray(rawObjects)) throw new DocFormatError('缺少 objects 数组')

  const objects: SceneObject[] = []
  rawObjects.forEach((item, index) => {
    if (item === null || typeof item !== 'object') {
      throw new DocFormatError(`第 ${index} 个对象不是有效对象`)
    }
    const raw = item as Record<string, unknown>
    if (raw['type'] === 'curve') objects.push(parseCurve(raw, index))
    else if (raw['type'] === 'marker') objects.push(parseMarker(raw, index))
    else throw new DocFormatError(`第 ${index} 个对象类型未知：${String(raw['type'])}`)
  })

  return { doc: { objects }, view: parseView(root['view']) }
}
