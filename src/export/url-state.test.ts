import { describe, expect, it } from 'vitest'
import { buildShareUrl, decodeSharedState, encodeSharedState, type SharedState } from './url-state'
import { DocFormatError } from '../state/serialize'
import { graphObjectFromDsl } from '../graph/dsl-to-doc'
import { createView } from '../core/transform'
import type { Curve, ViewTransform } from '../state/types'

function curve(expr: string, id = 'c1'): Curve {
  return {
    id,
    type: 'curve',
    kind: 'explicit',
    name: expr,
    expr,
    color: '#2563eb',
    lineStyle: 'dashed',
    quality: 3,
    visible: true,
  }
}

function makeState(overrides: Partial<SharedState> = {}): SharedState {
  const graph = graphObjectFromDsl('A-B:3, B-C:1.5').graph!
  const view: ViewTransform = { ...createView(), centerX: 1.25, centerY: -0.5, scaleX: 90 }
  return {
    doc: { objects: [curve('sin(x)'), curve('x^2 - 4', 'c2'), graph] },
    view,
    mode: 'graph',
    ...overrides,
  }
}

describe('export/url-state: 分享链接编解码', () => {
  it('往返一致：曲线 + 图 + 视图 + 模式', () => {
    const state = makeState()
    const decoded = decodeSharedState(encodeSharedState(state))
    expect(decoded.mode).toBe('graph')
    expect(decoded.view.centerX).toBeCloseTo(1.25, 9)
    expect(decoded.view.scaleX).toBeCloseTo(90, 9)
    expect(decoded.doc.objects).toHaveLength(3)
    const restoredCurves = decoded.doc.objects.filter((object) => object.type === 'curve')
    expect(restoredCurves.map((item) => item.expr)).toEqual(['sin(x)', 'x^2 - 4'])
    const restoredGraph = decoded.doc.objects.find((object) => object.type === 'graph')
    expect(restoredGraph).toBeDefined()
    if (restoredGraph?.type === 'graph') {
      expect(restoredGraph.edges.map((edge) => edge.weight)).toEqual([3, 1.5])
    }
  })

  it('100 个随机文档状态往返完全一致', () => {
    for (let round = 0; round < 100; round++) {
      const count = 1 + ((round * 7) % 4)
      const objects: Curve[] = []
      for (let i = 0; i < count; i++) {
        objects.push(curve(`${round * 13 + i}*sin(x/${i + 1}) + ${i}`, `r${round}c${i}`))
      }
      const state: SharedState = {
        doc: { objects },
        view: {
          ...createView(),
          centerX: (round % 100) / 10 - 5,
          centerY: (round % 37) / 10 - 2,
          scaleX: 40 + (round % 200),
        },
        mode: round % 2 === 0 ? 'plot' : 'graph',
      }
      const decoded = decodeSharedState(encodeSharedState(state))
      expect(decoded.view).toEqual(state.view)
      expect(decoded.mode).toBe(state.mode)
      expect(decoded.doc.objects).toEqual(state.doc.objects)
    }
  })

  it('验收：3 条曲线 + 图状态的 URL 长度 < 2000 字符', () => {
    const param = encodeSharedState(makeState())
    expect(param.length).toBeLessThan(2000)
  })

  it('损坏数据抛出 DocFormatError（base64 / 解压失败）', () => {
    expect(() => decodeSharedState('')).toThrow(DocFormatError)
    expect(() => decodeSharedState('!!!not-base64!!!')).toThrow(DocFormatError)
    expect(() => decodeSharedState('aGVsbG8')).toThrow(DocFormatError)
  })

  it('buildShareUrl：带 mode 与 doc 参数、清空 hash', () => {
    const url = buildShareUrl('http://localhost:5173/?old=1#frag', makeState())
    expect(url).toContain('mode=graph')
    expect(url).toContain('doc=')
    expect(url).not.toContain('old=1')
    expect(url).not.toContain('#frag')
  })
})
