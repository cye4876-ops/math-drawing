/** 数值算法公共类型（v0.4） */

/** 求根结果 */
export interface Root {
  x: number
  /** true = 无符号变化的触根（偶数重根或不可导点，如 x²、|x| 在 0 处） */
  repeated: boolean
}
