import { beforeEach, describe, expect, it } from 'vitest'
import { createStore, type AppStore } from '../state/store'
import { createSceneRenderer, type SceneRenderer } from '../render/scene'
import { mathToScreen } from '../core/transform'
import { ToolRegistry, type ToolContext, type ToolPointerEvent } from './tool-registry'
import { createGraphTool } from './graph-tool'
import { getGraphSelection, setGraphSelection } from '../state/selection.svelte'

const SIZE = { width: 800, height: 600 }

interface Fixture {
  store: AppStore
  registry: ToolRegistry
  ctx: ToolContext
  scene: SceneRenderer
  renders: { count: number }
}

function createFixture(): Fixture {
  const store = createStore()
  const scene = createSceneRenderer()
  const renders = { count: 0 }
  const ctx: ToolContext = {
    store,
    getView: () => store.getView(),
    getSize: () => SIZE,
    requestRender: () => {
      renders.count++
    },
    notify: () => registry.notify(),
    hitTest: (screen, maxDistancePx) =>
      scene.hitTest(
        store.getState().doc.objects,
        screen,
        { view: store.getView(), size: SIZE },
        maxDistancePx,
      ),
  }
  const registry = new ToolRegistry(ctx)
  registry.register(createGraphTool())
  return { store, registry, ctx, scene, renders }
}

/** 构造指针事件：数学坐标 → 屏幕；button 2 = 右键 */
function pe(store: AppStore, x: number, y: number, button = 0): ToolPointerEvent {
  return {
    screen: mathToScreen(store.getView(), SIZE, { x, y }),
    math: { x, y },
    pointer: { button } as PointerEvent,
  }
}

let f: Fixture

beforeEach(() => {
  setGraphSelection(null)
  f = createFixture()
  f.registry.activate('graph')
})

/** 在指定数学坐标点击（down + up） */
function click(x: number, y: number, button = 0): void {
  f.registry.handlePointerDown(pe(f.store, x, y, button))
  f.registry.handlePointerUp(pe(f.store, x, y, button))
}

/** 从数学坐标 (x1,y1) 拖动到 (x2,y2) */
function drag(x1: number, y1: number, x2: number, y2: number): void {
  f.registry.handlePointerDown(pe(f.store, x1, y1))
  f.registry.handlePointerMove(pe(f.store, x2, y2))
  f.registry.handlePointerUp(pe(f.store, x2, y2))
}

describe('tools/graph-tool: 建点（移动模式）', () => {
  it('点击空白自动建图并添加顶点（标签 A、B、C）', () => {
    click(0, 0)
    expect(f.store.getGraphs()).toHaveLength(1)
    expect(f.store.getGraphs()[0]!.nodes.map((n) => n.label)).toEqual(['A'])

    click(2, 0)
    click(0, 2)
    expect(f.store.getGraphs()[0]!.nodes.map((n) => n.label)).toEqual(['A', 'B', 'C'])
    // 坐标正确
    const nodes = f.store.getGraphs()[0]!.nodes
    expect(nodes[0]!.x).toBeCloseTo(0, 6)
    expect(nodes[1]!.x).toBeCloseTo(2, 6)
    expect(nodes[2]!.y).toBeCloseTo(2, 6)
  })

  it('每次建点一步撤销', () => {
    click(0, 0)
    click(2, 0)
    f.store.undo()
    expect(f.store.getGraphs()[0]!.nodes).toHaveLength(1)
    f.store.undo()
    expect(f.store.getGraphs()).toHaveLength(0)
  })

  it('命中节点时不建点（命中即拖动）', () => {
    click(0, 0)
    // 在已有节点上按下（不拖动）→ 不应新增顶点
    f.registry.handlePointerDown(pe(f.store, 0, 0))
    f.registry.handlePointerUp(pe(f.store, 0, 0))
    expect(f.store.getGraphs()[0]!.nodes).toHaveLength(1)
    // 未移动 → 不产生撤销步（撤销一次即移除建点）
    f.store.undo()
    expect(f.store.getGraphs()).toHaveLength(0)
  })
})

describe('tools/graph-tool: 单击选中（图面板编辑入口）', () => {
  const g = () => f.store.getGraphs()[0]!

  it('单击节点（未拖动）→ 选中该节点', () => {
    click(0, 0)
    click(2, 0)
    click(0, 0)

    expect(getGraphSelection()).toEqual({
      kind: 'node',
      graphId: g().id,
      nodeId: g().nodes[0]!.id,
    })
  })

  it('拖动节点不触发选中，拖动后单击可选中', () => {
    click(0, 0)
    drag(0, 0, 1, 1)
    expect(getGraphSelection()).toBeNull()

    click(1, 1)
    expect(getGraphSelection()).toEqual({
      kind: 'node',
      graphId: g().id,
      nodeId: g().nodes[0]!.id,
    })
  })

  it('单击边 → 选中该边', () => {
    click(0, 0)
    click(2, 0)
    f.registry.getActive()!.onControl!('mode', 'connect', f.ctx)
    drag(0, 0, 2, 0)
    f.registry.getActive()!.onControl!('mode', 'move', f.ctx)

    click(1, 0)
    expect(getGraphSelection()).toEqual({
      kind: 'edge',
      graphId: g().id,
      edgeId: g().edges[0]!.id,
    })
  })

  it('点击空白 → 清除选中并新建顶点', () => {
    click(0, 0)
    click(0, 0)
    expect(getGraphSelection()?.kind).toBe('node')

    click(5, 5)
    expect(getGraphSelection()).toBeNull()
    expect(g().nodes).toHaveLength(2)
  })

  it('删除模式删除节点后清除选中', () => {
    click(0, 0)
    click(0, 0)
    expect(getGraphSelection()?.kind).toBe('node')

    f.registry.getActive()!.onControl!('mode', 'delete', f.ctx)
    click(0, 0)
    expect(getGraphSelection()).toBeNull()
  })
})

describe('tools/graph-tool: 拖动节点', () => {
  it('拖动实时预览；松手一步撤销恢复原位', () => {
    click(0, 0)
    click(2, 0)
    drag(0, 0, 1, 1)

    const moved = f.store.getGraphs()[0]!.nodes[0]!
    expect(moved.x).toBeCloseTo(1, 6)
    expect(moved.y).toBeCloseTo(1, 6)

    // 拖动 = 一步撤销（回到 0,0），再撤销删除顶点
    f.store.undo()
    expect(f.store.getGraphs()[0]!.nodes[0]!.x).toBeCloseTo(0, 6)
    f.store.undo()
    expect(f.store.getGraphs()[0]!.nodes).toHaveLength(1)
  })

  it('拖动过程中不入撤销历史（预览）', () => {
    click(0, 0)
    f.registry.handlePointerDown(pe(f.store, 0, 0))
    f.registry.handlePointerMove(pe(f.store, 3, 3))
    // 拖动中：位置已变但撤销一次应回到「建点之前」（drag 还未入栈）
    expect(f.store.getGraphs()[0]!.nodes[0]!.x).toBeCloseTo(3, 6)
    f.store.undo()
    expect(f.store.getGraphs()).toHaveLength(0)
    // 追认后预览位移被丢弃（文档已回滚）——恢复预览状态供后续断言
    f.store.redo()
    expect(f.store.getGraphs()[0]!.nodes[0]!.x).toBeCloseTo(3, 6)
  })

  it('取消激活时未完成的拖动被追认为一步撤销', () => {
    click(0, 0)
    f.registry.handlePointerDown(pe(f.store, 0, 0))
    f.registry.handlePointerMove(pe(f.store, 1, 2))
    // 未松手直接切换工具（Escape 场景）
    f.registry.activate(null)
    expect(f.store.getGraphs()[0]!.nodes[0]!.x).toBeCloseTo(1, 6)

    f.store.undo()
    expect(f.store.getGraphs()[0]!.nodes[0]!.x).toBeCloseTo(0, 6)
  })
})

describe('tools/graph-tool: 删除（模式与右键）', () => {
  it('右键节点：删除节点及其关联边', () => {
    click(0, 0)
    click(2, 0)
    const graph = f.store.getGraphs()[0]!
    const [a, b] = graph.nodes
    f.store.updateGraph(graph.id, {
      edges: [
        {
          id: 'e1',
          source: a!.id,
          target: b!.id,
          directed: false,
          weight: null,
          color: '#999',
          style: 'solid',
        },
      ],
    })

    f.registry.handlePointerDown(pe(f.store, 0, 0, 2))
    const after = f.store.getGraphs()[0]!
    expect(after.nodes.map((n) => n.label)).toEqual(['B'])
    expect(after.edges).toHaveLength(0)

    f.store.undo()
    expect(f.store.getGraphs()[0]!.nodes).toHaveLength(2)
    expect(f.store.getGraphs()[0]!.edges).toHaveLength(1)
  })

  it('删除模式：点击边删除单条边；点击节点删除节点', () => {
    click(0, 0)
    click(2, 0)
    const graph = f.store.getGraphs()[0]!
    const [a, b] = graph.nodes
    f.store.updateGraph(graph.id, {
      edges: [
        {
          id: 'e1',
          source: a!.id,
          target: b!.id,
          directed: false,
          weight: null,
          color: '#999',
          style: 'solid',
        },
      ],
    })

    f.registry.getActive()!.onControl!('mode', 'delete', f.ctx)
    // 点击两节点中点的边
    click(1, 0)
    expect(f.store.getGraphs()[0]!.edges).toHaveLength(0)
    expect(f.store.getGraphs()[0]!.nodes).toHaveLength(2)
    // 再点节点
    click(0, 0)
    expect(f.store.getGraphs()[0]!.nodes).toHaveLength(1)
  })
})

describe('tools/graph-tool: 连边模式', () => {
  it('从节点拖到节点建立无向边 / 有向边', () => {
    click(0, 0)
    click(2, 0)
    f.registry.getActive()!.onControl!('mode', 'connect', f.ctx)

    drag(0, 0, 2, 0)
    let graph = f.store.getGraphs()[0]!
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]!.directed).toBe(false)
    expect(graph.edges[0]!.source).toBe(graph.nodes[0]!.id)
    expect(graph.edges[0]!.target).toBe(graph.nodes[1]!.id)

    // 切换有向，反向再连一条
    f.registry.getActive()!.onControl!('edge', 'directed', f.ctx)
    drag(2, 0, 0, 0)
    graph = f.store.getGraphs()[0]!
    expect(graph.edges).toHaveLength(2)
    expect(graph.edges[1]!.directed).toBe(true)
    expect(graph.edges[1]!.source).toBe(graph.nodes[1]!.id)
  })

  it('拖到空白不成边；拖回自己形成自环', () => {
    click(0, 0)
    f.registry.getActive()!.onControl!('mode', 'connect', f.ctx)

    drag(0, 0, 4, 4) // 拖到空白
    expect(f.store.getGraphs()[0]!.edges).toHaveLength(0)

    drag(0, 0, 0, 0) // 拖回自身 → 自环
    expect(f.store.getGraphs()[0]!.edges).toHaveLength(1)
    const edge = f.store.getGraphs()[0]!.edges[0]!
    expect(edge.source).toBe(edge.target)
  })

  it('连边拖动过程绘制预览（请求重绘）', () => {
    click(0, 0)
    click(2, 0)
    f.registry.getActive()!.onControl!('mode', 'connect', f.ctx)

    const before = f.renders.count
    f.registry.handlePointerDown(pe(f.store, 0, 0))
    f.registry.handlePointerMove(pe(f.store, 1, 1))
    expect(f.renders.count).toBeGreaterThan(before)
    f.registry.handlePointerUp(pe(f.store, 1, 1))
  })
})
