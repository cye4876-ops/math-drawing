/**
 * 实验台 UI 辅助（v2.7）：禁图键名/显示名的再导出与计划行计算。
 */
import { FORBIDDEN_KEYS, FORBIDDEN_NAMES, validateGraphSpec, type GraphSpec } from '../../lab/spec'
import { searchPlan } from '../../lab/planner'

export { FORBIDDEN_KEYS, FORBIDDEN_NAMES }

export interface PlanRow {
  n: number
  min: number
  max: number
}

/** 校验并给出逐阶计划行（边数范围）；非法规格抛错（由调用方捕获） */
export function searchPlanRows(spec: GraphSpec): PlanRow[] {
  const validated = validateGraphSpec(spec)
  return searchPlan(validated).orders.map((order) => ({
    n: order.n,
    min: order.edgeMin,
    max: order.edgeMax,
  }))
}
