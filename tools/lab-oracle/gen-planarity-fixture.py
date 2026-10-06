"""平面性基准生成（Sage oracle，v3.1）。

生成 src/lab/planarity-fixture.json：随机图 + 特殊图族的 graph6 与
Sage 判定的平面性，供 TypeScript 的 LR 平面性检验做交叉核验。

运行（WSL）：
  wsl -d Ubuntu -- /opt/codex-sage/env/bin/python /mnt/e/drawing/tools/lab-oracle/gen-planarity-fixture.py
"""
import json
import random

from sage.all import graphs

TARGET = "/mnt/e/drawing/src/lab/planarity-fixture.json"


def add(items, name, graph):
    items.append(
        {"name": name, "graph6": graph.graph6_string(), "planar": bool(graph.is_planar())}
    )


def main():
    items = []

    # 特殊图族
    add(items, "K5", graphs.CompleteGraph(5))
    add(items, "K33", graphs.CompleteBipartiteGraph(3, 3))
    add(items, "K4", graphs.CompleteGraph(4))
    add(items, "C5", graphs.CycleGraph(5))
    add(items, "Petersen", graphs.PetersenGraph())
    add(items, "cube", graphs.CubeGraph(3))
    add(items, "octahedron", graphs.OctahedralGraph())
    add(items, "wheel W6", graphs.WheelGraph(6))
    add(items, "K6", graphs.CompleteGraph(6))
    add(items, "tree n=8", graphs.RandomTree(8))

    subdivided = graphs.CompleteGraph(5)
    subdivided.subdivide_edges([(0, 1)], 1)
    add(items, "K5 subdiv", subdivided)

    subdivided33 = graphs.CompleteBipartiteGraph(3, 3)
    subdivided33.subdivide_edges([(0, 3)], 2)
    add(items, "K33 subdiv", subdivided33)

    add(
        items,
        "disconnected K5+K3",
        graphs.CompleteGraph(5).disjoint_union(graphs.CompleteGraph(3)),
    )
    add(items, "grid 3x3", graphs.Grid2dGraph(3, 3))
    add(items, "C4", graphs.CycleGraph(4))
    add(items, "star K1,7", graphs.StarGraph(7))
    add(items, "empty n=7", graphs.Graph(7))
    plus_vertex = graphs.CompleteGraph(4)
    plus_vertex.add_vertex()
    add(items, "K4 plus vertex", plus_vertex)

    # 随机图：n = 5..9，四种密度，每格 12 个
    random.seed(20261006)
    for n in range(5, 10):
        for p in (0.25, 0.4, 0.55, 0.7):
            for k in range(12):
                add(items, f"rand n={n} p={p} #{k}", graphs.RandomGNP(n, p))

    with open(TARGET, "w", encoding="utf-8") as handle:
        json.dump(items, handle, ensure_ascii=False, indent=1)
    planar = sum(1 for item in items if item["planar"])
    print(f"total {len(items)} planar {planar} nonplanar {len(items) - planar}")


if __name__ == "__main__":
    main()
