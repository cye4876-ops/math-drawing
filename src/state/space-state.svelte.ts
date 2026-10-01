/**
 * 3D 视图共享状态（v0.8）：视图选项、切点、相机记忆、导出命令通道。
 * 不入文档、不产生撤销；SpaceView（渲染）与 SpacePanel（UI）经模块级 runes 共享。
 */
import type { ColormapName } from '../render3d/colormaps'
import type { CameraKind, ShadingMode, SpaceOptions } from '../render3d/scene'
import type { Vec3 } from '../render3d/types'

let camera = $state<CameraKind>('persp')
let shading = $state<ShadingMode>('height')
let colormap = $state<ColormapName>('viridis')
let contourCount = $state(0)
let tangentEnabled = $state(false)
let tangentX = $state(0)
let tangentY = $state(0)
let cameraPosition = $state<Vec3 | null>(null)
let cameraTarget = $state<Vec3 | null>(null)
/** 变化计数器：读取它即可对任意视图选项建立响应依赖 */
let revision = $state(0)

let contextAvailable = $state(true)
let exportRequest = $state<{ kind: 'png' | 'gif' | 'reset'; token: number } | null>(null)

export function getCamera(): CameraKind {
  return camera
}
export function setCamera(value: CameraKind): void {
  camera = value
  revision++
}

export function getShading(): ShadingMode {
  return shading
}
export function setShading(value: ShadingMode): void {
  shading = value
  revision++
}

export function getColormapName(): ColormapName {
  return colormap
}
export function setColormapName(value: ColormapName): void {
  colormap = value
  revision++
}

export function getContourCount(): number {
  return contourCount
}
export function setContourCount(value: number): void {
  contourCount = Math.max(0, Math.min(20, Math.round(value)))
  revision++
}

export function isTangentEnabled(): boolean {
  return tangentEnabled
}
export function setTangentEnabled(value: boolean): void {
  tangentEnabled = value
  revision++
}

export function getTangentPoint(): [number, number] {
  return [tangentX, tangentY]
}
export function setTangentPoint(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  tangentX = x
  tangentY = y
  revision++
}

/** 汇总为场景选项 */
export function getSpaceOptions(): SpaceOptions {
  return {
    camera,
    shading,
    colormap,
    contourCount,
    tangentPlane: tangentEnabled,
    tangentX,
    tangentY,
  }
}

export function getSpaceRevision(): number {
  return revision
}

export function saveCameraState(position: Vec3 | null, target: Vec3 | null): void {
  cameraPosition = position
  cameraTarget = target
}

export function loadCameraState(): { position: Vec3; target: Vec3 } | null {
  if (!cameraPosition || !cameraTarget) return null
  return { position: cameraPosition, target: cameraTarget }
}

/** WebGL 上下文可用性（上下文丢失/不可用时由视图层更新） */
export function isContextAvailable(): boolean {
  return contextAvailable
}
export function setContextAvailable(value: boolean): void {
  contextAvailable = value
}

/** 导出/命令通道：面板请求 → 视图执行（避免面板直接持有 three 场景） */
export function requestSpaceExport(kind: 'png' | 'gif' | 'reset'): void {
  exportRequest = { kind, token: (exportRequest?.token ?? 0) + 1 }
}
export function getExportRequest(): { kind: 'png' | 'gif' | 'reset'; token: number } | null {
  return exportRequest
}

/** 导出进行中（面板按钮禁用与提示） */
let exporting = $state(false)
export function isSpaceExporting(): boolean {
  return exporting
}
export function setSpaceExporting(value: boolean): void {
  exporting = value
}

/** 旋转 GIF 参数：帧数（平滑度）与播放帧率（速度） */
let gifFrames = $state(36)
let gifFps = $state(12)
export function getGifFrames(): number {
  return gifFrames
}
export function setGifFrames(value: number): void {
  gifFrames = Math.max(8, Math.min(96, Math.round(value)))
}
export function getGifFps(): number {
  return gifFps
}
export function setGifFps(value: number): void {
  gifFps = Math.max(2, Math.min(30, Math.round(value)))
}
