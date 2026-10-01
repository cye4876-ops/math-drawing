/**
 * 零点工具（v0.4）：在可见视窗内找出所有显函数曲线的零点并标注。
 * 订阅文档变化自动重算（deactivate 时解绑——生命周期由注册表统一管理）。
 */
import { createProjector } from '../core/transform'
import { findRoots, type Root } from '../math/numeric/roots'
import { formatNum, getFs } from './helpers'
import type { Tool } from './tool-registry'
import type { DocState } from '../state/types'

interface RootsEntry {
  curveId: string
  name: string
  roots: Root[]
  unsupported: boolean
}

const MAX_DISPLAY = 12

export function createRootsTool(): Tool {
  let entries: RootsEntry[] = []
  let lastDoc: DocState | null = null
  let unsubscribe: (() => void) | null = null

  const recompute = (ctx: Parameters<NonNullable<Tool['activate']>>[0]): void => {
    const view = ctx.getView()
    const size = ctx.getSize()
    const bounds = {
      minX: 0,
      maxX: 0,
    }
    // 可见范围：与采样一致（此处直接用投影反算屏幕两侧）
    const projector = createProjector(view, size)
    bounds.minX = projector.screenToMathX(0)
    bounds.maxX = projector.screenToMathX(size.width)
    const scanSamples = Math.min(8192, Math.max(1024, Math.round(size.width)))

    entries = []
    for (const fs of getFs(ctx)) {
      if (entries.length >= 4) break
      const roots = findRoots(fs.fn, bounds.minX, bounds.maxX, {
        scanSamples,
        derivative: fs.derivative ?? undefined,
      })
      entries.push({
        curveId: fs.curve.id,
        name: fs.curve.name,
        roots: roots.slice(0, 400),
        unsupported: false,
      })
    }
    lastDoc = ctx.store.getState().doc
    ctx.notify()
    ctx.requestRender()
  }

  return {
    id: 'roots',
    name: '零点',

    activate(ctx) {
      recompute(ctx)
      unsubscribe = ctx.store.subscribe(() => {
        if (ctx.store.getState().doc !== lastDoc) recompute(ctx)
      })
    },

    deactivate() {
      unsubscribe?.()
      unsubscribe = null
      entries = []
      lastDoc = null
    },

    drawOverlay(c, ctx) {
      const projector = createProjector(ctx.getView(), ctx.getSize())
      c.save()
      for (const entry of entries) {
        for (const root of entry.roots.slice(0, 60)) {
          const p = projector.project({ x: root.x, y: 0 })
          if (!Number.isFinite(p.x) || p.x < -8 || p.x > ctx.getSize().width + 8) continue
          if (root.repeated) {
            c.fillStyle = '#d97706'
            c.beginPath()
            c.arc(p.x, p.y, 4.5, 0, Math.PI * 2)
            c.fill()
            c.strokeStyle = '#ffffff'
            c.lineWidth = 1.5
            c.stroke()
          } else {
            c.fillStyle = '#dc2626'
            c.beginPath()
            c.arc(p.x, p.y, 4, 0, Math.PI * 2)
            c.fill()
          }
        }
      }
      c.restore()
    },

    getReadout(ctx) {
      const rows: { label: string; value: string }[] = []
      let total = 0
      for (const entry of entries) {
        total += entry.roots.length
        if (entry.roots.length === 0) {
          rows.push({ label: entry.name, value: '无零点' })
          continue
        }
        const shown = entry.roots.slice(0, MAX_DISPLAY)
        const text = shown
          .map((r) => `${formatNum(r.x, 6)}${r.repeated ? '（重根）' : ''}`)
          .join('，')
        rows.push({
          label: entry.name,
          value: entry.roots.length > MAX_DISPLAY ? `${text} … 共 ${entry.roots.length} 个` : text,
        })
      }
      void ctx
      if (rows.length === 0) {
        return { title: '零点', rows: [], note: '添加显函数曲线后自动计算' }
      }
      return {
        title: `零点（共 ${total} 个）`,
        rows,
        note: '红点 = 常规零点；橙点 = 重根/触根（无符号变化）。扫描分辨率有限，极密集的根可能漏检。',
      }
    },
  }
}
