"""图自同构群基准生成（Sage oracle，v3.1）。

生成 src/lab/automorphism-fixture.json：随机图 + 特殊图族的 graph6 与 Sage 的
|Aut(G)|，供 TypeScript 回溯枚举做交叉核验。

运行（WSL）：
  wsl -d Ubuntu -- /opt/codex-sage/env/bin/python /mnt/e/drawing/tools/lab-oracle/gen-automorphism-fixture.py
"""
import json
import random

from sage.all import graphs

TARGET = "/mnt/e/drawing/src/lab/automorphism-fixture.json"


def add(items, name, graph):
    items.append(
        {
            "name": name,
            "graph6": graph.graph6_string(),
            "aut": int(graph.automorphism_group().order()),
        }
    )


def main():
    items = []

    add(items, "C5", graphs.CycleGraph(5))
    add(items, "C6", graphs.CycleGraph(6))
    add(items, "Petersen", graphs.PetersenGraph())
    add(items, "K4", graphs.CompleteGraph(4))
    add(items, "K33", graphs.CompleteBipartiteGraph(3, 3))
    add(items, "P4", graphs.PathGraph(4))
    add(items, "cube", graphs.CubeGraph(3))
    add(items, "wheel W6", graphs.WheelGraph(6))
    add(items, "grid 3x3", graphs.Grid2dGraph(3, 3))
    add(items, "tree n=8", graphs.RandomTree(8))

    random.seed(20261006)
    count = 0
    attempts = 0
    while count < 40 and attempts < 400:
        attempts += 1
        n = random.randint(4, 9)
        p = random.choice((0.2, 0.3, 0.45, 0.6))
        graph = graphs.RandomGNP(n, p)
        # 控制回溯成本：跳过 |Aut| 过大的稀疏图（我们的枚举会超预算）
        if int(graph.automorphism_group().order()) > 200:
            continue
        add(items, f"rand n={n} p={p} #{count}", graph)
        count += 1

    with open(TARGET, "w", encoding="utf-8") as handle:
        json.dump(items, handle, ensure_ascii=False, indent=1)
    print("total", len(items))


if __name__ == "__main__":
    main()
