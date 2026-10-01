/**
 * 3D 场景管理（v0.8，three.js）：
 * - 与 2D Canvas 层**并存**（独立 WebGL 画布），`update(objects, options)` 做对象级增删改同步；
 * - 着色：solid（单色）/ height（z 值 × 色图）/ normal（法向）三种模式（色图可换 → 即「自定义色图」）；
 * - 附加元素：等高线投影（z = 底面）、可拖动切平面（含偏导读数数据）、坐标轴与网格；
 * - 资源统一释放（geometry/material 全部经由 item.dispose）；
 * - WebGL 上下文丢失：`webglcontextlost` 阻止默认 + 回调通知，恢复后全量重建；
 * - 能力检测 `isWebGLAvailable()`（集显降级：分辨率由面板控制）。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Curve3D, Field3D, Ode2D, SpaceObject, Surface3D } from '../state/types'
import type { ColormapName } from './colormaps'
import { sampleColormap } from './colormaps'
import { compileDerivative, compileExpr } from './compile'
import { contourSegments } from './contours'
import {
  arrowField2D,
  arrowField3D,
  curl2D,
  curl3D,
  divergence2D,
  divergence3D,
  streamline2D,
  streamline3D,
} from './fields'
import { marchingCubes } from './marching-cubes'
import { lorenzTrajectory, integrateOde, directionField } from '../math/ode'
import {
  explicitSurfaceMesh,
  parametricSurfaceMesh,
  revolveSurfaceMesh,
  type MeshData,
} from './surfaces'
import { planeBasis, tangentPlaneAt } from './tangent'
import type { Vec3 } from './types'

export type CameraKind = 'persp' | 'ortho'
export type ShadingMode = 'solid' | 'height' | 'normal'

/** 视图选项（非文档状态） */
export interface SpaceOptions {
  camera: CameraKind
  shading: ShadingMode
  colormap: ColormapName
  /** 等高线层数（0 = 关闭；作用于 explicit 曲面，投影到底面） */
  contourCount: number
  /** 切平面（作用于第一个可见 explicit 曲面） */
  tangentPlane: boolean
  tangentX: number
  tangentY: number
}

export interface SpaceScene {
  update(objects: SpaceObject[], options: SpaceOptions): void
  resize(width: number, height: number, dpr: number): void
  render(): void
  /** 像素坐标（相对画布，左上原点）→ 命中曲面的数学 (x, y)；未命中返回 null */
  pick(px: number, py: number): [number, number] | null
  /** 相机绕 z 轴旋转（GIF 旋转动画用） */
  spinCamera(deltaDegrees: number): void
  getCameraState(): { position: Vec3; target: Vec3 } | null
  setCameraState(state: { position: Vec3; target: Vec3 } | null): void
  resetCamera(): void
  /** 暂停/恢复轨道控制（切平面拖动期间由视图层控制） */
  setControlsEnabled(enabled: boolean): void
  /** 抓取当前帧像素（行序已翻转为左上原点；RGBA） */
  captureFrame(): { data: Uint8ClampedArray; width: number; height: number }
  snapshot(): Promise<Blob | null>
  dispose(): void
  setOnContextEvent(callback: (lost: boolean) => void): void
}

/** WebGL 可用性检测（集显/无 GPU 环境降级提示） */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

interface SceneItem {
  key: string
  object: THREE.Object3D
  dispose(): void
}

const BACKGROUND = 0xf7f9fc

export function createSpaceScene(canvas: HTMLCanvasElement): SpaceScene {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(1)
  renderer.setSize(10, 10, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BACKGROUND)

  const persp = new THREE.PerspectiveCamera(50, 1, 0.05, 500)
  const ortho = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.05, 500)
  persp.up.set(0, 0, 1)
  ortho.up.set(0, 0, 1)
  let camera: THREE.Camera = persp
  let cameraKind: CameraKind = 'persp'
  persp.position.set(9, -11, 7)
  ortho.position.set(9, -11, 7)

  const controls = new OrbitControls(persp, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0, 0)
  controls.minDistance = 0.5
  controls.maxDistance = 120

  // 光照：环境 + 主方向光 + 补光
  const ambient = new THREE.AmbientLight(0xffffff, 1.1)
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(6, -8, 12)
  const fill = new THREE.DirectionalLight(0xffffff, 0.9)
  fill.position.set(-8, 6, -6)
  scene.add(ambient, key, fill)

  // 常驻元素：坐标轴 + 网格（z=0 平面）
  const staticGroup = new THREE.Group()
  const axisLines: number[] = [0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 10]
  const axisGeometry = new THREE.BufferGeometry()
  axisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(axisLines, 3))
  const axisMaterial = new THREE.LineBasicMaterial({ vertexColors: true })
  axisGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(
      [
        0.86, 0.15, 0.15, 0.86, 0.15, 0.15, 0.13, 0.65, 0.22, 0.13, 0.65, 0.22, 0.2, 0.4, 0.9, 0.2,
        0.4, 0.9,
      ],
      3,
    ),
  )
  const negative = new THREE.LineSegments(axisGeometry, axisMaterial)
  // 负半轴（细灰）
  const negLines: number[] = [-10, 0, 0, 0, 0, 0, 0, -10, 0, 0, 0, 0, 0, 0, -10, 0, 0, 0]
  const negGeometry = new THREE.BufferGeometry()
  negGeometry.setAttribute('position', new THREE.Float32BufferAttribute(negLines, 3))
  const negMaterial = new THREE.LineBasicMaterial({ color: 0xc7ced8 })
  const negativeAxes = new THREE.LineSegments(negGeometry, negMaterial)
  const grid = new THREE.GridHelper(20, 20, 0xcdd5df, 0xe2e8f0)
  grid.rotation.x = Math.PI / 2
  staticGroup.add(negative, negativeAxes, grid)
  scene.add(staticGroup)

  const items = new Map<string, SceneItem>()
  const pickTargets: THREE.Mesh[] = []
  let contextCallback: ((lost: boolean) => void) | null = null

  function disposeItem(item: SceneItem): void {
    scene.remove(item.object)
    item.dispose()
  }

  function buildSurfaceMeshData(object: Surface3D): MeshData | null {
    if (object.kind === 'explicit') {
      const f = compileExpr(object.expr, ['x', 'y'])
      if (!f) return null
      return explicitSurfaceMesh((x, y) => f(x, y), {
        xMin: object.xMin,
        xMax: object.xMax,
        yMin: object.yMin,
        yMax: object.yMax,
        cols: object.resolution,
        rows: object.resolution,
      })
    }
    if (object.kind === 'parametric') {
      const fx = compileExpr(object.expr, ['u', 'v'])
      const fy = compileExpr(object.expr2 ?? '', ['u', 'v'])
      const fz = compileExpr(object.expr3 ?? '', ['u', 'v'])
      if (!fx || !fy || !fz) return null
      return parametricSurfaceMesh((u, v) => [fx(u, v), fy(u, v), fz(u, v)], {
        uMin: object.xMin,
        uMax: object.xMax,
        vMin: object.yMin,
        vMax: object.yMax,
        cols: object.resolution,
        rows: object.resolution,
      })
    }
    if (object.kind === 'revolve') {
      const f = compileExpr(object.expr, ['x'])
      if (!f) return null
      return revolveSurfaceMesh((x) => f(x), {
        xMin: object.xMin,
        xMax: object.xMax,
        cols: object.resolution,
        rows: Math.max(24, Math.round(object.resolution * 0.75)),
      })
    }
    if (object.kind === 'implicit') {
      const f = compileExpr(object.expr, ['x', 'y', 'z'])
      if (!f) return null
      const surface = marchingCubes((x, y, z) => f(x, y, z), {
        min: [object.xMin, object.yMin, object.zMin],
        max: [object.xMax, object.yMax, object.zMax],
        resolution: Math.min(96, object.resolution),
      })
      return {
        positions: surface.positions,
        normals: surface.normals,
        values: new Float32Array(surface.positions.length / 3),
        indices: Uint32Array.from({ length: surface.positions.length / 3 }, (_, i) => i),
        vertexCount: surface.positions.length / 3,
        triangleCount: surface.triangleCount,
      }
    }
    return null
  }

  function colorForVertex(
    shading: ShadingMode,
    colormap: ColormapName,
    mesh: MeshData,
    index: number,
    minValue: number,
    maxValue: number,
  ): [number, number, number] {
    if (shading === 'normal') {
      return [
        mesh.normals[index * 3]! * 0.5 + 0.5,
        mesh.normals[index * 3 + 1]! * 0.5 + 0.5,
        mesh.normals[index * 3 + 2]! * 0.5 + 0.5,
      ]
    }
    const span = maxValue - minValue || 1
    const t = (mesh.values[index]! - minValue) / span
    return sampleColormap(colormap, t)
  }

  function geometryFromMeshData(mesh: MeshData, options: SpaceOptions): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
    if (options.shading === 'solid') {
      geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
    } else {
      let minValue = Infinity
      let maxValue = -Infinity
      for (let i = 0; i < mesh.vertexCount; i++) {
        const value = mesh.values[i]!
        if (value < minValue) minValue = value
        if (value > maxValue) maxValue = value
      }
      const colors = new Float32Array(mesh.vertexCount * 3)
      for (let i = 0; i < mesh.vertexCount; i++) {
        const [r, g, b] = colorForVertex(
          options.shading,
          options.colormap,
          mesh,
          i,
          minValue,
          maxValue,
        )
        colors[i * 3] = r
        colors[i * 3 + 1] = g
        colors[i * 3 + 2] = b
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    }
    return geometry
  }

  function buildSurface(object: Surface3D, options: SpaceOptions): SceneItem | null {
    const group = new THREE.Group()
    const disposables: (THREE.BufferGeometry | THREE.Material)[] = []
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(object.color),
      roughness: 0.5,
      metalness: 0.08,
      side: THREE.DoubleSide,
      transparent: object.opacity < 1,
      opacity: object.opacity,
      vertexColors: options.shading !== 'solid',
      flatShading: object.kind === 'polyhedron',
    })
    disposables.push(material)

    if (object.kind === 'polyhedron') {
      const preset = object.expr
      const match =
        /^(tetrahedron|cube|octahedron|dodecahedron|icosahedron|prism|pyramid)(\d+)?$/.exec(preset)
      const name = match?.[1] ?? 'cube'
      const sides = Math.max(3, Math.min(64, Number(match?.[2] ?? 6)))
      let geometry: THREE.BufferGeometry
      switch (name) {
        case 'tetrahedron':
          geometry = new THREE.TetrahedronGeometry(1.8, 0)
          break
        case 'octahedron':
          geometry = new THREE.OctahedronGeometry(1.8, 0)
          break
        case 'dodecahedron':
          geometry = new THREE.DodecahedronGeometry(1.8, 0)
          break
        case 'icosahedron':
          geometry = new THREE.IcosahedronGeometry(1.8, 0)
          break
        case 'prism':
          geometry = new THREE.CylinderGeometry(1.2, 1.2, 2.2, sides, 1)
          break
        case 'pyramid':
          geometry = new THREE.ConeGeometry(1.4, 2.2, sides, 1)
          break
        default:
          geometry = new THREE.BoxGeometry(2, 2, 2)
      }
      if (name === 'prism' || name === 'pyramid') {
        // three 几何 y 轴为柱向：旋转到 z 轴向上
        geometry.rotateX(Math.PI / 2)
      }
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, material)
      disposables.push(geometry)
      group.add(mesh)
    } else {
      const mesh = buildSurfaceMeshData(object)
      if (!mesh) {
        material.dispose()
        return null
      }
      const geometry = geometryFromMeshData(mesh, options)
      disposables.push(geometry)
      const surfaceMesh = new THREE.Mesh(geometry, material)
      surfaceMesh.userData['surfaceId'] = object.id
      group.add(surfaceMesh)
      pickTargets.push(surfaceMesh)
    }

    // 等高线投影（explicit 专属）：投影到底面 z = zMin
    if (options.contourCount > 0 && object.kind === 'explicit') {
      const f = compileExpr(object.expr, ['x', 'y'])
      if (f) {
        let minValue = Infinity
        let maxValue = -Infinity
        for (let i = 0; i <= 32; i++) {
          for (let j = 0; j <= 32; j++) {
            const value = f(
              object.xMin + ((object.xMax - object.xMin) * i) / 32,
              object.yMin + ((object.yMax - object.yMin) * j) / 32,
            )
            if (Number.isFinite(value)) {
              if (value < minValue) minValue = value
              if (value > maxValue) maxValue = value
            }
          }
        }
        if (Number.isFinite(minValue) && maxValue > minValue) {
          const lines: number[] = []
          const zFloor = object.zMin
          for (let level = 1; level <= options.contourCount; level++) {
            const value = minValue + ((maxValue - minValue) * level) / (options.contourCount + 1)
            const segments = contourSegments((x, y) => f(x, y), {
              xMin: object.xMin,
              xMax: object.xMax,
              yMin: object.yMin,
              yMax: object.yMax,
              cols: 72,
              rows: 72,
              level: value,
            })
            for (const [a, b] of segments) {
              lines.push(a.x, a.y, zFloor, b.x, b.y, zFloor)
            }
          }
          const contourGeometry = new THREE.BufferGeometry()
          contourGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
          const contourMaterial = new THREE.LineBasicMaterial({
            color: 0x94a3b8,
            transparent: true,
            opacity: 0.85,
          })
          disposables.push(contourGeometry, contourMaterial)
          group.add(new THREE.LineSegments(contourGeometry, contourMaterial))
        }
      }
    }

    return {
      key: '',
      object: group,
      dispose: () => {
        for (const disposable of disposables) disposable.dispose()
      },
    }
  }

  function buildCurve3D(object: Curve3D): SceneItem | null {
    let points: Vec3[]
    if (object.kind === 'lorenz') {
      points = lorenzTrajectory({ steps: Math.min(80_000, object.steps) })
    } else {
      const fx = compileExpr(object.expr, ['t'])
      const fy = compileExpr(object.expr2 ?? '', ['t'])
      const fz = compileExpr(object.expr3 ?? '', ['t'])
      if (!fx || !fy || !fz) return null
      const count = Math.max(2, Math.min(50_000, object.steps))
      points = []
      for (let i = 0; i <= count; i++) {
        const t = object.tMin + ((object.tMax - object.tMin) * i) / count
        const x = fx(t)
        const y = fy(t)
        const z = fz(t)
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) points.push([x, y, z])
      }
    }
    if (points.length < 2) return null
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
    const geometry = new THREE.TubeGeometry(
      curve,
      Math.min(2000, points.length * 2),
      0.035,
      8,
      false,
    )
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(object.color),
      roughness: 0.45,
      metalness: 0.1,
    })
    const mesh = new THREE.Mesh(geometry, material)
    return {
      key: '',
      object: mesh,
      dispose: () => {
        geometry.dispose()
        material.dispose()
      },
    }
  }

  function buildField(object: Field3D, options: SpaceOptions): SceneItem | null {
    const group = new THREE.Group()
    const disposables: (THREE.BufferGeometry | THREE.Material)[] = []
    /** 着色：按标量（散度/旋度/模长）映射色图 */
    const scalarToColor = (t: number): [number, number, number] =>
      options.colormap ? sampleColormap(options.colormap, t) : [0, 0, 0]

    const arrowPositions: number[] = []
    const arrowColors: number[] = []
    const cellSize = Math.min(
      (object.xMax - object.xMin) / Math.max(1, object.divisions - 1),
      (object.yMax - object.yMin) / Math.max(1, object.divisions - 1),
    )
    const arrowLength = cellSize * 0.85 * object.scale * 0.5
    const baseColor = new THREE.Color(object.color)
    const scalars: number[] = []
    const arrows: { from: Vec3; dir: Vec3; scalar: number }[] = []

    if (object.space === 'plane') {
      const fx = compileExpr(object.expr, ['x', 'y'])
      const fy = compileExpr(object.expr2 ?? '0', ['x', 'y'])
      if (!fx || !fy) return null
      const sampled = arrowField2D((x, y) => [fx(x, y), fy(x, y)], {
        xMin: object.xMin,
        xMax: object.xMax,
        yMin: object.yMin,
        yMax: object.yMax,
        cols: object.divisions,
        rows: object.divisions,
      })
      for (const arrow of sampled) {
        if (arrow.magnitude === 0) continue
        const dir: Vec3 = [
          (arrow.u / arrow.magnitude) * arrowLength,
          (arrow.v / arrow.magnitude) * arrowLength,
          0,
        ]
        let scalar = arrow.magnitude
        if (object.colorMode === 'divergence')
          scalar = divergence2D((x, y) => [fx(x, y), fy(x, y)], arrow.x, arrow.y)
        if (object.colorMode === 'curl')
          scalar = curl2D((x, y) => [fx(x, y), fy(x, y)], arrow.x, arrow.y)
        arrows.push({ from: [arrow.x, arrow.y, 0], dir, scalar })
        scalars.push(scalar)
      }
    } else {
      const fx = compileExpr(object.expr, ['x', 'y', 'z'])
      const fy = compileExpr(object.expr2 ?? '0', ['x', 'y', 'z'])
      const fz = compileExpr(object.expr3 ?? '0', ['x', 'y', 'z'])
      if (!fx || !fy || !fz) return null
      const sampled = arrowField3D((x, y, z) => [fx(x, y, z), fy(x, y, z), fz(x, y, z)], {
        min: [object.xMin, object.yMin, object.zMin],
        max: [object.xMax, object.yMax, object.zMax],
        divisions: object.divisions,
      })
      for (const arrow of sampled) {
        if (arrow.magnitude === 0) continue
        const dir: Vec3 = [
          (arrow.direction[0] / arrow.magnitude) * arrowLength,
          (arrow.direction[1] / arrow.magnitude) * arrowLength,
          (arrow.direction[2] / arrow.magnitude) * arrowLength,
        ]
        let scalar = arrow.magnitude
        if (object.colorMode === 'divergence')
          scalar = divergence3D(
            (x, y, z) => [fx(x, y, z), fy(x, y, z), fz(x, y, z)],
            ...arrow.position,
          )
        if (object.colorMode === 'curl') {
          const c = curl3D((x, y, z) => [fx(x, y, z), fy(x, y, z), fz(x, y, z)], ...arrow.position)
          scalar = Math.hypot(...c)
        }
        arrows.push({ from: arrow.position, dir, scalar })
        scalars.push(scalar)
      }
    }

    let minScalar = Infinity
    let maxScalar = -Infinity
    for (const value of scalars) {
      if (value < minScalar) minScalar = value
      if (value > maxScalar) maxScalar = value
    }
    const scalarSpan = maxScalar - minScalar || 1
    for (const arrow of arrows) {
      const end: Vec3 = [
        arrow.from[0] + arrow.dir[0],
        arrow.from[1] + arrow.dir[1],
        arrow.from[2] + arrow.dir[2],
      ]
      // 主杆
      arrowPositions.push(...arrow.from, ...end)
      // 箭头两翼（垂直于杆的短线段：用与全局 z 的叉积近似）
      const len = Math.hypot(...arrow.dir) || 1
      const headSize = len * 0.28
      const dirNorm: Vec3 = [arrow.dir[0] / len, arrow.dir[1] / len, arrow.dir[2] / len]
      const reference: Vec3 = Math.abs(dirNorm[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
      const side: Vec3 = [
        dirNorm[1] * reference[2] - dirNorm[2] * reference[1],
        dirNorm[2] * reference[0] - dirNorm[0] * reference[2],
        dirNorm[0] * reference[1] - dirNorm[1] * reference[0],
      ]
      const sideNorm = Math.hypot(...side) || 1
      const s: Vec3 = [side[0] / sideNorm, side[1] / sideNorm, side[2] / sideNorm]
      const back: Vec3 = [
        end[0] - dirNorm[0] * headSize,
        end[1] - dirNorm[1] * headSize,
        end[2] - dirNorm[2] * headSize,
      ]
      arrowPositions.push(
        ...end,
        back[0] + s[0] * headSize * 0.45,
        back[1] + s[1] * headSize * 0.45,
        back[2] + s[2] * headSize * 0.45,
      )
      arrowPositions.push(
        ...end,
        back[0] - s[0] * headSize * 0.45,
        back[1] - s[1] * headSize * 0.45,
        back[2] - s[2] * headSize * 0.45,
      )
      // 颜色（每段 3 个顶点同色）
      const t = object.colorMode === 'none' ? -1 : (arrow.scalar - minScalar) / scalarSpan
      const color: [number, number, number] =
        t < 0 ? [baseColor.r, baseColor.g, baseColor.b] : scalarToColor(t)
      for (let v = 0; v < 3; v++) arrowColors.push(color[0], color[1], color[2])
    }

    if (arrowPositions.length > 0) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrowPositions, 3))
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(arrowColors, 3))
      const material = new THREE.LineBasicMaterial({ vertexColors: true })
      disposables.push(geometry, material)
      group.add(new THREE.LineSegments(geometry, material))
    }

    // 流线
    if (object.streamSeeds > 0) {
      const linePositions: number[] = []
      if (object.space === 'plane') {
        const fx = compileExpr(object.expr, ['x', 'y'])!
        const fy = compileExpr(object.expr2 ?? '0', ['x', 'y'])!
        const cols = Math.ceil(Math.sqrt(object.streamSeeds))
        for (let i = 0; i < object.streamSeeds; i++) {
          const sx = object.xMin + ((object.xMax - object.xMin) * ((i % cols) + 0.5)) / cols
          const sy =
            object.yMin +
            ((object.yMax - object.yMin) * (Math.floor(i / cols) + 0.5)) /
              Math.ceil(object.streamSeeds / cols)
          const path = streamline2D((x, y) => [fx(x, y), fy(x, y)], [sx, sy], {
            dt: 0.02,
            steps: 600,
            both: true,
          })
          for (let k = 0; k + 1 < path.length; k++) {
            linePositions.push(path[k]!.x, path[k]!.y, 0, path[k + 1]!.x, path[k + 1]!.y, 0)
          }
        }
      } else {
        const fx = compileExpr(object.expr, ['x', 'y', 'z'])!
        const fy = compileExpr(object.expr2 ?? '0', ['x', 'y', 'z'])!
        const fz = compileExpr(object.expr3 ?? '0', ['x', 'y', 'z'])!
        const cols = Math.ceil(Math.cbrt(object.streamSeeds))
        for (let i = 0; i < object.streamSeeds; i++) {
          const sx = object.xMin + ((object.xMax - object.xMin) * ((i % cols) + 0.5)) / cols
          const sy =
            object.yMin +
            ((object.yMax - object.yMin) * ((Math.floor(i / cols) % cols) + 0.5)) / cols
          const sz =
            object.zMin +
            ((object.zMax - object.zMin) * (Math.floor(i / (cols * cols)) + 0.5)) / cols
          const path = streamline3D(
            (x, y, z) => [fx(x, y, z), fy(x, y, z), fz(x, y, z)],
            [sx, sy, sz],
            {
              dt: 0.03,
              steps: 500,
            },
          )
          for (let k = 0; k + 1 < path.length; k++) {
            linePositions.push(...path[k]!, ...path[k + 1]!)
          }
        }
      }
      if (linePositions.length > 0) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3))
        const material = new THREE.LineBasicMaterial({
          color: 0x475569,
          transparent: true,
          opacity: 0.55,
        })
        disposables.push(geometry, material)
        group.add(new THREE.LineSegments(geometry, material))
      }
    }

    return {
      key: '',
      object: group,
      dispose: () => {
        for (const disposable of disposables) disposable.dispose()
      },
    }
  }

  function buildOde(object: Ode2D): SceneItem | null {
    const f = compileExpr(object.expr, ['x', 'y'])
    if (!f) return null
    const group = new THREE.Group()
    const disposables: (THREE.BufferGeometry | THREE.Material)[] = []

    // 方向场（灰）
    if (object.directionField) {
      const arrows = directionField((x, y) => f(x, y), {
        xMin: Math.min(object.x0, object.xEnd),
        xMax: Math.max(object.x0, object.xEnd),
        yMin: object.y0 - Math.abs(object.xEnd - object.x0) * 0.6,
        yMax: object.y0 + Math.abs(object.xEnd - object.x0) * 0.9,
        cols: 24,
        rows: 18,
      })
      const positions: number[] = []
      const span = Math.abs(object.xEnd - object.x0)
      const scale = (span / 23) * 0.7
      for (const arrow of arrows) {
        positions.push(arrow.x, arrow.y, 0, arrow.x + arrow.u * scale, arrow.y + arrow.v * scale, 0)
      }
      if (positions.length > 0) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        const material = new THREE.LineBasicMaterial({ color: 0xcbd5e1 })
        disposables.push(geometry, material)
        group.add(new THREE.LineSegments(geometry, material))
      }
    }

    // 三种方法的解曲线
    const methodColors: Record<string, number> = {
      euler: 0xd97706,
      improved: 0x16a34a,
      rk4: 0x2563eb,
    }
    for (const method of ['euler', 'improved', 'rk4'] as const) {
      const points = integrateOde((x, y) => f(x, y), {
        x0: object.x0,
        y0: object.y0,
        xEnd: object.xEnd,
        steps: object.steps,
        method,
      })
      if (points.length < 2) continue
      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.y, 0)))
      const geometry = new THREE.TubeGeometry(
        curve,
        Math.min(2000, points.length * 2),
        0.03,
        6,
        false,
      )
      const material = new THREE.MeshStandardMaterial({
        color: methodColors[method]!,
        roughness: 0.4,
      })
      disposables.push(geometry, material)
      group.add(new THREE.Mesh(geometry, material))
    }

    // 初值点
    const markerGeometry = new THREE.SphereGeometry(0.08, 12, 12)
    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0x111827 })
    disposables.push(markerGeometry, markerMaterial)
    const marker = new THREE.Mesh(markerGeometry, markerMaterial)
    marker.position.set(object.x0, object.y0, 0)
    group.add(marker)

    return {
      key: '',
      object: group,
      dispose: () => {
        for (const disposable of disposables) disposable.dispose()
      },
    }
  }

  function buildItem(object: SpaceObject, options: SpaceOptions): SceneItem | null {
    switch (object.type) {
      case 'surface3d':
        return buildSurface(object, options)
      case 'curve3d':
        return buildCurve3D(object)
      case 'field3d':
        return buildField(object, options)
      case 'ode2d':
        return buildOde(object)
    }
  }

  /** 每个对象的重建键：包含影响几何/着色的全部字段 + 相关全局选项 */
  function itemKey(object: SpaceObject, options: SpaceOptions): string {
    if (object.type !== 'surface3d' && object.type !== 'field3d') {
      return JSON.stringify(object)
    }
    const shadingPart =
      object.type === 'surface3d' ? `${options.shading}|${options.colormap}` : options.colormap
    return `${JSON.stringify(object)}|${shadingPart}`
  }

  function update(objects: SpaceObject[], options: SpaceOptions): void {
    if (options.camera !== cameraKind) {
      cameraKind = options.camera
      camera = options.camera === 'ortho' ? ortho : persp
      controls.object = camera as THREE.PerspectiveCamera
    }

    pickTargets.length = 0
    const alive = new Set<string>()
    const contourKey = options.contourCount > 0 ? `|c${options.contourCount}` : ''
    for (const object of objects) {
      if (!object.visible) continue
      const key = `${itemKey(object, options)}${object.type === 'surface3d' && object.kind === 'explicit' ? contourKey : ''}`
      alive.add(object.id)
      const existing = items.get(object.id)
      if (existing && existing.key === key) continue
      if (existing) disposeItem(existing)
      const item = buildItem(object, options)
      if (item) {
        item.key = key
        items.set(object.id, item)
        scene.add(item.object)
      } else {
        items.delete(object.id)
      }
    }
    for (const [id, item] of items) {
      if (!alive.has(id)) {
        disposeItem(item)
        items.delete(id)
      }
    }

    // 切平面（独立于对象缓存，随 tangentX/Y 频繁变化）
    const tangentExisting = items.get('__tangent__')
    if (tangentExisting) {
      disposeItem(tangentExisting)
      items.delete('__tangent__')
    }
    if (options.tangentPlane) {
      const surface = objects.find(
        (object): object is Surface3D =>
          object.type === 'surface3d' && object.kind === 'explicit' && object.visible,
      )
      if (surface) {
        const f = compileExpr(surface.expr, ['x', 'y'])
        const dfx = compileDerivative(surface.expr, 'x', ['x', 'y'])
        const dfy = compileDerivative(surface.expr, 'y', ['x', 'y'])
        if (f && dfx && dfy) {
          const plane = tangentPlaneAt(
            (x, y) => f(x, y),
            (x, y) => dfx(x, y),
            (x, y) => dfy(x, y),
            options.tangentX,
            options.tangentY,
          )
          const group = new THREE.Group()
          const disposables: (THREE.BufferGeometry | THREE.Material)[] = []
          const half = Math.max(0.9, (surface.xMax - surface.xMin) * 0.16)
          const size = half * 2
          const planeGeometry = new THREE.PlaneGeometry(size, size)
          const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.45,
            side: THREE.DoubleSide,
            roughness: 0.6,
          })
          disposables.push(planeGeometry, planeMaterial)
          const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial)
          const { u, v } = planeBasis(plane.normal)
          const matrix = new THREE.Matrix4().makeBasis(
            new THREE.Vector3(u[0], u[1], u[2]),
            new THREE.Vector3(v[0], v[1], v[2]),
            new THREE.Vector3(plane.normal[0], plane.normal[1], plane.normal[2]),
          )
          planeMesh.quaternion.setFromRotationMatrix(matrix)
          planeMesh.position.set(plane.x0, plane.y0, plane.z0)
          group.add(planeMesh)

          const dotGeometry = new THREE.SphereGeometry(Math.max(0.05, size * 0.05), 16, 16)
          const dotMaterial = new THREE.MeshStandardMaterial({ color: 0xb45309 })
          disposables.push(dotGeometry)
          disposables.push(dotMaterial)
          const dot = new THREE.Mesh(dotGeometry, dotMaterial)
          dot.position.set(plane.x0, plane.y0, plane.z0)
          group.add(dot)

          // 法向箭头
          const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(plane.normal[0], plane.normal[1], plane.normal[2]),
            new THREE.Vector3(plane.x0, plane.y0, plane.z0),
            size * 0.9,
            0xb45309,
            size * 0.16,
            size * 0.09,
          )
          group.add(arrow)

          items.set('__tangent__', {
            key: 'tangent',
            object: group,
            dispose: () => {
              for (const disposable of disposables) disposable.dispose()
            },
          })
          scene.add(group)
        }
      }
    }
  }

  function resize(width: number, height: number, dpr: number): void {
    renderer.setPixelRatio(dpr)
    renderer.setSize(width, height, false)
    const aspect = width / Math.max(1, height)
    persp.aspect = aspect
    persp.updateProjectionMatrix()
    const distance = persp.position.distanceTo(controls.target)
    const heightUnits = 2 * distance * Math.tan((persp.fov * Math.PI) / 360)
    ortho.left = (-heightUnits * aspect) / 2
    ortho.right = (heightUnits * aspect) / 2
    ortho.top = heightUnits / 2
    ortho.bottom = -heightUnits / 2
    ortho.updateProjectionMatrix()
  }

  function render(): void {
    controls.update()
    renderer.render(scene, camera)
  }

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  function pick(px: number, py: number): [number, number] | null {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    ndc.set((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObjects(pickTargets, false)
    const first = hits[0]
    if (!first) return null
    return [first.point.x, first.point.y]
  }

  function spinCamera(deltaDegrees: number): void {
    const target = controls.target
    const offset = persp.position.clone().sub(target)
    const radius = Math.hypot(offset.x, offset.y)
    let theta = Math.atan2(offset.y, offset.x)
    theta += (deltaDegrees * Math.PI) / 180
    persp.position.set(
      target.x + radius * Math.cos(theta),
      target.y + radius * Math.sin(theta),
      persp.position.z,
    )
    persp.lookAt(target)
    ortho.position.copy(persp.position)
    ortho.lookAt(target)
  }

  function getCameraState(): { position: Vec3; target: Vec3 } | null {
    const active = camera === ortho ? ortho : persp
    return {
      position: [active.position.x, active.position.y, active.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    }
  }

  function setCameraState(state: { position: Vec3; target: Vec3 } | null): void {
    if (!state) return
    persp.position.set(...state.position)
    persp.lookAt(new THREE.Vector3(...state.target))
    ortho.position.set(...state.position)
    ortho.lookAt(new THREE.Vector3(...state.target))
    controls.target.set(...state.target)
    controls.update()
  }

  function resetCamera(): void {
    persp.position.set(9, -11, 7)
    ortho.position.set(9, -11, 7)
    controls.target.set(0, 0, 0)
    controls.update()
  }

  function setControlsEnabled(enabled: boolean): void {
    controls.enabled = enabled
  }

  function captureFrame(): { data: Uint8ClampedArray; width: number; height: number } {
    render()
    const gl = renderer.getContext()
    const width = renderer.domElement.width
    const height = renderer.domElement.height
    const raw = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw)
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      const source = (height - 1 - y) * width * 4
      data.set(raw.subarray(source, source + width * 4), y * width * 4)
    }
    return { data, width, height }
  }

  async function snapshot(): Promise<Blob | null> {
    render()
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  function onContextLost(event: Event): void {
    event.preventDefault()
    contextCallback?.(true)
  }
  function onContextRestored(): void {
    contextCallback?.(false)
  }
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  function dispose(): void {
    canvas.removeEventListener('webglcontextlost', onContextLost)
    canvas.removeEventListener('webglcontextrestored', onContextRestored)
    for (const item of items.values()) disposeItem(item)
    items.clear()
    controls.dispose()
    axisGeometry.dispose()
    axisMaterial.dispose()
    negGeometry.dispose()
    negMaterial.dispose()
    renderer.dispose()
  }

  return {
    update,
    resize,
    render,
    pick,
    spinCamera,
    getCameraState,
    setCameraState,
    resetCamera,
    setControlsEnabled,
    captureFrame,
    snapshot,
    dispose,
    setOnContextEvent(callback) {
      contextCallback = callback
    },
  }
}
