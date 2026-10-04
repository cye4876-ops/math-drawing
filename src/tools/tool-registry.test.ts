import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolRegistry, type Tool, type ToolContext } from './tool-registry'
import { createStore, type AppStore } from '../state/store'
import { createRiemannTool } from './riemann'
import { createRootsTool } from './roots'
import { clearDerivativeCache } from './curve-access'

interface Fixture {
  store: AppStore
  registry: ToolRegistry
  renders: { count: number }
}

function createFixture(): Fixture {
  const store = createStore()
  const renders = { count: 0 }
  const ctx: ToolContext = {
    store,
    getView: () => store.getView(),
    getSize: () => ({ width: 800, height: 600 }),
    requestRender: () => {
      renders.count++
    },
    notify: () => registry.notify(),
    hitTest: () => null,
  }
  const registry = new ToolRegistry(ctx)
  return { store, registry, renders }
}

function stubTool(id: string, log: string[], extra: Partial<Tool> = {}): Tool {
  return {
    id,
    name: id,
    activate: () => log.push(`activate:${id}`),
    deactivate: () => log.push(`deactivate:${id}`),
    ...extra,
  }
}

let fixture: Fixture

beforeEach(() => {
  fixture = createFixture()
  clearDerivativeCache()
})

describe('tools/registry: 单激活不变量与生命周期', () => {
  it('激活新工具前先 deactivate 旧工具；同一时刻只有一个激活', () => {
    const log: string[] = []
    fixture.registry.register(stubTool('a', log))
    fixture.registry.register(stubTool('b', log))

    fixture.registry.activate('a')
    expect(fixture.registry.getActive()?.id).toBe('a')
    fixture.registry.activate('b')
    expect(fixture.registry.getActive()?.id).toBe('b')
    expect(log).toEqual(['activate:a', 'deactivate:a', 'activate:b'])

    fixture.registry.activate(null)
    expect(fixture.registry.getActive()).toBeNull()
    expect(log[log.length - 1]).toBe('deactivate:b')
  })

  it('重复激活同一工具为 no-op（不重复触发 activate）', () => {
    const log: string[] = []
    fixture.registry.register(stubTool('a', log))
    fixture.registry.activate('a')
    fixture.registry.activate('a')
    expect(log).toEqual(['activate:a'])
  })

  it('未知工具 id 视为取消激活（安全）', () => {
    expect(() => fixture.registry.activate('nope')).not.toThrow()
    expect(fixture.registry.getActive()).toBeNull()
  })

  it('切换 100 次：activate/deactivate 配平、无异常、激活状态最终清理', () => {
    const log: string[] = []
    fixture.registry.register(stubTool('a', log))
    fixture.registry.register(stubTool('b', log))
    for (let i = 0; i < 100; i++) {
      fixture.registry.activate(i % 2 === 0 ? 'a' : 'b')
    }
    fixture.registry.activate(null)

    const activates = log.filter((entry) => entry.startsWith('activate')).length
    const deactivates = log.filter((entry) => entry.startsWith('deactivate')).length
    expect(activates).toBe(100)
    expect(deactivates).toBe(100)
    expect(fixture.registry.getActive()).toBeNull()
  })
})

describe('tools/registry: 事件路由', () => {
  it('onPointerDown 返回 true 时 registry 报告已消费（阻止平移）', () => {
    const log: string[] = []
    fixture.registry.register(stubTool('t', log, { onPointerDown: () => true }))
    fixture.registry.activate('t')
    const handled = fixture.registry.handlePointerDown({
      screen: { x: 0, y: 0 },
      math: { x: 0, y: 0 },
      pointer: {} as PointerEvent,
    })
    expect(handled).toBe(true)
  })

  it('未实现的处理器返回 false；键盘消费可转发', () => {
    const log: string[] = []
    fixture.registry.register(stubTool('t', log, { onKeyDown: (e) => e.key === ' ' }))
    fixture.registry.activate('t')
    expect(
      fixture.registry.handlePointerMove({
        screen: { x: 0, y: 0 },
        math: { x: 0, y: 0 },
        pointer: {} as PointerEvent,
      }),
    ).toBe(false)
    const spaceEvent = { key: ' ' } as KeyboardEvent
    const escapeEvent = { key: 'Escape' } as KeyboardEvent
    expect(fixture.registry.handleKeyDown(spaceEvent)).toBe(true)
    expect(fixture.registry.handleKeyDown(escapeEvent)).toBe(false)
  })
})

describe('tools/registry: 工具不写入撤销栈', () => {
  it('黎曼和工具操作后，撤销一次即可完整回滚曲线（工具未提交历史）', () => {
    const store = fixture.store
    store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    expect(store.canUndo()).toBe(true)

    fixture.registry.register(createRiemannTool())
    fixture.registry.activate('riemann')
    fixture.registry.onControl('n', 50)
    fixture.registry.onControl('toggle')
    fixture.registry.onControl('toggle')

    store.undo()
    expect(store.getCurves()).toHaveLength(0)
    expect(store.canUndo()).toBe(false)
  })
})

describe('tools/registry: 订阅清理（防泄漏）', () => {
  it('真实工具（零点）：deactivate 后文档变化不再触发工具重算', () => {
    const store = fixture.store
    store.addCurve({ kind: 'explicit', expr: 'x^3 - x' })
    fixture.registry.register(createRootsTool())

    const listener = vi.fn()
    fixture.registry.subscribe(listener)

    fixture.registry.activate('roots')
    const callsAfterActivate = listener.mock.calls.length

    store.addCurve({ kind: 'explicit', expr: 'x^2' })
    const callsAfterDocChange = listener.mock.calls.length
    expect(callsAfterDocChange).toBeGreaterThan(callsAfterActivate)

    fixture.registry.activate(null)
    const callsAfterDeactivate = listener.mock.calls.length
    store.addCurve({ kind: 'explicit', expr: 'sin(x)' })
    expect(listener.mock.calls.length).toBe(callsAfterDeactivate)
  })

  it('零点工具读数：x³-x 展示 3 个零点', () => {
    const store = fixture.store
    store.addCurve({ kind: 'explicit', expr: 'x^3 - x' })
    fixture.registry.register(createRootsTool())
    fixture.registry.activate('roots')
    const readout = fixture.registry.getReadout()
    expect(readout).not.toBeNull()
    const value = readout?.rows[0]?.value ?? ''
    expect(value).toContain('−1')
    expect(value).toContain('0')
    expect(value).toContain('1')
    // 三个零点（逗号分隔三段）
    expect(value.split('，')).toHaveLength(3)
  })
})
