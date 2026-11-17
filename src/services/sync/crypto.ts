import { SyncError } from './types.js'

/** 去掉横线和空格并转大写，让不同设备输入的码等价 */
export const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** 每 4 位插入横线，便于抄写 */
export const formatSyncCode = (code: string) => code.replace(/(.{4})/g, '$1-').replace(/-$/, '')

/** 生成 16 位同步码，去掉容易看错的 0/O/1/I */
export const createSyncCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 同步码派生登录用的邮箱与密码，保证同一个码在任何设备对应同一个账号 */
export const deriveCredentials = async (code: string) => ({
  email: `u_${(await sha256Hex(`email:${code}`)).slice(0, 24)}@ds-chat.local`,
  password: (await sha256Hex(`password:${code}`)).slice(0, 40),
})

/** 同步码再派生 AES-GCM 密钥：服务端只保存密文 */
const deriveCryptoKey = async (code: string): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('ds-chat-sync'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * 派生密钥很慢（PBKDF2 十万次），每次同步都重算会让退出前的最后一次上传来不及完成，
 * 因此按同步码缓存；切换同步码时旧条目自然失效。
 */
const keyCache = new Map<string, Promise<CryptoKey>>()

export const getCryptoKey = (code: string): Promise<CryptoKey> => {
  let cached = keyCache.get(code)
  if (!cached) {
    cached = deriveCryptoKey(code)
    keyCache.set(code, cached)
    // 派生失败时不要把被拒绝的 Promise 留在缓存里
    cached.catch(() => keyCache.delete(code))
  }
  return cached
}

/**
 * 字节转 Base64：不能一次性把整个数组展开成参数，否则数据量大时会超出调用栈，
 * 因此按 32KB 分块拼接。
 */
const toBase64 = (bytes: Uint8Array): string => {
  const CHUNK = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

export const encrypt = async (key: CryptoKey, text: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  )
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`
}

export const decrypt = async (key: CryptoKey, payload: string): Promise<string> => {
  const [ivPart, dataPart] = payload.split('.')
  if (!ivPart || !dataPart) {
    throw new SyncError('syncFailed')
  }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivPart) },
    key,
    fromBase64(dataPart)
  )
  return new TextDecoder().decode(plain)
}