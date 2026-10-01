import { describe, expect, it } from 'vitest'
import {
  collectFreeVariables,
  containsVariable,
  deserializeExpr,
  makeCall,
  makeNumber,
  serializeExpr,
} from './ast'
import { ExprFormatError } from './errors'
import { evaluate } from './evaluate'
import { parse } from './parser'

const SOURCES = [
  '2x + 3',
  'sin(x)^2 + cos(x)^2',
  'x^2^3',
  '-x^2',
  '2^3!',
  '{x < 0: -x, x >= 0: x}',
  'log(x, 2)',
  '1e-3 * x',
  'a*sin(b*x + c)',
  '2pi + e',
]

function assertSameNumber(a: number, b: number): void {
  const same = Number.isNaN(a) ? Number.isNaN(b) : a === b
  expect(same, `期望相等：${a} vs ${b}`).toBe(true)
}

describe('ast: 序列化往返（无损）', () => {
  for (const source of SOURCES) {
    it(`JSON 往返后 AST 相等：${source}`, () => {
      const original = parse(source)
      const restored = deserializeExpr(serializeExpr(original))
      expect(restored).toEqual(original)
    })
  }

  it('往返后求值结果一致', () => {
    const scope = { x: 0.7, a: 1.2, b: 2, c: 0.5 }
    for (const source of SOURCES) {
      const original = parse(source)
      const restored = deserializeExpr(serializeExpr(original))
      assertSameNumber(evaluate(restored, { ...scope }), evaluate(original, { ...scope }))
    }
  })

  it('序列化结果是合法 JSON（纯数据）', () => {
    const json = serializeExpr(parse('sin(x) + 1'))
    expect(() => JSON.parse(json)).not.toThrow()
    expect(json).not.toContain('function')
  })
})

describe('ast: 反序列化校验', () => {
  const invalid: [string, string][] = [
    ['[]', '节点必须是对象'],
    ['{}', '未知节点类型'],
    ['{"type":"number","value":null}', '有限数'],
    ['{"type":"number","value":"1"}', '有限数'],
    ['{"type":"constant","name":"euler"}', '未知常量'],
    ['{"type":"variable"}', '缺少 name'],
    ['{"type":"unary","op":"*","operand":{"type":"number","value":1}}', '未知一元运算符'],
    [
      '{"type":"binary","op":"&&","left":{"type":"number","value":1},"right":{"type":"number","value":1}}',
      '未知二元运算符',
    ],
    ['{"type":"call","name":"","args":[]}', '缺少 name'],
    ['{"type":"call","name":"sin","args":{}}', 'args 必须是数组'],
    ['{"type":"piecewise","cases":[]}', '至少需要一个分支'],
    ['{"type":"factorial"}', 'operand'],
    ['{"type":"assignment","name":"","value":{"type":"number","value":1}}', '缺少 name'],
  ]

  for (const [json, fragment] of invalid) {
    it(`拒绝无效 AST：${json.slice(0, 40)}`, () => {
      try {
        deserializeExpr(json)
        expect.unreachable('应当抛出错误')
      } catch (error) {
        expect(error).toBeInstanceOf(ExprFormatError)
        expect((error as Error).message).toContain(fragment)
      }
    })
  }

  it('非 JSON 输入报错', () => {
    expect(() => deserializeExpr('not json')).toThrowError(ExprFormatError)
  })

  it('深层嵌套的非法节点也能被定位', () => {
    const json =
      '{"type":"call","name":"sin","args":[{"type":"number","value":0},{"type":"number","value":1}]}'
    // 该 JSON 数值非法不存在，构造一个更深层的：
    const bad = '{"type":"unary","op":"-","operand":{"type":"constant","name":"nope"}}'
    expect(bad).not.toBe(json)
    try {
      deserializeExpr(bad)
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect((error as Error).message).toContain('$.operand')
    }
  })
})

describe('ast: 自由变量收集', () => {
  const cases: [string, string[]][] = [
    ['a*sin(b*x + c)', ['a', 'b', 'c', 'x']],
    ['pi*x + e', ['x']],
    ['theta*x', ['theta', 'x']],
    ['a = 3', []],
    ['a = b + 1', ['b']],
    ['{x < 0: -x, t > 0: k}', ['k', 't', 'x']],
    ['2x + 2y + x', ['x', 'y']],
    ['2 + 3', []],
    ['log(x, 2)', ['x']],
  ]

  for (const [source, expected] of cases) {
    it(`收集自由变量：${source}`, () => {
      expect(collectFreeVariables(parse(source))).toEqual(expected)
    })
  }
})

describe('ast: containsVariable', () => {
  it('基本命中与未命中', () => {
    expect(containsVariable(parse('sin(a*x)'), 'a')).toBe(true)
    expect(containsVariable(parse('sin(a*x)'), 'b')).toBe(false)
  })

  it('赋值定义名不算引用', () => {
    expect(containsVariable(parse('a = b'), 'a')).toBe(false)
    expect(containsVariable(parse('a = b'), 'b')).toBe(true)
  })

  it('分段函数各分支都参与检查', () => {
    expect(containsVariable(parse('{x < 0: t, x >= 0: 1}'), 't')).toBe(true)
  })

  it('函数参数参与检查', () => {
    expect(containsVariable(makeCall('sin', [makeNumber(1)]), 'sin')).toBe(false)
    expect(containsVariable(parse('cos(phi)'), 'phi')).toBe(false) // phi 是常量
  })
})
