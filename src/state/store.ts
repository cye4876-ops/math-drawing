import type {
  AppState,
  Curve,
  CurveKind,
  Dataset,
  DocState,
  GraphObject,
  MarkerPoint,
  SceneObject,
  SpaceObject,
  ViewTransform,
} from './types'
import type { GraphEdgeData, GraphNodeData } from '../graph/model'
import { createView, sanitizeView } from '../core/transform'
import { extractParameters, parseProgram } from '../expr'

/** 撤销历史最大深度 */
export const HISTORY_LIMIT = 100

/**
 * 曲线默认配色（v2.5）：10 色高对比调色板（色相拉开、深浅交替，浅/深主题下均可辨）；用完循环。
 * 首色沿用原红 #c32222（历史文档/像素断言兼容），节点蓝相近色 #1d4ed8 置末避免与图节点色混淆。
 */
const CURVE_PALETTE: readonly string[] = [
  '#c32222',
  '#15803d',
  '#7c3aed',
  '#c2410c',
  '#0e7490',
  '#be185d',
  '#4d7c0f',
  '#92400e',
  '#475569',
  '#1d4ed8',
]

/** 按序号分配曲线颜色（调色板循环，可被用户覆盖），输出 #rrggbb 以便颜色选择器使用 */
export function colorForIndex(index: number): string {
  const size = CURVE_PALETTE.length
  return CURVE_PALETTE[((index % size) + size) % size] ?? '#c32222'
}

export function isCurve(object: SceneObject): object is Curve {
  return object.type === 'curve'
}

export interface AddCurveInput {
  kind: CurveKind
  expr: string
  /** 仅 parametric：y(t) */
  expr2?: string
  name?: string
  color?: string
  /** 初始参数值（缺省时参数取表达式推导的默认值） */
  params?: Record<string, number>
}

/** 从表达式推导参数值表：识别自由参数（a/b/c…）；已有值按名保留、新参数补默认值、不再使用的参数剔除 */
export function curveParameterValues(
  expr: string,
  expr2: string | undefined,
  existing?: Record<string, number>,
): Record<string, number> {
  const values: Record<string, number> = {}
  try {
    const programs = parseProgram(expr)
    if (expr2 !== undefined && expr2.trim() !== '') programs.push(...parseProgram(expr2))
    for (const parameter of extractParameters(programs)) {
      values[parameter.name] = existing?.[parameter.name] ?? parameter.value
    }
  } catch {
    return existing ? { ...existing } : values
  }
  return values
}

type Listener = (state: AppState) => void

/**
 * 应用状态仓库（框架无关）：
 * - 单一状态源：{ doc, view }；
 * - doc 采用不可变快照进入撤销/重做历史，视图操作（缩放/平移）不记录；
 * - 通过 subscribe 通知订阅者（UI 层做薄适配）。
 */
export class AppStore {
  private doc: DocState = { objects: [] }
  private view: ViewTransform = createView()
  private undoStack: DocState[] = []
  private redoStack: DocState[] = []
  private readonly listeners = new Set<Listener>()

  getState(): AppState {
    return { doc: this.doc, view: this.view }
  }

  getView(): ViewTransform {
    return this.view
  }

  getDoc(): DocState {
    return this.doc
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 文档中的全部曲线（按文档顺序） */
  getCurves(): Curve[] {
    return this.doc.objects.filter(isCurve)
  }

  /**
   * 修改文档并记入撤销历史。
   * mutate 必须是纯函数式更新：基于旧 doc 返回新 doc（不可变快照）。
   */
  commit(mutate: (doc: DocState) => DocState): void {
    this.undoStack.push(this.doc)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.doc = mutate(this.doc)
    this.emit()
  }

  /** 更新视图：不进撤销历史（规格要求：视图缩放/平移不入历史）；对数坐标下中心/轴位置非正时自动归一化 */
  setView(view: ViewTransform): void {
    this.view = sanitizeView(view)
    this.emit()
  }

  undo(): void {
    const prev = this.undoStack.pop()
    if (prev === undefined) return
    this.redoStack.push(this.doc)
    this.doc = prev
    this.emit()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (next === undefined) return
    this.undoStack.push(this.doc)
    this.doc = next
    this.emit()
  }

  /** 在指定数学坐标添加标记点（v0.1 的"添加对象"操作，支撑撤销/重做验收） */
  addMarker(x: number, y: number): MarkerPoint {
    const marker: MarkerPoint = { id: crypto.randomUUID(), type: 'marker', x, y }
    this.commit((doc) => ({ objects: [...doc.objects, marker] }))
    return marker
  }

  /** 添加通用场景对象（v1.0 插件元素）：入撤销历史，返回带 id 的对象 */
  addSceneObject(input: { type: string; [key: string]: unknown }): SceneObject {
    const created = { ...input, id: crypto.randomUUID() } as unknown as SceneObject
    this.commit((doc) => ({ objects: [...doc.objects, created] }))
    return created
  }

  /** 删除任意场景对象（v1.0 插件元素；按 id） */
  removeSceneObject(id: string): void {
    this.commit((doc) => ({ objects: doc.objects.filter((object) => object.id !== id) }))
  }

  /** 删除标记点（入撤销历史） */
  removeMarker(id: string): void {
    this.commit((doc) => ({ objects: doc.objects.filter((object) => object.id !== id) }))
  }

  /** 文档中的图对象（v0.5） */
  getGraphs(): GraphObject[] {
    return this.doc.objects.filter((object): object is GraphObject => object.type === 'graph')
  }

  /** 添加图对象（顶点/边由调用方提供：DSL 解析、预置图族或画布编辑） */
  addGraph(nodes: GraphNodeData[], edges: GraphEdgeData[], name = '图'): GraphObject {
    const graph: GraphObject = {
      id: crypto.randomUUID(),
      type: 'graph',
      name,
      nodes,
      edges,
      visible: true,
    }
    this.commit((doc) => ({ objects: [...doc.objects, graph] }))
    return graph
  }

  removeGraph(id: string): void {
    this.commit((doc) => ({ objects: doc.objects.filter((object) => object.id !== id) }))
  }

  /** 更新图对象的顶点集（布局或拖动写回坐标时使用） */
  updateGraphNodes(id: string, nodes: GraphNodeData[]): void {
    this.updateGraph(id, { nodes })
  }

  /** 更新图对象（顶点与/或边；一次提交 = 一个撤销步） */
  updateGraph(id: string, patch: { nodes?: GraphNodeData[]; edges?: GraphEdgeData[] }): void {
    this.commit((doc) => ({
      objects: doc.objects.map((object) => {
        if (object.id !== id || object.type !== 'graph') return object
        return {
          ...object,
          nodes: patch.nodes ?? object.nodes,
          edges: patch.edges ?? object.edges,
        }
      }),
    }))
  }

  /**
   * 预览更新：直接替换文档但不入撤销历史（拖动过程的实时预览）。
   * 交互结束时用 commitPreview(before) 把拖动前快照追认为一个撤销步。
   */
  preview(mutate: (doc: DocState) => DocState): void {
    this.doc = mutate(this.doc)
    this.emit()
  }

  /** 预览结束的追认：before 入栈（当前文档即"之后"状态，一步撤销回到拖动前） */
  commitPreview(before: DocState): void {
    this.undoStack.push(before)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.emit()
  }

  /** 添加曲线：颜色默认按已有曲线数量从色环分配 */
  addCurve(input: AddCurveInput): Curve {
    const curve: Curve = {
      id: crypto.randomUUID(),
      type: 'curve',
      kind: input.kind,
      name: input.name ?? input.expr,
      expr: input.expr,
      color: input.color ?? colorForIndex(this.getCurves().length),
      lineStyle: 'solid',
      quality: 3,
      visible: true,
      params: curveParameterValues(input.expr, input.expr2, input.params),
    }
    if (input.expr2 !== undefined) curve.expr2 = input.expr2
    this.commit((doc) => ({ objects: [...doc.objects, curve] }))
    return curve
  }

  /** 更新曲线属性（表达式/颜色/线型/精度/可见性/名称/参数） */
  updateCurve(id: string, patch: Partial<Omit<Curve, 'id' | 'type'>>): void {
    this.commit((doc) => ({
      objects: doc.objects.map((object) => {
        if (object.type !== 'curve' || object.id !== id) return object
        const next = { ...object, ...patch }
        if ('expr' in patch || 'expr2' in patch) {
          next.params = curveParameterValues(next.expr, next.expr2, object.params)
        }
        return next
      }),
    }))
  }

  /** 删除曲线 */
  removeCurve(id: string): void {
    this.commit((doc) => ({
      objects: doc.objects.filter((object) => !(object.type === 'curve' && object.id === id)),
    }))
  }

  /** 文档中的数据集（v0.7 统计与数据） */
  getDatasets(): Dataset[] {
    return this.doc.objects.filter((object): object is Dataset => object.type === 'dataset')
  }

  /** 添加数据集（CSV 导入/生成；数据为独立图层） */
  addDataset(dataset: Dataset): Dataset {
    this.commit((doc) => ({ objects: [...doc.objects, dataset] }))
    return dataset
  }

  /** 更新数据集（数据/图表配置；一次提交 = 一个撤销步） */
  updateDataset(id: string, patch: Partial<Omit<Dataset, 'id' | 'type'>>): void {
    this.commit((doc) => ({
      objects: doc.objects.map((object) =>
        object.type === 'dataset' && object.id === id ? { ...object, ...patch } : object,
      ),
    }))
  }

  removeDataset(id: string): void {
    this.commit((doc) => ({
      objects: doc.objects.filter((object) => !(object.type === 'dataset' && object.id === id)),
    }))
  }

  /** 文档中的 3D 空间对象（v0.8：曲面/空间曲线/向量场/ODE） */
  getSpaceObjects(): SpaceObject[] {
    return this.doc.objects.filter(
      (object): object is SpaceObject =>
        object.type === 'surface3d' ||
        object.type === 'curve3d' ||
        object.type === 'field3d' ||
        object.type === 'ode2d',
    )
  }

  /** 添加 3D 对象 */
  addSpaceObject<T extends SpaceObject>(object: T): T {
    this.commit((doc) => ({ objects: [...doc.objects, object] }))
    return object
  }

  /** 更新 3D 对象（一次提交 = 一个撤销步；patch 字段由调用方按类型保证） */
  updateSpaceObject(id: string, patch: Record<string, unknown>): void {
    this.commit((doc) => ({
      objects: doc.objects.map((object) => {
        if (
          object.type !== 'surface3d' &&
          object.type !== 'curve3d' &&
          object.type !== 'field3d' &&
          object.type !== 'ode2d'
        )
          return object
        return object.id === id ? ({ ...object, ...patch } as SpaceObject) : object
      }),
    }))
  }

  removeSpaceObject(id: string): void {
    this.commit((doc) => ({
      objects: doc.objects.filter(
        (object) =>
          !(
            object.id === id &&
            (object.type === 'surface3d' ||
              object.type === 'curve3d' ||
              object.type === 'field3d' ||
              object.type === 'ode2d')
          ),
      ),
    }))
  }

  /** 在曲线之间上移/下移一位（delta = -1 上移，+1 下移；标记点相对位置不变） */
  moveCurve(id: string, delta: -1 | 1): void {
    const curves = this.getCurves()
    const index = curves.findIndex((curve) => curve.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= curves.length) return
    const reordered = [...curves]
    const a = reordered[index] as Curve
    const b = reordered[target] as Curve
    reordered[index] = b
    reordered[target] = a

    // 把新顺序的曲线填回文档中曲线原来的位置（标记点保持原位）
    this.commit((doc) => {
      let cursor = 0
      const objects = doc.objects.map((object) =>
        object.type === 'curve' ? (reordered[cursor++] as Curve) : object,
      )
      return { objects }
    })
  }

  /** 载入完整状态（JSON 导入等）；当前文档进入撤销历史，视图直接替换 */
  loadState(doc: DocState, view?: ViewTransform): void {
    this.undoStack.push(this.doc)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.doc = doc
    if (view) this.view = sanitizeView(view)
    this.emit()
  }

  private emit(): void {
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }
}

export function createStore(): AppStore {
  return new AppStore()
}
