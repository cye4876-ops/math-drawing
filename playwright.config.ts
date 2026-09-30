import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:5173'

/**
 * 浏览器通道覆盖（可选）：
 * - 默认不设置：使用 Playwright 内置 Chromium（CI 的标准路径）；
 * - 本机网络受限时可用已安装的系统浏览器：设置环境变量 PW_CHANNEL=chrome 或 msedge。
 */
const channel = process.env.PW_CHANNEL as 'chrome' | 'msedge' | undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
