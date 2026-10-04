/**
 * 猜想表达式（v2.7）：解析与求值。
 * 语法与原实验台一致：+ − * / **、比较（可链式）、and/or/not、
 * 函数 sqrt/abs/min/max、变量为整数/实数或真值（如 bipartite）。
 * 数值语义：整数与小数常量、四则运算与整数幂使用**精确有理数**；
 * sqrt 及与无理量（ρ、λ₂ 等数值）的运算按双精度。
 * 校验规则：长度 ≤300、常量 |v| ≤ 10⁶、幂指数为 0–8 整数常量、
 * 函数仅白名单、静态检查结果为真/假表达式。
 */

export interface Rat {
  n: bigint
  d: bigint
}

export type ClaimValue = number | boolean | Rat

export class ClaimError extends Error {}

/** ---------- 有理数 ---------- */

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

export function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) throw new ClaimError('除数为零')
  let num = n
  let den = d
  if (den < 0n) {
    num = -num
    den = -den
  }
  const g = gcd(num, den)
  if (g > 1n) {
    num /= g
    den /= g
  }
  return { n: num, d: den }
}

export function ratFromNumber(value: number): Rat {
  if (!Number.isFinite(value)) throw new ClaimError('数值必须有限')
  if (Number.isInteger(value)) return rat(BigInt(value))
  // 小数按十进制展开精确转换
  return ratFromDecimalString(String(value))
}

export function ratFromDecimalString(source: string): Rat {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(source.trim())
  if (!match) throw new ClaimError(`无法解析数值常量：${source}`)
  const sign = match[1] === '-' ? -1n : 1n
  const intPart = match[2]!
  const fracPart = match[3] ?? ''
  const exponent = Number(match[4] ?? '0')
  if (Math.abs(exponent) > 300) throw new ClaimError('小数常量的指数绝对值过大')
  let num = BigInt(intPart + fracPart)
  let den = 10n ** BigInt(fracPart.length)
  if (exponent > 0) num *= 10n ** BigInt(exponent)
  else if (exponent < 0) den *= 10n ** BigInt(-exponent)
  return rat(sign * num, den)
}

export function ratAdd(a: Rat, b: Rat): Rat {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d)
}

export function ratSub(a: Rat, b: Rat): Rat {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d)
}

export function ratMul(a: Rat, b: Rat): Rat {
  return rat(a.n * b.n, a.d * b.d)
}

export function ratDiv(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new ClaimError('除数为零')
  return rat(a.n * b.d, a.d * b.n)
}

export function ratPow(a: Rat, exponent: number): Rat {
  if (!Number.isInteger(exponent) || exponent < 0) throw new ClaimError('幂指数须为非负整数')
  return rat(a.n ** BigInt(exponent), a.d ** BigInt(exponent))
}

export function ratCmp(a: Rat, b: Rat): number {
  const left = a.n * b.d
  const right = b.n * a.d
  return left < right ? -1 : left > right ? 1 : 0
}

export function ratEquals(a: Rat, b: Rat): boolean {
  return a.n === b.n && a.d === b.d
}

export function ratToNumber(a: Rat): number {
  return Number(a.n) / Number(a.d)
}

/** 完全平方数时返回精确平方根，否则返回 null */
export function ratSqrtExact(a: Rat): Rat | null {
  if (a.n < 0n) throw new ClaimError('sqrt 的负数参数')
  const rootN = bigintSqrt(a.n)
  if (rootN * rootN !== a.n) return null
  const rootD = bigintSqrt(a.d)
  if (rootD * rootD !== a.d) return null
  return rat(rootN, rootD)
}

function bigintSqrt(value: bigint): bigint {
  if (value < 2n) return value
  let x = value
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + value / x) / 2n
  }
  return x
}

function isRat(v: ClaimValue): v is Rat {
  return typeof v === 'object'
}

export function valueToNumber(v: ClaimValue): number {
  if (typeof v === 'boolean') return v ? 1 : 0
  return isRat(v) ? ratToNumber(v) : v
}

function toRatOrNumber(v: ClaimValue): Rat | number {
  if (typeof v === 'number') return Number.isInteger(v) ? rat(BigInt(v)) : v
  if (typeof v === 'boolean') return rat(v ? 1n : 0n)
  return v
}

function compareValues(a: ClaimValue, b: ClaimValue): number {
  const left = toRatOrNumber(a)
  const right = toRatOrNumber(b)
  if (typeof left === 'object' && typeof right === 'object') return ratCmp(left, right)
  const x = valueToNumber(left)
  const y = valueToNumber(right)
  return x < y ? -1 : x > y ? 1 : 0
}

/** ---------- AST 与解析 ---------- */

export type ClaimNode =
  | { kind: 'num'; value: Rat }
  | { kind: 'bool'; value: boolean }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: '-' | 'not'; operand: ClaimNode }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/' | '**'; left: ClaimNode; right: ClaimNode }
  | { kind: 'boolop'; op: 'and' | 'or'; values: ClaimNode[] }
  | { kind: 'cmp'; ops: Array<'<' | '<=' | '>' | '>=' | '==' | '!='>; operands: ClaimNode[] }
  | { kind: 'call'; name: 'sqrt' | 'abs' | 'min' | 'max'; args: ClaimNode[] }

interface Token {
  kind: 'num' | 'name' | 'op'
  text: string
}

const OPERATORS = ['**', '<=', '>=', '==', '!=', '<', '>', '+', '-', '*', '/', '(', ')', ',']

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < source.length && /[0-9]/.test(source[j]!)) j++
      if (source[j] === '.') {
        j++
        while (j < source.length && /[0-9]/.test(source[j]!)) j++
      }
      if (source[j] === 'e' || source[j] === 'E') {
        const save = j
        j++
        if (source[j] === '+' || source[j] === '-') j++
        if (/[0-9]/.test(source[j] ?? '')) {
          while (j < source.length && /[0-9]/.test(source[j]!)) j++
        } else {
          j = save
        }
      }
      tokens.push({ kind: 'num', text: source.slice(i, j) })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j]!)) j++
      tokens.push({ kind: 'name', text: source.slice(i, j) })
      i = j
      continue
    }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, i))
    if (!op) throw new ClaimError(`无法识别的字符：${ch}`)
    tokens.push({ kind: 'op', text: op })
    i += op.length
  }
  return tokens
}

export interface ClaimContext {
  variables: ReadonlySet<string>
  booleans: ReadonlySet<string>
}

export function parseClaim(source: string, context: ClaimContext): ClaimNode {
  if (typeof source !== 'string' || source.length < 1 || source.length > 300) {
    throw new ClaimError('猜想表达式长度须为 1–300 个字符')
  }
  const tokens = tokenize(source)
  let position = 0
  let nodeCount = 0

  const peek = (): Token | undefined => tokens[position]
  const next = (): Token => {
    const token = tokens[position]
    if (!token) throw new ClaimError('表达式不完整')
    position++
    return token
  }
  const expectOp = (text: string): void => {
    const token = next()
    if (token.kind !== 'op' || token.text !== text) throw new ClaimError(`应为 ${text}`)
  }
  const atOp = (text: string): boolean => {
    const token = peek()
    return token?.kind === 'op' && token.text === text
  }
  const atName = (text: string): boolean => {
    const token = peek()
    return token?.kind === 'name' && token.text === text
  }

  function count<T extends ClaimNode>(node: T): T {
    nodeCount++
    if (nodeCount > 120) throw new ClaimError('表达式过于复杂，请拆分为几个猜想')
    return node
  }

  function parseOr(): ClaimNode {
    let left = parseAnd()
    if (atName('or')) {
      const values = [left]
      while (atName('or')) {
        next()
        values.push(parseAnd())
      }
      left = count({ kind: 'boolop', op: 'or', values })
    }
    return left
  }

  function parseAnd(): ClaimNode {
    let left = parseNot()
    if (atName('and')) {
      const values = [left]
      while (atName('and')) {
        next()
        values.push(parseNot())
      }
      left = count({ kind: 'boolop', op: 'and', values })
    }
    return left
  }

  function parseNot(): ClaimNode {
    if (atName('not')) {
      next()
      return count({ kind: 'unary', op: 'not', operand: parseNot() })
    }
    return parseComparison()
  }

  function parseComparison(): ClaimNode {
    const first = parseAdditive()
    const ops: Array<'<' | '<=' | '>' | '>=' | '==' | '!='> = []
    const operands: ClaimNode[] = [first]
    while (peek()?.kind === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(peek()!.text)) {
      ops.push(next().text as (typeof ops)[number])
      operands.push(parseAdditive())
    }
    if (ops.length === 0) return first
    return count({ kind: 'cmp', ops, operands })
  }

  function parseAdditive(): ClaimNode {
    let left = parseMultiplicative()
    while (atOp('+') || atOp('-')) {
      const op = next().text as '+' | '-'
      const right = parseMultiplicative()
      left = count({ kind: 'bin', op, left, right })
    }
    return left
  }

  function parseMultiplicative(): ClaimNode {
    let left = parseUnary()
    while (atOp('*') || atOp('/')) {
      const op = next().text as '*' | '/'
      const right = parseUnary()
      left = count({ kind: 'bin', op, left, right })
    }
    return left
  }

  function parseUnary(): ClaimNode {
    if (atOp('-')) {
      next()
      return count({ kind: 'unary', op: '-', operand: parseUnary() })
    }
    if (atOp('+')) {
      next()
      return parseUnary()
    }
    return parsePower()
  }

  function parsePower(): ClaimNode {
    const base = parseAtom()
    if (atOp('**')) {
      next()
      // Python 语义：** 右侧允许一元负号？原版要求指数为 0–8 整数常量
      const exponent = parseUnary()
      if (exponent.kind !== 'num' || exponent.value.d !== 1n) {
        throw new ClaimError('幂指数须为 0–8 的整数常量')
      }
      const exp = Number(exponent.value.n)
      if (exp < 0 || exp > 8) throw new ClaimError('幂指数须为 0–8 的整数常量')
      return count({ kind: 'bin', op: '**', left: base, right: exponent })
    }
    return base
  }

  function parseAtom(): ClaimNode {
    const token = next()
    if (token.kind === 'num') {
      const value = ratFromDecimalString(token.text)
      if (value.n < -1000000n * value.d || value.n > 1000000n * value.d) {
        throw new ClaimError('仅支持绝对值不超过 1000000 的数值常量')
      }
      return count({ kind: 'num', value })
    }
    if (token.kind === 'name') {
      const name = token.text
      if (['sqrt', 'abs', 'min', 'max'].includes(name)) {
        expectOp('(')
        const args: ClaimNode[] = []
        if (!atOp(')')) {
          args.push(parseOr())
          while (atOp(',')) {
            next()
            args.push(parseOr())
          }
        }
        expectOp(')')
        if ((name === 'sqrt' || name === 'abs') && args.length !== 1) {
          throw new ClaimError('sqrt 和 abs 需要一个参数')
        }
        if ((name === 'min' || name === 'max') && (args.length < 1 || args.length > 4)) {
          throw new ClaimError('min/max 需要 1–4 个参数')
        }
        return count({ kind: 'call', name: name as 'sqrt' | 'abs' | 'min' | 'max', args })
      }
      if (name === 'true' || name === 'True') return count({ kind: 'bool', value: true })
      if (name === 'false' || name === 'False') return count({ kind: 'bool', value: false })
      if (['and', 'or', 'not'].includes(name)) throw new ClaimError('逻辑运算符缺少操作数')
      if (!context.variables.has(name)) throw new ClaimError(`未知变量：${name}`)
      return count({ kind: 'var', name })
    }
    if (token.kind === 'op' && token.text === '(') {
      const inner = parseOr()
      expectOp(')')
      return inner
    }
    throw new ClaimError(`无法解析：${token.text}`)
  }

  const root = parseOr()
  if (position !== tokens.length) throw new ClaimError(`无法解析：${tokens[position]!.text}`)

  // 静态检查：表达式必须返回真/假
  const boolLike = (node: ClaimNode): boolean => {
    switch (node.kind) {
      case 'bool':
        return true
      case 'var':
        return context.booleans.has(node.name)
      case 'cmp':
        return true
      case 'boolop':
        return node.values.every(boolLike)
      case 'unary':
        return node.op === 'not' ? boolLike(node.operand) : false
      default:
        return false
    }
  }
  if (!boolLike(root)) {
    throw new ClaimError('猜想必须返回真/假，例如 m <= n**2/4 或 bipartite')
  }
  return root
}

/** ---------- 求值 ---------- */

export function evaluateClaim(node: ClaimNode, getValue: (name: string) => ClaimValue): boolean {
  const result = walk(node)
  if (typeof result !== 'boolean') throw new ClaimError('猜想必须返回真/假')
  return result

  function walk(n: ClaimNode): ClaimValue {
    switch (n.kind) {
      case 'num':
        return n.value
      case 'bool':
        return n.value
      case 'var':
        return getValue(n.name)
      case 'unary': {
        const operand = walk(n.operand)
        if (n.op === 'not') {
          if (typeof operand !== 'boolean') throw new ClaimError('not 后面须为真/假条件')
          return !operand
        }
        if (typeof operand === 'boolean') throw new ClaimError('布尔值不能取负')
        return isRat(operand) ? rat(-operand.n, operand.d) : -operand
      }
      case 'bin': {
        const left = walk(n.left)
        const right = walk(n.right)
        if (typeof left === 'boolean' || typeof right === 'boolean') {
          throw new ClaimError('布尔值不能参与算术运算')
        }
        return applyBinary(n.op, left, right)
      }
      case 'boolop': {
        const values = n.values.map((value) => walk(value))
        for (const value of values) {
          if (typeof value !== 'boolean') throw new ClaimError('and/or 的两侧须为真/假条件')
        }
        return n.op === 'and' ? values.every((v) => v as boolean) : values.some((v) => v as boolean)
      }
      case 'cmp': {
        let left = walk(n.operands[0]!)
        for (let i = 0; i < n.ops.length; i++) {
          const right = walk(n.operands[i + 1]!)
          if (typeof left === 'boolean' || typeof right === 'boolean') {
            if (n.ops[i] === '==' || n.ops[i] === '!=') {
              const equal = left === right
              if ((n.ops[i] === '==') !== equal) return false
            } else {
              throw new ClaimError('布尔值仅支持 ==/!= 比较')
            }
          } else {
            const comparison = compareValues(left, right)
            const ok =
              n.ops[i] === '<'
                ? comparison < 0
                : n.ops[i] === '<='
                  ? comparison <= 0
                  : n.ops[i] === '>'
                    ? comparison > 0
                    : n.ops[i] === '>='
                      ? comparison >= 0
                      : n.ops[i] === '=='
                        ? comparison === 0
                        : comparison !== 0
            if (!ok) return false
          }
          left = right
        }
        return true
      }
      case 'call': {
        const args = n.args.map((value) => walk(value))
        for (const arg of args) {
          if (typeof arg === 'boolean') throw new ClaimError('函数参数不能为布尔值')
        }
        if (n.name === 'abs') {
          const arg = args[0] as number | Rat
          return isRat(arg) ? rat(arg.n < 0n ? -arg.n : arg.n, arg.d) : arg < 0 ? -arg : arg
        }
        if (n.name === 'sqrt') {
          const arg = args[0] as number | Rat
          if (compareValues(arg, isRat(arg) ? rat(0n) : 0) < 0)
            throw new ClaimError('sqrt 的负数参数')
          if (isRat(arg)) {
            const exact = ratSqrtExact(arg)
            if (exact) return exact
          }
          return Math.sqrt(valueToNumber(arg))
        }
        const sorted = [...args].sort((a, b) => compareValues(a!, b!))
        return n.name === 'min' ? sorted[0]! : sorted[sorted.length - 1]!
      }
    }
  }
}

function applyBinary(
  op: '+' | '-' | '*' | '/' | '**',
  left: number | Rat,
  right: number | Rat,
): ClaimValue {
  if (op === '**') {
    const exponentNode = right
    const exponent = isRat(exponentNode) ? Number(exponentNode.n / exponentNode.d) : exponentNode
    if (!Number.isInteger(exponent)) throw new ClaimError('幂指数须为整数')
    if (isRat(left)) return ratPow(left, exponent)
    return left ** exponent
  }
  const l = toRatOrNumber(left)
  const r = toRatOrNumber(right)
  if (typeof l === 'object' && typeof r === 'object') {
    switch (op) {
      case '+':
        return ratAdd(l, r)
      case '-':
        return ratSub(l, r)
      case '*':
        return ratMul(l, r)
      case '/':
        return ratDiv(l, r)
    }
  }
  const x = valueToNumber(l)
  const y = valueToNumber(r)
  switch (op) {
    case '+':
      return x + y
    case '-':
      return x - y
    case '*':
      return x * y
    default:
      if (y === 0) throw new ClaimError('除数为零')
      return x / y
  }
}
