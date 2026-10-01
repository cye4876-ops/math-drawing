/**
 * 参数化预设测试（v0.8.1）：表达式生成（系数/符号/特判）、默认值、
 * 统一定义查找、以及 template 绑定的序列化往返。
 */
import { describe, expect, it } from 'vitest'
import { deserializeDocument, serializeDocument } from '../state/serialize'
import { createView } from '../core/transform'
import {
  CURVE3D_PRESETS,
  FIELD3D_PRESETS,
  SURFACE_PRESETS,
  createCurve3D,
  createSurface3D,
  formatCoefficient,
  getPresetDefinition,
  presetBinding,
  presetDefaults,
} from './objects'

function surfacePreset(id: string) {
  const preset = SURFACE_PRESETS.find((item) => item.id === id)
  if (!preset) throw new Error(`缺少预设 ${id}`)
  return preset
}

describe('v0.8.1 参数化预设：表达式生成', () => {
  it('平面：默认 z = 0.5x + 0.3y + 1；系数为 0 省略项；负系数正确', () => {
    const preset = surfacePreset('plane')
    const defaults = presetDefaults(preset.params)
    expect(preset.surface(defaults).expr).toBe('0.5*x + 0.3*y + 1')
    expect(preset.surface({ a: 0, b: 0.3, c: 1 }).expr).toBe('0.3*y + 1')
    expect(preset.surface({ a: -2, b: 0, c: 0 }).expr).toBe('-2*x')
    expect(preset.surface({ a: 0, b: 0, c: 0 }).expr).toBe('0')
    expect(preset.surface({ a: 1, b: -1, c: 2 }).expr).toBe('x - y + 2')
  })

  it('椭球：半轴并入表达式（1 省略系数）', () => {
    const preset = surfacePreset('ellipsoid')
    const defaults = preset.surface(presetDefaults(preset.params))
    expect(defaults.expr).toBe('2*sin(u)*cos(v)')
    expect(defaults.expr2).toBe('1.4*sin(u)*sin(v)')
    expect(defaults.expr3).toBe('cos(u)')
    const stretched = preset.surface({ a: 1, b: 1.4, c: 3 })
    expect(stretched.expr).toBe('sin(u)*cos(v)')
    expect(stretched.expr3).toBe('3*cos(u)')
    expect(String(stretched.name)).toContain('c=3')
  })

  it('环面：R、r 并入径向因子', () => {
    const preset = surfacePreset('torus')
    const defaults = preset.surface(presetDefaults(preset.params))
    expect(defaults.expr).toBe('(2 + 0.7*cos(v))*cos(u)')
    expect(defaults.expr3).toBe('0.7*sin(v)')
  })

  it('隐式球：R 平方并入常数项且范围随 R 缩放', () => {
    const preset = surfacePreset('sphere-implicit')
    const unit = preset.surface({ R: 1 })
    expect(unit.expr).toBe('x^2 + y^2 + z^2 - 1')
    expect(unit.xMax).toBeCloseTo(1.3, 12)
    const doubled = preset.surface({ R: 2 })
    expect(doubled.expr).toBe('x^2 + y^2 + z^2 - 4')
    expect(doubled.xMax).toBeCloseTo(2.6, 12)
  })

  it('单叶双曲面：系数 1 写 x^2，否则 (x/a)^2', () => {
    const preset = surfacePreset('hyperboloid')
    expect(preset.surface({ a: 1, b: 1, c: 1 }).expr).toBe('x^2 + y^2 - z^2 - 1')
    expect(preset.surface({ a: 2, b: 1, c: 1 }).expr).toBe('(x/2)^2 + y^2 - z^2 - 1')
  })

  it('sin·cos：振幅与频率并入表达式', () => {
    const preset = surfacePreset('sincos')
    const defaults = preset.surface(presetDefaults(preset.params))
    expect(defaults.expr).toBe('sin(x)*cos(y)')
    expect(preset.surface({ a: 1.5, b: 2, c: 1 }).expr).toBe('1.5*sin(2*x)*cos(y)')
  })

  it('洛伦兹：σ/ρ/β 默认值与名称', () => {
    const preset = CURVE3D_PRESETS.find((item) => item.id === 'lorenz')!
    const created = preset.curve(presetDefaults(preset.params))
    expect(String(created.name)).toContain('σ=10')
    expect(String(created.name)).toContain('ρ=28')
    // β = 8/3 ≈ 2.667（三位小数格式化）
    expect(String(created.name)).toContain('β=2.667')
  })

  it('捕食者-猎物：四系数并入场表达式', () => {
    const preset = FIELD3D_PRESETS.find((item) => item.id === 'predator')!
    const defaults = preset.field(presetDefaults(preset.params))
    expect(defaults.expr).toBe('x*(1 - 0.5*y)')
    expect(defaults.expr2).toBe('y*(0.4*x - 1)')
    const changed = preset.field({ alpha: 2, beta: 1, gamma: 0.2, delta: 0.5 })
    expect(changed.expr).toBe('x*(2 - 1*y)')
    expect(changed.expr2).toBe('y*(0.2*x - 0.5)')
  })

  it('formatCoefficient：去尾零与 -0 归一', () => {
    expect(formatCoefficient(0.5)).toBe('0.5')
    expect(formatCoefficient(2)).toBe('2')
    expect(formatCoefficient(-0)).toBe('0')
    expect(formatCoefficient(1 / 3)).toBe('0.333')
  })
})

describe('v0.8.1 参数化预设：查找与绑定', () => {
  it('getPresetDefinition：正确查找与 null 边界', () => {
    expect(getPresetDefinition('surface3d', 'plane')?.label).toContain('平面')
    expect(getPresetDefinition('curve3d', 'lorenz')?.params).toHaveLength(3)
    expect(getPresetDefinition('field3d', 'predator')?.params).toHaveLength(4)
    expect(getPresetDefinition('surface3d', 'nope')).toBeNull()
    expect(getPresetDefinition('ode2d', 'exp')).toBeNull()
  })

  it('presetBinding：无参数预设返回 undefined；有参数预设带默认值', () => {
    expect(presetBinding(surfacePreset('revolve-parabola'))).toBeUndefined()
    expect(presetBinding(surfacePreset('cube'))).toBeUndefined()
    const binding = presetBinding(surfacePreset('plane'))
    expect(binding?.presetId).toBe('plane')
    expect(binding?.params['a']).toBeCloseTo(0.5, 12)
  })
})

describe('v0.8.1 参数化预设：序列化往返', () => {
  it('template 绑定随文档保存与恢复', () => {
    const preset = surfacePreset('ellipsoid')
    const object = createSurface3D({
      ...preset.surface(presetDefaults(preset.params)),
      template: presetBinding(preset),
    })
    const json = serializeDocument({ objects: [object] }, createView())
    const restored = deserializeDocument(json)
    const first = restored.doc.objects[0]!
    expect(first.type).toBe('surface3d')
    if (first.type === 'surface3d') {
      expect(first.template?.presetId).toBe('ellipsoid')
      expect(first.template?.params['a']).toBeCloseTo(2, 12)
      expect(first.expr).toBe('2*sin(u)*cos(v)')
    }
  })

  it('无 template 的对象不提造该字段；非法 template 被忽略', () => {
    const plain = createSurface3D({ expr: 'x + y' })
    const json = serializeDocument({ objects: [plain] }, createView())
    const restored = deserializeDocument(json)
    const first = restored.doc.objects[0]!
    if (first.type === 'surface3d') expect(first.template).toBeUndefined()

    // 手工注入非法 template
    const raw = JSON.parse(json) as { objects: Record<string, unknown>[] }
    raw.objects[0]!['template'] = { presetId: 42, params: { a: 'x' } }
    const restoredBad = deserializeDocument(JSON.stringify(raw))
    const bad = restoredBad.doc.objects[0]!
    if (bad.type === 'surface3d') expect(bad.template).toBeUndefined()
  })

  it('洛伦兹曲线 template（σ/ρ/β）往返保真', () => {
    const preset = CURVE3D_PRESETS.find((item) => item.id === 'lorenz')!
    const curve = createCurve3D({
      ...preset.curve(presetDefaults(preset.params)),
      template: presetBinding(preset),
    })
    const json = serializeDocument({ objects: [curve] }, createView())
    const restored = deserializeDocument(json)
    const first = restored.doc.objects[0]!
    if (first.type === 'curve3d') {
      expect(first.template?.presetId).toBe('lorenz')
      expect(first.template?.params['rho']).toBeCloseTo(28, 12)
    }
  })
})
