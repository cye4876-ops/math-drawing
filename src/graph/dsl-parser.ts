/**
 * 图文本 DSL 解析（v0.5）。语法（详见 docs/graph-dsl.md）：
 * - 顶点声明：`A`（孤立点）
 * - 无向边：`A-B` / `A -- B`，可带权重 `A-B:3`
 * - 有向边：`A->B`，可带权重 `A->B:2.5`
 * - 语句分隔：逗号、分号、换行均可；`#` 起注释到行尾
 *
 * 尽力解析：单条语句格式错误记入 errors 并跳过，不影响其余语句（支撑"实时解析 + 逐行提示"体验）。
 */

export interface DslEdge {
  source: string
  target: string
  directed: boolean
  weight: number | null
}

export interface DslError {
  /** 1-based 行号 */
  line: number
  /** 行内 1-based 列（近似：语句起点） */
  column: number
  message: string
}

export interface DslParseResult {
  /** 出现过的全部顶点名（按首次出现顺序去重） */
  nodes: string[]
  edges: DslEdge[]
  errors: DslError[]
}

/** 合法名称：字母/数字/下划线/汉字（不含分隔符 - : , ; 与空白） */
const NAME_PATTERN = '[A-Za-z0-9_\\u4e00-\\u9fff]+'

const VERTEX_RE = new RegExp(`^(${NAME_PATTERN})$`)
const EDGE_RE = new RegExp(
  `^(${NAME_PATTERN})\\s*(->|--|-)\\s*(${NAME_PATTERN})\\s*(?::\\s*(\\S+))?$`,
)

/** 解析权重：允许数字与正负号/小数/科学计数（不做表达式求值） */
function parseWeight(text: string): number | null {
  if (!/^[-+]?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

export function parseGraphDsl(text: string): DslParseResult {
  const nodes: string[] = []
  const seen = new Set<string>()
  const edges: DslEdge[] = []
  const errors: DslError[] = []

  const addNode = (name: string): void => {
    if (!seen.has(name)) {
      seen.add(name)
      nodes.push(name)
    }
  }

  const lines = text.split(/\r?\n/)
  for (const [lineIndex, rawLine] of lines.entries()) {
    const lineNo = lineIndex + 1
    // 去注释
    const hashIndex = rawLine.indexOf('#')
    const line = hashIndex >= 0 ? rawLine.slice(0, hashIndex) : rawLine
    if (!line.trim()) continue

    // 行内按逗号/分号切分语句，跟踪近似列号
    let cursor = 0
    for (const statementRaw of line.split(/[,;]/)) {
      const column = cursor + 1
      cursor += statementRaw.length + 1
      const statement = statementRaw.trim()
      if (!statement) continue

      const vertexMatch = VERTEX_RE.exec(statement)
      if (vertexMatch) {
        addNode(vertexMatch[1] as string)
        continue
      }

      const edgeMatch = EDGE_RE.exec(statement)
      if (edgeMatch) {
        const source = edgeMatch[1] as string
        const op = edgeMatch[2] as string
        const target = edgeMatch[3] as string
        const weightText = edgeMatch[4]
        let weight: number | null = null
        if (weightText !== undefined) {
          weight = parseWeight(weightText)
          if (weight === null) {
            errors.push({
              line: lineNo,
              column,
              message: `权重无法解析：「${weightText}」（支持数字，如 3、2.5、-1）`,
            })
            continue
          }
        }
        addNode(source)
        addNode(target)
        edges.push({ source, target, directed: op === '->', weight })
        continue
      }

      errors.push({
        line: lineNo,
        column,
        message: `无法解析的语句：「${statement}」（期望「顶点」、「A-B」或「A->B」，可带 :权重）`,
      })
    }
  }

  return { nodes, edges, errors }
}
