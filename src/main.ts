import { mount } from 'svelte'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './app.css'
import App from './ui/App.svelte'
import { initTheme } from './ui/theme.svelte'

initTheme()

// 部署自愈：页面停留在旧版本时，新 chunk 哈希不匹配会触发 preloadError；
// 自动刷新一次拿到最新版本（会话内只重试一次，避免循环刷新）。
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (sessionStorage.getItem('md.preload-reload') === '1') return
  sessionStorage.setItem('md.preload-reload', '1')
  window.location.reload()
})

const app = mount(App, {
  target: document.getElementById('app')!,
})

// 应用成功启动：清除自愈标记，保证下次部署仍可自动恢复
sessionStorage.removeItem('md.preload-reload')
sessionStorage.removeItem('md.sw-reload')

// PWA（v1.0）：仅生产构建注册 Service Worker（dev 下注册会干扰 HMR 资源加载）
// 注册路径基于构建的 base（自适应子路径部署，如 GitHub Pages）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller)
  // 新版本 Service Worker 接管（= 部署完成）时刷新一次：避免旧页面引用已删除资源
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return
    if (sessionStorage.getItem('md.sw-reload') === '1') return
    sessionStorage.setItem('md.sw-reload', '1')
    window.location.reload()
  })
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      updateViaCache: 'none',
    })
  })
}

export default app
