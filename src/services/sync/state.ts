import { create } from 'zustand'
import type { SyncState } from './types.js'

export const CODE_KEY = 'chat-demo:sync-code'
export const AUTH_KEY = 'chat-demo:sync-auth'
export const LAST_SYNC_KEY = 'chat-demo:sync-last-at'
export const AUTO_KEY = 'chat-demo:sync-auto'
/** 每个会话同步到哪一版：本地改动时间与云端版本号 */
export const MARKS_KEY = 'chat-demo:sync-marks'
/** 本地已删除、尚未确认同步到云端的会话 */
export const DELETED_KEY = 'chat-demo:sync-deleted'
/** 旧整包快照是否已经拆成会话级快照 */
export const MIGRATED_KEY = 'chat-demo:sync-migrated'

export const readStorage = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const writeStorage = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在本次会话生效
  }
}

const readJson = <T>(key: string, fallback: T): T => {
  const raw = readStorage(key)
  if (!raw) {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 每个会话上次同步时的本地改动时间与云端版本号 */
export type SyncMark = { localAt: number; version: number }

export const readMarks = (): Record<string, SyncMark> => readJson(MARKS_KEY, {})

export const writeMarks = (entries: Iterable<[string, SyncMark]>) => {
  const marks = readMarks()
  let changed = false
  for (const [id, mark] of entries) {
    marks[id] = mark
    changed = true
  }
  if (changed) {
    writeStorage(MARKS_KEY, JSON.stringify(marks))
  }
}

export const writeMark = (id: string, mark: SyncMark) => writeMarks([[id, mark]])

export const forgetMark = (id: string) => {
  const marks = readMarks()
  if (Object.hasOwn(marks, id)) {
    writeStorage(
      MARKS_KEY,
      JSON.stringify(Object.fromEntries(Object.entries(marks).filter(([key]) => key !== id)))
    )
  }
}

/** 本地已删除的会话及删除时间；同步成功后仍然保留，避免被旧数据重新拉回来 */
export const readDeletions = (): Record<string, number> => readJson(DELETED_KEY, {})

export const markSessionDeleted = (id: string) => {
  const entries = readDeletions()
  entries[id] = Date.now()
  writeStorage(DELETED_KEY, JSON.stringify(entries))
}

export const clearDeletion = (id: string) => {
  const entries = readDeletions()
  if (Object.hasOwn(entries, id)) {
    writeStorage(
      DELETED_KEY,
      JSON.stringify(Object.fromEntries(Object.entries(entries).filter(([key]) => key !== id)))
    )
  }
}

/** 换同步码或重置使用：清掉逐会话的同步记录 */
export const resetSyncBooks = () => {
  writeStorage(MARKS_KEY, null)
  writeStorage(DELETED_KEY, null)
  writeStorage(MIGRATED_KEY, null)
  writeStorage(LAST_SYNC_KEY, null)
}

export const readAuto = (): boolean => readStorage(AUTO_KEY) !== 'false'

export const readLastSync = (): number | null => {
  const value = Number(readStorage(LAST_SYNC_KEY))
  return Number.isFinite(value) && value > 0 ? value : null
}

export const useSync = create<SyncState>(() => {
  const code = readStorage(CODE_KEY)
  return {
    code: code ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
    connected: Boolean(code && readStorage(AUTH_KEY)),
    busy: null,
    lastSyncAt: readLastSync(),
    error: null,
    errorDetail: null,
    auto: readAuto(),
    conflict: false,
    conflicts: [],
    pending: false,
    startup: 'idle',
    lease: null,
    takenOver: false,
  }
})