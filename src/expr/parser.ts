/**
 * 语法分析器：Token 序列 → AST（递归下降）。
 *
 * 优先级（从低到高，见 docs/expr-syntax.md）：
 *   比较 = != < <= > >= < 加减 < 乘除模 < 隐式乘法 < 一元正负 < 幂(右结合) < 后缀阶乘 < 原子
 *
 * 隐式乘法规则：相邻的"原子因子"自动相乘（2x、3sin(x)、(x+1)(x-1)、x y）；
 * 两个数字字面量直接相邻是错误（2 3 → 报错）。
 * 顶层形如 `变量 = 表达式` 的语句解析为 Assignment（参数定义）；其余 `=` 保持比较运算。
 */
import {
  isConstantName,
  makeAssignment,
  makeBinary,
  makeCall,
  makeConstant,
  makeFactorial,
  makeNumber,
  makePiecewise,
  makeUnary,
  makeVariable,
  type BinaryOperator,
  type Expr,
  type PiecewiseCase,
} from './ast'
import { ExprSyntaxError } from './errors'
import { FUNCTIONS, describeArity } from './functions'
import { tokenize, type Token } from './lexer'

const COMPARISON_OPS = new Set<string>(['=', '!=', '<', '<=', '>', '>='])

/** 解析单个表达式（不允许语句分隔符 ;） */
export function parse(source: string): Expr {
  return new Parser(tokenize(source)).parseSingle()
}

/** 解析以 ; 分隔的多条语句（参数定义场景） */
export function parseProgram(source: string): Expr[] {
  return new Parser(tokenize(source)).parseAll()
}

interface ErrorExtra {
  expected?: string
  actual?: string
  hint?: string
}

class Parser {
  private readonly tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parseSingle(): Expr {
    if (this.peek().type === 'eof') {
      this.error(this.peek(), '表达式不能为空', { hint: '请输入数学表达式，例如 2x + 1' })
    }
    const expr = this.parseStatement()
    const next = this.peek()
    if (next.type !== 'eof') {
      const hint = next.type === 'rparen' ? '括号可能多余' : undefined
      this.error(next, '期望运算符或表达式结束', {
        expected: '运算符或表达式结束',
        actual: this.describe(next),
        ...(hint !== undefined ? { hint } : {}),
      })
    }
    return expr
  }

  parseAll(): Expr[] {
    if (this.peek().type === 'eof') {
      this.error(this.peek(), '表达式不能为空', { hint: '请输入数学表达式，例如 2x + 1' })
    }
    const expressions: Expr[] = [this.parseStatement()]
    while (this.peek().type === 'semicolon') {
      this.consume()
      if (this.peek().type === 'eof') break // 允许结尾分号
      expressions.push(this.parseStatement())
    }
    const next = this.peek()
    if (next.type !== 'eof') {
      this.error(next, '期望运算符、表达式结束或 ;', {
        expected: '运算符、; 或输入结束',
        actual: this.describe(next),
      })
    }
    return expressions
  }

  // ---------- 语句与运算优先级 ----------

  private parseStatement(): Expr {
    const expr = this.parseComparison()
    // 顶层 `变量 = 表达式` 视为参数定义
    if (expr.type === 'binary' && expr.op === '=' && expr.left.type === 'variable') {
      return makeAssignment(expr.left.name, expr.right)
    }
    return expr
  }

  private parseComparison(): Expr {
    let left = this.parseAdditive()
    for (;;) {
      const t = this.peek()
      if (t.type !== 'operator' || !COMPARISON_OPS.has(t.text)) break
      this.consume()
      const right = this.parseAdditive()
      left = makeBinary(t.text as BinaryOperator, left, right)
    }
    return left
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative()
    for (;;) {
      const t = this.peek()
      if (t.type !== 'operator' || (t.text !== '+' && t.text !== '-')) break
      this.consume()
      const right = this.parseMultiplicative()
      left = makeBinary(t.text, left, right)
    }
    return left
  }

  private parseMultiplicative(): Expr {
    let left = this.parseImplicit()
    for (;;) {
      const t = this.peek()
      if (t.type !== 'operator' || (t.text !== '*' && t.text !== '/' && t.text !== '%')) break
      this.consume()
      const right = this.parseImplicit()
      left = makeBinary(t.text, left, right)
    }
    return left
  }

  /** 隐式乘法：相邻原子因子自动相乘；两个数字字面量相邻报错 */
  private parseImplicit(): Expr {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      const startsAtom = t.type === 'number' || t.type === 'identifier' || t.type === 'lparen'
      if (!startsAtom) break

      const previous = this.previous()
      if (previous !== null && previous.type === 'number' && t.type === 'number') {
        this.error(t, '两个数字之间缺少运算符', {
          expected: '运算符',
          actual: this.describe(t),
          hint: '隐式乘法可写 2x、2(x+1)；两个数字之间请显式书写运算符，如 2*3',
        })
      }

      const right = this.parseUnary()
      left = makeBinary('*', left, right)
    }
    return left
  }

  private parseUnary(): Expr {
    const t = this.peek()
    if (t.type === 'operator' && (t.text === '+' || t.text === '-')) {
      this.consume()
      return makeUnary(t.text, this.parseUnary())
    }
    return this.parsePower()
  }

  /** 幂运算：右结合（2^3^2 = 2^(3^2)），指数允许一元正负（2^-3） */
  private parsePower(): Expr {
    const base = this.parsePostfix()
    const t = this.peek()
    if (t.type === 'operator' && t.text === '^') {
      this.consume()
      const exponent = this.parseUnary()
      return makeBinary('^', base, exponent)
    }
    return base
  }

  /** 后缀阶乘：x!、x!! */
  private parsePostfix(): Expr {
    let expr = this.parsePrimary()
    while (this.peek().type === 'operator' && this.peek().text === '!') {
      this.consume()
      expr = makeFactorial(expr)
    }
    return expr
  }

  // ---------- 原子 ----------

  private parsePrimary(): Expr {
    const t = this.peek()
    switch (t.type) {
      case 'number': {
        this.consume()
        return makeNumber(t.value ?? NaN)
      }
      case 'identifier':
        return this.parseIdentifier()
      case 'lparen': {
        this.consume()
        const expr = this.parseComparison()
        const close = this.peek()
        if (close.type !== 'rparen') {
          this.error(close, "期望 ')'", {
            expected: "')'",
            actual: this.describe(close),
            hint: '括号未闭合',
          })
        }
        this.consume()
        return expr
      }
      case 'lbrace':
        return this.parsePiecewise()
      case 'lbracket':
        this.error(t, "暂不支持 '['", {
          expected: '表达式',
          actual: "'['",
          hint: '请使用圆括号 （ ） 分组',
        })
      // eslint-disable-next-line no-fallthrough
      default:
        if (t.type === 'eof') {
          this.error(t, '表达式意外结束', {
            expected: '表达式',
            actual: '输入结束',
            hint: '可能有缺失的操作数或未闭合的括号',
          })
        }
        this.error(t, '期望表达式', { expected: '表达式', actual: this.describe(t) })
    }
  }

  private parseIdentifier(): Expr {
    const t = this.peek()
    const name = t.text

    const definition = FUNCTIONS[name]
    if (definition !== undefined) {
      this.consume()
      if (this.peek().type !== 'lparen') {
        this.error(t, `函数 ${name} 需要括号调用`, {
          expected: "'('",
          actual: this.describe(this.peek()),
          hint: `改为 ${definition.signature}`,
        })
      }
      this.consume() // '('
      const args: Expr[] = []
      if (this.peek().type !== 'rparen') {
        args.push(this.parseComparison())
        while (this.peek().type === 'comma') {
          this.consume()
          args.push(this.parseComparison())
        }
      }
      const close = this.peek()
      if (close.type !== 'rparen') {
        this.error(close, "期望 ',' 或 ')'", {
          expected: "',' 或 ')'",
          actual: this.describe(close),
          hint: close.type === 'eof' ? '括号未闭合' : '函数参数未正确结束',
        })
      }
      this.consume() // ')'
      if (args.length < definition.minArgs || args.length > definition.maxArgs) {
        this.error(
          t,
          `函数 ${name} 需要 ${describeArity(definition)}，实际提供了 ${args.length} 个`,
          {
            hint: `用法：${definition.signature}`,
          },
        )
      }
      return makeCall(name, args)
    }

    this.consume()
    if (isConstantName(name)) return makeConstant(name)
    return makeVariable(name)
  }

  private parsePiecewise(): Expr {
    this.consume() // '{'
    const empty = this.peek()
    if (empty.type === 'rbrace') {
      this.error(empty, '分段函数至少需要一个分支', {
        expected: '条件: 值',
        actual: "'}'",
        hint: '格式：{条件: 值, 条件: 值, ...}，例如 {x < 0: -x, x >= 0: x}',
      })
    }

    const cases: PiecewiseCase[] = []
    for (;;) {
      const condition = this.parseComparison()
      const colon = this.peek()
      if (colon.type !== 'colon') {
        this.error(colon, "分段函数缺少 ':'", {
          expected: "':'",
          actual: this.describe(colon),
          hint: '格式：{条件: 值, 条件: 值, ...}',
        })
      }
      this.consume()
      const value = this.parseComparison()
      cases.push({ condition, value })
      if (this.peek().type === 'comma') {
        this.consume()
        continue
      }
      break
    }

    const close = this.peek()
    if (close.type !== 'rbrace') {
      this.error(close, "期望 '}'", {
        expected: "'}'",
        actual: this.describe(close),
        hint: '分段函数未闭合',
      })
    }
    this.consume()
    return makePiecewise(cases)
  }

  // ---------- 工具 ----------

  private peek(ahead = 0): Token {
    const token = this.tokens[this.pos + ahead]
    return token ?? this.tokens[this.tokens.length - 1]!
  }

  private previous(): Token | null {
    if (this.pos === 0) return null
    return this.tokens[this.pos - 1] ?? null
  }

  private consume(): Token {
    const token = this.peek()
    if (token.type !== 'eof') this.pos++
    return token
  }

  private describe(token: Token): string {
    if (token.type === 'eof') return '输入结束'
    return `'${token.text}'`
  }

  private error(token: Token, message: string, extra?: ErrorExtra): never {
    throw new ExprSyntaxError({ message, start: token.start, end: token.end, ...extra })
  }
}
