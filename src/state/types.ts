import type { GraphObject } from '../graph/model'
import type { Dataset } from '../stats/model'

export type { GraphObject }
export type { Dataset }

/** 数学平面上的二维点 */
export interface Point2 {
  x: number
  y: number
}

/** 像素尺寸（CSS 像素） */
export interface Size {
  width: number
  height: number
}

/**
 * 坐标系类型：
 * - rect：直角坐标（双轴线性网格，可叠加次刻度）
 * - polar：极坐标网格（同心圆 + 射线，曲线数据仍以 xy 表达）
 * - log：双轴 log10（scale = 每十倍程像素数）
 */
export type CoordType = 'rect' | 'polar' | 'log'

/**
 * 视图变换。
 * - centerX / centerY：视图中心对应的数学坐标（log 模式须 > 0）
 * - scaleX / scaleY：每个数学单位（log 模式：每十倍程）对应的 CSS 像素数（始终为正）
 * - equalAspect：等比模式。为 true 时任何会改写比例的操作用途都保持 scaleX === scaleY（圆看起来是圆）
 * - axisVisible：坐标轴是否显示
 * - axisX / axisY：水平轴所在的数学 y / 垂直轴所在的数学 x（轴可移动，默认 0）
 */
export interface ViewTransform {
  centerX: number
  centerY: number
  scaleX: number
  scaleY: number
  equalAspect: boolean
  coordType: CoordType
  axisVisible: boolean
  axisX: number
  axisY: number
}

/** 曲线类型：显函数 / 隐函数 / 参数方程 / 极坐标 */
export type CurveKind = 'explicit' | 'implicit' | 'parametric' | 'polar'

/** 线型 */
export type LineStyle = 'solid' | 'dashed' | 'dotted'

/** 曲线对象（进入文档状态与撤销历史） */
export interface Curve {
  id: string
  type: 'curve'
  kind: CurveKind
  /** 显示名（默认取表达式原文，可重命名） */
  name: string
  /**
   * 主表达式原文：
   * - explicit：f(x)（即 y = f(x) 的右侧）
   * - implicit：F(x, y)（方程 F = 0 的左侧）
   * - parametric：x(t)
   * - polar：r(θ)
   */
  expr: string
  /** 仅 parametric 使用：y(t) */
  expr2?: string
  color: string
  lineStyle: LineStyle
  /** 采样精度 1（低）~ 5（高），默认 3 */
  quality: number
  visible: boolean
}

/** 标记点（v0.1 场景对象，保留） */
export interface MarkerPoint {
  id: string
  type: 'marker'
  x: number
  y: number
}

/** ---------- v0.8：3D 与场 ---------- */

/** 参数化预设绑定：面板据此显示可调参数滑块；调整后重新生成表达式（而非手改文本） */
export interface PresetBinding {
  /** 预设 id（同一预设家族） */
  presetId: string
  /** 当前参数值表 */
  params: Record<string, number>
}

/** 3D 曲面类型：显式 / 参数 / 隐式（MC）/ 旋转体 / 正多面体（three 内置几何） */
export type Surface3DKind = 'explicit' | 'parametric' | 'implicit' | 'revolve' | 'polyhedron'

/**
 * 3D 曲面对象。
 * 区间字段复用命名：
 * - explicit：xMin..yMax 为定义域；
 * - implicit：xMin..zMax 为包围盒；
 * - parametric：xMin..yMax 为 u × v 参数区间；
 * - revolve：xMin..xMax 为母线定义域；
 * - polyhedron：expr 为预设 id（tetrahedron/cube/octahedron/dodecahedron/icosahedron/prismN/pyramidN）。
 */
export interface Surface3D {
  id: string
  type: 'surface3d'
  name: string
  kind: Surface3DKind
  /** explicit: f(x,y)；implicit: F(x,y,z)；parametric: x(u,v)；revolve: r(x)；polyhedron: 预设 id */
  expr: string
  /** parametric: y(u,v) */
  expr2?: string
  /** parametric: z(u,v) */
  expr3?: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  zMin: number
  zMax: number
  color: string
  /** 不透明度 0.1~1（1 = 不透明） */
  opacity: number
  /** 网格分辨率（每轴分段数） */
  resolution: number
  visible: boolean
  /** 参数化预设绑定（存在时面板显示参数滑块） */
  template?: PresetBinding
}

/** 3D 空间曲线：参数曲线或洛伦兹吸引子轨迹 */
export interface Curve3D {
  id: string
  type: 'curve3d'
  name: string
  kind: 'parametric' | 'lorenz'
  /** parametric: x(t)；lorenz 忽略 */
  expr: string
  expr2?: string
  expr3?: string
  /** parametric 的 t 区间（lorenz 忽略） */
  tMin: number
  tMax: number
  /** 采样点数（parametric）或积分步数（lorenz） */
  steps: number
  color: string
  visible: boolean
  /** 参数化预设绑定（如洛伦兹的 σ/ρ/β） */
  template?: PresetBinding
}

/** 向量场对象：3D 场或 z=0 平面上的 2D 场（方向场/相图） */
export interface Field3D {
  id: string
  type: 'field3d'
  name: string
  space: 'plane' | 'space'
  /** 分量 u（plane 时即 2D 场的 x 分量） */
  expr: string
  expr2?: string
  /** space 使用的第三分量 */
  expr3?: string
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  zMin: number
  zMax: number
  /** 每轴箭头数（plane: cols×rows；space: divisions³） */
  divisions: number
  /** 箭头长度比例（相对格距） */
  scale: number
  /** 场性质着色：无 / 散度 / 旋度（按值映射色图） */
  colorMode: 'none' | 'divergence' | 'curl'
  /** 流线种子数（0 = 关闭） */
  streamSeeds: number
  color: string
  visible: boolean
  /** 参数化预设绑定（如捕食者-猎物的 α/β/γ/δ） */
  template?: PresetBinding
}

/** 一阶 ODE 解曲线（v0.8，在 z=0 平面渲染）：y' = f(x, y)，欧拉/改进/RK4 同图对比 */
export interface Ode2D {
  id: string
  type: 'ode2d'
  name: string
  expr: string
  x0: number
  y0: number
  xEnd: number
  steps: number
  /** 叠加方向场（斜率场） */
  directionField: boolean
  visible: boolean
}

export type SpaceObject = Surface3D | Curve3D | Field3D | Ode2D

export type SceneObject = MarkerPoint | Curve | GraphObject | Dataset | SpaceObject

/** 文档状态：进入撤销历史的部分 */
export interface DocState {
  objects: SceneObject[]
}

/** 应用全局状态：doc 入历史，view 不入历史 */
export interface AppState {
  doc: DocState
  view: ViewTransform
}
