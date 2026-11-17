import { readStorage, writeStorage } from './state.js'

const DEVICE_KEY = 'chat-demo:sync-device'

/** 租约有效期：对方超过这段时间没有同步，就认为它已经不在用了 */
export const LEASE_MS = 10 * 60 * 1000

const randomId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** 本机标识：只用于租约登记，不含任何可识别个人的信息 */
export const deviceId = (): string => {
  const stored = readStorage(DEVICE_KEY)
  if (stored) {
    return stored
  }
  const id = randomId()
  writeStorage(DEVICE_KEY, id)
  return id
}

/** 从 UA 猜一个能让人认出来的名字，只用于「正在另一台设备上使用」这句提示 */
export const deviceName = (): string => {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser'
  const system = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return system ? `${browser} · ${system}` : browser
}