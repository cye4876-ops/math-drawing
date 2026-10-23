/**
 * v3.2 图同构/自同构测试（Sage/networkx 核验：Petersen |Aut|=120、K3∪K3 |Aut|=72、C4 |Aut|=8）。
 */
import { describe, expect, it } from 'vitest'
import { areIsomorphic, colorClassCount, countAutomorphisms } from './isomorphism'
import { createEdge, createNode, type GraphObject } from './model'

function makeGraph(labels: string[], edges: [string, string][]): GraphObject {
  const nodes = labels.map((label, i) => createNode(label, i, 0, '#2563eb'))
  const byLabel = new Map(nodes.map((node) => [node.label, node]))
  const edgesData = edges.map(([a, b]) => createEdge(byLabel.get(a)!.id, byLabel.get(b)!.id))
  return { id: 'g', type: 'graph', name: 'g', visible: true, nodes, edges: edgesData }
}

const PETERSEN_EDGES: [string, string][] = [
  ['1', '2'],
  ['2', '3'],
  ['3', '4'],
  ['4', '5'],
  ['5', '1'],
  ['6', '8'],
  ['8', '10'],
  ['10', '7'],
  ['7', '9'],
  ['9', '6'],
  ['1', '6'],
  ['2', '7'],
  ['3', '8'],
  ['4', '9'],
  ['5', '10'],
]

describe('v3.2 图同构与自同构', () => {
  it('自同构计数：P4=2、C4=8、K4=24、Petersen=120、K3∪K3=72', () => {
    const p4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ],
    )
    expect(countAutomorphisms(p4).count).toBe(2)

    const c4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['D', 'A'],
      ],
    )
    expect(countAutomorphisms(c4).count).toBe(8)

    const k4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['A', 'C'],
        ['A', 'D'],
        ['B', 'C'],
        ['B', 'D'],
        ['C', 'D'],
      ],
    )
    const k4Result = countAutomorphisms(k4)
    expect(k4Result.count).toBe(24)
    expect(k4Result.complete).toBe(true)

    const petersen = makeGraph(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], PETERSEN_EDGES)
    expect(countAutomorphisms(petersen).count).toBe(120)

    const twoTriangles = makeGraph(
      ['1', '2', '3', '4', '5', '6'],
      [
        ['1', '2'],
        ['2', '3'],
        ['3', '1'],
        ['4', '5'],
        ['5', '6'],
        ['6', '4'],
      ],
    )
    expect(countAutomorphisms(twoTriangles).count).toBe(72)
  })

  it('同构判定：C6 重标号同构；C6 与两个三角形不同构；P4 与 C4 不同构', () => {
    const c6 = makeGraph(
      ['1', '2', '3', '4', '5', '6'],
      [
        ['1', '2'],
        ['2', '3'],
        ['3', '4'],
        ['4', '5'],
        ['5', '6'],
        ['6', '1'],
      ],
    )
    const relabeled = makeGraph(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'e'],
        ['e', 'f'],
        ['f', 'a'],
      ],
    )
    expect(areIsomorphic(c6, relabeled).isomorphic).toBe(true)

    const twoTriangles = makeGraph(
      ['1', '2', '3', '4', '5', '6'],
      [
        ['1', '2'],
        ['2', '3'],
        ['3', '1'],
        ['4', '5'],
        ['5', '6'],
        ['6', '4'],
      ],
    )
    const notIso = areIsomorphic(c6, twoTriangles)
    expect(notIso.isomorphic).toBe(false)
    expect(notIso.budgetExceeded).toBe(false)
    expect(notIso.note).toContain('不同构')

    const p4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ],
    )
    const c4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['D', 'A'],
      ],
    )
    expect(areIsomorphic(p4, c4).isomorphic).toBe(false)
  })

  it('颜色细化：Petersen 点传递 → 单色类；P4 → 两类', () => {
    const petersen = makeGraph(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], PETERSEN_EDGES)
    expect(colorClassCount(petersen)).toBe(1)
    const p4 = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
      ],
    )
    expect(colorClassCount(p4)).toBe(2)
  })
})
