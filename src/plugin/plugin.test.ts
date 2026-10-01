/**
 * 插件系统测试（v1.0）：注册表、加载器、与表达式引擎的集成。
 *
 * 关键回归：插件注册的函数名（如 logistic）必须能被表达式「整体识别」，
 * 不能被内置函数前缀（log）吞掉——lexer 的完整词优先策略。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { compile, parse } from '../expr'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { loadPluginFromUrl } from './loader'
import {
  getLoadedPlugins,
  getPluginCellTypes,
  getPluginElements,
  getPluginExporters,
  getPluginTools,
  getPluginViews,
  isPluginFunction,
  registerPluginCellType,
  registerPluginElement,
  registerPluginExporter,
  registerPluginFunction,
  registerPluginTool,
  registerPluginView,
  resetPluginRegistry,
} from './registry.svelte'

const EXAMPLE_PLUGIN_PATH = path.resolve('public/plugins/example-logistic.js')

afterEach(() => {
  resetPluginRegistry()
})

describe('插件注册表', () => {
  it('注册函数后可在表达式中整体识别并求值（不被 log 前缀吞掉）', () => {
    registerPluginFunction({
      name: 'logistic',
      minArgs: 1,
      maxArgs: 1,
      signature: 'logistic(x)',
      differentiable: true,
      fn: (x) => 1 / (1 + Math.exp(-x)),
    })
    expect(isPluginFunction('logistic')).toBe(true)
    const fn = compile(parse('logistic(0) + x'))
    expect(fn({ x: 1 })).toBeCloseTo(1.5, 12)
    const fn2 = compile(parse('logistic(2)'))
    expect(fn2({})).toBeCloseTo(1 / (1 + Math.exp(-2)), 12)
  })

  it('六类扩展点注册后均可查询', () => {
    registerPluginFunction({
      name: 'plugintestfn',
      minArgs: 0,
      maxArgs: 0,
      signature: 'plugintestfn()',
      differentiable: false,
      fn: () => 7,
    })
    registerPluginElement({
      type: 'plugin',
      draw: () => {
        /* 测试用空渲染 */
      },
    })
    registerPluginTool({ id: 'test-tool', label: '测试工具', create: () => ({}) as never })
    registerPluginView({ id: 'test-view', title: '测试面板', render: () => undefined })
    registerPluginExporter({
      id: 'test-exporter',
      label: '测试导出',
      export: () => null,
    })
    registerPluginCellType({
      id: 'test-cell',
      label: '测试格',
      createData: () => ({}),
      render: () => undefined,
    })

    expect(isPluginFunction('plugintestfn')).toBe(true)
    expect(compile(parse('plugintestfn()'))({})).toBe(7)
    expect(getPluginElements().some((item) => item.type === 'plugin')).toBe(true)
    expect(getPluginTools().some((item) => item.id === 'test-tool')).toBe(true)
    expect(getPluginViews().some((item) => item.id === 'test-view')).toBe(true)
    expect(getPluginExporters().some((item) => item.id === 'test-exporter')).toBe(true)
    expect(getPluginCellTypes().some((item) => item.id === 'test-cell')).toBe(true)
  })
})

describe('插件加载器', () => {
  it('从 file:// URL 加载示例插件并注册全部 6 类扩展点（logistic 可求值）', async () => {
    const result = await loadPluginFromUrl(pathToFileURL(EXAMPLE_PLUGIN_PATH).href)
    expect(result.ok).toBe(true)
    expect(result.name).toBe('example-logistic')
    expect(result.version).toBe('1.0.0')

    expect(isPluginFunction('logistic')).toBe(true)
    expect(getPluginElements().length).toBeGreaterThan(0)
    expect(getPluginTools().length).toBeGreaterThan(0)
    expect(getPluginViews().length).toBeGreaterThan(0)
    expect(getPluginExporters().length).toBeGreaterThan(0)
    expect(getPluginCellTypes().length).toBeGreaterThan(0)
    expect(getLoadedPlugins().length).toBe(1)

    // 端到端：插件函数在表达式引擎中求值
    const fn = compile(parse('logistic(0)'))
    expect(fn({})).toBeCloseTo(0.5, 12)
    const fn3 = compile(parse('2 * logistic(0) + 1'))
    expect(fn3({})).toBeCloseTo(2, 12)
  })

  it('缺少 activate 的模块返回结构化错误', async () => {
    const result = await loadPluginFromUrl('data:text/javascript,export const name = "noop"')
    expect(result.ok).toBe(false)
    expect(result.error ?? '').toContain('activate')
  })

  it('加载不存在的文件返回错误而非抛出', async () => {
    const result = await loadPluginFromUrl('file:///definitely-missing-plugin-xyz.js')
    expect(result.ok).toBe(false)
    expect(result.error ?? '').toContain('模块加载失败')
  })
})
