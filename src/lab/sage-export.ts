/**
 * Sage 复算脚本导出（v3.1）：把浏览器搜索结果（目标值 + 候选 graph6）导出为
 * 独立可运行的 Sage/Python 脚本，在第五版（本地 Sage 环境）复算并逐项对照，
 * 落实“严格谱比较或更大规模转交第五版”的交接机制（浏览器 ↔ Sage）。
 *
 * 数据以 JSON 内嵌（json.loads 注入），脚本输出 OK / MISMATCH 与汇总结论；
 * 已验证：无三角形极值（max_edges）与最大匹配（ν）两个目标的生成脚本在
 * WSL Sage 上运行输出“全部一致”。
 */
import type { GraphSearchResult } from './search'
import type { LabExperiment, StoredCandidateGraph, StoredOrder } from './archive'

export interface SageExportCase {
  n: number
  m: number
  graph6: string
  /** 浏览器侧目标值（max_edges 目标时为边数；无法推断为 null 时不核对） */
  expected: number | null
}

export interface SageExportInput {
  title: string
  objective: string
  nMin: number
  nMax: number
  forbidden: string[]
  forbiddenMode: string
  algorithm: string
  complete: boolean
  bestPerOrder: Array<{ n: number; best: number | null }>
  cases: SageExportCase[]
}

/** 由实时搜索结果构造导出数据 */
export function sageInputFromResult(result: GraphSearchResult): SageExportInput {
  const spec = result.spec
  const cases: SageExportCase[] = []
  for (const order of result.orders) {
    for (const candidate of order.candidates.slice(0, 6)) {
      if (!candidate.graph6) continue
      const expected =
        candidate.objectiveValue ??
        candidate.rho ??
        (spec.objective === 'max_edges' ? candidate.m : null)
      cases.push({ n: candidate.n, m: candidate.m, graph6: candidate.graph6, expected })
    }
  }
  return {
    title: spec.title,
    objective: spec.objective,
    nMin: spec.nMin,
    nMax: spec.nMax,
    forbidden: spec.forbidden,
    forbiddenMode: spec.forbiddenMode,
    algorithm: result.algorithm,
    complete: result.complete,
    bestPerOrder: result.orders.map((order) => ({ n: order.n, best: order.best })),
    cases,
  }
}

/** 由（图）实验档案构造导出数据；非图档案返回 null */
export function sageInputFromExperiment(experiment: LabExperiment): SageExportInput | null {
  if (experiment.kind !== 'graph') return null
  const spec = experiment.spec as {
    title: string
    objective: string
    nMin: number
    nMax: number
    forbidden: string[]
    forbiddenMode: string
  }
  const orders = experiment.orders as StoredOrder<StoredCandidateGraph>[]
  const cases: SageExportCase[] = []
  for (const order of orders) {
    for (const candidate of order.candidates.slice(0, 6)) {
      if (!candidate.graph6) continue
      const expected =
        candidate.objectiveValue ??
        candidate.rho ??
        (spec.objective === 'max_edges' ? candidate.m : null)
      cases.push({ n: candidate.n, m: candidate.m, graph6: candidate.graph6, expected })
    }
  }
  return {
    title: spec.title,
    objective: spec.objective,
    nMin: spec.nMin,
    nMax: spec.nMax,
    forbidden: spec.forbidden,
    forbiddenMode: spec.forbiddenMode,
    algorithm: experiment.algorithm,
    complete: experiment.complete,
    bestPerOrder: orders.map((order) => ({ n: order.n, best: order.best })),
    cases,
  }
}

/** 生成自包含的 Sage 复算脚本文本 */
export function buildSageVerificationScript(input: SageExportInput): string {
  const lines: string[] = []
  lines.push('# -*- coding: utf-8 -*-')
  lines.push('"""Math-Drawing 图论实验复算脚本（自动生成，v3.1）。')
  lines.push('')
  lines.push('用法（需 Sage 环境）：')
  lines.push('    sage math-drawing-verify.py     # 或 python（sage.all 可用时）')
  lines.push('')
  lines.push('脚本内嵌浏览器侧搜索结果（算法 ' + input.algorithm + '）：对每个候选图重新计算')
  lines.push('目标值与结构不变量，并与浏览器记录逐项对照；全部一致时输出“全部一致”。')
  lines.push('"""')
  lines.push('import json')
  lines.push('from sage.all import Graph')
  lines.push('')
  lines.push(`SPEC = json.loads(r'''${JSON.stringify(input)}''')`)
  lines.push('')
  lines.push('')
  lines.push('def objective_value(graph, objective):')
  lines.push('    """按目标重算目标值（与浏览器搜索目标一致）"""')
  lines.push('    if objective == "max_edges":')
  lines.push('        return graph.size()')
  lines.push('    if objective == "max_spectral_radius":')
  lines.push('        return float(max(graph.adjacency_matrix().eigenvalues()))')
  lines.push('    if objective == "max_signless_laplacian_radius":')
  lines.push('        q = graph.laplacian_matrix() + 2 * graph.adjacency_matrix()')
  lines.push('        return float(max(q.eigenvalues()))')
  lines.push('    if objective == "max_algebraic_connectivity":')
  lines.push('        values = sorted(graph.laplacian_matrix().eigenvalues())')
  lines.push('        return float(values[1])')
  lines.push('    if objective == "max_matching":')
  lines.push('        return len(graph.matching())')
  lines.push('    if objective == "max_independence":')
  lines.push('        return len(graph.independent_set())')
  lines.push('    if objective == "max_clique":')
  lines.push('        return len(graph.clique_maximum())')
  lines.push('    raise ValueError("未知目标：" + objective)')
  lines.push('')
  lines.push('')
  lines.push('def invariants(graph):')
  lines.push('    return {')
  lines.push('        "n": graph.order(),')
  lines.push('        "m": graph.size(),')
  lines.push('        "rho": float(max(graph.adjacency_matrix().eigenvalues())),')
  lines.push(
    '        "q": float(max((graph.laplacian_matrix() + 2 * graph.adjacency_matrix()).eigenvalues())),',
  )
  lines.push('        "lambda2": float(sorted(graph.laplacian_matrix().eigenvalues())[1]),')
  lines.push('        "nu": len(graph.matching()),')
  lines.push('        "tau": len(graph.vertex_cover()),')
  lines.push('        "alpha": len(graph.independent_set()),')
  lines.push('        "omega": len(graph.clique_maximum()),')
  lines.push('        "planar": bool(graph.is_planar()),')
  lines.push('        "girth": graph.girth(),')
  lines.push('        "diameter": graph.diameter(),')
  lines.push('        "chromatic": graph.chromatic_number(),')
  lines.push('    }')
  lines.push('')
  lines.push('')
  lines.push('def close(a, b, tol=1e-6):')
  lines.push('    try:')
  lines.push('        return abs(float(a) - float(b)) <= tol')
  lines.push('    except (TypeError, ValueError):')
  lines.push('        return a == b')
  lines.push('')
  lines.push('')
  lines.push('def main():')
  lines.push('    objective = SPEC["objective"]')
  lines.push('    print("实验：" + SPEC["title"] + "（算法 " + SPEC["algorithm"] + "）")')
  lines.push('    all_ok = True')
  lines.push('    for index, case in enumerate(SPEC["cases"]):')
  lines.push('        graph = Graph(case["graph6"])')
  lines.push('        value = objective_value(graph, objective)')
  lines.push('        info = invariants(graph)')
  lines.push('        expected = case["expected"]')
  lines.push('        checks = [')
  lines.push('            ("n", info["n"] == case["n"]),')
  lines.push('            ("m", info["m"] == case["m"]),')
  lines.push('        ]')
  lines.push('        if expected is not None:')
  lines.push('            checks.append(("目标值", close(value, expected)))')
  lines.push('        ok = all(passed for _, passed in checks)')
  lines.push('        all_ok = all_ok and ok')
  lines.push('        flags = " ".join(name for name, passed in checks if not passed)')
  lines.push('        status = "OK" if ok else "MISMATCH(" + flags + ")"')
  lines.push(
    '        print("#%d n=%d m=%d graph6=%s" % (index, info["n"], info["m"], case["graph6"]))',
  )
  lines.push(
    '        print("   目标值 %s（浏览器 %s）| rho=%.6f q=%.6f lambda2=%.6f" % (value, expected, info["rho"], info["q"], info["lambda2"]))',
  )
  lines.push(
    '        print("   nu=%d tau=%d alpha=%d omega=%d planar=%s girth=%s diameter=%s chi=%d" % (info["nu"], info["tau"], info["alpha"], info["omega"], info["planar"], info["girth"], info["diameter"], info["chromatic"]))',
  )
  lines.push('        print("   " + status)')
  lines.push('    print("全部一致" if all_ok else "存在不一致（见 MISMATCH 行）")')
  lines.push('')
  lines.push('')
  lines.push('if __name__ == "__main__":')
  lines.push('    main()')
  lines.push('')
  return lines.join('\n')
}
