/**
 * 概率模拟（v0.7）：可复现的伪随机数（mulberry32）+ 五类演示的增量推进逻辑。
 * - 大数定律：抛硬币频率收敛（**增量累加**，不重算历史）；
 * - 中心极限定理：从任意来源分布抽样求均值，计算样本均值的直方图数据；
 * - 蒙特卡洛求 π：撒点计数；
 * - 自助法：从样本重抽样求均值的分布；
 * - 随机游走：多维轨迹。
 */

/** mulberry32：确定性 PRNG（同种子可复现，测试友好） */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 标准正态采样（Box-Muller，缓存第二个值） */
export function createGauss(rng: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const value = spare
      spare = null
      return value
    }
    let u = 0
    let v = 0
    while (u === 0) u = rng()
    while (v === 0) v = rng()
    const mag = Math.sqrt(-2 * Math.log(u))
    spare = mag * Math.sin(2 * Math.PI * v)
    return mag * Math.cos(2 * Math.PI * v)
  }
}

// ---------- 大数定律 ----------

export interface LlnState {
  trials: number
  heads: number
}

/** 增量推进 n 次抛硬币 */
export function llnAdvance(state: LlnState, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    state.trials++
    if (rng() < 0.5) state.heads++
  }
}

export function llnFraction(state: LlnState): number {
  return state.trials === 0 ? 0 : state.heads / state.trials
}

// ---------- 自助法 ----------

/** 从 data 有放回抽样 size 个求均值（返回均值） */
export function bootstrapMean(rng: () => number, data: number[], size = data.length): number {
  if (data.length === 0) return Number.NaN
  let acc = 0
  for (let i = 0; i < size; i++) {
    acc += data[Math.floor(rng() * data.length)]!
  }
  return acc / size
}

/** 批量自助均值（增量追加到 out） */
export function bootstrapAdvance(
  rng: () => number,
  data: number[],
  out: number[],
  reps: number,
  size = data.length,
): void {
  for (let i = 0; i < reps; i++) out.push(bootstrapMean(rng, data, size))
}

// ---------- 蒙特卡洛 π ----------

export interface MonteCarloState {
  inside: number
  total: number
}

/** 在单位正方形撒点（圆心 0.5,0.5 半径 0.5）；增量推进 */
export function monteCarloAdvance(state: MonteCarloState, rng: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = rng()
    const y = rng()
    const dx = x - 0.5
    const dy = y - 0.5
    if (dx * dx + dy * dy <= 0.25) state.inside++
    state.total++
  }
}

export function monteCarloEstimate(state: MonteCarloState): number {
  return state.total === 0 ? 0 : (4 * state.inside) / state.total
}

// ---------- 中心极限定理 ----------

/** 单次「n 个样本的均值」（来源：均匀分布 0..1 或任意 fn 采样） */
export function cltMean(
  rng: () => number,
  n: number,
  source: (rng: () => number) => number = (r) => r(),
): number {
  let acc = 0
  for (let i = 0; i < n; i++) acc += source(rng)
  return acc / n
}

/** 批量模拟：往 out 追加 reps 个样本均值 */
export function cltAdvance(
  rng: () => number,
  out: number[],
  n: number,
  reps: number,
  source?: (rng: () => number) => number,
): void {
  for (let i = 0; i < reps; i++) out.push(cltMean(rng, n, source))
}

// ---------- 随机游走 ----------

export interface WalkPoint {
  x: number
  y: number
}

/** 二维随机游走轨迹（起点 (0,0)，steps 步，每步 ±1 轴向） */
export function randomWalk2D(rng: () => number, steps: number): WalkPoint[] {
  const points: WalkPoint[] = [{ x: 0, y: 0 }]
  let x = 0
  let y = 0
  for (let i = 0; i < steps; i++) {
    const dir = Math.floor(rng() * 4)
    if (dir === 0) x++
    else if (dir === 1) x--
    else if (dir === 2) y++
    else y--
    points.push({ x, y })
  }
  return points
}
