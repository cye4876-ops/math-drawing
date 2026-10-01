/**
 * nerdamer 最小类型声明（仅测试使用的 API 子集）。
 */
declare module 'nerdamer' {
  interface NerdamerExpression {
    toString(): string
    evaluate(): NerdamerExpression
    text(): string
    symbol: { elements: NerdamerExpression[] }
  }
  interface NerdamerStatic {
    (input: string): NerdamerExpression
  }
  const nerdamer: NerdamerStatic
  export default nerdamer
}

declare module 'nerdamer/Algebra'
declare module 'nerdamer/Calculus'
declare module 'nerdamer/Solve'
