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
 * 视图变换。
 * - centerX / centerY：视图中心对应的数学坐标
 * - scale：每个数学单位对应的 CSS 像素数（始终为正）
 */
export interface ViewTransform {
  centerX: number
  centerY: number
  scale: number
}

/** v0.1 场景对象：标记点。后续版本将扩展曲线等其他对象类型 */
export interface MarkerPoint {
  id: string
  type: 'marker'
  x: number
  y: number
}

export type SceneObject = MarkerPoint

/** 文档状态：进入撤销历史的部分 */
export interface DocState {
  objects: SceneObject[]
}

/** 应用全局状态：doc 入历史，view 不入历史 */
export interface AppState {
  doc: DocState
  view: ViewTransform
}
