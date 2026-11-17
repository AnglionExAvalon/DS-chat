/**
 * Service Worker：网络优先、离线回退到缓存。
 * 每次在线访问都会更新缓存，所以推送新版本后刷新即可生效，不会卡在旧版本。
 */
const CACHE = 'ds-chat-v1'
const OFFLINE_FALLBACK = './index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_FALLBACK, './manifest.webmanifest']))
  )
  // 新版本立即接管，避免用户长时间停留在旧版
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  // 只处理同源静态资源，API 请求（跨域）直接交给浏览器
  if (url.origin !== self.location.origin) {
    return
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(request)
        if (cached) {
          return cached
        }
        // 页面导航失败时回退到缓存的首页，保证离线也能打开界面
        if (request.mode === 'navigate') {
          const fallback = await caches.match(OFFLINE_FALLBACK)
          if (fallback) {
            return fallback
          }
        }
        return Response.error()
      })
  )
})