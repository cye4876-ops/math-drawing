import { describe, expect, it } from 'vitest'
import { ExprSyntaxError } from './errors'
import { FUNCTIONS } from './functions'
import { tokenize, type Token } from './lexer'

function summarize(source: string): [string, string][] {
  return tokenize(source).map((t) => [t.type, t.text])
}

function values(source: string): number[] {
  return tokenize(source)
    .filter((t) => t.type === 'number')
    .map((t) => t.value ?? NaN)
}

describe('lexer: 数字', () => {
  it('整数与小数', () => {
    expect(values('42')).toEqual([42])
    expect(values('3.14')).toEqual([3.14])
    expect(values('.5')).toEqual([0.5])
    expect(values('2.')).toEqual([2])
  })

  it('科学计数法', () => {
    expect(values('1e-3')).toEqual([0.001])
    expect(values('2e3')).toEqual([2000])
    expect(values('2E+2')).toEqual([200])
    expect(values('1.5e2')).toEqual([150])
  })

  it('2e 是 2 * e（科学计数法仅当 e 后紧跟数字或符号+数字）', () => {
    expect(summarize('2e')).toEqual([
      ['number', '2'],
      ['identifier', 'e'],
      ['eof', ''],
    ])
    expect(summarize('2e+3')).toEqual([
      ['number', '2e+3'],
      ['eof', ''],
    ])
    expect(summarize('2e+x')).toEqual([
      ['number', '2'],
      ['identifier', 'e'],
      ['operator', '+'],
      ['identifier', 'x'],
      ['eof', ''],
    ])
    expect(summarize('2e + 3')).toEqual([
      ['number', '2'],
      ['identifier', 'e'],
      ['operator', '+'],
      ['number', '3'],
      ['eof', ''],
    ])
  })

  it('数字的数值解析正确', () => {
    const tokens = tokenize('0.25 1e2 .5')
    expect(tokens[0]?.value).toBe(0.25)
    expect(tokens[1]?.value).toBe(100)
    expect(tokens[2]?.value).toBe(0.5)
  })
})

describe('lexer: 标识符与已知词', () => {
  it('已知函数名作为整体识别', () => {
    expect(summarize('sqrt')).toEqual([
      ['identifier', 'sqrt'],
      ['eof', ''],
    ])
    expect(summarize('sinh')).toEqual([
      ['identifier', 'sinh'],
      ['eof', ''],
    ])
    expect(summarize('log10')).toEqual([
      ['identifier', 'log10'],
      ['eof', ''],
    ])
  })

  it('未知字母序列拆分为单字母变量', () => {
    expect(summarize('xy')).toEqual([
      ['identifier', 'x'],
      ['identifier', 'y'],
      ['eof', ''],
    ])
    expect(summarize('abc')).toEqual([
      ['identifier', 'a'],
      ['identifier', 'b'],
      ['identifier', 'c'],
      ['eof', ''],
    ])
  })

  it('已知词优先最长匹配：sinx → sin + x', () => {
    expect(summarize('sinx')).toEqual([
      ['identifier', 'sin'],
      ['identifier', 'x'],
      ['eof', ''],
    ])
    expect(summarize('log2x')).toEqual([
      ['identifier', 'log2'],
      ['identifier', 'x'],
      ['eof', ''],
    ])
  })

  it('完整词优先：运行时注册的函数名整体识别（logistic 不被 log 前缀吞掉）', () => {
    const backup = FUNCTIONS['logistic']
    FUNCTIONS['logistic'] = {
      name: 'logistic',
      minArgs: 1,
      maxArgs: 1,
      signature: 'logistic(x)',
      differentiable: true,
      fn: (x) => 1 / (1 + Math.exp(-x)),
    }
    try {
      expect(summarize('logistic(x)')).toEqual([
        ['identifier', 'logistic'],
        ['lparen', '('],
        ['identifier', 'x'],
        ['rparen', ')'],
        ['eof', ''],
      ])
      expect(summarize('2*logistic(0)')).toEqual([
        ['number', '2'],
        ['operator', '*'],
        ['identifier', 'logistic'],
        ['lparen', '('],
        ['number', '0'],
        ['rparen', ')'],
        ['eof', ''],
      ])
    } finally {
      if (backup === undefined) delete FUNCTIONS['logistic']
      else FUNCTIONS['logistic'] = backup
    }
  })

  it('未注册的形似词回退原有行为：logistic2 → log + i + s + t + i + c + 2', () => {
    expect(summarize('logistic2')).toEqual([
      ['identifier', 'log'],
      ['identifier', 'i'],
      ['identifier', 's'],
      ['identifier', 't'],
      ['identifier', 'i'],
      ['identifier', 'c'],
      ['number', '2'],
      ['eof', ''],
    ])
  })

  it('常量名作为整体识别：pi、phi、tau', () => {
    expect(summarize('pix')).toEqual([
      ['identifier', 'pi'],
      ['identifier', 'x'],
      ['eof', ''],
    ])
    expect(summarize('phi')).toEqual([
      ['identifier', 'phi'],
      ['eof', ''],
    ])
    expect(summarize('tau')).toEqual([
      ['identifier', 'tau'],
      ['eof', ''],
    ])
  })

  it('希腊字母别名：θ→theta、π→pi、φ→phi、τ→tau', () => {
    expect(summarize('θ')).toEqual([
      ['identifier', 'theta'],
      ['eof', ''],
    ])
    expect(summarize('πx')).toEqual([
      ['identifier', 'pi'],
      ['identifier', 'x'],
      ['eof', ''],
    ])
    expect(summarize('φ')).toEqual([
      ['identifier', 'phi'],
      ['eof', ''],
    ])
    expect(summarize('τ')).toEqual([
      ['identifier', 'tau'],
      ['eof', ''],
    ])
  })

  it('单个 e 是标识符（常量由语法层识别）', () => {
    expect(summarize('e')).toEqual([
      ['identifier', 'e'],
      ['eof', ''],
    ])
  })

  it('大小写敏感', () => {
    expect(summarize('X')).toEqual([
      ['identifier', 'X'],
      ['eof', ''],
    ])
    expect(summarize('Sin')).toEqual([
      ['identifier', 'S'],
      ['identifier', 'i'],
      ['identifier', 'n'],
      ['eof', ''],
    ])
  })
})

describe('lexer: 运算符与分隔符', () => {
  it('单字符运算符', () => {
    expect(summarize('+-*/^%!< > =')).toEqual([
      ['operator', '+'],
      ['operator', '-'],
      ['operator', '*'],
      ['operator', '/'],
      ['operator', '^'],
      ['operator', '%'],
      ['operator', '!'],
      ['operator', '<'],
      ['operator', '>'],
      ['operator', '='],
      ['eof', ''],
    ])
  })

  it('双字符比较运算符', () => {
    expect(summarize('<=>=')).toEqual([
      ['operator', '<='],
      ['operator', '>='],
      ['eof', ''],
    ])
    expect(summarize('!=')).toEqual([
      ['operator', '!='],
      ['eof', ''],
    ])
  })

  it('分隔符集合', () => {
    expect(summarize('()[]{},;:')).toEqual([
      ['lparen', '('],
      ['rparen', ')'],
      ['lbracket', '['],
      ['rbracket', ']'],
      ['lbrace', '{'],
      ['rbrace', '}'],
      ['comma', ','],
      ['semicolon', ';'],
      ['colon', ':'],
      ['eof', ''],
    ])
  })

  it('空白被跳过', () => {
    expect(summarize('  1\t+\n2  ')).toEqual([
      ['number', '1'],
      ['operator', '+'],
      ['number', '2'],
      ['eof', ''],
    ])
  })
})

describe('lexer: 位置追踪', () => {
  it('token 记录起止行列', () => {
    const tokens = tokenize('2x')
    expect(tokens[0]?.start).toEqual({ offset: 0, line: 1, column: 1 })
    expect(tokens[0]?.end.column).toBe(2)
    expect(tokens[1]?.start).toEqual({ offset: 1, line: 1, column: 2 })
  })

  it('多行位置正确', () => {
    const tokens = tokenize('x +\n y')
    const y = tokens.find((t) => t.text === 'y') as Token
    expect(y.start.line).toBe(2)
    expect(y.start.column).toBe(2)
  })

  it('eof token 位于输入末尾', () => {
    const tokens = tokenize('1+2')
    const eof = tokens[tokens.length - 1] as Token
    expect(eof.type).toBe('eof')
    expect(eof.start.offset).toBe(3)
  })
})

describe('lexer: 错误', () => {
  it('无法识别的字符', () => {
    try {
      tokenize('1 @ 2')
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprSyntaxError)
      const details = (error as ExprSyntaxError).details
      expect(details.message).toContain("无法识别的字符 '@'")
      expect(details.start.column).toBe(3)
    }
  })

  it('中文字符给出专门提示', () => {
    try {
      tokenize('x中')
      expect.unreachable('应当抛出错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ExprSyntaxError)
      expect((error as ExprSyntaxError).details.hint).toContain('希腊字母')
    }
  })

  it('孤立的小数点报错', () => {
    expect(() => tokenize('.')).toThrowError(ExprSyntaxError)
  })
})
