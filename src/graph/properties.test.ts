/**
 * 图的性质测试（v0.5）：连通性 / 二分性 / 欧拉路与回路 / 平面性透传。
 */
import { describe, expect, it } from 'vitest'
import { graphObjectFromDsl } from './dsl-to-doc'
import type { GraphObject } from './model'
import { computeProperties } from './properties'

function make(dsl: string): GraphObject {
  const { graph } = graphObjectFromDsl(dsl)
  return graph!
}

const K5 = '1-2, 1-3, 1-4, 1-5, 2-3, 2-4, 2-5, 3-4, 3-5, 4-5'

describe('v0.5 图的性质（computeProperties）', () => {
  it('连通性：连通 / 不连通（含孤立点与分量数）', () => {
    expect(computeProperties(make('A-B, B-C')).connected).toBe(true)
    const split = computeProperties(make('A-B, C-D'))
    expect(split.connected).toBe(false)
    expect(split.components).toBe(2)
    const withIsolated = computeProperties(make('A-B, C'))
    expect(withIsolated.connected).toBe(false)
    expect(withIsolated.components).toBe(2)
  })

  it('欧拉判据：三角形=回路、路径=路径、星=不存在、K5（4-正则）=回路', () => {
    expect(computeProperties(make('1-2, 2-3, 3-1')).euler).toBe('circuit')
    expect(computeProperties(make('1-2, 2-3')).euler).toBe('path')
    expect(computeProperties(make('1-2, 1-3, 1-4')).euler).toBe('none')
    expect(computeProperties(make(K5)).euler).toBe('circuit')
    // K4 每点度 3：4 个奇度点 → 不存在
    expect(computeProperties(make('1-2, 1-3, 1-4, 2-3, 2-4, 3-4')).euler).toBe('none')
  })

  it('孤立点与自环：全孤立=平凡回路；自环计 2 度（偶）不破坏回路', () => {
    expect(computeProperties(make('A, B')).euler).toBe('circuit')
    // 三角形 + 自环：每点度仍为偶（自环贡献 2）→ 回路
    expect(computeProperties(make('1-2, 2-3, 3-1, 1-1')).euler).toBe('circuit')
  })

  it('二分性透传：奇环非二分、偶环二分', () => {
    expect(computeProperties(make('1-2, 2-3, 3-1')).bipartite).toBe(false)
    expect(computeProperties(make('1-2, 2-3, 3-4, 4-1')).bipartite).toBe(true)
  })

  it('平面性透传（K5 → forbidden=K5）', () => {
    expect(computeProperties(make(K5)).planar.forbidden).toBe('K5')
  })
})
