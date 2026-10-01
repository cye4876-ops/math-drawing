/**
 * 词法分析器：源码 → Token 序列（含精确的行列位置）。
 *
 * 关键规则（完整规范见 docs/expr-syntax.md）：
 * - 数字支持整数、小数、科学计数法；`2e3` 是 2000，而 `2e` 是 `2 * e`、
 *   `2e + 3` 是 `2e + 3`（科学计数法仅当 e/E 后紧跟[符号+数字]时生效）；
 * - 标识符识别：完整词优先（函数名、常量名、theta 等作为整体识别；运行时注册的
 *   插件函数同样生效），未命中时回退"已知词最长匹配 + 单字母拆分"
 *   （xy → x * y，sinx → sin x）；
 * - 希腊字母别名：π→pi、φ→phi、τ→tau、θ→theta。
 */
import { CONSTANTS, NAMED_VARIABLE_WORDS } from './ast'
import { ExprSyntaxError, type SourcePosition } from './errors'
import { FUNCTION_NAMES, FUNCTIONS } from './functions'

export type TokenType =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'lbrace'
  | 'rbrace'
  | 'comma'
  | 'semicolon'
  | 'colon'
  | 'eof'

export interface Token {
  type: TokenType
  /** 原始文本（eof 为空字符串） */
  text: string
  /** number 类型的数值 */
  value?: number
  start: SourcePosition
  end: SourcePosition
}

/** 已知词（函数名、常量名、命名变量），按长度降序保证最长匹配。
 * 运行时构建（含插件注册的新函数名）；构建成本低且仅在遇到标识符时一次。 */
function knownWords(): { list: readonly string[]; set: ReadonlySet<string> } {
  const set = new Set<string>([
    ...FUNCTION_NAMES,
    ...Object.keys(FUNCTIONS),
    ...Object.keys(CONSTANTS),
    ...NAMED_VARIABLE_WORDS,
  ])
  return { list: [...set].sort((a, b) => b.length - a.length), set }
}

const GREEK_ALIASES: Record<string, string> = {
  π: 'pi',
  φ: 'phi',
  τ: 'tau',
  θ: 'theta',
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9'
}

function isLetter(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

function isIdentifierChar(c: string): boolean {
  return isLetter(c) || isDigit(c) || c === '_'
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let offset = 0
  let line = 1
  let column = 1
  let wordsCache: { list: readonly string[]; set: ReadonlySet<string> } | null = null
  const words = (): { list: readonly string[]; set: ReadonlySet<string> } =>
    (wordsCache ??= knownWords())

  const position = (): SourcePosition => ({ offset, line, column })
  const peekChar = (ahead = 0): string => source[offset + ahead] ?? ''
  const advance = (n: number): void => {
    for (let i = 0; i < n; i++) {
      if (source[offset] === '\n') {
        line++
        column = 1
      } else {
        column++
      }
      offset++
    }
  }
  const push = (type: TokenType, start: SourcePosition, text: string, value?: number): void => {
    const token: Token = { type, text, start, end: position() }
    if (value !== undefined) token.value = value
    tokens.push(token)
  }
  const fail = (
    start: SourcePosition,
    message: string,
    extra?: { expected?: string; actual?: string; hint?: string },
  ): never => {
    throw new ExprSyntaxError({ message, start, end: position(), ...extra })
  }

  while (offset < source.length) {
    const c = peekChar()

    // 空白
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance(1)
      continue
    }

    const start = position()

    // 数字：整数 / 小数 / 科学计数法
    if (isDigit(c) || (c === '.' && isDigit(peekChar(1)))) {
      while (isDigit(peekChar())) advance(1)
      if (peekChar() === '.') {
        advance(1)
        while (isDigit(peekChar())) advance(1)
      }
      if (peekChar() === 'e' || peekChar() === 'E') {
        const next = peekChar(1)
        const hasExponent =
          isDigit(next) || ((next === '+' || next === '-') && isDigit(peekChar(2)))
        if (hasExponent) {
          advance(1)
          if (peekChar() === '+' || peekChar() === '-') advance(1)
          while (isDigit(peekChar())) advance(1)
        }
      }
      const text = source.slice(start.offset, offset)
      push('number', start, text, Number(text))
      continue
    }

    // 希腊字母别名
    const alias = GREEK_ALIASES[c]
    if (alias !== undefined) {
      advance(1)
      push('identifier', start, alias)
      continue
    }

    // 标识符：优先整体识别完整词（含插件动态注册的函数名——如 logistic 不应被 log 前缀吞掉），
    // 否则回退「已知词最长匹配 + 单字母拆分」（sinx → sin x、xy → x * y）
    if (isLetter(c)) {
      let end = offset
      while (end < source.length) {
        const ch = source[end]
        if (ch === undefined || !isIdentifierChar(ch)) break
        end += 1
      }
      const whole = source.slice(offset, end)
      const known = words()
      if (known.set.has(whole)) {
        advance(whole.length)
        push('identifier', start, whole)
        continue
      }
      const rest = source.slice(offset)
      let matched: string | null = null
      for (const word of known.list) {
        if (rest.startsWith(word)) {
          matched = word
          break
        }
      }
      if (matched !== null) {
        advance(matched.length)
        push('identifier', start, matched)
      } else {
        advance(1)
        push('identifier', start, c)
      }
      continue
    }

    // 两字符运算符
    const two = source.slice(offset, offset + 2)
    if (two === '<=' || two === '>=' || two === '!=') {
      advance(2)
      push('operator', start, two)
      continue
    }

    // 单字符
    switch (c) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '^':
      case '%':
      case '!':
      case '<':
      case '>':
      case '=':
        advance(1)
        push('operator', start, c)
        continue
      case '(':
        advance(1)
        push('lparen', start, c)
        continue
      case ')':
        advance(1)
        push('rparen', start, c)
        continue
      case '[':
        advance(1)
        push('lbracket', start, c)
        continue
      case ']':
        advance(1)
        push('rbracket', start, c)
        continue
      case '{':
        advance(1)
        push('lbrace', start, c)
        continue
      case '}':
        advance(1)
        push('rbrace', start, c)
        continue
      case ',':
        advance(1)
        push('comma', start, c)
        continue
      case ';':
        advance(1)
        push('semicolon', start, c)
        continue
      case ':':
        advance(1)
        push('colon', start, c)
        continue
      default: {
        advance(1)
        const hint =
          c.codePointAt(0) !== undefined && (c.codePointAt(0) ?? 0) > 127
            ? '变量名请使用英文字母（或 π/φ/τ/θ 等支持的希腊字母），中文字符暂不支持'
            : '表达式仅支持数字、字母、运算符与括号'
        fail(start, `无法识别的字符 '${c}'`, { hint })
      }
    }
  }

  tokens.push({ type: 'eof', text: '', start: position(), end: position() })
  return tokens
}
