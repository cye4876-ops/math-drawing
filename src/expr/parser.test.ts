import { describe, expect, it } from 'vitest'
import {
  makeAssignment as asg,
  makeBinary as bin,
  makeCall as call,
  makeConstant as cnst,
  makeFactorial as fac,
  makeNumber as num,
  makePiecewise as pw,
  makeUnary as un,
  makeVariable as v,
  type Expr,
} from './ast'
import { ExprSyntaxError, formatError } from './errors'
import { parse, parseProgram } from './parser'

describe('parser: 基础与优先级', () => {
  it('加减乘除', () => {
    expect(parse('2x + 3')).toEqual(bin('+', bin('*', num(2), v('x')), num(3)))
    expect(parse('a - b - c')).toEqual(bin('-', bin('-', v('a'), v('b')), v('c')))
    expect(parse('1/2x')).toEqual(bin('/', num(1), bin('*', num(2), v('x'))))
    expect(parse('2x/3')).toEqual(bin('/', bin('*', num(2), v('x')), num(3)))
  })

  it('x^2^3 右结合', () => {
    expect(parse('x^2^3')).toEqual(bin('^', v('x'), bin('^', num(2), num(3))))
  })

  it('-x^2 = -(x^2)（一元负号优先级低于幂）', () => {
    expect(parse('-x^2')).toEqual(un('-', bin('^', v('x'), num(2))))
    expect(parse('-2^2')).toEqual(un('-', bin('^', num(2), num(2))))
  })

  it('(-x)^2 括号显式改变优先级', () => {
    expect(parse('(-x)^2')).toEqual(bin('^', un('-', v('x')), num(2)))
  })

  it('负号可作指数：2^-3、x^-2', () => {
    expect(parse('2^-3')).toEqual(bin('^', num(2), un('-', num(3))))
    expect(parse('x^-2')).toEqual(bin('^', v('x'), un('-', num(2))))
  })

  it('后缀阶乘优先级高于幂：2^3! = 2^(3!)', () => {
    expect(parse('2^3!')).toEqual(bin('^', num(2), fac(num(3))))
    expect(parse('x!^2')).toEqual(bin('^', fac(v('x')), num(2)))
    expect(parse('x!!')).toEqual(fac(fac(v('x'))))
  })

  it('一元正负链', () => {
    expect(parse('--x')).toEqual(un('-', un('-', v('x'))))
    expect(parse('+x')).toEqual(un('+', v('x')))
  })

  it('括号分组与嵌套', () => {
    expect(parse('(x+1)*2')).toEqual(bin('*', bin('+', v('x'), num(1)), num(2)))
    expect(parse('((x))')).toEqual(v('x'))
  })
})

describe('parser: 隐式乘法', () => {
  it('数字×变量：2x', () => {
    expect(parse('2x')).toEqual(bin('*', num(2), v('x')))
    expect(parse('2 x')).toEqual(bin('*', num(2), v('x')))
  })

  it('数字×函数：3sin(x)', () => {
    expect(parse('3sin(x)')).toEqual(bin('*', num(3), call('sin', [v('x')])))
  })

  it('括号相邻：(x+1)(x-1)', () => {
    expect(parse('(x+1)(x-1)')).toEqual(
      bin('*', bin('+', v('x'), num(1)), bin('-', v('x'), num(1))),
    )
  })

  it('数字×括号：2(x+1)', () => {
    expect(parse('2(x+1)')).toEqual(bin('*', num(2), bin('+', v('x'), num(1))))
  })

  it('变量相邻与变量×数字：xy、x2', () => {
    expect(parse('xy')).toEqual(bin('*', v('x'), v('y')))
    expect(parse('x2')).toEqual(bin('*', v('x'), num(2)))
  })

  it('函数调用后的隐式乘法：sin(x)cos(x)', () => {
    expect(parse('sin(x)cos(x)')).toEqual(bin('*', call('sin', [v('x')]), call('cos', [v('x')])))
  })

  it('常量参与隐式乘法：2pi、pi(2)', () => {
    expect(parse('2pi')).toEqual(bin('*', num(2), cnst('pi')))
    expect(parse('pi(2)')).toEqual(bin('*', cnst('pi'), num(2)))
  })

  it('隐式乘法优先级高于乘除：2x^2 = 2·(x^2)', () => {
    expect(parse('2x^2')).toEqual(bin('*', num(2), bin('^', v('x'), num(2))))
  })

  it('一元负号与隐式乘法：-2x = (-2)·x', () => {
    expect(parse('-2x')).toEqual(bin('*', un('-', num(2)), v('x')))
  })

  it('两个数字相邻报错（2 3）', () => {
    try {
      parse('2 3')
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprSyntaxError)
      expect((error as ExprSyntaxError).details.message).toContain('两个数字之间缺少运算符')
    }
  })

  it('2^2 3 同样报错（数字字面量直接相邻）', () => {
    expect(() => parse('2^2 3')).toThrowError(/两个数字之间缺少运算符/)
  })
})

describe('parser: 赋值与比较', () => {
  it('顶层 变量=表达式 解析为赋值', () => {
    expect(parse('a = 3')).toEqual(asg('a', num(3)))
    expect(parse('a = b + 1')).toEqual(asg('a', bin('+', v('b'), num(1))))
    expect(parse('x = 1')).toEqual(asg('x', num(1)))
  })

  it('左侧不是简单变量时为比较运算', () => {
    expect(parse('x^2 = 4')).toEqual(bin('=', bin('^', v('x'), num(2)), num(4)))
    expect(parse('2 = 3')).toEqual(bin('=', num(2), num(3)))
  })

  it('比较运算符', () => {
    expect(parse('x < 0')).toEqual(bin('<', v('x'), num(0)))
    expect(parse('x >= 1')).toEqual(bin('>=', v('x'), num(1)))
    expect(parse('a != b')).toEqual(bin('!=', v('a'), v('b')))
    expect(parse('1 <= x')).toEqual(bin('<=', num(1), v('x')))
  })
})

describe('parser: 函数调用', () => {
  it('一元与多元函数', () => {
    expect(parse('sin(x)')).toEqual(call('sin', [v('x')]))
    expect(parse('log(x, 2)')).toEqual(call('log', [v('x'), num(2)]))
    expect(parse('atan2(y, x)')).toEqual(call('atan2', [v('y'), v('x')]))
    expect(parse('min(1, 2, 3)')).toEqual(call('min', [num(1), num(2), num(3)]))
  })

  it('嵌套函数调用', () => {
    expect(parse('sin(cos(x))')).toEqual(call('sin', [call('cos', [v('x')])]))
  })

  it('参数可为完整表达式', () => {
    expect(parse('sin(2x + 1)')).toEqual(call('sin', [bin('+', bin('*', num(2), v('x')), num(1))]))
  })

  it('函数名后缺括号给出提示', () => {
    try {
      parse('sin x')
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprSyntaxError)
      const details = (error as ExprSyntaxError).details
      expect(details.message).toContain('函数 sin 需要括号调用')
      expect(details.hint).toBe('改为 sin(x)')
    }
  })

  it('参数个数不足/过多在解析期报错', () => {
    expect(() => parse('sin()')).toThrowError(/需要 1 个参数，实际提供了 0 个/)
    expect(() => parse('sin(x, y)')).toThrowError(/需要 1 个参数，实际提供了 2 个/)
    expect(() => parse('log()')).toThrowError(/需要 1~2 个参数/)
    expect(() => parse('min()')).toThrowError(/至少 1 个参数/)
    expect(() => parse('clamp(1, 2)')).toThrowError(/需要 3 个参数/)
  })
})

describe('parser: 分段函数', () => {
  it('基本分段：{x < 0: -x, x >= 0: x}', () => {
    expect(parse('{x < 0: -x, x >= 0: x}')).toEqual(
      pw([
        { condition: bin('<', v('x'), num(0)), value: un('-', v('x')) },
        { condition: bin('>=', v('x'), num(0)), value: v('x') },
      ]),
    )
  })

  it('单个分支', () => {
    expect(parse('{x < 0: -x}')).toEqual(
      pw([{ condition: bin('<', v('x'), num(0)), value: un('-', v('x')) }]),
    )
  })

  it('分支值可为嵌套分段与函数', () => {
    const parsed = parse('{x < 0: {y < 0: 1, y >= 0: 2}, x >= 0: sin(x)}')
    expect(parsed.type).toBe('piecewise')
    if (parsed.type === 'piecewise') {
      expect(parsed.cases.length).toBe(2)
      expect(parsed.cases[0]?.value.type).toBe('piecewise')
      expect(parsed.cases[1]?.value).toEqual(call('sin', [v('x')]))
    }
  })

  it('分段可参与四则运算', () => {
    const parsed = parse('2 * {x < 0: 1, x >= 0: 2} + 1')
    expect(parsed.type).toBe('binary')
  })

  it('错误：空分段', () => {
    expect(() => parse('{}')).toThrowError(/分段函数至少需要一个分支/)
  })

  it('错误：缺少冒号', () => {
    expect(() => parse('{x < 0}')).toThrowError(/分段函数缺少 ':'/)
  })

  it('错误：未闭合', () => {
    expect(() => parse('{x < 0: 1')).toThrowError(/期望 '}'/)
  })
})

describe('parser: 错误定位与提示', () => {
  it('多余的右括号（规格示例）', () => {
    const source = 'sin(x)) + 1'
    try {
      parse(source)
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprSyntaxError)
      const syntaxError = error as ExprSyntaxError
      expect(syntaxError.details.start.column).toBe(7)
      expect(syntaxError.details.hint).toBe('括号可能多余')

      const rendered = formatError(source, syntaxError)
      expect(rendered).toContain('错误：第 1 行第 7 列')
      expect(rendered).toContain('sin(x)) + 1')
      expect(rendered).toContain('^')
      expect(rendered).toContain('提示：括号可能多余')
    }
  })

  it('未闭合的左括号', () => {
    try {
      parse('sin(x')
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprSyntaxError)
      expect((error as ExprSyntaxError).details.hint).toBe('括号未闭合')
    }
  })

  it('运算符后缺少操作数', () => {
    try {
      parse('2 +')
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprSyntaxError)
      const details = (error as ExprSyntaxError).details
      expect(details.message).toContain('表达式意外结束')
      expect(details.hint).toContain('缺失的操作数')
    }
  })

  it('空输入报错', () => {
    expect(() => parse('')).toThrowError(/表达式不能为空/)
    expect(() => parse('   ')).toThrowError(/表达式不能为空/)
  })

  it('空括号报错', () => {
    expect(() => parse('()')).toThrowError(/期望表达式/)
  })

  it('词法错误从 parse 中抛出', () => {
    expect(() => parse('x @ y')).toThrowError(ExprSyntaxError)
  })

  it("'[' 给出明确提示", () => {
    expect(() => parse('[1+2]')).toThrowError(/暂不支持 '\['/)
  })
})

describe('parser: 多语句（parseProgram）', () => {
  it('分号分隔的多条语句', () => {
    expect(parseProgram('a = 1; b = 2')).toEqual([asg('a', num(1)), asg('b', num(2))])
  })

  it('允许结尾分号', () => {
    expect(parseProgram('a = 1;')).toEqual([asg('a', num(1))])
  })

  it('单表达式也返回数组', () => {
    expect(parseProgram('2x')).toEqual([bin('*', num(2), v('x'))])
  })

  it('parse 不接受多条语句', () => {
    expect(() => parse('a = 1; b = 2')).toThrowError(ExprSyntaxError)
  })
})

describe('parser: 综合表达式', () => {
  it('规格验收表达式：sin(x)^2 + cos(x)^2', () => {
    expect(parse('sin(x)^2 + cos(x)^2')).toEqual(
      bin('+', bin('^', call('sin', [v('x')]), num(2)), bin('^', call('cos', [v('x')]), num(2))),
    )
  })

  it('规格验收表达式：1e-3 * x', () => {
    expect(parse('1e-3 * x')).toEqual(bin('*', num(0.001), v('x')))
  })

  it('规格验收表达式：.5x', () => {
    expect(parse('.5x')).toEqual(bin('*', num(0.5), v('x')))
  })

  it('θ 变量', () => {
    expect(parse('θ + 1')).toEqual(bin('+', v('theta'), num(1)))
    expect(parse('sin(θ)')).toEqual(call('sin', [v('theta')]))
  })

  it('复杂混合表达式可解析', () => {
    const source = 'a*sin(b*x + c) - {x < 0: 1, x >= 0: x^2}/2'
    const parsed = parse(source)
    expect(parsed.type).toBe('binary')
  })

  it('比较链左结合', () => {
    expect(parse('1 < 2 < 3')).toEqual(bin('<', bin('<', num(1), num(2)), num(3)))
  })

  it('一元负号与函数参数：sin(-x)', () => {
    expect(parse('sin(-x)')).toEqual(call('sin', [un('-', v('x'))]))
  })

  it('深嵌套', () => {
    const source = 'sqrt(sin(x)^2 + cos(x)^2)'
    const parsed: Expr = parse(source)
    expect(parsed.type).toBe('call')
  })
})
