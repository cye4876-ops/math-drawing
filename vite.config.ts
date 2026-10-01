import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // 将"是否处于覆盖率模式"透传给测试（性能基准需要区分插桩与否）
    env: {
      EXPR_COVERAGE: process.argv.includes('--coverage') ? 'true' : 'false',
    },
    coverage: {
      provider: 'v8',
      include: [
        'src/expr/**',
        'src/core/**',
        'src/render/samplers/**',
        'src/render/viewport.ts',
        'src/render/curve-renderer.ts',
        'src/state/**',
        'src/math/numeric/**',
        'src/tools/**',
        'src/graph/**',
      ],
      // worker 入口（self.onmessage 顶层副作用）无法在 node 环境单测，由 e2e 冒烟覆盖；
      // 其内部逻辑（布局算法）在同目录 layouts.ts 中测试。
      exclude: ['src/graph/layout-worker.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        'src/expr/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        'src/render/samplers/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        'src/core/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        'src/math/numeric/**': {
          statements: 88,
          branches: 84,
          functions: 95,
          lines: 88,
        },
        // 交互工具含大量 canvas 绘制分支（由 e2e/人工验证兜底），阈值低于纯逻辑模块
        'src/tools/**': {
          statements: 76,
          branches: 55,
          functions: 80,
          lines: 80,
        },
        'src/graph/**': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
  build: {
    // PWA 分包（v1.0）：three / katex 独立 chunk（均由懒加载视图按需拉取，首屏不含）
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/katex')) return 'katex'
          return undefined
        },
      },
    },
  },
})
