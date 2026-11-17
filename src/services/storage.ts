/** 持久化存储状态：persisted 为 null 表示当前浏览器不支持 StorageManager */
export type StorageStatus = {
  persisted: boolean | null
  /** 已用字节数 */
  usage: number
  /** 配额字节数 */
  quota: number
}

const LAST_EXPORT_KEY = 'chat-demo:last-export'

const storageManager = () =>
  typeof navigator === 'undefined' ? undefined : navigator.storage

/**
 * 申请持久化存储：避免浏览器在磁盘紧张时把本站数据当缓存回收。
 * 是否授予由浏览器决定，失败或不受支持时静默返回 false。
 */
export const ensurePersistentStorage = async (): Promise<boolean> => {
  const storage = storageManager()
  if (!storage?.persist || !storage.persisted) {
    return false
  }
  try {
    if (await storage.persisted()) {
      return true
    }
    return await storage.persist()
  } catch {
    return false
  }
}

/** 读取持久化状态与用量；接口不可用或失败时按不支持处理 */
export const readStorageStatus = async (): Promise<StorageStatus> => {
  const storage = storageManager()
  if (!storage) {
    return { persisted: null, usage: 0, quota: 0 }
  }
  try {
    const persisted = storage.persisted ? await storage.persisted() : null
    const estimate = storage.estimate ? await storage.estimate() : undefined
    return {
      persisted,
      usage: estimate?.usage ?? 0,
      quota: estimate?.quota ?? 0,
    }
  } catch {
    return { persisted: null, usage: 0, quota: 0 }
  }
}

/** 上次导出备份的时间；没有记录或存储不可用时为 null */
export const readLastExport = (): number | null => {
  try {
    const value = Number(localStorage.getItem(LAST_EXPORT_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/** 导出成功后记录时间，供设置页提示备份情况 */
export const markExported = (time = Date.now()) => {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(time))
  } catch {
    // 存储不可用时只在本次会话生效，不影响导出结果
  }
}