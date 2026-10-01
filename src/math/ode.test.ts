/**
 * ODE 数值积分测试（v0.8）——覆盖规格「关键正确性测试」：
 * RK4 vs 欧拉（y'=y, y(0)=1）误差小 2 个数量级以上；精确解对照；相图守恒；洛伦兹。
 */
import { describe, expect, it } from 'vitest'
import {
  directionField,
  eulerStep,
  improvedEulerStep,
  integrateOde,
  lorenzTrajectory,
  phaseTrajectory,
  rk4Step,
} from './ode'

describe('v0.8 ODE：单步积分器', () => {
  it("欧拉一步：y = 1, h = 0.1, y' = y → 1.1", () => {
    expect(eulerStep((_x, y) => y, 0, 1, 0.1)).toBeCloseTo(1.1, 12)
  })

  it('改进欧拉一步：y = 1 + 0.05·(1 + 1.1) = 1.105', () => {
    expect(improvedEulerStep((_x, y) => y, 0, 1, 0.1)).toBeCloseTo(1.105, 12)
  })

  it('RK4 一步 ≈ e^0.1（截断误差 ~ h⁵，约 8e-8）', () => {
    expect(rk4Step((_x, y) => y, 0, 1, 0.1)).toBeCloseTo(Math.exp(0.1), 6)
  })
})

describe('v0.8 ODE：积分对比（关键验收）', () => {
  it("y' = y, y(0) = 1 到 x = 1：RK4 误差比欧拉小 ≥ 2 个数量级", () => {
    const f = (_x: number, y: number): number => y
    const euler = integrateOde(f, { x0: 0, y0: 1, xEnd: 1, steps: 10, method: 'euler' })
    const improved = integrateOde(f, { x0: 0, y0: 1, xEnd: 1, steps: 10, method: 'improved' })
    const rk4 = integrateOde(f, { x0: 0, y0: 1, xEnd: 1, steps: 10, method: 'rk4' })
    const exact = Math.E
    const eulerError = Math.abs(euler[euler.length - 1]!.y - exact)
    const improvedError = Math.abs(improved[improved.length - 1]!.y - exact)
    const rk4Error = Math.abs(rk4[rk4.length - 1]!.y - exact)
    expect(eulerError).toBeGreaterThan(0.1) // 欧拉 ~0.125
    expect(rk4Error).toBeLessThan(eulerError / 100) // 至少 2 个数量级
    expect(improvedError).toBeLessThan(eulerError / 10)
    expect(improvedError).toBeGreaterThan(rk4Error)
  })

  it("y' = 2x（精确解 x²）：RK4 五步误差 < 1e-6；步子更细则 < 1e-10", () => {
    const f = (x: number): number => 2 * x
    const coarse = integrateOde(f, { x0: 0, y0: 0, xEnd: 1, steps: 5, method: 'rk4' })
    expect(Math.abs(coarse[5]!.y - 1)).toBeLessThan(1e-6)
    const fine = integrateOde(f, { x0: 0, y0: 0, xEnd: 1, steps: 100, method: 'rk4' })
    expect(Math.abs(fine[100]!.y - 1)).toBeLessThan(1e-10)
  })

  it("反向积分（xEnd < x0）可用：y' = y 从 1 积到 0 ≈ e^{−1}", () => {
    const points = integrateOde((_x, y) => y, {
      x0: 1,
      y0: Math.E,
      xEnd: 0,
      steps: 50,
      method: 'rk4',
    })
    expect(Math.abs(points[points.length - 1]!.y - 1)).toBeLessThan(1e-4)
  })

  it('非有限值提前终止并保留已有前缀', () => {
    const points = integrateOde((_x, y) => (y > 2 ? Number.NaN : y), {
      x0: 0,
      y0: 1,
      xEnd: 10,
      steps: 100,
      method: 'euler',
    })
    expect(points.length).toBeLessThan(101)
    expect(points.length).toBeGreaterThan(1)
  })
})

describe('v0.8 ODE：方向场', () => {
  it('网格采样数量与斜率正确', () => {
    const arrows = directionField((x, y) => x - y, {
      xMin: -1,
      xMax: 1,
      yMin: -1,
      yMax: 1,
      cols: 5,
      rows: 5,
    })
    expect(arrows).toHaveLength(25)
    const at01 = arrows.find((a) => Math.abs(a.x - -0.5) < 1e-9 && Math.abs(a.y - 0.5) < 1e-9)
    expect(at01?.slope).toBeCloseTo(-1, 12)
  })

  it('非有限斜率格点跳过', () => {
    const arrows = directionField(() => Number.NaN, {
      xMin: 0,
      xMax: 1,
      yMin: 0,
      yMax: 1,
      cols: 3,
      rows: 3,
    })
    expect(arrows).toHaveLength(0)
  })
})

describe('v0.8 ODE：相图与洛伦兹', () => {
  it("谐振子 x' = y, y' = −x：轨线为半径 1 的圆（守恒）", () => {
    const points = phaseTrajectory((x, y) => [y, -x], { x0: 1, y0: 0, dt: 0.01, steps: 628 })
    for (const point of points) {
      expect(Math.abs(Math.hypot(point.x, point.y) - 1)).toBeLessThan(1e-3)
    }
    const last = points[points.length - 1]!
    expect(Math.hypot(last.x - 1, last.y)).toBeLessThan(1e-2)
  })

  it("衰减系统 x' = −x：收敛到原点", () => {
    const points = phaseTrajectory((x, y) => [-x, -y], { x0: 2, y0: 1, dt: 0.05, steps: 300 })
    const last = points[points.length - 1]!
    expect(Math.hypot(last.x, last.y)).toBeLessThan(1e-4)
  })

  it('洛伦兹：点数正确、吸引子范围有限、同参数可复现', () => {
    const points = lorenzTrajectory({ steps: 3000 })
    expect(points).toHaveLength(3001)
    for (const [x, y, z] of points) {
      expect(Math.abs(x)).toBeLessThan(30)
      expect(Math.abs(y)).toBeLessThan(35)
      expect(Math.abs(z)).toBeLessThan(60)
    }
    const again = lorenzTrajectory({ steps: 3000 })
    expect(again[3000]).toEqual(points[3000])
  })

  it('洛伦兹：不同初值最终进入同一吸引子区域（蝴蝶双翼）', () => {
    const a = lorenzTrajectory({ x0: 0.1, steps: 6000 })
    const b = lorenzTrajectory({ x0: 5, y0: 5, z0: 5, steps: 6000 })
    const tail = (pts: [number, number, number][]): [number, number, number] => {
      let sx = 0
      let sy = 0
      let sz = 0
      const last = pts.slice(-500)
      for (const [x, y, z] of last) {
        sx += x
        sy += y
        sz += z
      }
      return [sx / last.length, sy / last.length, sz / last.length]
    }
    const [ax, ay, az] = tail(a)
    const [bx, by, bz] = tail(b)
    expect(Math.abs(ax - bx)).toBeLessThan(5)
    expect(Math.abs(ay - by)).toBeLessThan(5)
    expect(Math.abs(az - bz)).toBeLessThan(5)
  })
})
