# 图算法（v0.5 阶段 5）

算法实现于 `src/graph/algorithms/`，统一为**可中断的生成器**（`function*`）：逐步 `yield` 可视化步骤，最终 `return` 结构化结果。播放器（单步/播放/回退）只需收集步骤数组；单测可直接断言步骤序列与结果。

## 统一约定

- **方向语义**：沿「出方向」——**有向边只沿箭头、无向边双向**（无向边 = 双向可通行）；自环按一条边处理；
- **权重**：边属性 `weight`（DSL 中 `A-B:3`），缺省 1；平行边逐条参与松弛；
- **结果类型**：遍历 `{ order, parent, distance }`；最短路 `{ distance, parent, order }`（不可达为 `null`）；
  拓扑 `{ order | null, remaining }`；着色 `{ colors, count }`；二分 `{ bipartite, colors, conflict }`；
- **错误**：负权 Dijkstra、负环等返回 `{ error: string }`（**拒绝执行而非给出错误结果**）。

### 步骤类型（播放器着色依据）

| kind | 含义 | 典型配色建议 |
|---|---|---|
| `push` | 节点加入前沿（入队/入栈/松弛成功发现） | 黄色 |
| `visit` | 节点正式访问/确定（出队、最短距离确定） | 绿色 |
| `inspect` | 检查一条边 | 高亮边 |
| `relax` | 距离更新 | 橙色 |
| `reject` | 拒绝/冲突（已访问、负权、负环） | 红色 |
| `select` | 选中边（生成树，预留） | 蓝色 |
| `note` | 整体提示（轮次、完成总结） | 文本 |

## 算法清单

| 算法 | 用途 | 复杂度 | 可视化要点 |
|---|---|---|---|
| **BFS 广度优先** | 逐层扩展；跳数最短路 | $O(V+E)$ | 队列状态、层序着色、`push/visit` 交替 |
| **DFS 深度优先** | 深入回溯；连通性 | $O(V+E)$ | 栈状态、深度着色 |
| **Dijkstra** | 非负权单源最短路 | $O(V^2)$（线性扫描，教学直观） | 距离表更新、已确定集合边界、当前最小点 |
| **Bellman-Ford** | 允许负权；负环检测 | $O(VE)$ | 逐轮全边松弛、收敛提示、负环报告 |
| **拓扑排序（Kahn）** | 有向无环图线性序 | $O(V+E)$ | 入度归零依次入队、出队顺序；有环时报告剩余节点 |
| **贪心着色（度数降序）** | 色数上界 | $O(V^2+E)$ | 逐点取最小可用色 |
| **DSATUR 着色** | 饱和度贪心（小图通常最优） | $O(V^2 \cdot \Delta)$ | 饱和度最高的点优先着色 |
| **二分判定** | 二着色存在性 | $O(V+E)$ | 二色分层；失败时给出冲突边 |

> 说明：最短路径与遍历的起点由 UI 指定（缺省第一个顶点）；拓扑/着色/二分无需起点。

## 语义细节（已实测 graphology 0.26 行为）

`graphology` 的 `outNeighbors/forEachOutEdge/inDegree` **不含无向边**。本层用
`forEachOutEdge + forEachUndirectedEdge` 组合出统一的「出方向」语义（见 `common.ts`），
保证「无向边双向、有向边单向」在遍历、最短路径与拓扑排序中一致；
拓扑排序的入度亦按「无向边双向计入」自算。

**注意**：无向负权边天然构成 2-环负环（两个方向权重相同）——测试沿用规格：
- 负权 Dijkstra 必须**拒绝**；
- Bellman-Ford 正确报告负环；
- 无负环的负权测试使用**有向**边。

## 正确性测试（规格对照，已全绿）

| 测试 | 结果 |
|---|---|
| Petersen 图 DSATUR 着色 | **3 色**（且着色合法） |
| K5 着色（greedy 与 DSATUR） | **5 色** |
| K3,3 二分性 | `true` |
| C5 二分性 / Petersen 二分性 | `false`（含冲突边） |
| 负权边的 Dijkstra | **拒绝执行**（返回错误，最后一步为 `reject`） |
| 负环检测（Bellman-Ford） | 正确报告 |
| 有向链拓扑排序 | 唯一序列；树满足全部边约束 |
| 边界 | 空图 / 单点 / 自环 / 平行边取短 / 不连通 / 混合方向 |

## 程序接口

```ts
import { ALGORITHMS, runAlgorithm, reconstructPath } from '../graph/algorithms'

// 一次性运行（步骤数组 + 结果）
const { steps, result } = runAlgorithm('dijkstra', graphObject, startId)

// 或直接消费生成器（单步/回退由播放器管理索引）
import { dijkstraSteps } from '../graph/algorithms/shortest-path'
const run = dijkstraSteps(graphObject)
run.next()   // { value: AlgorithmStep, done: false } ...
```

`ALGORITHMS` 提供面板所需的元数据（id / 中文名 / 是否需要起点 / 说明）。

## 待办（下一步）

- UI 播放器：工具面板「算法」区块——选择算法 → 生成步骤 → 单步 / 播放 / 回退 / 速度；
  步骤着色映射到图渲染（节点描边/填充、边高亮）；
- MST（Prim / Kruskal）、强连通分量、二分匹配、最大流（生成器同构扩展）。
