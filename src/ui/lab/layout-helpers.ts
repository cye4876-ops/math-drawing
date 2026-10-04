/** 实验台 SVG 组件的共享布局辅助（v2.7） */

/** 二着色（BFS）；非二部返回 null */
export function bipColoringOf(
  n: number,
  edges: ReadonlyArray<readonly [number, number]>,
): number[] | null {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const [u, v] of edges) {
    if (adj[u] && adj[v]) {
      adj[u]!.push(v)
      adj[v]!.push(u)
    }
  }
  const color = new Array<number>(n).fill(-1)
  for (let start = 0; start < n; start++) {
    if (color[start] !== -1) continue
    color[start] = 0
    const queue = [start]
    while (queue.length > 0) {
      const u = queue.shift()!
      for (const w of adj[u]!) {
        if (color[w] === -1) {
          color[w] = 1 - color[u]!
          queue.push(w)
        } else if (color[w] === color[u]) {
          return null
        }
      }
    }
  }
  return color
}
