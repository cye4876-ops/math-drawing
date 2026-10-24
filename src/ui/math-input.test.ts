/**
 * v3.3 结构化数学输入测试：插入/替换/光标标记；比较式预览；非法输入降级。
 */
import { describe, expect, it } from 'vitest'
import { MATH_KEYS, insertMathSnippet, previewLatex } from './math-input'

describe('v3.3 数学输入：片段插入', () => {
  it('光标处插入并落在末尾（原光标后的字符保留）', () => {
    expect(insertMathSnippet('x + ', 3, 3, '^2')).toEqual({ value: 'x +^2 ', caret: 5 })
  })

  it('选中文本被替换', () => {
    expect(insertMathSnippet('abc', 0, 3, '1/2')).toEqual({ value: '1/2', caret: 3 })
  })

  it('@ 标记决定光标位置（sqrt(@)）', () => {
    const key = MATH_KEYS.find((item) => item.id === 'sqrt')!
    expect(insertMathSnippet('', 0, 0, key.insert)).toEqual({ value: 'sqrt()', caret: 5 })
  })

  it('越界光标被夹紧，不抛异常', () => {
    expect(insertMathSnippet('ab', 99, 99, '+')).toEqual({ value: 'ab+', caret: 3 })
    expect(insertMathSnippet('ab', -5, 1, 'x')).toEqual({ value: 'xb', caret: 1 })
  })

  it('键位表 id 唯一且均非空', () => {
    const ids = MATH_KEYS.map((key) => key.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const key of MATH_KEYS) {
      expect(key.label.length).toBeGreaterThan(0)
      expect(key.insert.length).toBeGreaterThan(0)
    }
  })
})

describe('v3.3 数学输入：LaTeX 预览', () => {
  it('普通表达式渲染为 LaTeX', () => {
    const latex = previewLatex('x^2 + 1')
    expect(latex).toBeTruthy()
    expect(latex).toContain('x')
    expect(latex).toContain('2')
  })

  it('比较式分别渲染两侧（≤ / ≠ / =）', () => {
    expect(previewLatex('x <= 1')).toContain('\\le')
    expect(previewLatex('a != b')).toContain('\\ne')
    expect(previewLatex('y = x + 1')).toContain('=')
  })

  it('空串 / 不完整表达式 / 不完整比较式返回 null', () => {
    expect(previewLatex('   ')).toBeNull()
    expect(previewLatex('x +')).toBeNull()
    expect(previewLatex('x =')).toBeNull()
    expect(previewLatex('= 2')).toBeNull()
  })
})
