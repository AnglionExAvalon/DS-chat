/**
 * 云同步的对外入口：底层拆在 services/sync 目录里，
 * 这里只做汇总，界面与 App 只依赖本文件。
 */
export { createSyncCode, formatSyncCode } from './sync/crypto.js'
export {
  checkStartupSync,
  clearSyncError,
  connectSync,
  disconnectSync,
  dismissOccupied,
  flushAutoSync,
  openSyncConflict,
  pullFromCloud,
  pushToCloud,
  resolveConflicts,
  scheduleAutoSync,
  setAutoSync,
  syncNow,
  takeOverSync,
} from './sync/engine.js'
export { useSync } from './sync/state.js'
export { SyncError } from './sync/types.js'