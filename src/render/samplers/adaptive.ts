import {
  JUMP_GAP_FACTOR,
  MAG_FACTOR,
  MAX_EVALUATIONS,
  MIN_CHORD_PX,
  SEED_SPACING_PX,
  type SamplePoint,
  type SampleTuning,
  type SampledPolyline,
} from './types'

/**
 * 显函数 y = f(x) 的自适应采样。
 *
 * 策略（参考 JSXGraph / Gnuplot 的成熟做法，见 docs/TECH-STACK.md）：
 * 1. 按屏幕空间均匀取种子点（log 坐标下即按十倍程均匀）；
 * 2. 对相邻两点递归细分：中点偏离弦超过容差（且弦长 > 最小像素）则二分；
 * 3. 不连续检测：相邻点屏幕纵向间距超过一个视口高度时，二分定位跳变位置，
 *    在跳变点求值分类：
 *    - NaN（值本身缺失，如 abs(x)/x 在 0）→ 断开；
 *    - ±Infinity 或数值巨大（离视口中心 20 个视口高度以上，如 tan 在 π/2 的 1.6e16）→ 渐近线：断开并记录 x；
 *    - 有限且量级正常（如 floor 的台阶）→ 垂直接线；
 * 4. 端值非有限（域边界）时向边界二分行进，只保留有限侧；
 * 5. 深度、弦长、求值预算三重上限，保证病态函数不死循环。
 */
/** 采样参数（xMin/xMax 必须与 screenX 的 [0, widthPx] 屏幕范围一致，即 viewBounds 结果） */
export interface ExplicitSampleOptions extends SampleTuning {
  /** 可见数学 x 范围 */
  xMin: number
  xMax: number
  /** 画布 CSS 宽度（决定种子数） */
  widthPx: number
  /** 视口高度（CSS 像素），跳跃与量级判定用 */
  heightPx: number
  /** 数学 x → 屏幕 x */
  screenX: (x: number) => number
  /** 数学 y → 屏幕 y（对不可绘制值应返回非有限数） */
  screenY: (y: number) => number
  /** 屏幕 x → 数学 x（在屏幕空间均匀铺种子） */
  screenToMathX: (sx: number) => number
}

export function sampleExplicit(
  fn: (x: number) => number,
  options: ExplicitSampleOptions,
): SampledPolyline {
  const { xMin, xMax, widthPx, heightPx, screenX, screenY, screenToMathX, tolerancePx, maxDepth } =
    options

  const segments: SamplePoint[][] = []
  const asymptoteXs: number[] = []
  let current: SamplePoint[] | null = null
  let evaluations = 0
  let budgetExceeded = false

  const halfHeight = heightPx / 2
  const jumpGapPx = JUMP_GAP_FACTOR * heightPx
  const magPx = MAG_FACTOR * heightPx

  const evaluate = (x: number): number => {
    evaluations++
    if (evaluations > MAX_EVALUATIONS) budgetExceeded = true
    return fn(x)
  }

  const emit = (x: number, y: number): void => {
    // 不可投影的点（如对数坐标域外的非正值、log(x) 等）不进入折线，与渲染器裁剪语义一致
    if (!Number.isFinite(screenX(x)) || !Number.isFinite(screenY(y))) return
    if (!current) {
      current = []
      segments.push(current)
    }
    const last = current[current.length - 1]
    if (last && last.x === x && last.y === y) return
    current.push({ x, y, t: x })
  }

  const breakSegment = (): void => {
    current = null
  }

  const recordAsymptote = (x: number): void => {
    const sx = screenX(x)
    const last = asymptoteXs[asymptoteXs.length - 1]
    if (last !== undefined && Math.abs(screenX(last) - sx) < 2) return
    asymptoteXs.push(x)
  }

  /** 值在屏幕上的位置离视口中心是否超过"巨大"阈值 */
  const isHuge = (y: number): boolean => {
    const sy = screenY(y)
    return !Number.isFinite(sy) || Math.abs(sy - halfHeight) > magPx
  }

  /** 点到弦的屏幕垂距 */
  const chordDeviation = (
    sx0: number,
    sy0: number,
    sx1: number,
    sy1: number,
    sxm: number,
    sym: number,
  ): number => {
    const dx = sx1 - sx0
    const dy = sy1 - sy0
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(sxm - sx0, sym - sy0)
    let t = ((sxm - sx0) * dx + (sym - sy0) * dy) / len2
    t = Math.min(1, Math.max(0, t))
    return Math.hypot(sxm - (sx0 + t * dx), sym - (sy0 + t * dy))
  }

  /** 定位 [x0, x1] 内的跳变位置：按屏幕空间二分，收敛到 0.25px 或 60 次迭代 */
  const locateJump = (
    x0: number,
    f0: number,
    x1: number,
    f1: number,
  ): { a: number; fa: number; b: number; fb: number } => {
    let a = x0
    let fa = f0
    let b = x1
    let fb = f1
    let iterations = 0
    while (iterations < 60 && screenX(b) - screenX(a) > 0.25) {
      iterations++
      const m = (a + b) / 2
      const fm = evaluate(m)
      const fmFinite = Number.isFinite(fm)
      if (!fmFinite) {
        // 非有限落在中点：向它收缩区间
        if (Number.isFinite(fa) && Number.isFinite(fb)) {
          b = m
          fb = fm
        } else if (!Number.isFinite(fa) && Number.isFinite(fb)) {
          b = m
          fb = fm
        } else if (Number.isFinite(fa) && !Number.isFinite(fb)) {
          a = m
          fa = fm
        } else {
          break
        }
        continue
      }
      const ga = Number.isFinite(fa)
        ? Math.abs(screenY(fm) - screenY(fa))
        : Number.POSITIVE_INFINITY
      const gb = Number.isFinite(fb)
        ? Math.abs(screenY(fb) - screenY(fm))
        : Number.POSITIVE_INFINITY
      if (ga >= gb) {
        b = m
        fb = fm
      } else {
        a = m
        fa = fm
      }
    }
    return { a, fa, b, fb }
  }

  /** 处理疑似跳变：定位、分类（断开 / 渐近线 / 垂直接线）并递归外侧两段 */
  const handleJump = (x0: number, f0: number, x1: number, f1: number, depth: number): void => {
    const { a, fa, b, fb } = locateJump(x0, f0, x1, f1)
    const xd = (a + b) / 2
    const fmid = evaluate(xd)

    const isGap = Number.isNaN(fmid)
    // ±Infinity 直接判渐近线；数值有限但巨大且两侧同样巨大（tan 在 π/2 为 1.6e16）也判渐近线
    const isAsymptote =
      !isGap && (!Number.isFinite(fmid) || (isHuge(fmid) && (isHuge(fa) || isHuge(fb))))

    if (isAsymptote) recordAsymptote(xd)

    // 左外段
    if (a > x0) refinePair(x0, f0, a, fa, depth + 1)
    // 中间处理
    if (isGap || isAsymptote) {
      breakSegment()
    } else {
      // 有限跳变（floor 台阶等）：垂直接线
      const yl = Number.isFinite(fa) ? fa : f0
      const yr = Number.isFinite(fb) ? fb : f1
      emit(xd, yl)
      emit(xd, yr)
    }
    // 右外段（leaf 会自行发射起点）
    if (b < x1) refinePair(b, fb, x1, f1, depth + 1)
  }

  const refinePair = (x0: number, f0: number, x1: number, f1: number, depth: number): void => {
    if (x1 === x0) {
      if (Number.isFinite(f1)) emit(x1, f1)
      return
    }

    const finite0 = Number.isFinite(f0)
    const finite1 = Number.isFinite(f1)

    // 两端都不可绘制：断开
    if (!finite0 && !finite1) {
      breakSegment()
      return
    }

    // 单端不可绘制：向域边界二分行进，只保留有限侧
    if (!finite0 || !finite1) {
      if (depth >= maxDepth || budgetExceeded) {
        // 深度用尽：若边界值是 ±Infinity（垂直渐近线），记录后断开
        const badX = finite1 ? x0 : x1
        const badF = finite1 ? f0 : f1
        if (!Number.isNaN(badF)) recordAsymptote(badX)
        breakSegment()
        return
      }
      const xm = (x0 + x1) / 2
      const fm = evaluate(xm)
      if (!Number.isFinite(fm)) {
        // 中点仍不可绘制：继续向有效侧收缩
        if (finite1) refinePair(xm, fm, x1, f1, depth + 1)
        else refinePair(x0, f0, xm, fm, depth + 1)
      } else {
        refinePair(x0, f0, xm, fm, depth + 1)
        emit(xm, fm)
        refinePair(xm, fm, x1, f1, depth + 1)
      }
      return
    }

    // 两端均有限：先看是否是跳变
    const sy0 = screenY(f0)
    const sy1 = screenY(f1)
    const gap = Math.abs(sy1 - sy0)

    if (depth >= maxDepth || budgetExceeded) {
      if (gap > jumpGapPx && (isHuge(f0) || isHuge(f1))) {
        // 深度用尽且末端巨大：断开，避免画出跨渐近线的竖直长线
        recordAsymptote((x0 + x1) / 2)
        emit(x0, f0)
        breakSegment()
        emit(x1, f1)
      } else {
        emit(x0, f0)
        emit(x1, f1)
      }
      return
    }

    if (gap > jumpGapPx) {
      handleJump(x0, f0, x1, f1, depth)
      return
    }

    const xm = (x0 + x1) / 2
    const fm = evaluate(xm)
    if (!Number.isFinite(fm)) {
      refinePair(x0, f0, xm, fm, depth + 1)
      refinePair(xm, fm, x1, f1, depth + 1)
      return
    }

    const sx0 = screenX(x0)
    const sx1 = screenX(x1)
    const sxm = screenX(xm)
    const sym = screenY(fm)
    const chordPx = Math.hypot(sx1 - sx0, sy1 - sy0)
    const dev = chordDeviation(sx0, sy0, sx1, sy1, sxm, sym)

    if (dev > tolerancePx && chordPx > MIN_CHORD_PX) {
      refinePair(x0, f0, xm, fm, depth + 1)
      refinePair(xm, fm, x1, f1, depth + 1)
    } else {
      emit(x0, f0)
      emit(x1, f1)
    }
  }

  // —— 种子点：按屏幕空间均匀分布（log 坐标下即按十倍程均匀） ——
  const seedCount = Math.min(2048, Math.max(8, Math.round(widthPx / SEED_SPACING_PX)))
  let prevX = Number.NaN
  let prevF = Number.NaN
  let started = false

  for (let i = 0; i <= seedCount; i++) {
    const sx = (i / seedCount) * widthPx
    // 内部种子按屏幕空间均匀取得；clamp 兜底，兼容传入范围与屏幕映射略有不一致的调用方
    const raw = i === 0 ? xMin : i === seedCount ? xMax : screenToMathX(sx)
    const x = raw < xMin ? xMin : raw > xMax ? xMax : raw
    const f = evaluate(x)

    if (started) {
      refinePair(prevX, prevF, x, f, 0)
    } else {
      if (Number.isFinite(f)) emit(x, f)
    }
    prevX = x
    prevF = f
    started = true
  }

  return { segments, asymptoteXs, evaluations }
}
