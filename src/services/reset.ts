import * as db from './chat/db.js'

/** 本站写入 localStorage 的键统一使用这个前缀，清理时按前缀整批删除 */
const STORAGE_PREFIX = 'chat-demo:'
/** Service Worker 使用的缓存名前缀 */
const CACHE_PREFIX = 'ds-chat'

/**
 * 清除本机保存的全部数据：IndexedDB 中的对话与附件、localStorage 中的 API Key 与各项设置，
 * 以及 Service Worker 缓存的静态资源。云端同步记录不受影响，重新输入同步码即可恢复。
 */
export const clearLocalData = async (): Promise<void> => {
  await db.clearAll()
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key)
      }
    }
  } catch {
    // 存储被禁用时本来就没有可清理的内容
  }
  if ('caches' in window) {
    try {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))
      )
    } catch {
      // 缓存接口不可用时忽略，不影响数据清理
    }
  }
}