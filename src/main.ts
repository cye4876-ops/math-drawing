import { mount } from 'svelte'
import './app.css'
import App from './ui/App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// PWA（v1.0）：仅生产构建注册 Service Worker（dev 下注册会干扰 HMR 资源加载）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

export default app
