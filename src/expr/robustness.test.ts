import { describe, expect, it } from 'vitest'
import { differentiate } from './differentiate'
import { ExprEvaluationError, ExprSyntaxError } from './errors'
import { compile, evaluate, type Scope } from './evaluate'
import { parse } from './parser'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const COMMON_SCOPE: Scope = { x: 0.5, y: 1, t: 2, a: 1, b: 2, c: 3, theta: 0.5 }

/** 对任意输入执行全链路，要求只抛结构化错误 */
function exercise(source: string, onParsed: () => void): void {
  try {
    const expr = parse(source)
    onParsed()
    evaluate(expr, { ...COMMON_SCOPE })
    compile(expr)({ ...COMMON_SCOPE })
    differentiate(expr, 'x')
  } catch (error) {
    const structured = error instanceof ExprSyntaxError || error instanceof ExprEvaluationError
    expect(structured, `非结构化错误：${String(error)}；输入：${JSON.stringify(source)}`).toBe(true)
  }
}

describe('robustness: 模糊测试', () => {
  it('随机畸形输入不崩溃（只抛结构化错误）', () => {
    const rng = mulberry32(20261001)
    const alphabet = '0123456789.+-*/^%!(){}[],;:<=> abcdefghijklmnopqrstuvwxyz'
    let parsedCount = 0

    for (let i = 0; i < 400; i++) {
      const length = Math.floor(rng() * 40)
      let source = ''
      for (let j = 0; j < length; j++) {
        source += alphabet[Math.floor(rng() * alphabet.length)] ?? ''
      }
      exercise(source, () => {
        parsedCount++
      })
    }
    expect(parsedCount).toBeGreaterThan(0)
  })

  it('对合法表达式的随机变异不崩溃', () => {
    const rng = mulberry32(7)
    const seeds = [
      'sin(x)^2 + cos(x)^2',
      '{x < 0: -x, x >= 0: x}',
      'a*sin(b*x + c)',
      '2^3! + x/2',
      'log(x, 2)',
    ]
    const alphabet = '+-*/^%!,;:(){}<>=.xab01 '
    let parsedCount = 0

    for (let i = 0; i < 200; i++) {
      const base = seeds[Math.floor(rng() * seeds.length)] ?? ''
      const pos = Math.floor(rng() * (base.length + 1))
      const ch = alphabet[Math.floor(rng() * alphabet.length)] ?? ''
      const mutated =
        rng() < 0.5
          ? base.slice(0, pos) + ch + base.slice(pos)
          : base.slice(0, pos) + base.slice(pos + 1)
      exercise(mutated, () => {
        parsedCount++
      })
    }
    expect(parsedCount).toBeGreaterThan(0)
  })
})

describe('robustness: 性能基准（规格阈值）', () => {
  /**
   * 纳秒级绝对阈值只在"本机验收"环境严格断言（规格阈值以本地 `pnpm test` 验收为准）：
   * - 覆盖率插桩（v8 provider）会改变性能测量结果 → 跳过
   * - CI 共享 runner 机器更慢、噪声大，不代表用户环境 → 跳过（仅保留参考值打印）
   */
  const strictPerf = process.env['EXPR_COVERAGE'] !== 'true' && !process.env['CI']
  const perfIt = strictPerf ? it : it.skip

  it('单表达式解析 + 求值 < 0.1 ms（1000 次平均）', () => {
    const source = 'a*sin(b*x + c) + log(x, 2) - x^2/3'
    const scope: Scope = { a: 1.2, b: 2, c: 0.5, x: 0.7 }

    for (let i = 0; i < 100; i++) evaluate(parse(source), { ...scope })

    const iterations = 1000
    const start = performance.now()
    let acc = 0
    for (let i = 0; i < iterations; i++) {
      acc += evaluate(parse(source), { ...scope })
    }
    const averageMs = (performance.now() - start) / iterations
    expect(Number.isFinite(acc)).toBe(true)
    expect(averageMs).toBeLessThan(0.1)
  })

  perfIt('编译闭包单点求值 < 100 ns（2x + 1）', () => {
    expect(benchCompiled('2x + 1')).toBeLessThan(100)
  })

  perfIt('编译闭包单点求值 < 100 ns（x*x + 2*x + 1）', () => {
    expect(benchCompiled('x*x + 2*x + 1')).toBeLessThan(100)
  })

  it('编译闭包单点求值基准：x^2 + sin(x)（参考值，仅打印）', () => {
    const ns = benchCompiled('x^2 + sin(x)')
    expect(ns).toBeGreaterThan(0)
    console.info(`[bench] x^2 + sin(x): ${ns.toFixed(1)} ns/次`)
  })
})

/** 对编译后的闭包做预热 + 多批次计时，返回最优批次的单次耗时（ns） */
function benchCompiled(source: string): number {
  const fn = compile(parse(source))
  const scope: Scope = { x: 1.5 }
  const iterations = 200_000

  let sink = 0
  for (let i = 0; i < iterations; i++) sink += fn(scope)

  let best = Number.POSITIVE_INFINITY
  for (let batch = 0; batch < 5; batch++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) sink += fn(scope)
    const perCallNs = ((performance.now() - start) * 1e6) / iterations
    if (perCallNs < best) best = perCallNs
  }
  expect(Number.isFinite(sink)).toBe(true)
  return best
}
