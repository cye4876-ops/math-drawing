/**
 * 猜想表达式（v2.7）：解析与求值。
 * 语法与原实验台一致：+ − * / **、比较（可链式）、and/or/not、
 * 函数 sqrt/abs/min/max、变量为整数/实数或真值（如 bipartite）。
 * 数值语义：整数与小数常量、四则运算与整数幂使用**精确有理数**；
 * v2.9：非完全平方的有理数开方保留**精确根式**（可与有理数精确比较：sqrt(2) < 1.4142135623730951 为真），
 * 与谱值等双精度量的临界比较（差在容差内）返回“精度不足，无法严格判断”，不再冒充严格结论。
 * 校验规则：长度 ≤300、常量 |v| ≤ 10⁶、幂指数为 0–8 整数常量、
 * 函数仅白名单、静态检查结果为真/假表达式。
 */

/** 非完全平方非负有理数的精确平方根：保留被开方数，可与有理数精确比较 */
export interface ClaimSqrt {
  readonly sqrt: true
  /** 被开方数（非负有理数） */
  radicand: Rat
  /** 双精度近似（参与非精确运算时使用） */
  approx: number
}

export type ClaimValue = number | boolean | Rat | ClaimSqrt

/** 三值判定：真 / 假 / 精度不足 */
export type ClaimVerdict = boolean | 'uncertain'

export class ClaimError extends Error {}

/** ---------- 有理数（共享实现，re-export 保持 API） ---------- */

import {
  rat,
  ratAdd,
  ratCmp,
  ratDiv,
  ratFromDecimalString,
  ratMul,
  ratPow,
  ratSqrtExact,
  ratSub,
  ratToNumber,
  type Rat,
} from '../math/exact/rational'

export {
  rat,
  ratAdd,
  ratCmp,
  ratDiv,
  ratEquals,
  ratFromDecimalString,
  ratFromNumber,
  ratMul,
  ratPow,
  ratSqrtExact,
  ratSub,
  ratToNumber,
  type Rat,
} from '../math/exact/rational'

function isRat(v: ClaimValue): v is Rat {
  return typeof v === 'object' && !('sqrt' in v)
}

function isSqrt(v: ClaimValue): v is ClaimSqrt {
  return typeof v === 'object' && 'sqrt' in v
}

export function valueToNumber(v: ClaimValue): number {
  if (typeof v === 'boolean') return v ? 1 : 0
  if (isSqrt(v)) return v.approx
  return isRat(v) ? ratToNumber(v) : v
}

function toRatOrNumber(v: ClaimValue): Rat | number {
  if (typeof v === 'number') return Number.isInteger(v) ? rat(BigInt(v)) : v
  if (typeof v === 'boolean') return rat(v ? 1n : 0n)
  if (isSqrt(v)) return v.approx
  return v
}

/** 精确比较：双方都是精确表示时给出符号；否则 null */
function narrow(cmp: number): -1 | 0 | 1 {
  return cmp < 0 ? -1 : cmp > 0 ? 1 : 0
}

function compareExact(a: ClaimValue, b: ClaimValue): -1 | 0 | 1 | null {
  if (isRat(a) && isRat(b)) return narrow(ratCmp(a, b))
  if (isSqrt(a) && isSqrt(b)) return narrow(ratCmp(a.radicand, b.radicand))
  if (isSqrt(a) && isRat(b)) {
    if (b.n < 0n) return 1
    return narrow(ratCmp(a.radicand, ratMul(b, b)))
  }
  if (isRat(a) && isSqrt(b)) {
    const back = compareExact(b, a)
    if (back === null) return null
    return back === 0 ? 0 : back === 1 ? -1 : 1
  }
  return null
}

/** 比较容差：相对 1e-9 内视为“精度不足”（谱值等双精度量在临界处无法严格判断） */
const COMPARE_TOLERANCE = 1e-9

/** 带精度的比较：-1/0/1 为严格结论；'unknown' 表示两值差距小于容差，无法严格判断 */
function compareWithPrecision(a: ClaimValue, b: ClaimValue): -1 | 0 | 1 | 'unknown' {
  const exact = compareExact(a, b)
  if (exact !== null) return exact
  const x = valueToNumber(a)
  const y = valueToNumber(b)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'unknown'
  const scale = Math.max(1, Math.abs(x), Math.abs(y))
  if (Math.abs(x - y) <= COMPARE_TOLERANCE * scale) return 'unknown'
  return x < y ? -1 : 1
}

function compareValues(a: ClaimValue, b: ClaimValue): number {
  const exact = compareExact(a, b)
  if (exact !== null) return exact
  const x = valueToNumber(a)
  const y = valueToNumber(b)
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

/** 内部求值值：数值 | 布尔 | 'unknown'（精度不足的三值逻辑） */
type WalkValue = ClaimValue | 'unknown'

function isBoolish(v: WalkValue): v is boolean | 'unknown' {
  return typeof v === 'boolean' || v === 'unknown'
}

/**
 * 详细求值（v2.9）：返回 真 / 假 / 'uncertain'（精度不足，无法严格判断）。
 * 谱值等双精度量在临界比较处不再默认取一侧，而是标'uncertain'。
 */
export function evaluateClaimDetailed(
  node: ClaimNode,
  getValue: (name: string) => ClaimValue,
): ClaimVerdict {
  const result = walk(node)
  if (result === 'unknown') return 'uncertain'
  if (typeof result !== 'boolean') throw new ClaimError('猜想必须返回真/假')
  return result

  function walk(n: ClaimNode): WalkValue {
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
          if (operand === 'unknown') return 'unknown'
          if (typeof operand !== 'boolean') throw new ClaimError('not 后面须为真/假条件')
          return !operand
        }
        if (operand === 'unknown') throw new ClaimError('布尔值不能取负')
        if (typeof operand === 'boolean') throw new ClaimError('布尔值不能取负')
        if (isSqrt(operand)) return -operand.approx
        return isRat(operand) ? rat(-operand.n, operand.d) : -operand
      }
      case 'bin': {
        const left = walk(n.left)
        const right = walk(n.right)
        if (left === 'unknown' || right === 'unknown') {
          throw new ClaimError('无法比较的数值不能参与算术运算')
        }
        if (typeof left === 'boolean' || typeof right === 'boolean') {
          throw new ClaimError('布尔值不能参与算术运算')
        }
        return applyBinary(n.op, left, right)
      }
      case 'boolop': {
        const values = n.values.map((value) => walk(value))
        for (const value of values) {
          if (typeof value !== 'boolean' && value !== 'unknown') {
            throw new ClaimError('and/or 的两侧须为真/假条件')
          }
        }
        const hasUnknown = values.some((value) => value === 'unknown')
        if (n.op === 'and') {
          // Kleene 三值逻辑：任一项为假 → 假；否则有未知 → 未知；全真 → 真
          if (values.some((value) => value === false)) return false
          return hasUnknown ? 'unknown' : true
        }
        if (values.some((value) => value === true)) return true
        return hasUnknown ? 'unknown' : false
      }
      case 'cmp': {
        let left = walk(n.operands[0]!)
        let inconclusive = false
        for (let i = 0; i < n.ops.length; i++) {
          const right = walk(n.operands[i + 1]!)
          const op = n.ops[i]!
          if (isBoolish(left) || isBoolish(right)) {
            if (op !== '==' && op !== '!=') throw new ClaimError('布尔值仅支持 ==/!= 比较')
            if (left === 'unknown' || right === 'unknown') {
              inconclusive = true
              left = right
              continue
            }
            const equal = left === right
            if ((op === '==') !== equal) return false
          } else {
            const comparison = compareWithPrecision(left, right)
            if (comparison === 'unknown') {
              inconclusive = true
            } else {
              const ok =
                op === '<'
                  ? comparison < 0
                  : op === '<='
                    ? comparison <= 0
                    : op === '>'
                      ? comparison > 0
                      : op === '>='
                        ? comparison >= 0
                        : op === '=='
                          ? comparison === 0
                          : comparison !== 0
              if (!ok) return false // 已经确定的假优先于“精度不足”
            }
          }
          left = right
        }
        return inconclusive ? 'unknown' : true
      }
      case 'call': {
        const args = n.args.map((value) => walk(value))
        for (const arg of args) {
          if (typeof arg === 'boolean' || arg === 'unknown') {
            throw new ClaimError('函数参数不能为布尔值或未知值')
          }
        }
        if (n.name === 'abs') {
          const arg = args[0] as ClaimValue
          if (isSqrt(arg)) return arg
          if (isRat(arg)) return rat(arg.n < 0n ? -arg.n : arg.n, arg.d)
          return Math.abs(arg as number)
        }
        if (n.name === 'sqrt') {
          const arg = args[0] as ClaimValue
          if (compareValues(arg, 0) < 0) throw new ClaimError('sqrt 的负数参数')
          if (isRat(arg)) {
            const exact = ratSqrtExact(arg)
            if (exact) return exact
            // v2.9：保留精确根式（可与有理数精确比较）
            return { sqrt: true, radicand: arg, approx: Math.sqrt(ratToNumber(arg)) }
          }
          return Math.sqrt(valueToNumber(arg))
        }
        const sorted = [...args].sort((a, b) => compareValues(a as ClaimValue, b as ClaimValue))
        return n.name === 'min' ? sorted[0]! : sorted[sorted.length - 1]!
      }
    }
  }
}

/** 兼容入口：'uncertain'（精度不足）按“不成立”处理（不作为反例/不视为成立） */
export function evaluateClaim(node: ClaimNode, getValue: (name: string) => ClaimValue): boolean {
  return evaluateClaimDetailed(node, getValue) === true
}

function applyBinary(
  op: '+' | '-' | '*' | '/' | '**',
  left: ClaimValue,
  right: ClaimValue,
): ClaimValue {
  if (op === '**') {
    const exponentNode = right
    const exponent = isRat(exponentNode)
      ? Number(exponentNode.n / exponentNode.d)
      : isSqrt(exponentNode)
        ? exponentNode.approx
        : (exponentNode as number)
    if (!Number.isInteger(exponent)) throw new ClaimError('幂指数须为整数')
    if (isSqrt(left) && exponent >= 0) {
      // (√r)ⁿ = √(rⁿ)：保留精确根式
      const radicand = ratPow(left.radicand, exponent)
      const exact = ratSqrtExact(radicand)
      return exact ?? { sqrt: true, radicand, approx: left.approx ** exponent }
    }
    if (isRat(left)) return ratPow(left, exponent)
    return (toRatOrNumber(left) as number) ** exponent
  }
  if (op === '*' || op === '/') {
    const merge = (radicand: Rat, approx: number): ClaimValue => {
      const exact = ratSqrtExact(radicand)
      return exact ?? { sqrt: true, radicand, approx }
    }
    if (isSqrt(left) && isSqrt(right)) {
      if (op === '/' && right.radicand.n === 0n) throw new ClaimError('除数为零')
      return merge(
        op === '*' ? ratMul(left.radicand, right.radicand) : ratDiv(left.radicand, right.radicand),
        op === '*' ? left.approx * right.approx : left.approx / right.approx,
      )
    }
    if (isSqrt(left) && isRat(right) && right.n >= 0n) {
      if (op === '/' && right.n === 0n) throw new ClaimError('除数为零')
      const square = ratMul(right, right)
      return merge(
        op === '*' ? ratMul(square, left.radicand) : ratDiv(left.radicand, square),
        op === '*' ? left.approx * ratToNumber(right) : left.approx / ratToNumber(right),
      )
    }
    if (op === '*' && isRat(left) && left.n >= 0n && isSqrt(right)) {
      return merge(ratMul(ratMul(left, left), right.radicand), ratToNumber(left) * right.approx)
    }
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
