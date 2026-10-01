/**
 * 题目模式（v1.0）：出题 → 学生操作 → 自动判定。
 * 判定方式：曲线/表达式数值等价（容差可配）+ 结构判定（标记点误差、图的连通性）。
 */
import { compile, parse } from '../expr'
import type { DocState, ViewTransform } from '../state/types'

export interface ProblemContext {
  doc: DocState
  view: ViewTransform
  mode: string
}

export interface ProblemCheckResult {
  pass: boolean
  detail: string
}

export interface TeachingProblem {
  id: string
  title: string
  prompt: string
  /** 建议容差（UI 可调） */
  defaultTolerance: number
  check(context: ProblemContext, tolerance: number): ProblemCheckResult
}

const SAMPLE_X = [-2.4, -1.1, -0.3, 0.5, 1.3, 2.7, 4.2]

/** 单变量表达式数值等价（采样点相对容差；定义域不一致视为不等价） */
export function numericEquivalent(
  sourceA: string,
  sourceB: string,
  variable: string,
  tolerance: number,
): boolean {
  try {
    const fa = compile(parse(sourceA))
    const fb = compile(parse(sourceB))
    for (const point of SAMPLE_X) {
      const scopeA: Record<string, number> = { [variable]: point }
      const scopeB: Record<string, number> = { [variable]: point }
      const va = fa(scopeA)
      const vb = fb(scopeB)
      if (!Number.isFinite(va) || !Number.isFinite(vb)) {
        if (Number.isFinite(va) !== Number.isFinite(vb)) return false
        continue
      }
      if (Math.abs(va - vb) > tolerance * (1 + Math.abs(vb))) return false
    }
    return true
  } catch {
    return false
  }
}

/** 双变量表达式数值等价（含常数倍判定：F 与 G 的比值处处一致且非零） */
export function numericProportional(sourceA: string, sourceB: string, tolerance: number): boolean {
  try {
    const fa = compile(parse(sourceA))
    const fb = compile(parse(sourceB))
    let first: number | null = null
    for (const x of [-2.2, -0.7, 0.4, 1.1, 2.3]) {
      for (const y of [-2.2, -0.7, 0.4, 1.1, 2.3]) {
        const va = fa({ x, y })
        const vb = fb({ x, y })
        if (!Number.isFinite(va) || !Number.isFinite(vb)) continue
        if (Math.abs(vb) < 1e-6) continue
        const ratio = va / vb
        if (first === null) {
          // 常数倍 k 不得为 0（学生用恒 0 的曲线不能通过判定）
          if (Math.abs(ratio) < 1e-9) return false
          first = ratio
        } else if (
          Math.abs(ratio - first) >
          Math.max(tolerance * 20, 0.01) * (1 + Math.abs(first))
        ) {
          return false
        }
      }
    }
    return first !== null
  } catch {
    return false
  }
}

export const TEACHING_PROBLEMS: TeachingProblem[] = [
  {
    id: 'plot-sin',
    title: '绘制正弦曲线',
    prompt: '在函数绘图模式中绘制 y = sin(x)（一条与它数值一致的曲线即可）。',
    defaultTolerance: 1e-6,
    check(context, tolerance) {
      const curves = context.doc.objects.filter((object) => object.type === 'curve')
      const match = curves.find(
        (object) =>
          object.kind === 'explicit' &&
          numericEquivalent(object.expr, 'sin(x)', 'x', Math.max(tolerance, 1e-9)),
      )
      return match
        ? { pass: true, detail: '找到与 sin(x) 一致的曲线。' }
        : { pass: false, detail: '尚未找到与 sin(x) 数值一致的显函数曲线。' }
    },
  },
  {
    id: 'marker-sqrt2',
    title: '标出 x² = 2 的正根',
    prompt: '用「添加标记点」（或标记工具）在 x = √2 ≈ 1.414 附近放置标记点，误差在容差内。',
    defaultTolerance: 0.05,
    check(context, tolerance) {
      const target = Math.SQRT2
      const markers = context.doc.objects.filter((object) => object.type === 'marker')
      const match = markers.find(
        (marker) => Math.abs(marker.x - target) <= Math.max(tolerance, 1e-6),
      )
      return match
        ? {
            pass: true,
            detail: `标记点 x = ${match.x.toFixed(4)}，误差 ${Math.abs(match.x - target).toFixed(4)} ✓`,
          }
        : {
            pass: false,
            detail: `还没有足够接近 √2 的标记点（当前 ${markers.length} 个标记，容差 ${tolerance}）。`,
          }
    },
  },
  {
    id: 'implicit-circle',
    title: '绘制圆的方程',
    prompt: '绘制隐式曲线 x² + y² = 25（左端样式即可，整体常数倍也算对）。',
    defaultTolerance: 1e-3,
    check(context, tolerance) {
      const curves = context.doc.objects.filter((object) => object.type === 'curve')
      const match = curves.find(
        (object) =>
          object.kind === 'implicit' &&
          numericProportional(object.expr, 'x^2 + y^2 - 25', Math.max(tolerance, 1e-6)),
      )
      return match
        ? { pass: true, detail: '找到与 x² + y² − 25 成比例的隐式曲线。' }
        : {
            pass: false,
            detail: '尚未找到与 x² + y² − 25 成比例的隐式曲线（检查是否选择了「隐函数」类型）。',
          }
    },
  },
  {
    id: 'parametric-unit-circle',
    title: '参数方程画单位圆',
    prompt: '用参数曲线绘制（cos t, sin t）。',
    defaultTolerance: 1e-6,
    check(context, tolerance) {
      const curves = context.doc.objects.filter((object) => object.type === 'curve')
      const eps = Math.max(tolerance, 1e-9)
      const match = curves.find(
        (object) =>
          object.kind === 'parametric' &&
          object.expr2 !== undefined &&
          numericEquivalent(object.expr, 'cos(t)', 't', eps) &&
          numericEquivalent(object.expr2, 'sin(t)', 't', eps),
      )
      return match
        ? { pass: true, detail: '找到参数方程 (cos t, sin t)。' }
        : {
            pass: false,
            detail: '尚未找到 (cos t, sin t) 的参数曲线（检查 x(t) 与 y(t) 两栏输入）。',
          }
    },
  },
  {
    id: 'graph-connected',
    title: '画一个连通的三角形图',
    prompt: '在图论模式中创建至少 3 个顶点、3 条边且整体连通的图。',
    defaultTolerance: 0,
    check(context) {
      const graphs = context.doc.objects.filter((object) => object.type === 'graph')
      for (const graph of graphs) {
        if (graph.nodes.length < 3) continue
        // 边需去重（无向归一化）：重边不能凑数
        const uniqueEdges = new Set(
          graph.edges.map((edge) => [edge.source, edge.target].sort().join('\u0001')),
        )
        if (uniqueEdges.size < 3) continue
        // 连通性（无向视角）
        const adjacency = new Map<string, string[]>()
        for (const node of graph.nodes) adjacency.set(node.id, [])
        for (const edge of graph.edges) {
          adjacency.get(edge.source)?.push(edge.target)
          adjacency.get(edge.target)?.push(edge.source)
        }
        const visited = new Set<string>([graph.nodes[0]!.id])
        const queue = [graph.nodes[0]!.id]
        while (queue.length > 0) {
          const current = queue.shift()!
          for (const next of adjacency.get(current) ?? []) {
            if (!visited.has(next)) {
              visited.add(next)
              queue.push(next)
            }
          }
        }
        if (visited.size === graph.nodes.length) {
          return {
            pass: true,
            detail: `图「${graph.name}」：${graph.nodes.length} 顶点 / ${graph.edges.length} 边，连通 ✓`,
          }
        }
      }
      const count = graphs.length
      return {
        pass: false,
        detail:
          count === 0
            ? '尚未创建图（切换到图论模式并添加顶点/边）。'
            : '图还不满足：≥3 顶点、≥3 边且连通。',
      }
    },
  },
]

export function findProblem(id: string): TeachingProblem | null {
  return TEACHING_PROBLEMS.find((problem) => problem.id === id) ?? null
}
