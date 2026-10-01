import type {
  Curve,
  Curve3D,
  CurveKind,
  Dataset,
  DocState,
  Field3D,
  GraphObject,
  LineStyle,
  Ode2D,
  PluginSceneObject,
  PresetBinding,
  SceneObject,
  Surface3D,
  Surface3DKind,
  ViewTransform,
} from './types'
import { createView } from '../core/transform'
import { normalizeGraphDoc } from '../graph/model'
import { normalizeDataset } from '../stats/model'

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

/** 解析图对象（v0.5）：顶点/边经 normalizeGraphDoc 校验与默认值补齐 */
function parseGraph(raw: Record<string, unknown>, position: number): GraphObject {
  const id = raw['id']
  if (typeof id !== 'string' || id === '')
    throw new DocFormatError(`第 ${position} 个对象缺少合法 id`)
  let graphDoc
  try {
    graphDoc = normalizeGraphDoc({ nodes: raw['nodes'], edges: raw['edges'] })
  } catch (error) {
    throw new DocFormatError(
      `第 ${position} 个图对象无效：${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return {
    id,
    type: 'graph',
    name: typeof raw['name'] === 'string' && raw['name'] !== '' ? raw['name'] : '图',
    nodes: graphDoc.nodes,
    edges: graphDoc.edges,
    visible: typeof raw['visible'] === 'boolean' ? raw['visible'] : true,
  }
}

/** 解析数据集对象（v0.7）：经 normalizeDataset 校验与默认值补齐 */
function parseDataset(raw: Record<string, unknown>, position: number): Dataset {
  try {
    return normalizeDataset(raw)
  } catch (error) {
    throw new DocFormatError(
      `第 ${position} 个数据集无效：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

const SURFACE3D_KINDS: readonly Surface3DKind[] = [
  'explicit',
  'parametric',
  'implicit',
  'revolve',
  'polyhedron',
]

/** 有限数字读取（带夹取） */
function numField(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  min?: number,
  max?: number,
): number {
  const value = raw[key]
  let result = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  if (min !== undefined) result = Math.max(min, result)
  if (max !== undefined) result = Math.min(max, result)
  return result
}

/** 解析参数化预设绑定（v0.8.1）：presetId 必须为非空字符串；params 只保留有限数字 */
function parsePresetBinding(raw: unknown): PresetBinding | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  const presetId = record['presetId']
  if (typeof presetId !== 'string' || presetId === '') return undefined
  const params: Record<string, number> = {}
  const paramsRaw = record['params']
  if (paramsRaw !== null && typeof paramsRaw === 'object') {
    for (const [key, value] of Object.entries(paramsRaw as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) params[key] = value
    }
  }
  return { presetId, params }
}

function parseSurface3D(raw: Record<string, unknown>, position: number): Surface3D {
  const id = raw['id']
  const kind = raw['kind']
  const expr = raw['expr']
  if (typeof id !== 'string' || id === '')
    throw new DocFormatError(`第 ${position} 个对象缺少合法 id`)
  if (typeof kind !== 'string' || !SURFACE3D_KINDS.includes(kind as Surface3DKind))
    throw new DocFormatError(`第 ${position} 个对象曲面类型无效`)
  if (typeof expr !== 'string' || expr === '')
    throw new DocFormatError(`第 ${position} 个曲面缺少表达式`)
  const surface: Surface3D = {
    id,
    type: 'surface3d',
    name: typeof raw['name'] === 'string' && raw['name'] !== '' ? raw['name'] : expr,
    kind: kind as Surface3DKind,
    expr,
    xMin: numField(raw, 'xMin', -5),
    xMax: numField(raw, 'xMax', 5),
    yMin: numField(raw, 'yMin', -5),
    yMax: numField(raw, 'yMax', 5),
    zMin: numField(raw, 'zMin', -5),
    zMax: numField(raw, 'zMax', 5),
    color: typeof raw['color'] === 'string' && raw['color'] !== '' ? raw['color'] : '#2563eb',
    opacity: numField(raw, 'opacity', 1, 0.1, 1),
    resolution: Math.round(numField(raw, 'resolution', 64, 4, 256)),
    visible: typeof raw['visible'] === 'boolean' ? raw['visible'] : true,
  }
  if (typeof raw['expr2'] === 'string') surface.expr2 = raw['expr2']
  if (typeof raw['expr3'] === 'string') surface.expr3 = raw['expr3']
  const surfaceTemplate = parsePresetBinding(raw['template'])
  if (surfaceTemplate) surface.template = surfaceTemplate
  return surface
}

function parseCurve3D(raw: Record<string, unknown>, position: number): Curve3D {
  const id = raw['id']
  const kind = raw['kind']
  const expr = raw['expr']
  if (typeof id !== 'string' || id === '')
    throw new DocFormatError(`第 ${position} 个对象缺少合法 id`)
  if (kind !== 'parametric' && kind !== 'lorenz')
    throw new DocFormatError(`第 ${position} 个空间曲线类型无效`)
  if (typeof expr !== 'string') throw new DocFormatError(`第 ${position} 个空间曲线缺少表达式`)
  const curve: Curve3D = {
    id,
    type: 'curve3d',
    name: typeof raw['name'] === 'string' && raw['name'] !== '' ? raw['name'] : expr,
    kind,
    expr,
    tMin: numField(raw, 'tMin', 0),
    tMax: numField(raw, 'tMax', Math.PI * 6),
    steps: Math.round(numField(raw, 'steps', 600, 2, 200_000)),
    color: typeof raw['color'] === 'string' && raw['color'] !== '' ? raw['color'] : '#dc2626',
    visible: typeof raw['visible'] === 'boolean' ? raw['visible'] : true,
  }
  if (typeof raw['expr2'] === 'string') curve.expr2 = raw['expr2']
  if (typeof raw['expr3'] === 'string') curve.expr3 = raw['expr3']
  const curveTemplate = parsePresetBinding(raw['template'])
  if (curveTemplate) curve.template = curveTemplate
  return curve
}

function parseField3D(raw: Record<string, unknown>, position: number): Field3D {
  const id = raw['id']
  const space = raw['space']
  const expr = raw['expr']
  if (typeof id !== 'string' || id === '')
    throw new DocFormatError(`第 ${position} 个对象缺少合法 id`)
  if (space !== 'plane' && space !== 'space')
    throw new DocFormatError(`第 ${position} 个向量场空间类型无效`)
  if (typeof expr !== 'string' || expr === '')
    throw new DocFormatError(`第 ${position} 个向量场缺少分量表达式`)
  const colorMode = raw['colorMode']
  const field: Field3D = {
    id,
    type: 'field3d',
    name: typeof raw['name'] === 'string' && raw['name'] !== '' ? raw['name'] : expr,
    space,
    expr,
    xMin: numField(raw, 'xMin', -3),
    xMax: numField(raw, 'xMax', 3),
    yMin: numField(raw, 'yMin', -3),
    yMax: numField(raw, 'yMax', 3),
    zMin: numField(raw, 'zMin', -3),
    zMax: numField(raw, 'zMax', 3),
    divisions: Math.round(numField(raw, 'divisions', 6, 2, 24)),
    scale: numField(raw, 'scale', 1.6, 0.1, 5),
    colorMode: colorMode === 'divergence' || colorMode === 'curl' ? colorMode : ('none' as const),
    streamSeeds: Math.round(numField(raw, 'streamSeeds', 0, 0, 64)),
    color: typeof raw['color'] === 'string' && raw['color'] !== '' ? raw['color'] : '#0891b2',
    visible: typeof raw['visible'] === 'boolean' ? raw['visible'] : true,
  }
  if (typeof raw['expr2'] === 'string') field.expr2 = raw['expr2']
  if (typeof raw['expr3'] === 'string') field.expr3 = raw['expr3']
  const fieldTemplate = parsePresetBinding(raw['template'])
  if (fieldTemplate) field.template = fieldTemplate
  return field
}

function parseOde2D(raw: Record<string, unknown>, position: number): Ode2D {
  const id = raw['id']
  const expr = raw['expr']
  if (typeof id !== 'string' || id === '')
    throw new DocFormatError(`第 ${position} 个对象缺少合法 id`)
  if (typeof expr !== 'string' || expr === '')
    throw new DocFormatError(`第 ${position} 个 ODE 对象缺少表达式`)
  return {
    id,
    type: 'ode2d',
    name: typeof raw['name'] === 'string' && raw['name'] !== '' ? raw['name'] : expr,
    expr,
    x0: numField(raw, 'x0', 0),
    y0: numField(raw, 'y0', 1),
    xEnd: numField(raw, 'xEnd', 3),
    steps: Math.round(numField(raw, 'steps', 30, 1, 20_000)),
    directionField: typeof raw['directionField'] === 'boolean' ? raw['directionField'] : true,
    visible: typeof raw['visible'] === 'boolean' ? raw['visible'] : true,
  }
}

/** 插件场景对象（v1.0）：data 原样保留（插件自行校验解释） */
function parsePluginObject(raw: Record<string, unknown>, position: number): PluginSceneObject {
  const id = raw['id']
  if (typeof id !== 'string' || id === '') {
    throw new DocFormatError(`第 ${position} 个插件对象缺少 id`)
  }
  const pluginType = raw['pluginType']
  if (typeof pluginType !== 'string' || pluginType === '') {
    throw new DocFormatError(`第 ${position} 个插件对象缺少 pluginType`)
  }
  return {
    id,
    type: 'plugin',
    pluginType,
    name: typeof raw['name'] === 'string' ? raw['name'] : pluginType,
    data: raw['data'],
    visible: raw['visible'] !== false,
  }
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
    else if (raw['type'] === 'graph') objects.push(parseGraph(raw, index))
    else if (raw['type'] === 'dataset') objects.push(parseDataset(raw, index))
    else if (raw['type'] === 'surface3d') objects.push(parseSurface3D(raw, index))
    else if (raw['type'] === 'curve3d') objects.push(parseCurve3D(raw, index))
    else if (raw['type'] === 'field3d') objects.push(parseField3D(raw, index))
    else if (raw['type'] === 'ode2d') objects.push(parseOde2D(raw, index))
    else if (raw['type'] === 'plugin') objects.push(parsePluginObject(raw, index))
    else throw new DocFormatError(`第 ${index} 个对象类型未知：${String(raw['type'])}`)
  })

  return { doc: { objects }, view: parseView(root['view']) }
}
