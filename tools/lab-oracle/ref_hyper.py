"""Oracle 参考数据生成（超图）。

在 WSL Sage 环境运行：
  wsl -d Ubuntu -- /opt/codex-sage/env/bin/python /mnt/e/drawing/tools/lab-oracle/ref_hyper.py
输出：tools/lab-oracle/fixtures/hyper.json
"""
import json
import shutil
import sys
from pathlib import Path

REPO_LAB = "/mnt/d/Documents/ChatGPT/研究软件设计"
sys.path.insert(0, REPO_LAB)

from sage.all import Graph, matrix, QQ  # noqa: E402
from graphlab import hypergraph as hyper_mod, hypergraph_spec, hypergraph_search, spec as spec_mod  # noqa: E402

OUT = Path("/mnt/e/drawing/tools/lab-oracle/fixtures/hyper.json")
RUN_ROOT = Path("/mnt/e/drawing/tools/lab-oracle/fixtures/hyper-runs")
OUT.parent.mkdir(parents=True, exist_ok=True)

result = {"analyses": {}, "searches": {}}

ANALYSIS_CASES = {
    "fano": {"n": 7, "edges": hypergraph_spec.FANO_EDGES},
    "k4_3": {"n": 4, "edges": [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]},
    "star_5_2": {"n": 5, "edges": [[0, 1], [0, 2], [0, 3], [0, 4]]},
    "matching_6_2": {"n": 6, "edges": [[0, 1], [2, 3], [4, 5]]},
    "empty_4": {"n": 4, "edges": []},
    "nonuniform": {"n": 5, "edges": [[0, 1], [1, 2, 3], [3, 4]]},
    "with_isolates": {"n": 6, "edges": [[0, 1, 2], [2, 3, 4]]},
}

for name, payload in ANALYSIS_CASES.items():
    basic = hyper_mod._basic(payload["n"], tuple(tuple(sorted(e)) for e in payload["edges"]))
    inv = hyper_mod.HyperInvariants(payload["n"], tuple(tuple(sorted(e)) for e in payload["edges"]), basic)
    entry = {
        "n": payload["n"],
        "edges": [sorted(e) for e in payload["edges"]],
        "basic": {
            "degrees": basic["degrees"],
            "codegree": basic["codegree"],
            "rank": basic["rank"],
            "uniformity": basic["uniformity"],
            "linear": basic["linear"],
            "connected": basic["connected"],
            "regular": basic["regular"],
        },
        "nu": int(inv.get("nu")), "tau": int(inv.get("tau")), "alpha": int(inv.get("alpha")),
    }
    n = payload["n"]
    degrees = basic["degrees"]
    codegrees = basic["codegree_matrix"]
    bbt = matrix(QQ, [[degrees[i] if i == j else codegrees[i][j] for j in range(n)] for i in range(n)])
    poly = bbt.charpoly()
    entry["charpoly"] = [str(c) for c in poly.list()][::-1]
    result["analyses"][name] = entry

SEARCH_CASES = {
    "k4_custom_ordinary_n4": {
        "kind": "hypergraph", "title": "自定义禁超图普通包含", "n_min": 4, "n_max": 4, "r": 3,
        "objective": "max_edges", "linear": "any",
        "custom_forbidden": [{"title": "单边 012", "n": 4, "edges": [[0, 1, 2]]}],
        "forbidden_mode": "subgraph",
    },
    "k4_custom_induced_n4": {
        "kind": "hypergraph", "title": "自定义禁超图诱导包含", "n_min": 4, "n_max": 4, "r": 3,
        "objective": "max_edges", "linear": "any",
        "custom_forbidden": [{"title": "单边 012", "n": 4, "edges": [[0, 1, 2]]}],
        "forbidden_mode": "induced",
    },
    "linear6_max_edges": {
        "kind": "hypergraph", "title": "线性 3 一致超图六点极值", "n_min": 6, "n_max": 6, "r": 3,
        "objective": "max_edges", "linear": "yes",
    },
    "linear7_max_edges": {
        "kind": "hypergraph", "title": "线性 3 一致超图七点极值", "n_min": 7, "n_max": 7, "r": 3,
        "objective": "max_edges", "linear": "yes",
    },
    "counterexample_tau_nu_n3_6": {
        "kind": "hypergraph", "title": "检验 τ≤ν", "n_min": 3, "n_max": 6, "r": 3,
        "objective": "counterexample", "claim": "tau <= nu", "linear": "any",
    },
    "counterexample_tau_nu_linear_n3_6": {
        "kind": "hypergraph", "title": "线性 τ≤ν", "n_min": 3, "n_max": 6, "r": 3,
        "objective": "counterexample", "claim": "tau <= nu", "linear": "yes",
    },
}

RUN_ROOT.mkdir(parents=True, exist_ok=True)

for name, payload in SEARCH_CASES.items():
    s = hypergraph_spec.validate_hyper_spec(payload)
    run_dir = RUN_ROOT / name
    if run_dir.exists():
        shutil.rmtree(run_dir)

    def emit(event):
        pass

    search_result = hypergraph_search.search_incidence(s, run_dir, emit)
    orders = []
    for order in search_result["orders"]:
        candidates = []
        path = run_dir / order["file"]
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    record = json.loads(line)
                    candidates.append(record["edges"])
        orders.append({
            "n": order["n"], "best": order["best"], "candidate_count": order["candidate_count"],
            "coverage": order["coverage"], "complete": order["complete"], "candidates": candidates,
        })
    result["searches"][name] = {
        "spec": payload,
        "termination": search_result["termination"], "complete": search_result["complete"],
        "candidate_count": search_result["candidate_count"], "violations": search_result["violations"],
        "orders": orders,
    }
    print(name, "->", search_result["termination"], "candidates:", search_result["candidate_count"])

OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT)
