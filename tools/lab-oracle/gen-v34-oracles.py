"""
v3.4 / v3.5 独立基准（纯 Python，无第三方依赖）：
- 超图：度、线性、正则、连通、ν、τ、α、Property B（穷举着色）；
- 反拉姆齐：K_n 边着色的受限增长串穷举，求无彩虹 H 的最大颜色数 ar(n,H)（n ≤ 5）。
输出 v34-oracles.json，供单测/文档对照。
"""
import itertools
import json
from pathlib import Path


def normalize(n, edges):
    result = []
    seen = set()
    for edge in edges:
        members = tuple(sorted(set(edge)))
        if not members or members in seen:
            continue
        seen.add(members)
        result.append(members)
    return result


def hypergraph_record(name, n, edges):
    edges = normalize(n, edges)
    deg = [0] * n
    codeg = [[0] * n for _ in range(n)]
    for edge in edges:
        for v in edge:
            deg[v] += 1
        for a, b in itertools.combinations(edge, 2):
            codeg[a][b] += 1
            codeg[b][a] += 1
    max_codeg = max((codeg[i][j] for i in range(n) for j in range(i + 1, n)), default=0)

    # 连通（含孤立点）
    adj = [set() for _ in range(n)]
    for edge in edges:
        for a, b in itertools.combinations(edge, 2):
            adj[a].add(b)
            adj[b].add(a)
    seen = {0}
    stack = [0]
    while stack:
        u = stack.pop()
        for v in adj[u]:
            if v not in seen:
                seen.add(v)
                stack.append(v)
    connected = len(seen) == n

    # ν：最大不交超边数
    best_nu = 0
    for r in range(len(edges), 0, -1):
        found = False
        for subset in itertools.combinations(range(len(edges)), r):
            used = set()
            ok = True
            for index in subset:
                if used & set(edges[index]):
                    ok = False
                    break
                used |= set(edges[index])
            if ok:
                found = True
                break
        if found:
            best_nu = r
            break

    # τ：最小横截；α：最大不含完整超边的顶点集
    edge_sets = [set(edge) for edge in edges]
    best_tau = n
    for r in range(0, n + 1):
        if any(all(set(combo) & edge for edge in edge_sets) for combo in itertools.combinations(range(n), r)):
            best_tau = r
            break
    best_alpha = 0
    for r in range(n, -1, -1):
        if any(all(not edge.issubset(set(combo)) for edge in edge_sets) for combo in itertools.combinations(range(n), r)):
            best_alpha = r
            break

    # Property B：2-着色（顶点 0 固定为 0）
    colorable = False
    for mask in range(1 << max(0, n - 1)):
        colors = [0] + [(mask >> (i - 1)) & 1 for i in range(1, n)]
        if all(len({colors[v] for v in edge}) > 1 for edge in edges):
            colorable = True
            break

    return {
        "name": name,
        "n": n,
        "m": len(edges),
        "degrees": deg,
        "minDegree": min(deg) if deg else 0,
        "maxDegree": max(deg) if deg else 0,
        "maxCodegree": max_codeg,
        "linear": max_codeg <= 1,
        "regular": len(set(deg)) <= 1,
        "connected": connected,
        "nu": best_nu,
        "tau": best_tau,
        "alpha": best_alpha,
        "propertyB": colorable,
    }


def edge_pairs(n):
    return [(i, j) for i in range(n) for j in range(i + 1, n)]


def pattern_instances(n, kind, size):
    pairs = edge_pairs(n)
    index = {pair: k for k, pair in enumerate(pairs)}
    instances = set()
    if kind == "clique":
        for combo in itertools.combinations(range(n), size):
            instances.add(tuple(sorted(index[(a, b)] for a, b in itertools.combinations(combo, 2))))
    elif kind == "path":
        for perm in itertools.permutations(range(n), size):
            if perm[0] > perm[-1]:
                continue
            instances.add(tuple(sorted(index[tuple(sorted((perm[i], perm[i + 1])))] for i in range(size - 1))))
    elif kind == "cycle":
        for combo in itertools.combinations(range(n), size):
            start = combo[0]
            for rest in itertools.permutations(combo[1:]):
                if rest[0] > rest[-1]:
                    continue
                seq = (start,) + rest
                edges = [index[tuple(sorted((seq[i], seq[(i + 1) % size])))] for i in range(size)]
                instances.add(tuple(sorted(edges)))
    elif kind == "matching":
        for combo in itertools.combinations(range(len(pairs)), size):
            used = set()
            ok = True
            for edge_index in combo:
                u, v = pairs[edge_index]
                if u in used or v in used:
                    ok = False
                    break
                used.add(u)
                used.add(v)
            if ok:
                instances.add(tuple(sorted(combo)))
    return [list(item) for item in instances]


def partitions(m):
    colors = [0] * m
    used = 1

    def walk(index, used_count):
        if index == m:
            yield list(colors)
            return
        for color in range(used_count):
            colors[index] = color
            yield from walk(index + 1, used_count if color < used_count - 1 else used_count)
        # 新颜色
        colors[index] = used_count
        yield from walk(index + 1, used_count + 1)
        colors[index] = 0

    yield from walk(1, 1)


def ar_value(n, kind, size):
    instances = pattern_instances(n, kind, size)
    m = len(edge_pairs(n))
    best = 0
    for colors in partitions(m):
        used = max(colors) + 1
        if used <= best:
            continue
        ok = True
        for instance in instances:
            if len({colors[e] for e in instance}) == len(instance):
                ok = False
                break
        if ok:
            best = used
    return best


def main():
    fano = [
        [0, 1, 2],
        [0, 3, 4],
        [0, 5, 6],
        [1, 3, 5],
        [1, 4, 6],
        [2, 3, 6],
        [2, 4, 5],
    ]
    k5 = [list(combo) for combo in itertools.combinations(range(5), 3)]
    loose = [[0, 1, 2], [2, 3, 4], [4, 5, 0]]
    hypergraphs = [
        hypergraph_record("K5^3", 5, k5),
        hypergraph_record("Fano", 7, fano),
        hypergraph_record("loose_triangle", 6, loose),
    ]
    anti_ramsey = {}
    for n in (4, 5):
        for kind, sizes in (("clique", [3, 4]), ("path", [3, 4]), ("cycle", [3, 4]), ("matching", [2])):
            for size in sizes:
                if (kind == "clique" and size > n) or (kind == "matching" and size * 2 > n):
                    continue
                anti_ramsey[f"n{n}:{kind}{size}"] = ar_value(n, kind, size)
    output = {
        "generatedBy": "tools/lab-oracle/gen-v34-oracles.py",
        "hypergraphs": hypergraphs,
        "antiRamsey": anti_ramsey,
    }
    target = Path(__file__).with_name("v34-oracles.json")
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
