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

/** 撤销历史最大深度 */
export const HISTORY_LIMIT = 100

/** 曲线自动取色的色相间隔（黄金角，保证相邻曲线颜色可区分） */
const COLOR_HUE_STEP = 137.508

/** 按序号分配曲线颜色（色环，可被用户覆盖），输出 #rrggbb 以便颜色选择器使用 */
export function colorForIndex(index: number): string {
  const hue = (((index * COLOR_HUE_STEP) % 360) + 360) % 360
  return hslToHex(hue, 0.7, 0.45)
}

/** HSL（h 角度、s/l 0..1）→ #rrggbb */
function hslToHex(hDeg: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((hDeg % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) {
    r = c
    g = x
  } else if (hp < 2) {
    r = x
    g = c
  } else if (hp < 3) {
    g = c
    b = x
  } else if (hp < 4) {
    g = x
    b = c
  } else if (hp < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const m = l - c / 2
  const to255 = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to255(r)}${to255(g)}${to255(b)}`
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
    }
    if (input.expr2 !== undefined) curve.expr2 = input.expr2
    this.commit((doc) => ({ objects: [...doc.objects, curve] }))
    return curve
  }

  /** 更新曲线属性（表达式/颜色/线型/精度/可见性/名称） */
  updateCurve(id: string, patch: Partial<Omit<Curve, 'id' | 'type'>>): void {
    this.commit((doc) => ({
      objects: doc.objects.map((object) =>
        object.type === 'curve' && object.id === id ? { ...object, ...patch } : object,
      ),
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
