/**
 * 生命游戏测试（v0.9）：滑翔机周期 4、闪烁器周期 2、随机确定性、性能目标。
 */
import { describe, expect, it } from 'vitest'
import { LIFE_PATTERNS, LifeSim, lifeRandom, renderLife } from './life'

function pattern(name: string) {
  const found = LIFE_PATTERNS.find((item) => item.name === name)
  if (!found) throw new Error(`缺少图案 ${name}`)
  return found
}

describe('v0.9 生命游戏：规则与图案', () => {
  it('滑翔机：周期 4，整体位移 (1, 1)', () => {
    const sim = new LifeSim(24, 24)
    sim.wrap = true
    const glider = pattern('glider')
    sim.setPattern(glider, 5, 5)
    const before = sim.liveCells()
    for (let i = 0; i < 4; i++) sim.step()
    const after = sim.liveCells()
    expect(after.length).toBe(before.length)
    const expected = before.map((cell) => ({ x: cell.x + 1, y: cell.y + 1 }))
    const sortKey = (cell: { x: number; y: number }): string => `${cell.x},${cell.y}`
    expect(after.map(sortKey).sort()).toEqual(expected.map(sortKey).sort())
    expect(sim.generation).toBe(4)
  })

  it('闪烁器：周期 2，横→竖→横', () => {
    const sim = new LifeSim(10, 10)
    sim.setPattern(pattern('blinker'), 3, 3)
    expect(sim.population()).toBe(3)
    sim.step()
    // 竖排：x=4, y=2..4
    expect(sim.liveCells().sort((a, b) => a.y - b.y)).toEqual([
      { x: 4, y: 2 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
    ])
    sim.step()
    expect(sim.liveCells().sort((a, b) => a.x - b.x)).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
    ])
  })

  it('静止方块（block）保持不变', () => {
    const sim = new LifeSim(8, 8)
    sim.set(2, 2, 1)
    sim.set(3, 2, 1)
    sim.set(2, 3, 1)
    sim.set(3, 3, 1)
    sim.step()
    expect(sim.population()).toBe(4)
    expect(sim.get(2, 2)).toBe(1)
    expect(sim.get(3, 3)).toBe(1)
  })

  it('不环绕边界：贴着顶边的闪烁器逐步消亡', () => {
    const sim = new LifeSim(12, 12)
    sim.wrap = false
    sim.setPattern(pattern('blinker'), 5, 0)
    for (let i = 0; i < 4; i++) sim.step()
    expect(sim.population()).toBe(0)
  })

  it('randomize 确定性（同种子同结果）', () => {
    const a = new LifeSim(32, 32)
    const b = new LifeSim(32, 32)
    a.randomize(0.3, 42)
    b.randomize(0.3, 42)
    expect(a.population()).toBe(b.population())
    expect(a.liveCells()).toEqual(b.liveCells())
    const c = new LifeSim(32, 32)
    c.randomize(0.3, 43)
    expect(c.population()).not.toBe(a.population())
  })

  it('lifeRandom 输出在 [0,1)', () => {
    const rand = lifeRandom(7)
    for (let i = 0; i < 100; i++) {
      const value = rand()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('v0.9 生命游戏：渲染与性能', () => {
  it('renderLife 尺寸与颜色（活细胞亮、死细胞暗）', () => {
    const sim = new LifeSim(4, 4)
    sim.set(0, 0, 1)
    const data = renderLife(sim, 2)
    expect(data.length).toBe(8 * 8 * 4)
    // 活细胞 (0,0) → 像素 (0,0)：绿色通道亮
    expect(data[1]!).toBeGreaterThan(200)
    // 死细胞 (1,0) → 像素 (2,0)
    const deadOffset = 2 * 4
    expect(data[deadOffset]!).toBeLessThan(40)
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255)
  })

  // 覆盖率插桩会成倍拖慢执行（CI 与普通模式严格断言）；本地跑覆盖率时设 SKIP_PERF=1
  it.skipIf(process.env.SKIP_PERF === '1')('1000×1000 步进性能（30fps 目标）', () => {
    const sim = new LifeSim(1000, 1000)
    sim.randomize(0.28, 99)
    // 预热
    sim.step()
    sim.step()
    // best-of 采样：并行 CI 下单轮可能被抢占，取最快轮代表实际能力
    let best = Number.POSITIVE_INFINITY
    for (let round = 0; round < 7; round++) {
      const start = performance.now()
      sim.step()
      best = Math.min(best, performance.now() - start)
    }
    expect(best).toBeLessThan(33)
  })
})
