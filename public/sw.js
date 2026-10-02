/**
 * Math Drawing Service Worker
 *
 * 策略：
 * - 应用外壳（HTML/manifest/图标）：install 预缓存；导航请求 network-first
 *   （`cache: 'no-cache'` 强制向服务器重验证，拿到新版即更新缓存），断网回退缓存的 index.html —— 可离线打开应用；
 * - 静态资源（/assets/* 内容哈希、字体、图片、样式、脚本）：cache-first（哈希文件名天然可长缓存）；
 * - 升级自愈（v2.5.1）：VERSION 由构建时注入（每次部署不同）→ activate 检测到旧版本缓存时，
 *   主动导航所有已打开的页面（`client.navigate`）——即使旧页面因资源错配白屏也能被拉回最新版；
 * - 升级：切换 VERSION 即清理全部旧缓存（activate 时）；
 * - 仅同源 GET 请求介入；插件（public/plugins/*.js 无哈希）走 navigator 默认策略（浏览器 HTTP 缓存）。
 */
const VERSION = '__SW_VERSION__'
const SHELL_CACHE = `math-drawing-shell-${VERSION}`
const ASSET_CACHE = `math-drawing-assets-${VERSION}`
/** 站点前缀（自适应子路径部署，如 GitHub Pages 的 /math-drawing/；根路径部署则为 /） */
const BASE = new URL('./', self.location).href
const SHELL_FILES = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.webmanifest',
  BASE + 'icon.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // 存在旧版本缓存 ⇒ 本次是“部署升级”（首次安装时无旧缓存）
        const hadOldVersion = keys.some((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
        return Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ).then(() => hadOldVersion)
      })
      .then((hadOldVersion) =>
        self.clients.claim().then(() => {
          if (!hadOldVersion) return
          // 升级自愈：导航所有已打开的页面——旧页面（甚至白屏）重新加载后
          // 由导航请求的 no-cache 重验证拿到新 index.html，避免引用已删除资源
          return self.clients.matchAll({ type: 'window' }).then((clients) => {
            for (const client of clients) void client.navigate(client.url)
          })
        }),
      ),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // 导航：network-first（no-cache 重验证，部署后立即可见；离线回退外壳）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          const copy = response.clone()
          void caches.open(SHELL_CACHE).then((cache) => cache.put(BASE + 'index.html', copy))
          return response
        })
        .catch(() =>
          caches.match(BASE + 'index.html').then((cached) => cached ?? Response.error()),
        ),
    )
    return
  }

  // 静态资源：cache-first（/plugins/ 除外——插件由用户迭代，走网络以拿最新）
  if (
    !url.pathname.includes('/plugins/') &&
    (url.pathname.includes('/assets/') ||
      /\.(woff2?|ttf|png|svg|css|js|webmanifest)$/.test(url.pathname))
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
      }),
    )
  }
})
