/**
 * 插件加载器（v1.0）：本地 ES 模块（URL 或 File）→ `activate(api)` 约定。
 * - 隔离：模块加载或 activate 抛错均返回结构化错误，不影响主程序；
 * - API 版本化：api.apiVersion = '1'；
 * - 插件清单：export const name / version 可选（缺省取 URL / 文件名）。
 */
import { compile, parse, type CompiledExpression } from '../expr'
import type { FunctionDefinition } from '../expr/functions'
import type { ElementRenderer } from '../render/element-registry'
import type { SceneObject, Size } from '../state/types'
import type { AppStore } from '../state/store'
import type { Tool, ToolContext } from '../tools/tool-registry'
import {
  markPluginLoaded,
  registerPluginCellType,
  registerPluginElement,
  registerPluginExporter,
  registerPluginFunction,
  registerPluginTool,
  registerPluginView,
  type PluginCellTypeDef,
  type PluginExporter,
  type PluginToolContribution,
  type PluginViewContribution,
} from './registry.svelte'

export interface PluginApi {
  /** 接口版本（当前 '1'） */
  apiVersion: string
  /** 表达式函数（注册后可在曲线/计算中使用） */
  registerFunction(definition: FunctionDefinition): void
  /** 图形元素渲染器（对象 type 为 'plugin'，按 pluginType 分发） */
  registerElement(renderer: ElementRenderer<SceneObject>): void
  /** 交互工具（App 在插件加载后接入工具注册表） */
  registerTool(contribution: PluginToolContribution): void
  /** 侧栏视图面板（Notebook 模式的「插件面板」区） */
  registerView(contribution: PluginViewContribution): void
  /** 导出格式（导出面板的「插件导出器」） */
  registerExporter(exporter: PluginExporter): void
  /** Notebook 单元格类型 */
  registerCellType(definition: PluginCellTypeDef): void
  /** 使用应用的表达式引擎求值（便于插件复用同一语法） */
  evaluate(expression: string, variable: string, value: number): number | null
  /** 调试输出（收集在加载结果中） */
  log(message: string): void
}

export interface PluginModule {
  name?: string
  version?: string
  activate?: (api: PluginApi) => void
}

export interface PluginLoadResult {
  ok: boolean
  name: string
  version: string
  url: string
  error?: string
  logs: string[]
}

const compileCache = new Map<string, CompiledExpression | null>()

/** 原生动态 import（避免打包器重写 specifier —— 打包器会给 VariableDynamicImport 注入
 *  `?import` 查询，导致 public/ 下的插件文件在 dev 模式被拒绝转换）。
 *  浏览器：new Function 构造（不经打包器）；Node（测试）：直接 import（Function 构造的
 *  import 在 vm 上下文无 callback）。浏览器主线程以外（如 Worker）不在插件加载场景内。 */
const nativeImport: (u: string) => Promise<PluginModule & { default?: PluginModule }> =
  typeof document === 'undefined'
    ? (u) => import(/* @vite-ignore */ u) as Promise<PluginModule & { default?: PluginModule }>
    : (new Function('u', 'return import(u)') as (
        u: string,
      ) => Promise<PluginModule & { default?: PluginModule }>)

/** 供导出器/单元格使用的求值入口（带编译缓存） */
export function pluginEvaluate(expression: string, variable: string, value: number): number | null {
  const cached = compileCache.get(expression)
  let compiled: CompiledExpression | null
  if (cached === undefined) {
    try {
      compiled = compile(parse(expression))
    } catch {
      compiled = null
    }
    compileCache.set(expression, compiled)
  } else {
    compiled = cached
  }
  if (!compiled) return null
  try {
    const result = compiled({ [variable]: value })
    return Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

function activateModule(
  url: string,
  module: PluginModule,
  logs: string[],
  displayName?: string,
): PluginLoadResult {
  const fallbackName = displayName ?? url.split('/').pop() ?? url
  if (typeof module.activate !== 'function') {
    return {
      ok: false,
      name: module.name ?? fallbackName,
      version: module.version ?? '',
      url,
      error: '插件缺少 activate(api) 导出（应为 ES 模块）',
      logs,
    }
  }
  const api: PluginApi = {
    apiVersion: '1',
    registerFunction: (definition) => registerPluginFunction(definition),
    registerElement: (renderer) => registerPluginElement(renderer),
    registerTool: (contribution) => registerPluginTool(contribution),
    registerView: (contribution) => registerPluginView(contribution),
    registerExporter: (exporter) => registerPluginExporter(exporter),
    registerCellType: (definition) => registerPluginCellType(definition),
    evaluate: (expression, variable, value) => pluginEvaluate(expression, variable, value),
    log: (message) => {
      logs.push(String(message))
    },
  }
  try {
    module.activate(api)
  } catch (error) {
    return {
      ok: false,
      name: module.name ?? fallbackName,
      version: module.version ?? '',
      url,
      error: `activate 执行失败：${(error as Error).message}`,
      logs,
    }
  }
  const name = module.name ?? fallbackName
  const version = module.version ?? '0.0.0'
  markPluginLoaded({ name, version, url })
  return { ok: true, name, version, url, logs }
}

/** 从 URL 加载插件（站点相对路径如 /plugins/example-logistic.js，或 blob:/data: URL）
 * 注：通过 new Function 使用「原生」动态 import，绕过打包器对 public 资源注入的
 * `?import` 查询（Vite 会拒绝对 public 目录文件的模块转换，原生请求则按静态文件返回）。 */
export async function loadPluginFromUrl(
  url: string,
  displayName?: string,
): Promise<PluginLoadResult> {
  const logs: string[] = []
  try {
    const namespace = (await nativeImport(url)) as PluginModule & { default?: PluginModule }
    return activateModule(url, namespace.default ?? namespace, logs, displayName)
  } catch (error) {
    return {
      ok: false,
      name: displayName ?? url,
      version: '',
      url,
      error: `模块加载失败：${(error as Error).message}`,
      logs,
    }
  }
}

/** 从本地文件加载插件（File → blob URL → ES 模块；命名回退为文件名） */
export async function loadPluginFromFile(file: File): Promise<PluginLoadResult> {
  const url = URL.createObjectURL(file)
  try {
    return await loadPluginFromUrl(url, file.name)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 供工具上下文/应用使用的再导出（减少插件侧 import 面） */
export type { Tool, ToolContext, AppStore, Size }
