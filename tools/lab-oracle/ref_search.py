"""Oracle 参考数据生成（搜索用例）。

在 WSL Sage 环境运行：
  wsl -d Ubuntu -- /opt/codex-sage/env/bin/python /mnt/e/drawing/tools/lab-oracle/ref_search.py
输出：tools/lab-oracle/fixtures/search.json
"""
import json
import shutil
import sys
from pathlib import Path

REPO_LAB = "/mnt/d/Documents/ChatGPT/研究软件设计"
sys.path.insert(0, REPO_LAB)

from graphlab import search as search_mod, spec as spec_mod  # noqa: E402

OUT = Path("/mnt/e/drawing/tools/lab-oracle/fixtures/search.json")
RUN_ROOT = Path("/mnt/e/drawing/tools/lab-oracle/fixtures/runs")

CASES = {
    "triangle_free_n6_max_edges": {
        "title": "无三角形图的边数极值", "n_min": 6, "n_max": 6, "forbidden": ["K3"],
        "objective": "max_edges", "strategy": "auto", "time_limit": 120, "graph_limit": 200000,
    },
    "triangle_free_n6_spectral": {
        "title": "无三角形图的谱极值", "n_min": 6, "n_max": 6, "forbidden": ["K3"],
        "objective": "max_spectral_radius", "strategy": "auto", "time_limit": 180, "graph_limit": 200000,
    },
    "counterexample_bipartite_n3_6": {
        "title": "寻找一个反例", "n_min": 3, "n_max": 6, "forbidden": ["K3"],
        "objective": "counterexample", "claim": "bipartite", "strategy": "auto",
        "time_limit": 180, "graph_limit": 200000,
    },
    "triangle_free_n6_enumerate": {
        "title": "逐图枚举对照", "n_min": 6, "n_max": 6, "forbidden": ["K3"],
        "objective": "max_edges", "strategy": "enumerate", "time_limit": 120, "graph_limit": 200000,
    },
    "c4_free_n7_max_edges": {
        "title": "无普通 C4 的边数极值", "n_min": 7, "n_max": 7, "forbidden": ["C4"],
        "objective": "max_edges", "strategy": "auto", "time_limit": 180, "graph_limit": 200000,
    },
    "triangle_free_n8_max_edges": {
        "title": "无三角形图的边数极值", "n_min": 8, "n_max": 8, "forbidden": ["K3"],
        "objective": "max_edges", "strategy": "auto", "time_limit": 300, "graph_limit": 200000,
    },
    "lambda2_claim_n3_6": {
        "title": "检验 λ₂ 猜想", "n_min": 3, "n_max": 6, "objective": "counterexample",
        "claim": "lambda2 >= 1", "strategy": "auto",
        "time_limit": 180, "graph_limit": 200000,
    },
}

RUN_ROOT.mkdir(parents=True, exist_ok=True)
out = {}

for name, payload in CASES.items():
    s = spec_mod.validate_spec(payload)
    run_dir = RUN_ROOT / name
    if run_dir.exists():
        shutil.rmtree(run_dir)

    def emit(event):
        pass

    result = search_mod.search(s, run_dir, emit)
    orders = []
    for order in result["orders"]:
        candidates = []
        path = run_dir / order["file"]
        if path.exists():
            candidates = [line.strip() for line in path.read_text(encoding="ascii").splitlines() if line.strip()]
        orders.append({
            "n": order["n"], "best": order["best"], "candidate_count": order["candidate_count"],
            "coverage": order["coverage"], "complete": order["complete"], "candidates": candidates,
        })
    out[name] = {
        "spec": payload,
        "termination": result["termination"], "complete": result["complete"],
        "candidate_count": result["candidate_count"], "violations": result["violations"],
        "evidence": result["evidence"], "coverage": result["coverage"],
        "orders": orders,
    }
    print(name, "->", result["termination"], "candidates:", result["candidate_count"])

OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT)
