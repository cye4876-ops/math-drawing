/**
 * 3D 对象工厂与预设库（v0.8）。
 * 对象本体存文档（可撤销、可分享）；预设只是面板上的快捷入口。
 */
import type { Curve3D, Field3D, Ode2D, Surface3D } from '../state/types'

/** 正多面体预设 id（scene 层映射到 three 内置几何） */
export const POLYHEDRON_IDS = [
  'tetrahedron',
  'cube',
  'octahedron',
  'dodecahedron',
  'icosahedron',
] as const

export function createSurface3D(partial: Partial<Omit<Surface3D, 'id' | 'type'>> = {}): Surface3D {
  return {
    id: crypto.randomUUID(),
    type: 'surface3d',
    name: 'z = sin(x)·cos(y)',
    kind: 'explicit',
    expr: 'sin(x)*cos(y)',
    xMin: -5,
    xMax: 5,
    yMin: -5,
    yMax: 5,
    zMin: -5,
    zMax: 5,
    color: '#2563eb',
    opacity: 1,
    resolution: 96,
    visible: true,
    ...partial,
  }
}

export function createCurve3D(partial: Partial<Omit<Curve3D, 'id' | 'type'>> = {}): Curve3D {
  return {
    id: crypto.randomUUID(),
    type: 'curve3d',
    name: '洛伦兹吸引子',
    kind: 'lorenz',
    expr: 'cos(t)',
    expr2: 'sin(t)',
    expr3: 't/5',
    tMin: 0,
    tMax: Math.PI * 6,
    steps: 4000,
    color: '#dc2626',
    visible: true,
    ...partial,
  }
}

export function createField3D(partial: Partial<Omit<Field3D, 'id' | 'type'>> = {}): Field3D {
  return {
    id: crypto.randomUUID(),
    type: 'field3d',
    name: 'F = (−y, x, 0)',
    space: 'space',
    expr: '-y',
    expr2: 'x',
    expr3: '0',
    xMin: -3,
    xMax: 3,
    yMin: -3,
    yMax: 3,
    zMin: -3,
    zMax: 3,
    divisions: 6,
    scale: 1.6,
    colorMode: 'none',
    streamSeeds: 0,
    color: '#0891b2',
    visible: true,
    ...partial,
  }
}

export function createOde2D(partial: Partial<Omit<Ode2D, 'id' | 'type'>> = {}): Ode2D {
  return {
    id: crypto.randomUUID(),
    type: 'ode2d',
    name: "y' = y",
    expr: 'y',
    x0: 0,
    y0: 1,
    xEnd: 3,
    steps: 30,
    directionField: true,
    visible: true,
    ...partial,
  }
}

/** 曲面预设（kind / 表达式 / 区间 / 分辨率） */
export interface SurfacePreset {
  id: string
  label: string
  surface: Partial<Omit<Surface3D, 'id' | 'type'>>
}

export const SURFACE_PRESETS: SurfacePreset[] = [
  {
    id: 'sincos',
    label: 'z = sin(x)·cos(y)',
    surface: { kind: 'explicit', expr: 'sin(x)*cos(y)', name: 'z = sin(x)·cos(y)' },
  },
  {
    id: 'saddle',
    label: '马鞍面 z = x² − y²',
    surface: {
      kind: 'explicit',
      expr: 'x^2 - y^2',
      name: 'z = x² − y²',
      xMin: -3,
      xMax: 3,
      yMin: -3,
      yMax: 3,
    },
  },
  {
    id: 'paraboloid',
    label: '抛物面 z = x² + y²',
    surface: {
      kind: 'explicit',
      expr: 'x^2 + y^2',
      name: 'z = x² + y²',
      xMin: -2.5,
      xMax: 2.5,
      yMin: -2.5,
      yMax: 2.5,
    },
  },
  {
    id: 'plane',
    label: '平面 z = 0.5x + 0.3y + 1',
    surface: {
      kind: 'explicit',
      expr: '0.5*x + 0.3*y + 1',
      name: '平面 z = 0.5x + 0.3y + 1',
      xMin: -3,
      xMax: 3,
      yMin: -3,
      yMax: 3,
    },
  },
  {
    id: 'cone',
    label: '圆锥 z = −√(x²+y²)',
    surface: {
      kind: 'explicit',
      expr: '-sqrt(x^2 + y^2)',
      name: 'z = −√(x²+y²)',
      xMin: -3,
      xMax: 3,
      yMin: -3,
      yMax: 3,
    },
  },
  {
    id: 'sphere-implicit',
    label: '隐式球面 x²+y²+z² = 1',
    surface: {
      kind: 'implicit',
      expr: 'x^2 + y^2 + z^2 - 1',
      name: 'x²+y²+z² = 1',
      xMin: -1.3,
      xMax: 1.3,
      yMin: -1.3,
      yMax: 1.3,
      zMin: -1.3,
      zMax: 1.3,
      resolution: 48,
    },
  },
  {
    id: 'hyperboloid',
    label: '单叶双曲面 x²+y²−z² = 1',
    surface: {
      kind: 'implicit',
      expr: 'x^2 + y^2 - z^2 - 1',
      name: 'x²+y²−z² = 1',
      xMin: -2,
      xMax: 2,
      yMin: -2,
      yMax: 2,
      zMin: -1.5,
      zMax: 1.5,
      resolution: 40,
    },
  },
  {
    id: 'ellipsoid',
    label: '椭球（参数）',
    surface: {
      kind: 'parametric',
      expr: '2*sin(u)*cos(v)',
      expr2: '1.4*sin(u)*sin(v)',
      expr3: 'cos(u)',
      name: '椭球',
      xMin: 0,
      xMax: Math.PI,
      yMin: 0,
      yMax: Math.PI * 2,
    },
  },
  {
    id: 'torus',
    label: '环面（参数）',
    surface: {
      kind: 'parametric',
      expr: '(2 + 0.7*cos(v))*cos(u)',
      expr2: '(2 + 0.7*cos(v))*sin(u)',
      expr3: '0.7*sin(v)',
      name: '环面',
      xMin: 0,
      xMax: Math.PI * 2,
      yMin: 0,
      yMax: Math.PI * 2,
    },
  },
  {
    id: 'mobius',
    label: '莫比乌斯带（参数）',
    surface: {
      kind: 'parametric',
      expr: '(1 + 0.5*v*cos(u/2))*cos(u)',
      expr2: '(1 + 0.5*v*cos(u/2))*sin(u)',
      expr3: '0.5*v*sin(u/2)',
      name: '莫比乌斯带',
      xMin: 0,
      xMax: Math.PI * 2,
      yMin: -1,
      yMax: 1,
    },
  },
  {
    id: 'revolve-cos',
    label: '旋转体 r(x) = 2 + cos(2x)',
    surface: {
      kind: 'revolve',
      expr: '2 + cos(2*x)',
      name: 'r(x) = 2 + cos(2x)',
      xMin: -Math.PI,
      xMax: Math.PI,
      resolution: 72,
    },
  },
  {
    id: 'revolve-parabola',
    label: '旋转体 r(x) = √|x|',
    surface: {
      kind: 'revolve',
      expr: 'sqrt(abs(x))',
      name: 'r(x) = √|x|',
      xMin: -2,
      xMax: 2,
      resolution: 72,
    },
  },
  ...(
    [
      ['tetrahedron', '正四面体'],
      ['cube', '正六面体（立方体）'],
      ['octahedron', '正八面体'],
      ['dodecahedron', '正十二面体'],
      ['icosahedron', '正二十面体'],
      ['prism6', '六棱柱'],
      ['pyramid5', '五棱锥'],
    ] as const
  ).map(([id, label]): SurfacePreset => ({
    id,
    label,
    surface: { kind: 'polyhedron', expr: id, name: label, color: '#d97706' },
  })),
]

/** 空间曲线预设 */
export interface Curve3DPreset {
  id: string
  label: string
  curve: Partial<Omit<Curve3D, 'id' | 'type'>>
}

export const CURVE3D_PRESETS: Curve3DPreset[] = [
  {
    id: 'lorenz',
    label: '洛伦兹吸引子',
    curve: { kind: 'lorenz', name: '洛伦兹吸引子', steps: 4000, color: '#dc2626' },
  },
  {
    id: 'helix',
    label: '螺旋线',
    curve: {
      kind: 'parametric',
      expr: 'cos(t)',
      expr2: 'sin(t)',
      expr3: 't/5',
      name: '螺旋线',
      tMin: 0,
      tMax: Math.PI * 6,
      steps: 600,
      color: '#16a34a',
    },
  },
  {
    id: 'line',
    label: '空间直线 (1+t, 2−t, t/2)',
    curve: {
      kind: 'parametric',
      expr: '1 + t',
      expr2: '2 - t',
      expr3: 't/2',
      name: '空间直线',
      tMin: -3,
      tMax: 3,
      steps: 120,
      color: '#d97706',
    },
  },
  {
    id: 'torus-knot',
    label: '环面纽结 (2,3)',
    curve: {
      kind: 'parametric',
      expr: '(2 + cos(3*t))*cos(2*t)',
      expr2: '(2 + cos(3*t))*sin(2*t)',
      expr3: 'sin(3*t)',
      name: '环面纽结',
      tMin: 0,
      tMax: Math.PI * 2,
      steps: 600,
      color: '#7c3aed',
    },
  },
]

/** 向量场预设 */
export interface Field3DPreset {
  id: string
  label: string
  field: Partial<Omit<Field3D, 'id' | 'type'>>
}

export const FIELD3D_PRESETS: Field3DPreset[] = [
  {
    id: 'rotation',
    label: '旋转场 (−y, x, 0)（旋度 = 2）',
    field: {
      space: 'space',
      expr: '-y',
      expr2: 'x',
      expr3: '0',
      name: 'F = (−y, x, 0)',
      colorMode: 'curl',
      streamSeeds: 0,
    },
  },
  {
    id: 'radial',
    label: '径向场 (x, y, z)（散度 = 3）',
    field: {
      space: 'space',
      expr: 'x',
      expr2: 'y',
      expr3: 'z',
      name: 'F = (x, y, z)',
      colorMode: 'divergence',
      divisions: 5,
    },
  },
  {
    id: 'saddle2d',
    label: '平面场 (x, −y)（鞍点）',
    field: {
      space: 'plane',
      expr: 'x',
      expr2: '-y',
      name: 'F = (x, −y)',
      colorMode: 'none',
      streamSeeds: 12,
    },
  },
  {
    id: 'oscillator',
    label: '相图：谐振子 (y, −x)',
    field: {
      space: 'plane',
      expr: 'y',
      expr2: '-x',
      name: '谐振子相图',
      colorMode: 'none',
      streamSeeds: 9,
      divisions: 14,
    },
  },
  {
    id: 'predator',
    label: '相图：捕食者-猎物',
    field: {
      space: 'plane',
      expr: 'x*(1 - 0.5*y)',
      expr2: 'y*(0.4*x - 1)',
      name: '捕食者-猎物相图',
      colorMode: 'none',
      streamSeeds: 16,
      divisions: 14,
      xMin: -0.5,
      xMax: 5,
      yMin: -0.5,
      yMax: 4,
    },
  },
]

/** ODE 解预设 */
export interface Ode2DPreset {
  id: string
  label: string
  ode: Partial<Omit<Ode2D, 'id' | 'type'>>
}

export const ODE2D_PRESETS: Ode2DPreset[] = [
  {
    id: 'exp',
    label: "y' = y",
    ode: { expr: 'y', name: "y' = y", x0: 0, y0: 1, xEnd: 3, steps: 30 },
  },
  {
    id: 'x-minus-y',
    label: "y' = x − y",
    ode: { expr: 'x - y', name: "y' = x − y", x0: 0, y0: 1, xEnd: 5, steps: 40 },
  },
  {
    id: 'logistic',
    label: "y' = y(1 − y/4)（逻辑斯蒂）",
    ode: { expr: 'y*(1 - y/4)', name: "y' = y(1 − y/4)", x0: 0, y0: 0.5, xEnd: 12, steps: 60 },
  },
  {
    id: 'stiff-ish',
    label: "y' = −10y（快衰减，步长敏感）",
    ode: {
      expr: '-10*y',
      name: "y' = −10y",
      x0: 0,
      y0: 1,
      xEnd: 1,
      steps: 20,
      directionField: false,
    },
  },
]
