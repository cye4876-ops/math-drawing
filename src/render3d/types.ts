/** 3D 基础类型（v0.8） */
export type Vec3 = [number, number, number]

/** 轴对齐包围盒 */
export interface Box3 {
  min: Vec3
  max: Vec3
}
