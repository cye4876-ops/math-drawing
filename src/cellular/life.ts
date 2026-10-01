/**
 * 生命游戏（v0.9）：TypedArray 双缓冲、预设（滑翔机等）、随机播种与位图渲染。
 * 目标：1000×1000 步进流畅（≥30fps）。
 */

export interface LifePattern {
  name: string
  cells: { x: number; y: number }[]
}

/** 经典图案（坐标相对图案左上角） */
export const LIFE_PATTERNS: LifePattern[] = [
  {
    name: 'glider',
    cells: [
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ],
  },
  {
    name: 'blinker',
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
  },
  {
    name: 'pulsar',
    cells: [
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 9, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 2 },
      { x: 5, y: 2 },
      { x: 7, y: 2 },
      { x: 12, y: 2 },
      { x: 0, y: 3 },
      { x: 5, y: 3 },
      { x: 7, y: 3 },
      { x: 12, y: 3 },
      { x: 0, y: 4 },
      { x: 5, y: 4 },
      { x: 7, y: 4 },
      { x: 12, y: 4 },
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 8, y: 5 },
      { x: 9, y: 5 },
      { x: 10, y: 5 },
      { x: 2, y: 7 },
      { x: 3, y: 7 },
      { x: 4, y: 7 },
      { x: 8, y: 7 },
      { x: 9, y: 7 },
      { x: 10, y: 7 },
      { x: 0, y: 8 },
      { x: 5, y: 8 },
      { x: 7, y: 8 },
      { x: 12, y: 8 },
      { x: 0, y: 9 },
      { x: 5, y: 9 },
      { x: 7, y: 9 },
      { x: 12, y: 9 },
      { x: 0, y: 10 },
      { x: 5, y: 10 },
      { x: 7, y: 10 },
      { x: 12, y: 10 },
      { x: 2, y: 12 },
      { x: 3, y: 12 },
      { x: 4, y: 12 },
      { x: 8, y: 12 },
      { x: 9, y: 12 },
      { x: 10, y: 12 },
    ],
  },
]

/** 简单可复现随机数（xorshift32） */
export function lifeRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

export class LifeSim {
  readonly width: number
  readonly height: number
  wrap = true
  generation = 0
  private current: Uint8Array
  private next: Uint8Array

  constructor(width: number, height: number) {
    this.width = Math.max(3, Math.floor(width))
    this.height = Math.max(3, Math.floor(height))
    this.current = new Uint8Array(this.width * this.height)
    this.next = new Uint8Array(this.width * this.height)
  }

  get(x: number, y: number): number {
    return this.current[y * this.width + x]!
  }

  set(x: number, y: number, value: number): void {
    this.current[y * this.width + x] = value ? 1 : 0
  }

  toggle(x: number, y: number): void {
    const index = y * this.width + x
    this.current[index] = this.current[index] === 1 ? 0 : 1
  }

  clear(): void {
    this.current.fill(0)
    this.generation = 0
  }

  /** 以密度 p 随机播种（确定性，便于测试） */
  randomize(density: number, seed = 12345): void {
    const rand = lifeRandom(seed)
    for (let i = 0; i < this.current.length; i++) {
      this.current[i] = rand() < density ? 1 : 0
    }
    this.generation = 0
  }

  setPattern(pattern: LifePattern, offsetX: number, offsetY: number): void {
    for (const cell of pattern.cells) {
      const x = offsetX + cell.x
      const y = offsetY + cell.y
      if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.set(x, y, 1)
    }
  }

  population(): number {
    let count = 0
    const cells = this.current
    for (let i = 0; i < cells.length; i++) count += cells[i]!
    return count
  }

  /** 活细胞坐标（测试与调试用） */
  liveCells(): { x: number; y: number }[] {
    const result: { x: number; y: number }[] = []
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.current[y * this.width + x] === 1) result.push({ x, y })
      }
    }
    return result
  }

  /** 就地步进（双缓冲交换，无额外分配）；wrap 路径对行拆分边界/中段以减少分支 */
  step(): void {
    const { width, height, current, next, wrap } = this
    if (wrap) {
      const wm1 = width - 1
      const hm1 = height - 1
      for (let y = 0; y < height; y++) {
        const up = (y === 0 ? hm1 : y - 1) * width
        const mid = y * width
        const down = (y === hm1 ? 0 : y + 1) * width
        // x = 0（左边界环绕）
        {
          const left = wm1
          const neighbors =
            current[up + left]! +
            current[up]! +
            current[up + 1]! +
            current[mid + left]! +
            current[mid + 1]! +
            current[down + left]! +
            current[down]! +
            current[down + 1]!
          const alive = current[mid]!
          next[mid] = neighbors === 3 || (alive === 1 && neighbors === 2) ? 1 : 0
        }
        // 中段（无边界判断）
        for (let x = 1; x < wm1; x++) {
          const neighbors =
            current[up + x - 1]! +
            current[up + x]! +
            current[up + x + 1]! +
            current[mid + x - 1]! +
            current[mid + x + 1]! +
            current[down + x - 1]! +
            current[down + x]! +
            current[down + x + 1]!
          const alive = current[mid + x]!
          next[mid + x] = neighbors === 3 || (alive === 1 && neighbors === 2) ? 1 : 0
        }
        // x = wm1（右边界环绕）
        {
          const neighbors =
            current[up + wm1 - 1]! +
            current[up + wm1]! +
            current[up]! +
            current[mid + wm1 - 1]! +
            current[mid]! +
            current[down + wm1 - 1]! +
            current[down + wm1]! +
            current[down]!
          const alive = current[mid + wm1]!
          next[mid + wm1] = neighbors === 3 || (alive === 1 && neighbors === 2) ? 1 : 0
        }
      }
    } else {
      for (let y = 0; y < height; y++) {
        const hasUp = y > 0
        const hasDown = y < height - 1
        const upRow = hasUp ? (y - 1) * width : 0
        const midRow = y * width
        const downRow = hasDown ? (y + 1) * width : 0
        for (let x = 0; x < width; x++) {
          const hasLeft = x > 0
          const hasRight = x < width - 1
          let neighbors = 0
          if (hasUp) {
            if (hasLeft) neighbors += current[upRow + x - 1]!
            neighbors += current[upRow + x]!
            if (hasRight) neighbors += current[upRow + x + 1]!
          }
          if (hasLeft) neighbors += current[midRow + x - 1]!
          if (hasRight) neighbors += current[midRow + x + 1]!
          if (hasDown) {
            if (hasLeft) neighbors += current[downRow + x - 1]!
            neighbors += current[downRow + x]!
            if (hasRight) neighbors += current[downRow + x + 1]!
          }
          const alive = current[midRow + x]!
          next[midRow + x] = neighbors === 3 || (alive === 1 && neighbors === 2) ? 1 : 0
        }
      }
    }
    const swap = this.current
    this.current = this.next
    this.next = swap
    this.generation++
  }
}

/**
 * 渲染为 RGBA 位图（1 格 = cell×cell 像素，默认 1）。返回宽高为 (width·cell)×(height·cell)。
 */
export function renderLife(
  sim: LifeSim,
  cell = 1,
  alive: [number, number, number] = [120, 230, 160],
  dead: [number, number, number] = [12, 16, 24],
): Uint8ClampedArray {
  const scale = Math.max(1, Math.floor(cell))
  const width = sim.width * scale
  const height = sim.height * scale
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < sim.height; y++) {
    for (let x = 0; x < sim.width; x++) {
      const isAlive = sim.get(x, y) === 1
      const r = isAlive ? alive[0] : dead[0]
      const g = isAlive ? alive[1] : dead[1]
      const b = isAlive ? alive[2] : dead[2]
      for (let dy = 0; dy < scale; dy++) {
        const row = y * scale + dy
        let offset = (row * width + x * scale) * 4
        for (let dx = 0; dx < scale; dx++) {
          data[offset] = r
          data[offset + 1] = g
          data[offset + 2] = b
          data[offset + 3] = 255
          offset += 4
        }
      }
    }
  }
  return data
}
