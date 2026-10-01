/**
 * TikZ 导出编译验证（v0.6 验收：「生成的 .tex 在标准 LaTeX 环境编译无错误」）。
 * - 未安装 pdflatex（如 CI 环境）时自动跳过；
 * - 本机 pdflatex 因权限限制不可直接运行时，尝试 Windows 降权模式（runas /trustlevel）执行；
 * - 编译真实导出的完整文档，断言生成 PDF。
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTikz } from './tikz'
import { graphObjectFromDsl } from '../graph/dsl-to-doc'
import { createView } from '../core/transform'
import type { Curve, DocState } from '../state/types'

/** 同步等待（Atomics.wait；Node 环境可用） */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** 探测 pdflatex 能否直接编译（部分环境下 --version 会「警告但退出 0」，必须实际编译） */
function canRunDirect(): boolean {
  try {
    const dir = mkdtempSync(join(tmpdir(), 'tikz-probe-'))
    const file = join(dir, 'probe.tex')
    writeFileSync(
      file,
      '\\documentclass{article}\n\\begin{document}\nprobe\n\\end{document}\n',
      'utf-8',
    )
    execFileSync(
      'pdflatex',
      ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', dir, file],
      { stdio: 'ignore', timeout: 60_000 },
    )
    return existsSync(join(dir, 'probe.pdf'))
  } catch {
    return false
  }
}

/** Windows 权限受限时：探测 runas 降权模式是否可用（输出版本号到探测文件） */
function runasAvailable(): boolean {
  if (process.platform !== 'win32') return false
  try {
    const probe = join(tmpdir(), `pdflatex-probe-${process.pid}-${Date.now()}.txt`)
    execSync(`runas /trustlevel:0x20000 "cmd /c pdflatex --version > ${probe} 2>&1"`, {
      stdio: 'ignore',
    })
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (existsSync(probe)) {
        const text = readFileSync(probe, 'utf-8')
        if (text.includes('pdfTeX')) return true
        // 文件已创建但内容可能尚未写完（降权进程异步）——继续等待
      }
      sleepSync(250)
    }
    return false
  } catch {
    return false
  }
}

const direct = canRunDirect()
const viaRunas = !direct && runasAvailable()

function curve(expr: string, extra: Partial<Curve> = {}): Curve {
  return {
    id: `c-${expr}`,
    type: 'curve',
    kind: 'explicit',
    name: expr,
    expr,
    color: '#2563eb',
    lineStyle: 'solid',
    quality: 3,
    visible: true,
    ...extra,
  }
}

/** 编译 tex 文档；返回是否生成 PDF（direct 直跑，或 runas 降权后轮询产物） */
function compile(tex: string): boolean {
  const dir = mkdtempSync(join(tmpdir(), 'tikz-check-'))
  writeFileSync(join(dir, 'export-test.tex'), tex, 'utf-8')
  const pdf = join(dir, 'export-test.pdf')
  if (direct) {
    execFileSync(
      'pdflatex',
      [
        '-interaction=nonstopmode',
        '-halt-on-error',
        '-output-directory',
        dir,
        join(dir, 'export-test.tex'),
      ],
      { encoding: 'utf-8', cwd: dir, timeout: 120_000 },
    )
    return existsSync(pdf)
  }
  execSync(
    `runas /trustlevel:0x20000 "cmd /c cd /d ${dir} && pdflatex -interaction=nonstopmode -halt-on-error export-test.tex > compile.log 2>&1"`,
    { stdio: 'ignore' },
  )
  // 轮询产物：文件出现且大小连续两次稳定视为写完
  const deadline = Date.now() + 120_000
  let lastSize = -1
  while (Date.now() < deadline) {
    if (existsSync(pdf)) {
      const size = statSync(pdf).size
      if (size > 0 && size === lastSize) return true
      lastSize = size
    }
    sleepSync(500)
  }
  return false
}

describe.skipIf(!direct && !viaRunas)('export/tikz: 实际编译验证（需要本地 LaTeX）', () => {
  const view = createView()
  const size = { width: 800, height: 600 }

  it('显式函数曲线：sin(x) 与二次函数文档编译通过', () => {
    const doc: DocState = {
      objects: [curve('sin(x)'), curve('0.5*x^2 - 2')],
    }
    const { tex } = buildTikz(doc, 'plot', view, {
      range: { kind: 'view' },
      size,
      standalone: true,
    })
    expect(compile(tex)).toBe(true)
  })

  it('参数方程与极坐标文档编译通过', () => {
    const doc: DocState = {
      objects: [
        { ...curve('cos(t)'), kind: 'parametric', expr2: 'sin(t)' },
        { ...curve('1 + cos(theta)'), kind: 'polar' },
        curve('sqrt(abs(x))'),
      ],
    }
    const { tex } = buildTikz(doc, 'plot', view, {
      range: { kind: 'view' },
      size,
      standalone: true,
    })
    expect(compile(tex)).toBe(true)
  })

  it('图（有向边 + 权重 + 自环）文档编译通过', () => {
    const { graph } = graphObjectFromDsl('A->B:3, A-C, B-C:1.5, C->D, D-D')
    const tex = buildTikz({ objects: [graph!] }, 'graph', view, {
      range: { kind: 'view' },
      size,
      standalone: true,
    }).tex
    expect(compile(tex)).toBe(true)
  })

  it('生成的代码可读：含注释与缩进、无坐标点列表', () => {
    const doc: DocState = { objects: [curve('sin(x)')] }
    const { tex } = buildTikz(doc, 'plot', view, {
      range: { kind: 'view' },
      size,
      standalone: true,
    })
    expect(tex).toContain('% 曲线：sin(x)')
    expect(tex).toContain('\\begin{tikzpicture}')
    expect(tex).toContain('\\begin{axis}')
    // 符号形式而非点列表：整体长度受控
    expect(tex.length).toBeLessThan(2000)
  })
})
