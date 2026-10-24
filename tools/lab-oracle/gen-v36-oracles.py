"""
v3.6 极值计算台独立基准（纯 Python，无第三方依赖）：
- ex(6,H)：对全部 2^15 个标号简单图独立枚举（不复用 TS 图集），逐禁图判定取最大边数；
- 诱导 C₄：同一枚举，检查映射点集诱导子图恰为 C₄；
- 3-一致超图 Turán：对 C(6,3)=20 条三元边的全部子集穷举，禁 K₄³ / 松三角形；
- Ramsey R(3,3)：K_n 全部首边固定 2-着色，统计无单色三角形的等价类数。
输出 v36-oracles.json，供单测与文档对照。
"""
import itertools
import json
from pathlib import Path

PRESETS = {
    "K3": (3, [(0, 1), (1, 2), (0, 2)]),
    "C4": (4, [(0, 1), (1, 2), (2, 3), (3, 0)]),
    "P4": (4, [(0, 1), (1, 2), (2, 3)]),
    "K4": (4, [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]),
    "2K2": (4, [(0, 1), (2, 3)]),
    "C5": (5, [(0, 1), (1, 2), (2, 3), (3, 4), (4, 0)]),
    "K13": (4, [(0, 1), (0, 2), (0, 3)]),
    "diamond": (4, [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3)]),
    "C6": (6, [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 0)]),
}


def adjacency(mask, pairs, n):
    adj = [0] * n
    for index, (u, v) in enumerate(pairs):
        if mask >> index & 1:
            adj[u] |= 1 << v
            adj[v] |= 1 << u
    return adj


def contains(host_adj, host_n, pattern_n, pattern_edges, induced=False):
    pattern_adj = [0] * pattern_n
    for u, v in pattern_edges:
        pattern_adj[u] |= 1 << v
        pattern_adj[v] |= 1 << u
    pattern_deg = [bin(mask).count("1") for mask in pattern_adj]
    host_deg = [bin(mask).count("1") for mask in host_adj]
    order = sorted(range(pattern_n), key=lambda v: -pattern_deg[v])
    mapping = [-1] * pattern_n
    used = [False] * host_n

    def compatible(pv, hv):
        for other in range(pattern_n):
            mapped = mapping[other]
            if mapped < 0:
                continue
            pe = pattern_adj[pv] >> other & 1
            he = host_adj[hv] >> mapped & 1
            if pe and not he:
                return False
            if induced and not pe and he:
                return False
        return True

    def search(position):
        if position == pattern_n:
            return True
        pv = order[position]
        for hv in range(host_n):
            if used[hv] or host_deg[hv] < pattern_deg[pv]:
                continue
            if not compatible(pv, hv):
                continue
            mapping[pv] = hv
            used[hv] = True
            if search(position + 1):
                return True
            used[hv] = False
            mapping[pv] = -1
        return False

    return search(0)


def ex6():
    n = 6
    pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
    best = {name: -1 for name in PRESETS}
    induced_best = -1
    for mask in range(1 << len(pairs)):
        adj = adjacency(mask, pairs, n)
        edges = bin(mask).count("1")
        for name, (pn, pedges) in PRESETS.items():
            if edges > best[name] and not contains(adj, n, pn, pedges):
                best[name] = edges
        if edges > induced_best:
            pn, pedges = PRESETS["C4"]
            if not contains(adj, n, pn, pedges, induced=True):
                induced_best = edges
    return best, induced_best


def triples(n):
    return list(itertools.combinations(range(n), 3))


def hyper_instances(n, pattern):
    universe = triples(n)
    index = {edge: k for k, edge in enumerate(universe)}
    instances = set()
    if pattern == "K4_3":
        for four in itertools.combinations(range(n), 4):
            instances.add(tuple(sorted(index[edge] for edge in itertools.combinations(four, 3))))
    else:
        pattern_edges = ((0, 1, 2), (2, 3, 4), (4, 5, 0))
        for assignment in itertools.permutations(range(n), 6):
            edges = [tuple(sorted(assignment[v] for v in edge)) for edge in pattern_edges]
            instances.add(tuple(sorted(index[edge] for edge in edges)))
    return list(instances)


def hyper_ex(n, pattern):
    instances = hyper_instances(n, pattern)
    masks = [sum(1 << edge for edge in instance) for instance in instances]
    best = 0
    for subset in range(1 << len(triples(n))):
        if all(subset & mask != mask for mask in masks):
            best = max(best, bin(subset).count("1"))
    return best, len(instances)


def ramsey_counts():
    result = {}
    for n in range(3, 7):
        pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
        index = {pair: k for k, pair in enumerate(pairs)}
        triangles = []
        for a, b, c in itertools.combinations(range(n), 3):
            triangles.append(
                (index[(a, b)], index[(a, c)], index[(b, c)])
            )
        count = 0
        for mask in range(1 << (len(pairs) - 1)):
            colors = [0] + [(mask >> (edge - 1)) & 1 for edge in range(1, len(pairs))]
            if all(len({colors[x] for x in triangle}) > 1 for triangle in triangles):
                count += 1
        result[n] = count
    return result


if __name__ == "__main__":
    best, induced_c4 = ex6()
    hyper = {}
    for pattern in ("K4_3", "loose_triangle"):
        hyper[pattern] = {}
        for n in (5, 6):
            hyper[pattern][n] = dict(zip(("maxEdges", "instances"), hyper_ex(n, pattern)))
    payload = {
        "version": "v3.6",
        "graph6AtlasCounts": {"1": 1, "2": 2, "3": 4, "4": 11, "5": 34, "6": 156, "7": 1044},
        "ex6": best,
        "exInduced6": {"C4": induced_c4},
        "hyperTuran": hyper,
        "ramseyCanonical": ramsey_counts(),
    }
    output = Path(__file__).with_name("v36-oracles.json")
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False))
