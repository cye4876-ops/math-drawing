/**
 * 力导向布局 WebWorker（v0.5 阶段 4）：
 * 主线程发送 { nodes:{id,x,y}[], edges:{source,target,directed}[], iterations }，
 * worker 内用 graphology-layout-forceatlas2 迭代后回传 { positions:{id,x,y}[] }。
 * 大图（200 节点/500 边量级）不阻塞主线程；单测覆盖同步版（本文件由 e2e/构建冒烟覆盖）。
 */
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'

export interface LayoutWorkerNode {
  id: string
  x: number
  y: number
}

export interface LayoutWorkerEdge {
  source: string
  target: string
  directed: boolean
}

export interface LayoutWorkerRequest {
  nodes: LayoutWorkerNode[]
  edges: LayoutWorkerEdge[]
  iterations: number
}

export interface LayoutWorkerResponse {
  positions: LayoutWorkerNode[]
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<LayoutWorkerRequest>) => void) | null
  postMessage: (message: LayoutWorkerResponse) => void
}

workerScope.onmessage = (event: MessageEvent<LayoutWorkerRequest>): void => {
  const { nodes, edges, iterations } = event.data
  const graph = new Graph({ multi: true, type: 'mixed', allowSelfLoops: true })
  for (const node of nodes) graph.addNode(node.id, { x: node.x, y: node.y })
  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue
    if (edge.directed) graph.addDirectedEdge(edge.source, edge.target)
    else graph.addUndirectedEdge(edge.source, edge.target)
  }
  const settings = forceAtlas2.inferSettings(graph.order)
  forceAtlas2.assign(graph, { iterations, settings })
  workerScope.postMessage({
    positions: nodes.map((node) => ({
      id: node.id,
      x: graph.getNodeAttribute(node.id, 'x') as number,
      y: graph.getNodeAttribute(node.id, 'y') as number,
    })),
  })
}
