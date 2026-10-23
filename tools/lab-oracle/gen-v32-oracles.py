# v3.2 代数/图论核验脚本（WSL Sage 纯 Python + networkx；不依赖 GAP）
import itertools
import json

from sage.all import (
    AlternatingGroup, CyclicPermutationGroup, DihedralGroup, KleinFourGroup,
    QuaternionGroup, SymmetricGroup,
)
import networkx as nx

out = {}

S3 = SymmetricGroup(3)
S4 = SymmetricGroup(4)
A4 = AlternatingGroup(4)
A5 = AlternatingGroup(5)
C4 = CyclicPermutationGroup(4)
C6 = CyclicPermutationGroup(6)
V4 = KleinFourGroup()
D4 = DihedralGroup(4)
Q8 = QuaternionGroup()

def subgroup_report(g):
    subs = g.subgroups()
    hist = {}
    for s in subs:
        hist[str(s.order())] = hist.get(str(s.order()), 0) + 1
    return {'count': len(subs), 'order_histogram': dict(sorted(hist.items(), key=lambda kv: int(kv[0])))}

out['S4_subgroups'] = subgroup_report(S4)
out['A5_subgroups'] = subgroup_report(A5)
out['A4_subgroups'] = subgroup_report(A4)

def closure(g, gens):
    one = g.one()
    seen = {one}
    queue = [one]
    while queue:
        x = queue.pop()
        for gen in gens:
            y = x * gen
            if y not in seen:
                seen.add(y)
                queue.append(y)
    return seen

def minimal_generators(g):
    els = list(g)
    gens = []
    generated = {g.one()}
    for a in els:
        if a not in generated:
            gens.append(a)
            generated = closure(g, gens)
    return gens

def automorphism_count(g):
    els = list(g)
    one = g.one()
    orders = {a: a.order() for a in els}
    gens = minimal_generators(g)
    count = 0

    def extend(images):
        mapping = {one: one}
        queue = [one]
        while queue:
            x = queue.pop()
            for gen, image in zip(gens, images):
                y = x * gen
                target = mapping[x] * image
                if y in mapping:
                    if mapping[y] != target:
                        return None
                else:
                    mapping[y] = target
                    queue.append(y)
        if len(mapping) != len(els) or len(set(mapping.values())) != len(els):
            return None
        for a in els:
            for b in els:
                if mapping[a * b] != mapping[a] * mapping[b]:
                    return None
        return mapping

    def backtrack(index, used, images):
        nonlocal count
        if index == len(gens):
            if extend(images) is not None:
                count += 1
            return
        gen = gens[index]
        for h in els:
            if h in used or orders[h] != orders[gen]:
                continue
            used.add(h)
            images.append(h)
            backtrack(index + 1, used, images)
            images.pop()
            used.discard(h)

    backtrack(0, set(), [])
    return count

for name, group in [
    ('Aut_C4', C4), ('Aut_V4', V4), ('Aut_C6', C6), ('Aut_S3', S3),
    ('Aut_D4', D4), ('Aut_Q8', Q8), ('Aut_A4', A4), ('Aut_S4', S4), ('Aut_A5', A5),
]:
    out[name] = automorphism_count(group)

def hom_count(g, h):
    els_g = list(g)
    els_h = list(h)
    count = 0
    for images in itertools.product(els_h, repeat=len(els_g)):
        mapping = dict(zip(els_g, images))
        ok = True
        for a in els_g:
            for b in els_g:
                if mapping[a * b] != mapping[a] * mapping[b]:
                    ok = False
                    break
            if not ok:
                break
        if ok:
            count += 1
    return count

out['Hom_C4_C4'] = hom_count(C4, C4)
out['Hom_C4_V4'] = hom_count(C4, V4)
out['Hom_S3_S3'] = hom_count(S3, S3)

def cube_rotations():
    verts = [(x, y, z) for x in (1, -1) for y in (1, -1) for z in (1, -1)]
    index = {v: i for i, v in enumerate(verts)}
    perms = []
    for perm in itertools.permutations(range(3)):
        for signs in itertools.product((1, -1), repeat=3):
            inv = sum(1 for i in range(3) for j in range(i + 1, 3) if perm[i] > perm[j])
            det = signs[0] * signs[1] * signs[2] * (-1 if inv % 2 else 1)
            if det != 1:
                continue
            m = [[0, 0, 0] for _ in range(3)]
            for row, col in enumerate(perm):
                m[row][col] = signs[row]
            perms.append([
                index[tuple(sum(m[i][j] * v[j] for j in range(3)) for i in range(3))]
                for v in verts
            ])
    uniq = []
    seen = set()
    for p in perms:
        key = tuple(p)
        if key not in seen:
            seen.add(key)
            uniq.append(p)
    return verts, uniq

verts, vertex_perms = cube_rotations()
vi = {v: i for i, v in enumerate(verts)}
faces = [frozenset(vi[v] for v in verts if v[axis] == sign)
         for axis in range(3) for sign in (1, -1)]
edges = [frozenset((i, j)) for i in range(8) for j in range(i + 1, 8)
         if sum(1 for k in range(3) if verts[i][k] != verts[j][k]) == 1]

def act_on_sets(perms, sets):
    lookup = {s: i for i, s in enumerate(sets)}
    return [[lookup[frozenset(p[pt] for pt in s)] for s in sets] for p in perms]

def burnside(perms, k):
    total = 0
    for p in perms:
        seen = [False] * len(p)
        cycles = 0
        for i in range(len(p)):
            if seen[i]:
                continue
            cycles += 1
            j = i
            while not seen[j]:
                seen[j] = True
                j = p[j]
        total += k ** cycles
    return total // len(perms)

face_perms = act_on_sets(vertex_perms, faces)
edge_perms = act_on_sets(vertex_perms, edges)
out['cube_rotation_group_order'] = len(vertex_perms)
out['cube_burnside'] = {
    'faces': {'k2': burnside(face_perms, 2), 'k3': burnside(face_perms, 3)},
    'vertices': {'k2': burnside(vertex_perms, 2), 'k3': burnside(vertex_perms, 3)},
    'edges': {'k2': burnside(edge_perms, 2), 'k3': burnside(edge_perms, 3)},
}

def graph_aut_count(g):
    return sum(1 for _ in nx.algorithms.isomorphism.GraphMatcher(g, g).isomorphisms_iter())

def petersen():
    g = nx.Graph()
    g.add_edges_from([(0, 1), (1, 2), (2, 3), (3, 4), (4, 0),
                      (0, 5), (1, 6), (2, 7), (3, 8), (4, 9),
                      (5, 7), (7, 9), (9, 6), (6, 8), (8, 5)])
    return g

out['Petersen_aut_order'] = graph_aut_count(petersen())
out['C4_aut_order_graph'] = graph_aut_count(nx.cycle_graph(4))
out['P4_aut_order_graph'] = graph_aut_count(nx.path_graph(4))
out['K3x2_aut_order_graph'] = graph_aut_count(
    nx.disjoint_union(nx.complete_graph(3), nx.complete_graph(3)))

g = nx.Graph()
g.add_edges_from([(0, 1), (1, 2), (2, 0), (3, 4), (4, 5), (5, 3), (2, 3)])
out['modularity_two_triangles'] = float(
    nx.community.modularity(g, [{0, 1, 2}, {3, 4, 5}]))

with open('/mnt/e/drawing/tools/lab-oracle/v32-oracles.json', 'w', encoding='utf-8') as handle:
    json.dump(out, handle, ensure_ascii=False, indent=1)
print('written')
