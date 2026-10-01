/**
 * 插件注册表（v1.0）：6 类扩展点的运行时存储与查询。
 * - 表达式函数：写入 expr 引擎的 FUNCTIONS（求值即时生效）；
 * - 图形元素：场景渲染器在创建时合并注册（见 render/scene.ts）；
 * - 工具：由 App 在插件加载后接入 ToolRegistry（见 plugin/loader.ts 与 App.svelte）；
 * - 视图：Notebook 侧栏「插件面板」区渲染；
 * - 导出格式：导出面板的「插件导出器」下拉；
 * - 单元格类型：Notebook 的 plugin 单元格渲染。
 */
/* eslint-disable svelte/prefer-svelte-reactivity -- 注册表为非响应式 Map；UI 经 getRegistryRevision()
   修订号感知变化（无需 SvelteMap 语义，且注册时多次写入不应产生多次 UI 更新） */
import { FUNCTIONS, type FunctionDefinition } from '../expr/functions'
import type { ElementRenderer } from '../render/element-registry'
import type { PluginCell } from '../notebook/model'
import type { AppStore } from '../state/store'
import type { DocState, SceneObject, Size, ViewTransform } from '../state/types'
import type { Tool, ToolContext } from '../tools/tool-registry'

export interface PluginExporter {
  id: string
  label: string
  /** 导出当前文档快照；返回 null 表示不支持当前内容 */
  export(input: {
    doc: DocState
    view: ViewTransform
    size: Size
  }): { filename: string; blob: Blob } | null
}

export interface PluginCellContext {
  /** 请求重新执行 Notebook（数据变化后） */
  rerun: () => void
}

export interface PluginCellTypeDef {
  id: string
  label: string
  /** 新建单元格时的初始数据 */
  createData(): unknown
  /** 渲染进容器；返回清理函数 */
  render(container: HTMLElement, cell: PluginCell, context: PluginCellContext): (() => void) | void
}

export interface PluginViewContribution {
  id: string
  title: string
  /** 渲染进容器（Notebook 侧栏的「插件面板」区）；返回清理函数 */
  render(container: HTMLElement, context: PluginViewContext): (() => void) | void
}

export interface PluginViewContext {
  store: AppStore
}

export interface PluginToolContribution {
  id: string
  label: string
  create(ctx: ToolContext): Tool
}

export interface PluginManifestInfo {
  name: string
  version: string
  url: string
}

const pluginFunctions = new Map<string, FunctionDefinition>()
const pluginElements = new Map<string, ElementRenderer<SceneObject>>()
const pluginTools = new Map<string, PluginToolContribution>()
const pluginViews = new Map<string, PluginViewContribution>()
const pluginExporters = new Map<string, PluginExporter>()
const pluginCellTypes = new Map<string, PluginCellTypeDef>()
const loadedPlugins: PluginManifestInfo[] = []

/** 注册表修订号（Svelte 响应式）：任何注册变化递增，UI 以此刷新列表（如插件区）。 */
let revision = $state(0)

export function getRegistryRevision(): number {
  return revision
}

// ---------- 注册 ----------

export function registerPluginFunction(def: FunctionDefinition): void {
  const key = def.name.toLowerCase()
  if (key in FUNCTIONS && !pluginFunctions.has(key)) {
    // 覆盖内置函数会改变全局表达式语义（如 sin/log）——告警但不阻止（文档已声明覆盖风险）
    console.warn(`插件函数「${key}」将覆盖内置函数，影响所有表达式的求值语义`)
  }
  FUNCTIONS[key] = { ...def, name: key }
  pluginFunctions.set(key, FUNCTIONS[key]!)
  revision++
}

export function registerPluginElement(renderer: ElementRenderer<SceneObject>): void {
  pluginElements.set(renderer.type, renderer)
  revision++
}

export function registerPluginTool(contribution: PluginToolContribution): void {
  pluginTools.set(contribution.id, contribution)
  revision++
}

export function registerPluginView(contribution: PluginViewContribution): void {
  pluginViews.set(contribution.id, contribution)
  revision++
}

export function registerPluginExporter(exporter: PluginExporter): void {
  pluginExporters.set(exporter.id, exporter)
  revision++
}

export function registerPluginCellType(def: PluginCellTypeDef): void {
  pluginCellTypes.set(def.id, def)
  revision++
}

export function markPluginLoaded(info: PluginManifestInfo): void {
  loadedPlugins.push(info)
  revision++
}

// ---------- 查询 ----------

export function getPluginElements(): ElementRenderer<SceneObject>[] {
  return [...pluginElements.values()]
}

export function getPluginTools(): PluginToolContribution[] {
  return [...pluginTools.values()]
}

export function getPluginViews(): PluginViewContribution[] {
  return [...pluginViews.values()]
}

export function getPluginExporters(): PluginExporter[] {
  return [...pluginExporters.values()]
}

export function getPluginCellRenderer(id: string): PluginCellTypeDef['render'] | null {
  return pluginCellTypes.get(id)?.render ?? null
}

export function getPluginCellType(id: string): PluginCellTypeDef | null {
  return pluginCellTypes.get(id) ?? null
}

export function getPluginCellTypes(): PluginCellTypeDef[] {
  return [...pluginCellTypes.values()]
}

export function getPluginCellTitle(id: string): string {
  return pluginCellTypes.get(id)?.label ?? id
}

export function getLoadedPlugins(): PluginManifestInfo[] {
  return [...loadedPlugins]
}

export function isPluginFunction(name: string): boolean {
  return pluginFunctions.has(name.toLowerCase())
}

// ---------- 测试与重载 ----------

/** 清空全部插件注册（仅测试使用；函数注册无法从 FUNCTIONS 移除，测试请使用唯一名字） */
export function resetPluginRegistry(): void {
  pluginElements.clear()
  pluginTools.clear()
  pluginViews.clear()
  pluginExporters.clear()
  pluginCellTypes.clear()
  loadedPlugins.length = 0
  revision++
}
