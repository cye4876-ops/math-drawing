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
      ],
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
      },
    },
  },
})
