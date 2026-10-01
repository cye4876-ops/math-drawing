import { describe, expect, it } from 'vitest'
import {
  buildAlgorithmFrames,
  buildAnimationFrames,
  buildRiemannFrames,
  buildTaylorFrames,
} from './animation'
import { graphObjectFromDsl } from '../graph/dsl-to-doc'
import { createView } from '../core/transform'
import type { Curve, DocState } from '../state/types'

function curve(expr: string): Curve {
  return {
    id: 'c1',
    type: 'curve',
    kind: 'explicit',
    name: expr,
    expr,
    color: '#2563eb',
    lineStyle: 'solid',
    quality: 3,
    visible: true,
  }
}

const doc: DocState = { objects: [curve('sin(x)')] }
const view = createView()
const size = { width: 640, height: 420 }

/** 最小 Canvas mock（overlay 冒烟测试） */
function mockCtx(): CanvasRenderingContext2D {
  const noop = (): void => {}
  return {
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    fillText: noop,
    arc: noop,
    fill: noop,
    closePath: noop,
    setLineDash: noop,
  } as unknown as CanvasRenderingContext2D
}

describe('export/animation: 帧构建（v0.6 扩展帧源）', () => {
  it('黎曼和：n = 1..N 递增帧数与标签；overlay 可执行', () => {
    const frames = buildRiemannFrames(doc, {
      kind: 'riemann',
      curveId: 'c1',
      a: -1,
      b: 1,
      mode: 'mid',
      maxN: 10,
    })
    expect(frames).toHaveLength(10)
    expect(frames[0]!.label).toContain('n = 1')
    expect(frames[9]!.label).toContain('n = 10')
    expect(frames[0]!.overlay).toBeTypeOf('function')
    frames[4]!.overlay!(mockCtx(), view, size)
  })

  it('黎曼和：区间非法 / 曲线缺失返回空', () => {
    expect(
      buildRiemannFrames(doc, {
        kind: 'riemann',
        curveId: 'c1',
        a: 1,
        b: -1,
        mode: 'left',
        maxN: 8,
      }),
    ).toEqual([])
    expect(
      buildRiemannFrames(doc, {
        kind: 'riemann',
        curveId: 'nope',
        a: -1,
        b: 1,
        mode: 'left',
        maxN: 8,
      }),
    ).toEqual([])
  })

  it('泰勒：T1..Tk 帧（系数来自符号求导）；不可导函数降级', () => {
    const frames = buildTaylorFrames(doc, { kind: 'taylor', curveId: 'c1', x0: 0, maxOrder: 6 })
    expect(frames).toHaveLength(6)
    expect(frames[5]!.label).toContain('T6')
    frames[5]!.overlay!(mockCtx(), view, size)

    const rough: DocState = { objects: [curve('floor(x)')] }
    const roughFrames = buildTaylorFrames(rough, {
      kind: 'taylor',
      curveId: 'c1',
      x0: 0,
      maxOrder: 6,
    })
    expect(roughFrames.length).toBeLessThanOrEqual(6)
  })

  it('统一入口分发：算法需要图；黎曼/泰勒按曲线', () => {
    const graph = graphObjectFromDsl('1-2, 2-3').graph!
    const graphDoc: DocState = { objects: [graph] }
    expect(
      buildAnimationFrames(graphDoc, { kind: 'algorithm', algorithmId: 'bfs' }).length,
    ).toBeGreaterThan(0)
    expect(buildAnimationFrames(doc, { kind: 'algorithm', algorithmId: 'bfs' })).toEqual([])
    expect(
      buildAnimationFrames(doc, {
        kind: 'riemann',
        curveId: 'c1',
        a: 0,
        b: 2,
        mode: 'left',
        maxN: 4,
      }),
    ).toHaveLength(4)
  })

  it('算法帧保留 highlight 且无 overlay', () => {
    const graph = graphObjectFromDsl('1-2, 2-3').graph!
    const frames = buildAlgorithmFrames(graph, { algorithmId: 'bfs' })
    expect(
      (frames[0]!.highlight!.nodes?.length ?? 0) + (frames[0]!.highlight!.edges?.length ?? 0),
    ).toBeGreaterThan(0)
    expect(frames[0]!.overlay).toBeUndefined()
  })
})
