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

export type SceneObject = MarkerPoint | Curve

/** 文档状态：进入撤销历史的部分 */
export interface DocState {
  objects: SceneObject[]
}

/** 应用全局状态：doc 入历史，view 不入历史 */
export interface AppState {
  doc: DocState
  view: ViewTransform
}
