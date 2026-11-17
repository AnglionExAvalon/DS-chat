/**
 * 会话层与同步层之间的单向通道：会话状态变化时通知同步层，避免 store 反向依赖 sync 引擎。
 * 同步引擎加载后注册实现，未注册时调用是空操作。
 */
export type SyncRequest = {
  /** 跳过防抖，立刻同步一次（发送消息后使用） */
  immediate?: boolean
}

let trigger: ((request: SyncRequest) => void) | null = null

export const setSyncTrigger = (fn: ((request: SyncRequest) => void) | null) => {
  trigger = fn
}

export const requestSync = (request: SyncRequest = {}) => {
  trigger?.(request)
}