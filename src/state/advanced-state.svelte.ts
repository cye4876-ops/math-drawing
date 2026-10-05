/**
 * 「进阶」模式共享状态（v0.9）：复变 / 数论 / 自动机 / 符号 / 近世代数（v2.2） 五个子模块的视图参数、
 * 生命游戏模拟器实例与符号计算输出。AdvancedView（渲染）与 AdvancedPanel（控件）经模块级 runes 共享。
 */
import type { ColormapName } from '../render3d/colormaps'
import type { ModularMode } from '../numbertheory/modular'
import { LifeSim, LIFE_PATTERNS } from '../cellular/life'
import { runSymbolicOperation as runSymbolic, type SymbolicOperation } from '../symbolic/run'
import type { Interval } from '../symbolic/inequality'
import { DEFAULT_CASE_ID } from '../algebra/counterexamples'

export type AdvancedModule = 'complex' | 'numbertheory' | 'automata' | 'symbolic' | 'algebra'
export type ComplexViewMode = 'domain' | 'mobius' | 'branch' | 'contour'
export type NumberViz = 'ulam' | 'sacks' | 'modular' | 'collatz' | 'primes'
export type AutomataViz = 'life' | 'mandelbrot' | 'julia'
export type ComplexColormap = 'standard' | 'highcontrast'
export type BranchKind = 'sqrt' | 'log'
export type SymbolicOp = SymbolicOperation

export interface SymbolicOutput {
  title: string
  ok: boolean
  latex: string[]
  text: string[]
  /** 不等式解集（数轴可视化） */
  intervals?: Interval[]
}

// ---------- 模块导航 ----------
let currentModule = $state<AdvancedModule>('complex')
/** 变化计数器：读取它即可对任意视图参数建立响应依赖 */
let revision = $state(0)

export function getModule(): AdvancedModule {
  return currentModule
}
export function setModule(value: AdvancedModule): void {
  currentModule = value
  stopLife()
  revision++
}

export function getRevision(): number {
  return revision
}

function bump(): void {
  revision++
}

// ---------- 近世代数（v2.2） ----------
export type AlgebraSection = 'counterexamples' | 'groups' | 'rings' | 'actions' | 'sylow'
let algebraSection = $state<AlgebraSection>('counterexamples')
let algebraCaseId = $state(DEFAULT_CASE_ID)
let algebraGroupId = $state('s3')
let algebraRingN = $state(6)
// v3.0：群作用视图（共轭类/陪集/Burnside）与 Sylow 工作台
let actionGroupId = $state('a4')
let actionElementIndex = $state(1)
let sylowGroupId = $state('a4')
let sylowPrime = $state(2)

export function getAlgebraSection(): AlgebraSection {
  return algebraSection
}
export function setAlgebraSection(value: AlgebraSection): void {
  algebraSection = value
  bump()
}
export function getAlgebraCase(): string {
  return algebraCaseId
}
export function setAlgebraCase(value: string): void {
  algebraCaseId = value
  bump()
}
export function getAlgebraGroup(): string {
  return algebraGroupId
}
export function setAlgebraGroup(value: string): void {
  algebraGroupId = value
  bump()
}
export function getAlgebraRingN(): number {
  return algebraRingN
}
export function setAlgebraRingN(value: number): void {
  algebraRingN = Math.max(2, Math.min(12, Math.round(value)))
  bump()
}
export function getActionGroup(): string {
  return actionGroupId
}
export function setActionGroup(value: string): void {
  actionGroupId = value
  actionElementIndex = 1
  bump()
}
export function getActionElement(): number {
  return actionElementIndex
}
export function setActionElement(value: number): void {
  actionElementIndex = Math.max(0, Math.round(value))
  bump()
}
export function getSylowGroup(): string {
  return sylowGroupId
}
export function setSylowGroup(value: string): void {
  sylowGroupId = value
  sylowPrime = 2
  bump()
}
export function getSylowPrime(): number {
  return sylowPrime
}
export function setSylowPrime(value: number): void {
  sylowPrime = Math.max(2, Math.round(value))
  bump()
}

// ---------- 复变 ----------
let complexMode = $state<ComplexViewMode>('domain')
let complexExpr = $state('(z-1)/(z+1)')
let complexSpan = $state(4.4)
let complexCenterRe = $state(0)
let complexCenterIm = $state(0)
let complexResolution = $state(512)
let complexColormapState = $state<ComplexColormap>('standard')
let complexGrids = $state(true)
let mobiusPreset = $state('cayley')
let mobiusExtent = $state(2)
let branchKindState = $state<BranchKind>('sqrt')
let branchIndex = $state(0)
let contourExpr = $state('1/(z-i)')
let contourRadius = $state(2)

export function getComplexMode(): ComplexViewMode {
  return complexMode
}
export function setComplexMode(value: ComplexViewMode): void {
  complexMode = value
  bump()
}
export function getComplexExpr(): string {
  return complexExpr
}
export function setComplexExpr(value: string): void {
  complexExpr = value
  bump()
}
export function getComplexSpan(): number {
  return complexSpan
}
export function setComplexSpan(value: number): void {
  complexSpan = Math.max(1, Math.min(20, value))
  bump()
}
export function getComplexCenter(): { re: number; im: number } {
  return { re: complexCenterRe, im: complexCenterIm }
}
export function setComplexCenter(re: number, im: number): void {
  complexCenterRe = Math.max(-50, Math.min(50, re))
  complexCenterIm = Math.max(-50, Math.min(50, im))
  bump()
}
export function resetComplexView(): void {
  complexCenterRe = 0
  complexCenterIm = 0
  complexSpan = 4.4
  bump()
}
export function getComplexResolution(): number {
  return complexResolution
}
export function setComplexResolution(value: number): void {
  complexResolution = Math.max(128, Math.min(1024, Math.round(value)))
  bump()
}
export function getComplexColormap(): ComplexColormap {
  return complexColormapState
}
export function setComplexColormap(value: ComplexColormap): void {
  complexColormapState = value
  bump()
}
export function getComplexGrids(): boolean {
  return complexGrids
}
export function setComplexGrids(value: boolean): void {
  complexGrids = value
  bump()
}
export function getMobiusPreset(): string {
  return mobiusPreset
}
export function setMobiusPreset(value: string): void {
  mobiusPreset = value
  bump()
}
export function getMobiusExtent(): number {
  return mobiusExtent
}
export function setMobiusExtent(value: number): void {
  mobiusExtent = Math.max(0.5, Math.min(5, value))
  bump()
}
export function getBranchKind(): BranchKind {
  return branchKindState
}
export function setBranchKind(value: BranchKind): void {
  branchKindState = value
  branchIndex = 0
  bump()
}
export function getBranchIndex(): number {
  return branchIndex
}
export function setBranchIndex(value: number): void {
  branchIndex = Math.max(0, Math.round(value))
  bump()
}
export function getContourExpr(): string {
  return contourExpr
}
export function setContourExpr(value: string): void {
  contourExpr = value
  bump()
}
export function getContourRadius(): number {
  return contourRadius
}
export function setContourRadius(value: number): void {
  contourRadius = Math.max(0.2, Math.min(5, value))
  bump()
}

// ---------- 数论 ----------
let numberViz = $state<NumberViz>('ulam')
let ulamSize = $state(200)
let sacksCount = $state(10000)
let modularNState = $state(48)
let modularModeState = $state<ModularMode>('product')
let collatzLimit = $state(5000)
let primeLimit = $state(5000)

export function getPrimeLimit(): number {
  return primeLimit
}
export function setPrimeLimit(value: number): void {
  primeLimit = Math.max(500, Math.min(50000, Math.round(value)))
  bump()
}

export function getNumberViz(): NumberViz {
  return numberViz
}
export function setNumberViz(value: NumberViz): void {
  numberViz = value
  bump()
}
export function getUlamSize(): number {
  return ulamSize
}
export function setUlamSize(value: number): void {
  ulamSize = Math.max(50, Math.min(1000, Math.round(value)))
  bump()
}
export function getSacksCount(): number {
  return sacksCount
}
export function setSacksCount(value: number): void {
  sacksCount = Math.max(200, Math.min(50000, Math.round(value)))
  bump()
}
export function getModularN(): number {
  return modularNState
}
export function setModularN(value: number): void {
  modularNState = Math.max(4, Math.min(256, Math.round(value)))
  bump()
}
export function getModularMode(): ModularMode {
  return modularModeState
}
export function setModularMode(value: ModularMode): void {
  modularModeState = value
  bump()
}
export function getCollatzLimit(): number {
  return collatzLimit
}
export function setCollatzLimit(value: number): void {
  collatzLimit = Math.max(100, Math.min(50000, Math.round(value)))
  bump()
}

// ---------- 自动机（生命游戏 + 分形） ----------
let automataViz = $state<AutomataViz>('life')
let lifeSpeed = $state(10)
let lifeDensity = $state(0.3)
let lifePlaying = $state(false)
let fractalIter = $state(200)
let fractalColormapState = $state<ColormapName>('plasma')
let fractalSpan = $state(3.2)
let fractalCenterRe = $state(-0.6)
let fractalCenterIm = $state(0)
let juliaRe = $state(-0.8)
let juliaIm = $state(0.156)

export function getAutomataViz(): AutomataViz {
  return automataViz
}
export function setAutomataViz(value: AutomataViz): void {
  automataViz = value
  stopLife()
  bump()
}
export function getLifeSpeed(): number {
  return lifeSpeed
}
export function setLifeSpeed(value: number): void {
  lifeSpeed = Math.max(2, Math.min(30, Math.round(value)))
  bump()
}
export function getLifeDensity(): number {
  return lifeDensity
}
export function setLifeDensity(value: number): void {
  lifeDensity = Math.max(0.05, Math.min(0.6, value))
  bump()
}
export function isLifePlaying(): boolean {
  return lifePlaying
}
export function setLifePlaying(value: boolean): void {
  lifePlaying = value
  bump()
}
export function getFractalIter(): number {
  return fractalIter
}
export function setFractalIter(value: number): void {
  fractalIter = Math.max(50, Math.min(400, Math.round(value)))
  bump()
}
export function getFractalColormap(): ColormapName {
  return fractalColormapState
}
export function setFractalColormap(value: ColormapName): void {
  fractalColormapState = value
  bump()
}
export function getFractalView(): { centerRe: number; centerIm: number; span: number } {
  return { centerRe: fractalCenterRe, centerIm: fractalCenterIm, span: fractalSpan }
}
export function setFractalView(centerRe: number, centerIm: number, span: number): void {
  fractalCenterRe = centerRe
  fractalCenterIm = centerIm
  fractalSpan = Math.max(1e-6, Math.min(8, span))
  bump()
}
export function resetFractalView(): void {
  fractalCenterRe = -0.6
  fractalCenterIm = 0
  fractalSpan = 3.2
  bump()
}
export function getJuliaC(): { re: number; im: number } {
  return { re: juliaRe, im: juliaIm }
}
export function setJuliaC(re: number, im: number): void {
  juliaRe = Math.max(-1.5, Math.min(1.5, re))
  juliaIm = Math.max(-1.5, Math.min(1.5, im))
  bump()
}

// ---------- 生命游戏模拟器（非响应式对象 + revision 通知） ----------
let lifeSim: LifeSim | null = null
let lifeGridW = 0
let lifeGridH = 0

/** 获取（必要时按网格尺寸重建）模拟器 */
export function ensureLifeSim(gridW: number, gridH: number): LifeSim {
  if (!lifeSim || lifeGridW !== gridW || lifeGridH !== gridH) {
    const previous = lifeSim
    lifeSim = new LifeSim(gridW, gridH)
    lifeGridW = gridW
    lifeGridH = gridH
    if (previous) {
      // 简单迁移：拷贝重叠区域
      const w = Math.min(previous.width, gridW)
      const h = Math.min(previous.height, gridH)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) lifeSim.set(x, y, previous.get(x, y))
      }
    } else {
      lifeSim.randomize(0.18, 20240601)
    }
    bump()
  }
  return lifeSim
}

export function getLifeSim(): LifeSim | null {
  return lifeSim
}

export function stepLifeOnce(): void {
  lifeSim?.step()
  bump()
}

export function randomizeLife(): void {
  lifeSim?.randomize(lifeDensity, Math.floor(Math.random() * 1e9))
  bump()
}

export function clearLife(): void {
  lifeSim?.clear()
  stopLife()
  bump()
}

export function placeLifePattern(name: string): void {
  const pattern = LIFE_PATTERNS.find((item) => item.name === name)
  if (!pattern || !lifeSim) return
  lifeSim.setPattern(pattern, Math.floor(lifeSim.width / 2) - 3, Math.floor(lifeSim.height / 2) - 3)
  bump()
}

export function toggleLifeCell(x: number, y: number): void {
  lifeSim?.toggle(x, y)
  bump()
}

function stopLife(): void {
  if (lifePlaying) lifePlaying = false
}
export function pauseLife(): void {
  stopLife()
  bump()
}

// ---------- 符号 ----------
let symbolicInput = $state('x^2 - 1 = 0')
let symbolicLimitPoint = $state('0')
let symbolicOutput = $state<SymbolicOutput | null>(null)

export function getSymbolicInput(): string {
  return symbolicInput
}
export function setSymbolicInput(value: string): void {
  symbolicInput = value
}
export function getSymbolicLimitPoint(): string {
  return symbolicLimitPoint
}
export function setSymbolicLimitPoint(value: string): void {
  symbolicLimitPoint = value
}
export function getSymbolicOutput(): SymbolicOutput | null {
  return symbolicOutput
}

/** 执行符号操作并把结果写入输出（面板按钮触发；计算委托 symbolic/run 共享入口） */
export function runSymbolicOperation(op: SymbolicOp): void {
  symbolicOutput = runSymbolic(symbolicInput, op, symbolicLimitPoint)
  bump()
}
