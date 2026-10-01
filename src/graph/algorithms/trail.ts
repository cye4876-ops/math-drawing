/**
 * 累积轨迹（v0.5 阶段 5b）：播放器将第 0..upto 步聚合为「已走过的节点与边」，
 * 供画布以次级样式（玫红）持续标记：遍历树边、松弛边、生成树选中边逐步累积；
 * 回退时轨迹随索引自动收缩。
 */
import type { AlgorithmStep } from './types'

export interface Trail {
  nodes: string[]
  edges: { source: string; target: string }[]
}

export function computeTrail(allSteps: AlgorithmStep[], upto: number): Trail {
  const nodes: string[] = []
  const nodeSeen = new Set<string>()
  const edges: { source: string; target: string }[] = []
  const edgeSeen = new Set<string>()
  const addNode = (id: string): void => {
    if (nodeSeen.has(id)) return
    nodeSeen.add(id)
    nodes.push(id)
  }
  for (let i = 0; i <= upto && i < allSteps.length; i++) {
    const step = allSteps[i]
    if (!step) continue
    // 已发现 / 已访问节点
    if ((step.kind === 'visit' || step.kind === 'push') && step.node) addNode(step.node)
    // 已走过的边：树边（push 携带的发现边）、松弛边、选中边
    if ((step.kind === 'push' || step.kind === 'relax' || step.kind === 'select') && step.edge) {
      const key = `${step.edge.source}>${step.edge.target}`
      if (!edgeSeen.has(key)) {
        edgeSeen.add(key)
        edges.push({ source: step.edge.source, target: step.edge.target })
      }
    }
    if (step.kind === 'relax' && step.node) addNode(step.node)
    if (step.kind === 'select' && step.edge) {
      addNode(step.edge.source)
      addNode(step.edge.target)
    }
  }
  return { nodes, edges }
}
