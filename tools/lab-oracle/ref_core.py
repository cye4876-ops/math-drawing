"""Oracle 参考数据生成（核心不变量/谱/规划器）。

在 WSL Sage 环境运行：
  wsl -d Ubuntu -- /opt/codex-sage/env/bin/python /mnt/e/drawing/tools/lab-oracle/ref_core.py
输出：tools/lab-oracle/fixtures/core.json
"""
import json
import sys
from pathlib import Path

REPO_LAB = "/mnt/d/Documents/ChatGPT/研究软件设计"
sys.path.insert(0, REPO_LAB)

from sage.all import Graph  # noqa: E402

from graphlab import engine, planner, spec as spec_mod  # noqa: E402

OUT = Path("/mnt/e/drawing/tools/lab-oracle/fixtures/core.json")
OUT.parent.mkdir(parents=True, exist_ok=True)

GRAPHS = {
    "K4": [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]],
    "C5": [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
    "K33": [[i, 3 + j] for i in range(3) for j in range(3)],
    "petersen": [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
                 [5, 7], [7, 9], [9, 6], [6, 8], [8, 5],
                 [0, 5], [1, 6], [2, 7], [3, 8], [4, 9]],
    "c6_c3c3": [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
    "K44": [[i, 4 + j] for i in range(4) for j in range(4)],
}

result = {"graphs": {}, "plans": {}}

for name, edges in GRAPHS.items():
    n = max(max(e) for e in edges) + 1
    g = Graph([list(range(n)), [tuple(e) for e in edges]], format="vertices_and_edges")
    values = engine.Invariants(g)
    spectra = {}
    for key in ("A", "L", "Q"):
        polynomial, _roots = values.spectrum(key)
        spectra[key] = [str(c) for c in polynomial.list()][::-1]
    result["graphs"][name] = {
        "graph6": g.graph6_string(),
        "canonical_graph6": g.canonical_label().graph6_string(),
        "invariants": {k: int(values.get(k)) if not isinstance(values.get(k), bool) else bool(values.get(k))
                       for k in ["delta", "Delta", "omega", "alpha", "nu", "triangles", "bipartite", "connected", "regular"]},
        "rho": float(values.get("rho")),
        "q": float(values.get("q")),
        "lambda2": float(values.get("lambda2")),
        "charpoly": spectra,
    }

PLAN_CASES = {
    "triangle_free_n6": {"title": "无三角形图的边数极值", "n_min": 6, "n_max": 6, "forbidden": ["K3"], "objective": "max_edges", "strategy": "auto"},
    "triangle_free_n8": {"title": "无三角形图的边数极值", "n_min": 8, "n_max": 8, "forbidden": ["K3"], "objective": "max_edges", "strategy": "auto"},
    "c4_free_n7": {"title": "无普通 C4 的边数极值", "n_min": 7, "n_max": 7, "forbidden": ["C4"], "objective": "max_edges", "strategy": "auto"},
    "claw_free_connected_n6": {"title": "连接无爪图", "n_min": 6, "n_max": 6, "forbidden": ["claw"], "objective": "max_edges", "connected": "yes", "strategy": "auto"},
    "bipartite_n7": {"title": "二部图极值", "n_min": 7, "n_max": 7, "bipartite": "yes", "objective": "max_edges", "strategy": "auto"},
    "enumerate_n6": {"title": "逐图枚举对照", "n_min": 6, "n_max": 6, "forbidden": ["K3"], "objective": "max_edges", "strategy": "enumerate"},
}

for name, payload in PLAN_CASES.items():
    s = spec_mod.validate_spec(payload)
    plans = []
    for n in range(s["n_min"], s["n_max"] + 1):
        row = planner.order_plan(n, s)
        plans.append({
            "n": row["n"], "mode": row["mode"], "edge_min": row["edge_min"], "edge_max": row["edge_max"],
            "impossible": row["impossible"], "deletion_upper": row["deletion_upper"],
            "labelled_space": row["labelled_space"],
        })
    result["plans"][name] = plans

OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT, "graphs:", len(result["graphs"]), "plans:", len(result["plans"]))
