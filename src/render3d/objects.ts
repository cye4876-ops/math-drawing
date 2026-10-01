/**
 * 3D 对象工厂与预设库（v0.8；参数化预设）。
 * 对象本体存文档（可撤销、可分享）；预设是面板快捷入口；
 * 带参数的预设把参数绑定存进对象的 `template` 字段——面板据此渲染滑块，
 * 调整参数时由预设的生成函数**重建表达式**（而非手改文本）。
 */
import type { Curve3D, Field3D, Ode2D, PresetBinding, Surface3D } from '../state/types'

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

// ---------- 表达式拼装 helper（数字格式化 + 系数符号感知） ----------

/** 数字格式化（去尾零；-0 归 0） */
export function formatCoefficient(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded === 0 ? 0 : rounded)
}

/** 系数 × 项（abs 为 1 且非常数项时省略系数） */
function mul(abs: number, term: string): string {
  if (term === '') return formatCoefficient(abs)
  if (abs === 1) return term
  return `${formatCoefficient(abs)}*${term}`
}

/** 系数 × 表达式片段（返回一段完整表达式；1/−1 特判） */
function scale(coeff: number, body: string): string {
  if (coeff === 1) return body
  if (coeff === -1) return `-${body}`
  return `${formatCoefficient(coeff)}*${body}`
}

/** 线性组合（符号感知拼接；系数为 0 的项省略；全零为 '0'） */
function sumTerms(terms: [number, string][]): string {
  let result = ''
  for (const [coeff, term] of terms) {
    if (coeff === 0) continue
    const body = mul(Math.abs(coeff), term)
    if (result === '') result = coeff < 0 ? `-${body}` : body
    else result += coeff < 0 ? ` - ${body}` : ` + ${body}`
  }
  return result === '' ? '0' : result
}

/** 平方项（系数 1 省略；否则写 (x/a)^2） */
function squared(variable: string, coeff: number): string {
  return coeff === 1 ? `${variable}^2` : `(${variable}/${formatCoefficient(coeff)})^2`
}

// ---------- 预设参数定义 ----------

export interface PresetParam {
  key: string
  label: string
  min: number
  max: number
  step: number
  default: number
}

export function presetDefaults(params: PresetParam[] | undefined): Record<string, number> {
  const values: Record<string, number> = {}
  for (const param of params ?? []) values[param.key] = param.default
  return values
}

// ---------- 曲面预设 ----------

export interface SurfacePreset {
  id: string
  label: string
  params?: PresetParam[]
  surface: (values: Record<string, number>) => Partial<Omit<Surface3D, 'id' | 'type'>>
}

export const SURFACE_PRESETS: SurfacePreset[] = [
  {
    id: 'sincos',
    label: 'z = a·sin(bx)·cos(cy)',
    params: [
      { key: 'a', label: '振幅 a', min: 0.2, max: 3, step: 0.1, default: 1 },
      { key: 'b', label: '频率 b', min: 0.2, max: 4, step: 0.1, default: 1 },
      { key: 'c', label: '频率 c', min: 0.2, max: 4, step: 0.1, default: 1 },
    ],
    surface: (v) => {
      const expr = scale(
        v['a'] ?? 1,
        `sin(${scale(v['b'] ?? 1, 'x')})*cos(${scale(v['c'] ?? 1, 'y')})`,
      )
      return { kind: 'explicit', expr, name: `z = ${expr}` }
    },
  },
  {
    id: 'saddle',
    label: '马鞍面 z = ax² − by²',
    params: [
      { key: 'a', label: 'a', min: 0.2, max: 3, step: 0.1, default: 1 },
      { key: 'b', label: 'b', min: 0.2, max: 3, step: 0.1, default: 1 },
    ],
    surface: (v) => {
      const expr = sumTerms([
        [v['a'] ?? 1, 'x^2'],
        [-(v['b'] ?? 1), 'y^2'],
      ])
      return {
        kind: 'explicit',
        expr,
        name: `z = ${expr}`,
        xMin: -3,
        xMax: 3,
        yMin: -3,
        yMax: 3,
      }
    },
  },
  {
    id: 'paraboloid',
    label: '抛物面 z = a(x² + y²)',
    params: [{ key: 'a', label: 'a', min: 0.2, max: 3, step: 0.1, default: 1 }],
    surface: (v) => {
      const expr = scale(v['a'] ?? 1, '(x^2 + y^2)')
      return {
        kind: 'explicit',
        expr,
        name: `z = ${expr}`,
        xMin: -2.5,
        xMax: 2.5,
        yMin: -2.5,
        yMax: 2.5,
      }
    },
  },
  {
    id: 'plane',
    label: '平面 z = ax + by + c',
    params: [
      { key: 'a', label: 'a（x 系数）', min: -3, max: 3, step: 0.1, default: 0.5 },
      { key: 'b', label: 'b（y 系数）', min: -3, max: 3, step: 0.1, default: 0.3 },
      { key: 'c', label: 'c（常数）', min: -3, max: 3, step: 0.1, default: 1 },
    ],
    surface: (v) => {
      const expr = sumTerms([
        [v['a'] ?? 0, 'x'],
        [v['b'] ?? 0, 'y'],
        [v['c'] ?? 0, ''],
      ])
      return {
        kind: 'explicit',
        expr,
        name: `z = ${expr}`,
        xMin: -3,
        xMax: 3,
        yMin: -3,
        yMax: 3,
      }
    },
  },
  {
    id: 'cone',
    label: '圆锥 z = −a·√(x²+y²)',
    params: [{ key: 'a', label: 'a', min: 0.2, max: 3, step: 0.1, default: 1 }],
    surface: (v) => {
      const expr = sumTerms([[-(v['a'] ?? 1), 'sqrt(x^2 + y^2)']])
      return {
        kind: 'explicit',
        expr,
        name: `z = ${expr}`,
        xMin: -3,
        xMax: 3,
        yMin: -3,
        yMax: 3,
      }
    },
  },
  {
    id: 'sphere-implicit',
    label: '隐式球面 x²+y²+z² = R²',
    params: [{ key: 'R', label: '半径 R', min: 0.3, max: 3, step: 0.1, default: 1 }],
    surface: (v) => {
      const radius = v['R'] ?? 1
      const expr = `x^2 + y^2 + z^2 - ${formatCoefficient(radius * radius)}`
      const bound = 1.3 * radius
      return {
        kind: 'implicit',
        expr,
        name: `x²+y²+z² = ${formatCoefficient(radius)}²`,
        xMin: -bound,
        xMax: bound,
        yMin: -bound,
        yMax: bound,
        zMin: -bound,
        zMax: bound,
        resolution: 48,
      }
    },
  },
  {
    id: 'hyperboloid',
    label: '单叶双曲面 (x/a)²+(y/b)²−(z/c)² = 1',
    params: [
      { key: 'a', label: 'a', min: 0.3, max: 3, step: 0.1, default: 1 },
      { key: 'b', label: 'b', min: 0.3, max: 3, step: 0.1, default: 1 },
      { key: 'c', label: 'c', min: 0.3, max: 3, step: 0.1, default: 1 },
    ],
    surface: (v) => {
      const a = v['a'] ?? 1
      const b = v['b'] ?? 1
      const c = v['c'] ?? 1
      const expr = `${squared('x', a)} + ${squared('y', b)} - ${squared('z', c)} - 1`
      const bx = 2 * a
      const by = 2 * b
      const bz = 1.5 * c
      return {
        kind: 'implicit',
        expr,
        name: '单叶双曲面',
        xMin: -bx,
        xMax: bx,
        yMin: -by,
        yMax: by,
        zMin: -bz,
        zMax: bz,
        resolution: 40,
      }
    },
  },
  {
    id: 'ellipsoid',
    label: '椭球（参数，半轴 a·b·c）',
    params: [
      { key: 'a', label: '半轴 a', min: 0.3, max: 3, step: 0.1, default: 2 },
      { key: 'b', label: '半轴 b', min: 0.3, max: 3, step: 0.1, default: 1.4 },
      { key: 'c', label: '半轴 c', min: 0.3, max: 3, step: 0.1, default: 1 },
    ],
    surface: (v) => {
      const a = v['a'] ?? 2
      const b = v['b'] ?? 1.4
      const c = v['c'] ?? 1
      return {
        kind: 'parametric',
        expr: scale(a, 'sin(u)*cos(v)'),
        expr2: scale(b, 'sin(u)*sin(v)'),
        expr3: scale(c, 'cos(u)'),
        name: `椭球（a=${formatCoefficient(a)}, b=${formatCoefficient(b)}, c=${formatCoefficient(c)}）`,
        xMin: 0,
        xMax: Math.PI,
        yMin: 0,
        yMax: Math.PI * 2,
      }
    },
  },
  {
    id: 'torus',
    label: '环面（参数，R 与 r）',
    params: [
      { key: 'R', label: '主半径 R', min: 0.5, max: 4, step: 0.1, default: 2 },
      { key: 'r', label: '管半径 r', min: 0.1, max: 1.8, step: 0.05, default: 0.7 },
    ],
    surface: (v) => {
      const bigR = v['R'] ?? 2
      const smallR = v['r'] ?? 0.7
      const radial = `(${formatCoefficient(bigR)} + ${formatCoefficient(smallR)}*cos(v))`
      return {
        kind: 'parametric',
        expr: `${radial}*cos(u)`,
        expr2: `${radial}*sin(u)`,
        expr3: `${formatCoefficient(smallR)}*sin(v)`,
        name: `环面（R=${formatCoefficient(bigR)}, r=${formatCoefficient(smallR)}）`,
        xMin: 0,
        xMax: Math.PI * 2,
        yMin: 0,
        yMax: Math.PI * 2,
      }
    },
  },
  {
    id: 'mobius',
    label: '莫比乌斯带（参数，带宽 w）',
    params: [{ key: 'w', label: '带宽 w', min: 0.2, max: 1.2, step: 0.05, default: 0.5 }],
    surface: (v) => {
      const width = v['w'] ?? 0.5
      const factor = `(1 + ${formatCoefficient(width)}*v*cos(u/2))`
      return {
        kind: 'parametric',
        expr: `${factor}*cos(u)`,
        expr2: `${factor}*sin(u)`,
        expr3: `${formatCoefficient(width)}*v*sin(u/2)`,
        name: '莫比乌斯带',
        xMin: 0,
        xMax: Math.PI * 2,
        yMin: -1,
        yMax: 1,
      }
    },
  },
  {
    id: 'revolve-cos',
    label: '旋转体 r(x) = a + cos(bx)',
    params: [
      { key: 'a', label: 'a（基线）', min: 0.5, max: 3, step: 0.1, default: 2 },
      { key: 'b', label: 'b（频率）', min: 0.5, max: 4, step: 0.1, default: 2 },
    ],
    surface: (v) => {
      const expr = `${formatCoefficient(v['a'] ?? 2)} + cos(${scale(v['b'] ?? 2, 'x')})`
      return {
        kind: 'revolve',
        expr,
        name: `r(x) = ${expr}`,
        xMin: -Math.PI,
        xMax: Math.PI,
        resolution: 72,
      }
    },
  },
  {
    id: 'revolve-parabola',
    label: '旋转体 r(x) = √|x|',
    surface: () => ({
      kind: 'revolve',
      expr: 'sqrt(abs(x))',
      name: 'r(x) = √|x|',
      xMin: -2,
      xMax: 2,
      resolution: 72,
    }),
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
    surface: () => ({ kind: 'polyhedron', expr: id, name: label, color: '#d97706' }),
  })),
]

// ---------- 空间曲线预设 ----------

export interface Curve3DPreset {
  id: string
  label: string
  params?: PresetParam[]
  curve: (values: Record<string, number>) => Partial<Omit<Curve3D, 'id' | 'type'>>
}

export const CURVE3D_PRESETS: Curve3DPreset[] = [
  {
    id: 'lorenz',
    label: '洛伦兹吸引子（σ, ρ, β 可调）',
    params: [
      { key: 'sigma', label: 'σ', min: 1, max: 20, step: 0.5, default: 10 },
      { key: 'rho', label: 'ρ', min: 5, max: 60, step: 1, default: 28 },
      { key: 'beta', label: 'β', min: 0.5, max: 6, step: 0.05, default: 8 / 3 },
    ],
    curve: (v) => ({
      kind: 'lorenz',
      expr: 'cos(t)',
      expr2: 'sin(t)',
      expr3: 't/5',
      name: `洛伦兹（σ=${formatCoefficient(v['sigma'] ?? 10)}, ρ=${formatCoefficient(v['rho'] ?? 28)}, β=${formatCoefficient(v['beta'] ?? 8 / 3)}）`,
      steps: 4000,
      color: '#dc2626',
    }),
  },
  {
    id: 'helix',
    label: '螺旋线（半径/螺距可调）',
    params: [
      { key: 'a', label: '半径 a', min: 0.2, max: 3, step: 0.1, default: 1 },
      { key: 'b', label: '螺距 b', min: 0.05, max: 0.8, step: 0.05, default: 0.2 },
    ],
    curve: (v) => ({
      kind: 'parametric',
      expr: scale(v['a'] ?? 1, 'cos(t)'),
      expr2: scale(v['a'] ?? 1, 'sin(t)'),
      expr3: scale(v['b'] ?? 0.2, 't'),
      name: '螺旋线',
      tMin: 0,
      tMax: Math.PI * 6,
      steps: 600,
      color: '#16a34a',
    }),
  },
  {
    id: 'line',
    label: '空间直线 (1+t, 2−t, t/2)',
    curve: () => ({
      kind: 'parametric',
      expr: '1 + t',
      expr2: '2 - t',
      expr3: 't/2',
      name: '空间直线',
      tMin: -3,
      tMax: 3,
      steps: 120,
      color: '#d97706',
    }),
  },
  {
    id: 'torus-knot',
    label: '环面纽结 (2,3)',
    curve: () => ({
      kind: 'parametric',
      expr: '(2 + cos(3*t))*cos(2*t)',
      expr2: '(2 + cos(3*t))*sin(2*t)',
      expr3: 'sin(3*t)',
      name: '环面纽结',
      tMin: 0,
      tMax: Math.PI * 2,
      steps: 600,
      color: '#7c3aed',
    }),
  },
]

// ---------- 向量场预设 ----------

export interface Field3DPreset {
  id: string
  label: string
  params?: PresetParam[]
  field: (values: Record<string, number>) => Partial<Omit<Field3D, 'id' | 'type'>>
}

export const FIELD3D_PRESETS: Field3DPreset[] = [
  {
    id: 'rotation',
    label: '旋转场 (−y, x, 0)（旋度 = 2）',
    field: () => ({
      space: 'space',
      expr: '-y',
      expr2: 'x',
      expr3: '0',
      name: 'F = (−y, x, 0)',
      colorMode: 'curl',
      streamSeeds: 0,
    }),
  },
  {
    id: 'radial',
    label: '径向场 (x, y, z)（散度 = 3）',
    field: () => ({
      space: 'space',
      expr: 'x',
      expr2: 'y',
      expr3: 'z',
      name: 'F = (x, y, z)',
      colorMode: 'divergence',
      divisions: 5,
    }),
  },
  {
    id: 'saddle2d',
    label: '平面场 (x, −y)（鞍点）',
    field: () => ({
      space: 'plane',
      expr: 'x',
      expr2: '-y',
      name: 'F = (x, −y)',
      colorMode: 'none',
      streamSeeds: 12,
    }),
  },
  {
    id: 'oscillator',
    label: '相图：谐振子 (y, −x)',
    field: () => ({
      space: 'plane',
      expr: 'y',
      expr2: '-x',
      name: '谐振子相图',
      colorMode: 'none',
      streamSeeds: 9,
      divisions: 14,
    }),
  },
  {
    id: 'predator',
    label: '相图：捕食者-猎物（系数可调）',
    params: [
      { key: 'alpha', label: 'α（猎物增长）', min: 0.2, max: 2, step: 0.05, default: 1 },
      { key: 'beta', label: 'β（被捕食）', min: 0.1, max: 2, step: 0.05, default: 0.5 },
      { key: 'gamma', label: 'γ（捕食增长）', min: 0.1, max: 2, step: 0.05, default: 0.4 },
      { key: 'delta', label: 'δ（捕食死亡）', min: 0.2, max: 2, step: 0.05, default: 1 },
    ],
    field: (v) => ({
      space: 'plane',
      expr: `x*(${formatCoefficient(v['alpha'] ?? 1)} - ${formatCoefficient(v['beta'] ?? 0.5)}*y)`,
      expr2: `y*(${formatCoefficient(v['gamma'] ?? 0.4)}*x - ${formatCoefficient(v['delta'] ?? 1)})`,
      name: '捕食者-猎物相图',
      colorMode: 'none',
      streamSeeds: 16,
      divisions: 14,
      xMin: -0.5,
      xMax: 5,
      yMin: -0.5,
      yMax: 4,
    }),
  },
]

// ---------- ODE 解预设 ----------

export interface Ode2DPreset {
  id: string
  label: string
  ode: () => Partial<Omit<Ode2D, 'id' | 'type'>>
}

export const ODE2D_PRESETS: Ode2DPreset[] = [
  {
    id: 'exp',
    label: "y' = y",
    ode: () => ({ expr: 'y', name: "y' = y", x0: 0, y0: 1, xEnd: 3, steps: 30 }),
  },
  {
    id: 'x-minus-y',
    label: "y' = x − y",
    ode: () => ({ expr: 'x - y', name: "y' = x − y", x0: 0, y0: 1, xEnd: 5, steps: 40 }),
  },
  {
    id: 'logistic',
    label: "y' = y(1 − y/4)（逻辑斯蒂）",
    ode: () => ({
      expr: 'y*(1 - y/4)',
      name: "y' = y(1 − y/4)",
      x0: 0,
      y0: 0.5,
      xEnd: 12,
      steps: 60,
    }),
  },
  {
    id: 'stiff-ish',
    label: "y' = −10y（快衰减，步长敏感）",
    ode: () => ({
      expr: '-10*y',
      name: "y' = −10y",
      x0: 0,
      y0: 1,
      xEnd: 1,
      steps: 20,
      directionField: false,
    }),
  },
]

// ---------- 统一查找（面板调参用） ----------

export interface PresetDefinition {
  id: string
  label: string
  params?: PresetParam[]
  /** 由参数值生成对象字段（不含 id/type/template） */
  generate: (values: Record<string, number>) => Record<string, unknown>
}

/** 按对象类型与预设 id 查找定义（不存在返回 null） */
export function getPresetDefinition(type: string, presetId: string): PresetDefinition | null {
  if (type === 'surface3d') {
    const preset = SURFACE_PRESETS.find((item) => item.id === presetId)
    return preset
      ? {
          id: preset.id,
          label: preset.label,
          params: preset.params,
          generate: (v) => preset.surface(v),
        }
      : null
  }
  if (type === 'curve3d') {
    const preset = CURVE3D_PRESETS.find((item) => item.id === presetId)
    return preset
      ? {
          id: preset.id,
          label: preset.label,
          params: preset.params,
          generate: (v) => preset.curve(v),
        }
      : null
  }
  if (type === 'field3d') {
    const preset = FIELD3D_PRESETS.find((item) => item.id === presetId)
    return preset
      ? {
          id: preset.id,
          label: preset.label,
          params: preset.params,
          generate: (v) => preset.field(v),
        }
      : null
  }
  return null
}

/** 由预设构造对象绑定（无参数预设返回 undefined） */
export function presetBinding(preset: {
  id: string
  params?: PresetParam[]
}): PresetBinding | undefined {
  if (!preset.params || preset.params.length === 0) return undefined
  return { presetId: preset.id, params: presetDefaults(preset.params) }
}
