"""
v3.7 极值增强独立基准（纯 Python，无第三方依赖）：
- ex(6, {K3,C4}) / ex(6, {K3,K4}) / ex(6, {C4,K23})；
- 结构约束下的 ex(6,K3)：连通 / 二部 / 无三角形 / Δ≤2；
- K3-饱和数与 {K3,C4}-饱和数（最小边数的极大 H-free 图）。
输出 v37-oracles.json，供单测/文档对照。
"""
import itertools
import json
from pathlib import Path

PRESETS = {
    "K3": (3, [(0, 1), (1, 2), (0, 2)]),
    "C4": (4, [(0, 1), (1, 2), (2, 3), (3, 0)]),
    "K4": (4, [(0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3)]),
    "K23": (5, [(0, 2), (0, 3), (0, 4), (1, 2), (1, 3), (1, 4)]),
}


def pairs_n(n):
    return [(i, j) for i in range(n) for j in range(i + 1, n)]


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
    pdeg = [bin(x).count("1") for x in pattern_adj]
    hdeg = [bin(x).count("1") for x in host_adj]
    order = sorted(range(pattern_n), key=lambda v: -pdeg[v])
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
            if used[hv] or hdeg[hv] < pdeg[pv]:
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


def is_connected(adj, n):
    if n <= 1:
        return True
    seen = {0}
    stack = [0]
    while stack:
        v = stack.pop()
        for w in range(n):
            if adj[v] >> w & 1 and w not in seen:
                seen.add(w)
                stack.append(w)
    return len(seen) == n


def is_bipartite(adj, n):
    color = [-1] * n
    for start in range(n):
        if color[start] >= 0:
            continue
        color[start] = 0
        queue = [start]
        for v in queue:
            for w in range(n):
                if not (adj[v] >> w & 1):
                    continue
                if color[w] < 0:
                    color[w] = 1 - color[v]
                    queue.append(w)
                elif color[w] == color[v]:
                    return False
    return True


def is_triangle_free(adj, n):
    for a, b, c in itertools.combinations(range(n), 3):
        if adj[a] >> b & 1 and adj[a] >> c & 1 and adj[b] >> c & 1:
            return False
    return True


def max_degree(adj):
    return max((bin(x).count("1") for x in adj), default=0)


def free(adj, n, patterns, induced=False):
    return all(not contains(adj, n, pn, pe, induced) for pn, pe in patterns)


def maximal(adj, n, patterns):
    for u, v in pairs_n(n):
        if adj[u] >> v & 1:
            continue
        copy = list(adj)
        copy[u] |= 1 << v
        copy[v] |= 1 << u
        if free(copy, n, patterns):
            return False
    return True


def main():
    n = 6
    pairs = pairs_n(n)
    sets = {
        "K3_C4": [PRESETS["K3"], PRESETS["C4"]],
        "K3_K4": [PRESETS["K3"], PRESETS["K4"]],
        "C4_K23": [PRESETS["C4"], PRESETS["K23"]],
    }
    ex = {key: -1 for key in sets}
    ex_filters = {
        "connected": -1,
        "bipartite": -1,
        "triangleFree": -1,
        "maxDegree2": -1,
        "c4_bipartite": -1,
    }
    sat = dict.fromkeys(("K3", "K3_C4"), None)
    for mask in range(1 << len(pairs)):
        adj = adjacency(mask, pairs, n)
        edges = bin(mask).count("1")
        for key, patterns in sets.items():
            if edges > ex[key] and free(adj, n, patterns):
                ex[key] = edges
        k3 = [PRESETS["K3"]]
        if free(adj, n, k3):
            if is_connected(adj, n):
                ex_filters["connected"] = max(ex_filters["connected"], edges)
            if is_bipartite(adj, n):
                ex_filters["bipartite"] = max(ex_filters["bipartite"], edges)
            if is_triangle_free(adj, n):
                ex_filters["triangleFree"] = max(ex_filters["triangleFree"], edges)
            if max_degree(adj) <= 2:
                ex_filters["maxDegree2"] = max(ex_filters["maxDegree2"], edges)
            if maximal(adj, n, k3):
                sat["K3"] = edges if sat["K3"] is None else min(sat["K3"], edges)
        if is_bipartite(adj, n) and free(adj, n, [PRESETS["C4"]]):
            ex_filters["c4_bipartite"] = max(ex_filters["c4_bipartite"], edges)
        if free(adj, n, sets["K3_C4"]) and maximal(adj, n, sets["K3_C4"]):
            sat["K3_C4"] = edges if sat["K3_C4"] is None else min(sat["K3_C4"], edges)
    payload = {
        "version": "v3.7",
        "ex6": ex,
        "ex6WithFilters": ex_filters,
        "saturation6": sat,
    }
    Path(__file__).with_name("v37-oracles.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
