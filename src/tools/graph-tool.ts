/**
 * 图编辑工具（v0.5）：
 * - 移动模式：点击空白建点（文档无图时自动建图）、拖动节点移动（实时预览 + 一步撤销）、右键删除；
 * - 连边模式：从节点拖向另一节点建立边（可切换有向/无向），拖动中显示预览线；
 * - 删除模式：点击节点（连带删边）或边删除，右键亦可用。
 * 命中检测经 ctx.hitTest（v0.5 元素注册制）；拖动过程走 store.preview（不入历史），
 * 松手时 commitPreview 追认为单步撤销记录。
 */
import { mathToScreen } from '../core/transform'
import { createEdge, createNode, paletteColor, type GraphObject } from '../graph/model'
import { setGraphSelection } from '../state/selection.svelte'
import type { DocState, Point2 } from '../state/types'
import type { Tool, ToolContext, ToolControl } from './tool-registry'

type GraphMode = 'move' | 'connect' | 'delete'

const HIT_RADIUS_PX = 14

/** 自动顶点标签：A..Z → A2..Z2 → A3.. */
function nextLabel(graph: GraphObject): string {
  const used = new Set(graph.nodes.map((node) => node.label))
  for (let round = 1; round < 100; round++) {
    const suffix = round === 1 ? '' : String(round)
    for (let i = 0; i < 26; i++) {
      const label = `${String.fromCharCode(65 + i)}${suffix}`
      if (!used.has(label)) return label
    }
  }
  return `V${graph.nodes.length + 1}`
}

interface DragState {
  graphId: string
  nodeId: string
  before: DocState
  moved: boolean
}

interface ConnectState {
  graphId: string
  fromId: string
  screen: Point2
}

/** 移动模式下单击边的待确认状态（up 且未拖动 → 选中该边） */
interface EdgeClickState {
  graphId: string
  edgeId: string
}

export function createGraphTool(): Tool {
  let mode: GraphMode = 'move'
  let directed = false
  let drag: DragState | null = null
  let connect: ConnectState | null = null
  let edgeClick: EdgeClickState | null = null

  const graphById = (ctx: ToolContext, id: string): GraphObject | null =>
    ctx.store.getGraphs().find((graph) => graph.id === id) ?? null

  /** 拖动中实时预览节点位置（不入撤销历史；松手时追认） */
  const moveNodePreview = (ctx: ToolContext, state: DragState, math: Point2): void => {
    ctx.store.preview((doc) => ({
      objects: doc.objects.map((object) => {
        if (object.id !== state.graphId || object.type !== 'graph') return object
        return {
          ...object,
          nodes: object.nodes.map((node) =>
            node.id === state.nodeId ? { ...node, x: math.x, y: math.y } : node,
          ),
        }
      }),
    }))
  }

  /** 删除命中的图元素（节点连同关联边 / 单条边）；命中曲线不处理（走曲线列表删除） */
  const deleteAt = (ctx: ToolContext, screen: Point2): boolean => {
    const hit = ctx.hitTest(screen, HIT_RADIUS_PX)
    if (!hit || hit.part === 'curve') return false
    const graph = graphById(ctx, hit.elementId)
    if (!graph) return false
    if (hit.part === 'node') {
      ctx.store.updateGraph(graph.id, {
        nodes: graph.nodes.filter((node) => node.id !== hit.targetId),
        edges: graph.edges.filter(
          (edge) => edge.source !== hit.targetId && edge.target !== hit.targetId,
        ),
      })
    } else if (hit.part === 'edge') {
      ctx.store.updateGraph(graph.id, {
        edges: graph.edges.filter((edge) => edge.id !== hit.targetId),
      })
    } else {
      return false
    }
    setGraphSelection(null)
    ctx.notify()
    ctx.requestRender()
    return true
  }

  return {
    id: 'graph',
    name: '图编辑',
    group: 'graph',

    activate(ctx) {
      mode = 'move'
      directed = false
      drag = null
      connect = null
      edgeClick = null
      ctx.notify()
    },

    deactivate(ctx) {
      // 未完成的拖动预览追认为历史（位置保留、可一步撤销）
      if (drag?.moved) ctx.store.commitPreview(drag.before)
      drag = null
      connect = null
      edgeClick = null
    },

    onPointerDown(e, ctx) {
      // 右键：删除命中的图元素（所有模式可用）
      if (e.pointer.button === 2) return deleteAt(ctx, e.screen)

      const hit = ctx.hitTest(e.screen, HIT_RADIUS_PX)

      if (mode === 'delete') {
        if (!hit || hit.part === 'curve') return false
        return deleteAt(ctx, e.screen)
      }

      if (mode === 'connect') {
        if (hit && hit.part === 'node') {
          const graph = graphById(ctx, hit.elementId)
          if (graph) {
            connect = { graphId: graph.id, fromId: hit.targetId, screen: e.screen }
            ctx.requestRender()
            return true
          }
        }
        return false
      }

      // 移动模式：命中节点 → 开始拖动
      if (hit && hit.part === 'node') {
        const graph = graphById(ctx, hit.elementId)
        if (!graph) return false
        drag = {
          graphId: graph.id,
          nodeId: hit.targetId,
          before: ctx.store.getDoc(),
          moved: false,
        }
        return true
      }

      // 移动模式：命中边 → 单击选中（up 时确认；随后可在图面板赋权/删除）
      if (hit && hit.part === 'edge') {
        edgeClick = { graphId: hit.elementId, edgeId: hit.targetId }
        return true
      }

      // 移动模式：点击空白 → 建点（无图时自动建图）；同时清除选中
      if (!hit) {
        setGraphSelection(null)
        const graph = ctx.store.getGraphs()[0] ?? null
        const label = graph ? nextLabel(graph) : 'A'
        const node = createNode(
          label,
          e.math.x,
          e.math.y,
          paletteColor(graph ? graph.nodes.length : 0),
        )
        if (graph) {
          ctx.store.updateGraph(graph.id, { nodes: [...graph.nodes, node] })
        } else {
          ctx.store.addGraph([node], [])
        }
        ctx.notify()
        ctx.requestRender()
        return true
      }
      return false
    },

    onPointerMove(e, ctx) {
      if (drag) {
        moveNodePreview(ctx, drag, e.math)
        drag.moved = true
        return true
      }
      if (connect) {
        connect.screen = e.screen
        ctx.requestRender()
        return true
      }
      return false
    },

    onPointerUp(e, ctx) {
      if (drag) {
        if (drag.moved) {
          ctx.store.commitPreview(drag.before)
        } else {
          // 未拖动 = 单击节点：选中（图面板打开编辑卡片）
          setGraphSelection({ kind: 'node', graphId: drag.graphId, nodeId: drag.nodeId })
        }
        drag = null
        ctx.notify()
        ctx.requestRender()
        return true
      }
      if (edgeClick) {
        setGraphSelection({ kind: 'edge', graphId: edgeClick.graphId, edgeId: edgeClick.edgeId })
        edgeClick = null
        ctx.notify()
        return true
      }
      if (connect) {
        const hit = ctx.hitTest(e.screen, HIT_RADIUS_PX)
        if (hit && hit.part === 'node' && hit.elementId === connect.graphId) {
          const graph = graphById(ctx, connect.graphId)
          if (graph) {
            const edge = createEdge(connect.fromId, hit.targetId, { directed })
            ctx.store.updateGraph(graph.id, { edges: [...graph.edges, edge] })
            ctx.notify()
          }
        }
        connect = null
        ctx.requestRender()
        return true
      }
      return false
    },

    drawOverlay(c, ctx) {
      if (!connect) return
      const graph = graphById(ctx, connect.graphId)
      const node = graph?.nodes.find((item) => item.id === connect?.fromId)
      if (!node) return
      const from = mathToScreen(ctx.getView(), ctx.getSize(), node)
      if (!Number.isFinite(from.x) || !Number.isFinite(from.y)) return

      c.save()
      c.strokeStyle = '#2563eb'
      c.lineWidth = 1.6
      c.setLineDash([6, 4])
      c.beginPath()
      c.moveTo(from.x, from.y)
      c.lineTo(connect.screen.x, connect.screen.y)
      c.stroke()
      c.setLineDash([])
      c.beginPath()
      c.arc(connect.screen.x, connect.screen.y, 4, 0, Math.PI * 2)
      c.fillStyle = '#2563eb'
      c.fill()
      c.restore()
    },

    getReadout(ctx) {
      const graph = ctx.store.getGraphs()[0]
      const rows = graph
        ? [
            { label: '顶点', value: String(graph.nodes.length) },
            { label: '边', value: String(graph.edges.length) },
          ]
        : []
      const notes: Record<GraphMode, string> = {
        move: '点击空白建点；拖动节点移动；右键删除。',
        connect: '从节点拖到另一节点建立边；先选「边类型」。',
        delete: '点击节点或边删除（节点连同其边）；也可右键删除。',
      }
      return {
        title: '图编辑',
        rows,
        note: graph ? notes[mode] : '点击画布创建第一个顶点（自动建立图）',
      }
    },

    getControls(): ToolControl[] {
      const controls: ToolControl[] = [
        {
          kind: 'buttons' as const,
          id: 'mode',
          label: '模式',
          options: [
            { value: 'move', label: '移动' },
            { value: 'connect', label: '连边' },
            { value: 'delete', label: '删除' },
          ],
          value: mode,
        },
      ]
      if (mode === 'connect') {
        controls.push({
          kind: 'buttons' as const,
          id: 'edge',
          label: '边类型',
          options: [
            { value: 'undirected', label: '无向' },
            { value: 'directed', label: '有向' },
          ],
          value: directed ? 'directed' : 'undirected',
        })
      }
      return controls
    },

    onControl(id, value, ctx) {
      if (id === 'mode' && typeof value === 'string') {
        mode = value as GraphMode
      } else if (id === 'edge' && typeof value === 'string') {
        directed = value === 'directed'
      }
      ctx.notify()
    },
  }
}
