/**
 * 统计模式共享状态（v0.7）：模拟运行时（非文档数据）+ 散点点选高亮。
 * - 运行时按需重建（重置 = 新种子，可复现由 simulation 模块保证）；
 * - 渲染器每帧读取；面板 rAF 驱动推进（playing 时）。
 * - 点选高亮用于散点↔残差联动（不入文档、不产生撤销）。
 */
import {
  bootstrapAdvance,
  cltAdvance,
  createGauss,
  createRng,
  llnAdvance,
  monteCarloAdvance,
  randomWalk2D,
  type WalkPoint,
} from './simulation'
import type { SimulationKind } from './model'

export interface RuntimeLln {
  kind: 'lln'
  trials: number
  heads: number
  history: { trials: number; fraction: number }[]
}

export interface RuntimeClt {
  kind: 'clt'
  means: number[]
}

export interface RuntimeMc {
  kind: 'montecarlo-pi'
  inside: number
  total: number
  /** 最近撒点（环形保留，用于可视化） */
  points: { x: number; y: number }[]
}

export interface RuntimeBoot {
  kind: 'bootstrap'
  means: number[]
}

export interface RuntimeWalk {
  kind: 'random-walk'
  walks: WalkPoint[][]
}

export type SimulationRuntime = RuntimeLln | RuntimeClt | RuntimeMc | RuntimeBoot | RuntimeWalk

/** 每帧推进的试验规模基准（乘 speed） */
const BASE_STEP = 10

const rngs = new WeakMap<object, () => number>()
const gausses = new WeakMap<object, () => number>()

function attachRng(target: object, seed: number): () => number {
  const rng = createRng(seed)
  rngs.set(target, rng)
  gausses.set(target, createGauss(rng))
  return rng
}

/** 生成（或重置）指定模拟的运行时；样本数据在推进时按需传入 */
export function createRuntime(kind: SimulationKind, seed: number): SimulationRuntime {
  switch (kind) {
    case 'clt': {
      const runtime: RuntimeClt = { kind: 'clt', means: [] }
      attachRng(runtime, seed)
      return runtime
    }
    case 'montecarlo-pi': {
      const runtime: RuntimeMc = { kind: 'montecarlo-pi', inside: 0, total: 0, points: [] }
      attachRng(runtime, seed)
      return runtime
    }
    case 'bootstrap': {
      const runtime: RuntimeBoot = { kind: 'bootstrap', means: [] }
      attachRng(runtime, seed)
      return runtime
    }
    case 'random-walk': {
      const runtime: RuntimeWalk = { kind: 'random-walk', walks: [] }
      attachRng(runtime, seed)
      return runtime
    }
    default: {
      const runtime: RuntimeLln = { kind: 'lln', trials: 0, heads: 0, history: [] }
      attachRng(runtime, seed)
      return runtime
    }
  }
}

/** 运行时用 raw（不深代理：大数组零开销；响应性由 frameVersion 显式驱动） */
let runtime = $state.raw<SimulationRuntime | null>(null)
/** 帧版本：渲染器订阅（$derived 读取）以在推进后刷新 */
let frameVersion = $state(0)
let playing = $state(false)
/** 散点点选索引（配对后索引；散点与残差联动高亮） */
let selection = $state<number | null>(null)

export function getSimRuntime(): SimulationRuntime | null {
  return runtime
}

export function setSimRuntime(next: SimulationRuntime | null): void {
  runtime = next
  frameVersion = 0
}

export function getSimFrameVersion(): number {
  return frameVersion
}

export function isSimPlaying(): boolean {
  return playing
}

export function setSimPlaying(value: boolean): void {
  playing = value
}

export function getPointSelection(): number | null {
  return selection
}

export function setPointSelection(value: number | null): void {
  selection = value
}

export interface AdvanceOptions {
  speed: number
  samples: number
  /** 自助法样本数据 */
  bootstrapData?: number[]
  /** CLT 来源分布（默认均匀 0..1） */
  cltSource?: (rng: () => number) => number
}

/** 按速度推进一帧；返回是否仍在进行（供面板决定是否继续 rAF） */
export function advanceSimulation(options: AdvanceOptions): boolean {
  const rt = runtime
  if (!rt) return false
  const step = Math.max(1, Math.round(options.speed))
  const rng = rngs.get(rt) ?? attachRng(rt, 1)
  switch (rt.kind) {
    case 'lln': {
      llnAdvance(rt, rng, step * BASE_STEP)
      const fraction = rt.trials === 0 ? 0 : rt.heads / rt.trials
      const last = rt.history[rt.history.length - 1]
      if (!last || rt.trials - last.trials >= Math.max(1, Math.round(options.samples / 400))) {
        rt.history.push({ trials: rt.trials, fraction })
      }
      frameVersion++
      return rt.trials < options.samples
    }
    case 'clt': {
      cltAdvance(rng, rt.means, 30, Math.max(1, Math.ceil(step / 2)), options.cltSource)
      frameVersion++
      return rt.means.length < options.samples
    }
    case 'montecarlo-pi': {
      const before = rt.total
      monteCarloAdvance(rt, rng, step * 40)
      // 保留可视化点（环形 3000）
      const totalNew = Math.min(step * 40, rt.total - before)
      for (let i = 0; i < totalNew; i++) {
        rt.points.push({ x: rng(), y: rng() })
      }
      if (rt.points.length > 3000) rt.points.splice(0, rt.points.length - 3000)
      frameVersion++
      return rt.total < options.samples
    }
    case 'bootstrap': {
      const data = options.bootstrapData ?? []
      if (data.length === 0) return false
      bootstrapAdvance(rng, data, rt.means, Math.max(1, Math.ceil(step / 2)))
      frameVersion++
      return rt.means.length < options.samples
    }
    default: {
      // random-walk：每帧新增/延长轨迹
      if (rt.walks.length === 0) {
        for (let i = 0; i < 3; i++) rt.walks.push(randomWalk2D(rng, 0))
      }
      for (const walk of rt.walks) {
        const tail = walk[walk.length - 1]!
        const next = randomWalk2D(rng, step * 2)
        for (let i = 1; i < next.length; i++) {
          walk.push({ x: tail.x + next[i]!.x, y: tail.y + next[i]!.y })
        }
      }
      frameVersion++
      const length = rt.walks[0]?.length ?? 0
      return length < options.samples
    }
  }
}
