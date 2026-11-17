import type { TranslationKey } from '../../i18n/index.js'

/** 可以直接展示给用户的同步错误，detail 保留服务端返回的原文便于排查 */
export class SyncError extends Error {
  constructor(
    readonly key: TranslationKey,
    readonly detail?: string
  ) {
    super(detail ? `${key}: ${detail}` : key)
    this.name = 'SyncError'
  }
}

export type AuthSession = {
  access_token: string
  refresh_token: string
  /** 毫秒时间戳 */
  expires_at: number
  user_id: string
}

/** 云端登记的占用设备，同一同步码同一时间只允许一台设备写入 */
export type DeviceLease = {
  deviceId: string
  deviceName: string
  /** 毫秒时间戳，来自服务端时间 */
  seenAt: number
}

/** 启动检查阶段：检查中 / 同步中 / 有冲突 / 被其他设备占用 / 空闲 */
export type StartupStage = 'idle' | 'checking' | 'syncing' | 'conflict' | 'occupied'

export type SyncState = {
  /** 归一化后的同步码；未配置时为 null */
  code: string | null
  connected: boolean
  busy: 'connect' | 'sync' | null
  lastSyncAt: number | null
  error: TranslationKey | null
  /** 服务端返回的错误原文，便于定位 RLS、请求过大等问题 */
  errorDetail: string | null
  /** 是否自动同步，默认开启 */
  auto: boolean
  /** 有会话两边都改过，自动同步已暂停，等待用户选择 */
  conflict: boolean
  /** 冲突的会话 id；用于弹窗里显示数量 */
  conflicts: string[]
  /** 本地存在尚未上传的改动 */
  pending: boolean
  startup: StartupStage
  /** 云端登记的占用设备；未读取到时为 null */
  lease: DeviceLease | null
  /** 同步码已被另一台设备接管，本机停止自动同步 */
  takenOver: boolean
}