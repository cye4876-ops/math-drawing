/**
 * 教学示例库（v1.0）：常用教学场景一键加载（曲线 + 工具激活 + 模式切换）。
 * 示例通过公开 API 操作 store 与进阶状态，不触碰内部结构。
 */
import { createView } from '../core/transform'
import { graphObjectFromDsl } from '../graph/dsl-to-doc'
import {
  setAutomataViz,
  setComplexExpr,
  setComplexMode,
  setModule as setAdvancedModule,
  setNumberViz,
  setUlamSize,
} from '../state/advanced-state.svelte'
import type { AppStore } from '../state/store'
import type { DocState, ViewTransform } from '../state/types'

export interface ExampleHooks {
  /** 激活工具（null = 选择/平移） */
  activateTool(id: string | null): void
}

export interface TeachingExample {
  id: string
  title: string
  description: string
  mode: 'plot' | 'graph' | 'stats' | 'space' | 'advanced' | 'notebook'
  apply(store: AppStore, hooks: ExampleHooks): void
}

function emptyDoc(): DocState {
  return { objects: [] }
}

function defaultView(overrides: Partial<ViewTransform> = {}): ViewTransform {
  return { ...createView(0, 0, 80), ...overrides }
}

export const TEACHING_EXAMPLES: TeachingExample[] = [
  {
    id: 'sine',
    title: '正弦曲线入门',
    description: 'y = sin(x) 的基本绘制与缩放平移',
    mode: 'plot',
    apply(store, hooks) {
      store.loadState(emptyDoc(), defaultView())
      store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
      hooks.activateTool(null)
    },
  },
  {
    id: 'tangent',
    title: '导数的几何意义',
    description: '在 sin(x) 上拖动切点，观察切线斜率 = 导数值',
    mode: 'plot',
    apply(store, hooks) {
      store.loadState(emptyDoc(), defaultView({ scaleX: 120, scaleY: 120 }))
      store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
      hooks.activateTool('tangent')
    },
  },
  {
    id: 'riemann',
    title: '黎曼和逼近定积分',
    description: '调整 n 观察矩形和趋近 ∫ sin(x) dx',
    mode: 'plot',
    apply(store, hooks) {
      store.loadState(emptyDoc(), defaultView())
      store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
      hooks.activateTool('riemann')
    },
  },
  {
    id: 'circle',
    title: '圆的方程（隐函数）',
    description: 'x² + y² = 25 的隐式曲线绘制',
    mode: 'plot',
    apply(store, hooks) {
      store.loadState(emptyDoc(), defaultView({ scaleX: 60, scaleY: 60 }))
      store.addCurve({ kind: 'implicit', expr: 'x^2 + y^2 - 25' })
      hooks.activateTool(null)
    },
  },
  {
    id: 'rose',
    title: '极坐标玫瑰线',
    description: 'r = cos(3θ) 的三叶玫瑰',
    mode: 'plot',
    apply(store, hooks) {
      store.loadState(emptyDoc(), defaultView({ scaleX: 100, scaleY: 100 }))
      store.addCurve({ kind: 'polar', expr: 'cos(3 * theta)' })
      hooks.activateTool(null)
    },
  },
  {
    id: 'damped',
    title: '阻尼振动',
    description: 'y = e^(−x/3)·sin(2x) 的衰减振荡',
    mode: 'plot',
    apply(store, hooks) {
      store.loadState(emptyDoc(), defaultView({ scaleX: 50, scaleY: 50 }))
      store.addCurve({ kind: 'explicit', expr: 'exp(-x/3) * sin(2*x)' })
      hooks.activateTool(null)
    },
  },
  {
    id: 'graph-dijkstra',
    title: '图论：最短路径（Dijkstra）',
    description: '五个带权顶点的最短路演示——在图面板运行 Dijkstra',
    mode: 'graph',
    apply(store, hooks) {
      store.loadState(emptyDoc(), defaultView({ scaleX: 90, scaleY: 90 }))
      const { graph } = graphObjectFromDsl(
        'a-b:4; b-c:2; c-d:5; d-a:1; a-c:3; d-e:2; c-e:6',
        '最短路示例',
      )
      if (graph) store.addGraph(graph.nodes, graph.edges, graph.name)
      hooks.activateTool('graph')
    },
  },
  {
    id: 'complex-domain',
    title: '复变：定义域着色',
    description: 'sin(z) 的相位色轮与极点/零点特征',
    mode: 'advanced',
    apply(_store, hooks) {
      setAdvancedModule('complex')
      setComplexMode('domain')
      setComplexExpr('sin(z)')
      hooks.activateTool(null)
    },
  },
  {
    id: 'ulam',
    title: '数论：Ulam 螺旋',
    description: '质数在方螺旋中的对角线聚集',
    mode: 'advanced',
    apply(_store, hooks) {
      setAdvancedModule('numbertheory')
      setNumberViz('ulam')
      setUlamSize(300)
      hooks.activateTool(null)
    },
  },
  {
    id: 'life',
    title: '康威生命游戏',
    description: '滑翔机与脉冲星——播放、单步、随机播种',
    mode: 'advanced',
    apply(_store, hooks) {
      setAdvancedModule('automata')
      setAutomataViz('life')
      hooks.activateTool(null)
    },
  },
]

export function findExample(id: string): TeachingExample | null {
  return TEACHING_EXAMPLES.find((example) => example.id === id) ?? null
}
