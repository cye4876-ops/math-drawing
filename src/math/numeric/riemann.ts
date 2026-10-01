/** 黎曼和（v0.4 黎曼和动画工具）：左端点 / 右端点 / 中点 / 梯形 */

export type RiemannMode = 'left' | 'right' | 'mid' | 'trapezoid'

export interface RiemannResult {
  value: number
  n: number
  mode: RiemannMode
  evaluations: number
}

const MAX_N = 10_000

/**
 * 计算 f 在 [a, b] 上的 n 格黎曼和（四种模式）。
 * 关于"逐帧重算 vs 增量更新"（规格风险清单）：n ≤ 100 时一次求和仅约 101 次
 * 编译闭包求值（~0.01ms 量级，见 riemann 测试的性能用例），每帧重算的开销
 * 远低于一帧预算；因此不做增量机制（复杂度不值得），此偏差与理由记录于 docs/tools.md。
 */
export function riemannSum(
  f: (x: number) => number,
  a: number,
  b: number,
  nRaw: number,
  mode: RiemannMode,
): RiemannResult {
  const n = Math.min(MAX_N, Math.max(1, Math.round(nRaw)))
  if (!(b > a) || !Number.isFinite(a) || !Number.isFinite(b)) {
    return { value: Number.NaN, n, mode, evaluations: 0 }
  }
  const h = (b - a) / n
  let evaluations = 0
  const evalF = (x: number): number => {
    evaluations++
    return f(x)
  }

  let sum = 0
  switch (mode) {
    case 'left':
      for (let i = 0; i < n; i++) sum += evalF(a + i * h)
      break
    case 'right':
      for (let i = 1; i <= n; i++) sum += evalF(a + i * h)
      break
    case 'mid':
      for (let i = 0; i < n; i++) sum += evalF(a + (i + 0.5) * h)
      break
    case 'trapezoid':
      sum = (evalF(a) + evalF(b)) / 2
      for (let i = 1; i < n; i++) sum += evalF(a + i * h)
      break
  }
  return { value: sum * h, n, mode, evaluations }
}
