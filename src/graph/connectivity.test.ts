/**
 * v3.2 连通度/围长/直径测试：K4 κ=λ=3、C4 2、P4 1、Petersen 3、K3,3 3、K5 4、不连通 0。
 */
import { describe, expect, it } from 'vitest'
import { computeConnectivity, diameterOf, girthOf } from './connectivity'
import { createEdge, createNode, type GraphObject } from './model'

function makeGraph(labels: string[], edges: [string, string][]): GraphObject {
  const nodes = labels.map((label, i) => createNode(label, i, 0, '#2563eb'))
  const byLabel = new Map(nodes.map((node) => [node.label, node]))
  return {
    id: 'g',
    type: 'graph',
    name: 'g',
    visible: true,
    nodes,
    edges: edges.map(([a, b]) => createEdge(byLabel.get(a)!.id, byLabel.get(b)!.id)),
  }
}

const K4 = makeGraph(
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

const C4 = makeGraph(
  ['A', 'B', 'C', 'D'],
  [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
    ['D', 'A'],
  ],
)

const P4 = makeGraph(
  ['A', 'B', 'C', 'D'],
  [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'D'],
  ],
)

const PETERSEN = makeGraph(
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  [
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
  ],
)

const K33 = makeGraph(
  ['1', '2', '3', '4', '5', '6'],
  [
    ['1', '4'],
    ['1', '5'],
    ['1', '6'],
    ['2', '4'],
    ['2', '5'],
    ['2', '6'],
    ['3', '4'],
    ['3', '5'],
    ['3', '6'],
  ],
)

describe('v3.2 连通度（Menger）', () => {
  it('K4：κ = λ = 3；K5：4；三角形：2', () => {
    const k4 = computeConnectivity(K4)
    expect(k4.vertex).toBe(3)
    expect(k4.edge).toBe(3)
    const k5 = makeGraph(
      ['1', '2', '3', '4', '5'],
      [
        ['1', '2'],
        ['1', '3'],
        ['1', '4'],
        ['1', '5'],
        ['2', '3'],
        ['2', '4'],
        ['2', '5'],
        ['3', '4'],
        ['3', '5'],
        ['4', '5'],
      ],
    )
    const result = computeConnectivity(k5)
    expect(result.vertex).toBe(4)
    expect(result.edge).toBe(4)
    const triangle = makeGraph(
      ['1', '2', '3'],
      [
        ['1', '2'],
        ['2', '3'],
        ['3', '1'],
      ],
    )
    const t = computeConnectivity(triangle)
    expect(t.vertex).toBe(2)
    expect(t.edge).toBe(2)
  })

  it('C4：2/2；P4：1/1；单边：1/1；不连通：0/0', () => {
    expect(computeConnectivity(C4)).toMatchObject({ vertex: 2, edge: 2 })
    expect(computeConnectivity(P4)).toMatchObject({ vertex: 1, edge: 1 })
    const single = makeGraph(['A', 'B'], [['A', 'B']])
    expect(computeConnectivity(single)).toMatchObject({ vertex: 1, edge: 1 })
    const disconnected = makeGraph(
      ['A', 'B', 'C', 'D'],
      [
        ['A', 'B'],
        ['C', 'D'],
      ],
    )
    expect(computeConnectivity(disconnected)).toMatchObject({ vertex: 0, edge: 0 })
  })

  it('Petersen：3/3（3-连通、3-边连通）；K3,3：3/3', () => {
    expect(computeConnectivity(PETERSEN)).toMatchObject({ vertex: 3, edge: 3 })
    expect(computeConnectivity(K33)).toMatchObject({ vertex: 3, edge: 3 })
  })

  it('围长：C4=4、Petersen=5、K4=3、森林=∞；直径：P4=3、C4=2、不连通=null', () => {
    expect(girthOf(C4)).toBe(4)
    expect(girthOf(PETERSEN)).toBe(5)
    expect(girthOf(K4)).toBe(3)
    expect(girthOf(P4)).toBe(Infinity)
    expect(diameterOf(P4)).toBe(3)
    expect(diameterOf(C4)).toBe(2)
    const disconnected = makeGraph(['A', 'B'], [['A', 'B']])
    expect(diameterOf(disconnected)).toBe(1)
    const twoParts = makeGraph(['A', 'B', 'C'], [['A', 'B']])
    expect(diameterOf(twoParts)).toBeNull()
  })
})
