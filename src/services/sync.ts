import { create } from 'zustand'
import type { TranslationKey } from '../i18n/index.js'
import * as db from './chat/db.js'
import { replaceHistory, useChatStore } from './chat/store.js'
import type { Session } from './chat/types.js'

/** 构建时注入的 Supabase 项目地址与可公开的 publishable key */
const SUPABASE_URL = __SUPABASE_URL__
const SUPABASE_KEY = __SUPABASE_KEY__

const CODE_KEY = 'chat-demo:sync-code'
const AUTH_KEY = 'chat-demo:sync-auth'
const LAST_SYNC_KEY = 'chat-demo:sync-last-at'

/** 可以直接展示给用户的同步错误 */
export class SyncError extends Error {
  constructor(readonly key: TranslationKey) {
    super(key)
    this.name = 'SyncError'
  }
}

type AuthSession = {
  access_token: string
  refresh_token: string
  /** 毫秒时间戳 */
  expires_at: number
  user_id: string
}

type SyncState = {
  /** 归一化后的同步码；未配置时为 null */
  code: string | null
  connected: boolean
  busy: 'connect' | 'push' | 'pull' | null
  lastSyncAt: number | null
  error: TranslationKey | null
}

const readStorage = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: string | null) => {
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

/** 去掉横线和空格并转大写，让不同设备输入的码等价 */
const normalizeCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** 每 4 位插入横线，便于抄写 */
export const formatSyncCode = (code: string) => code.replace(/(.{4})/g, '$1-').replace(/-$/, '')

/** 生成 16 位同步码，去掉容易看错的 0/O/1/I */
export const createSyncCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}

const readAuth = (): AuthSession | null => {
  const raw = readStorage(AUTH_KEY)
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    return typeof parsed.access_token === 'string' &&
      typeof parsed.refresh_token === 'string' &&
      typeof parsed.expires_at === 'number' &&
      typeof parsed.user_id === 'string'
      ? (parsed as AuthSession)
      : null
  } catch {
    return null
  }
}

const writeAuth = (session: AuthSession | null) =>
  writeStorage(AUTH_KEY, session ? JSON.stringify(session) : null)

const readLastSync = (): number | null => {
  const value = Number(readStorage(LAST_SYNC_KEY))
  return Number.isFinite(value) && value > 0 ? value : null
}

const markSynced = () => {
  const now = Date.now()
  writeStorage(LAST_SYNC_KEY, String(now))
  useSync.setState({ lastSyncAt: now })
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 同步码派生登录用的邮箱与密码，保证同一个码在任何设备对应同一个账号 */
const deriveCredentials = async (code: string) => ({
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

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

const encrypt = async (key: CryptoKey, text: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  )
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`
}

const decrypt = async (key: CryptoKey, payload: string): Promise<string> => {
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

const authCall = async (path: string, body: unknown) => {
  let response: Response
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new SyncError('syncNetwork')
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
  return { ok: response.ok, payload }
}

const toAuthSession = (payload: Record<string, unknown> | null): AuthSession | null => {
  const accessToken = payload?.access_token
  const refreshToken = payload?.refresh_token
  const user = payload?.user as { id?: string } | undefined
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return null
  }
  if (typeof user?.id !== 'string') {
    return null
  }
  const expiresIn = typeof payload?.expires_in === 'number' ? payload.expires_in : 3600
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    user_id: user.id,
  }
}

/** 先用密码登录，账号不存在时注册；注册未返回会话说明邮箱确认还开着 */
const signIn = async (code: string): Promise<AuthSession> => {
  const { email, password } = await deriveCredentials(code)
  const signInResult = await authCall('token?grant_type=password', { email, password })
  const session = toAuthSession(signInResult.payload)
  if (signInResult.ok && session) {
    return session
  }
  const signUpResult = await authCall('signup', { email, password })
  const created = toAuthSession(signUpResult.payload)
  if (signUpResult.ok && created) {
    return created
  }
  if (signUpResult.ok) {
    throw new SyncError('syncConfirmEmail')
  }
  throw new SyncError('syncBadCode')
}

/** 取用可用的会话：临期或失效时先刷新，再退回重新登录 */
const ensureSession = async (code: string): Promise<AuthSession> => {
  const stored = readAuth()
  if (stored && stored.expires_at > Date.now() + 60_000) {
    return stored
  }
  if (stored) {
    const refreshed = await authCall('token?grant_type=refresh_token', {
      refresh_token: stored.refresh_token,
    })
    const next = toAuthSession(refreshed.payload)
    if (refreshed.ok && next) {
      writeAuth(next)
      return next
    }
  }
  const session = await signIn(code)
  writeAuth(session)
  return session
}

const restRequest = async (code: string, path: string, init: RequestInit = {}) => {
  const session = await ensureSession(code)
  let response: Response
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new SyncError('syncNetwork')
  }
  if (response.status === 401) {
    writeAuth(null)
    throw new SyncError('syncUnauthorized')
  }
  if (!response.ok) {
    throw new SyncError('syncFailed')
  }
  return response
}

/** 读取本地全部会话，与导出备份使用同一份数据 */
const readAllSessions = async (): Promise<Session[]> => {
  const { sessions, sessionCache } = useChatStore.getState()
  const list: Session[] = []
  for (const summary of sessions) {
    const session = Object.hasOwn(sessionCache, summary.id)
      ? sessionCache[summary.id]
      : await db.loadSession(summary.id)
    if (session) {
      list.push({ ...session, ...summary })
    }
  }
  return list
}

export const useSync = create<SyncState>(() => {
  const code = readStorage(CODE_KEY)
  return {
    code: code ? normalizeCode(code) : null,
    connected: Boolean(code && readAuth()),
    busy: null,
    lastSyncAt: readLastSync(),
    error: null,
  }
})

/** 连接：校验同步码并登录 / 注册，成功后保存到本地 */
export const connectSync = async (input: string) => {
  const code = normalizeCode(input)
  if (code.length < 8) {
    useSync.setState({ error: 'syncBadCode' })
    return
  }
  if (!crypto.subtle) {
    useSync.setState({ error: 'syncInsecure' })
    return
  }
  useSync.setState({ busy: 'connect', error: null })
  try {
    const session = await signIn(code)
    writeAuth(session)
    writeStorage(CODE_KEY, code)
    useSync.setState({ code, connected: true, lastSyncAt: readLastSync() })
  } catch (error) {
    useSync.setState({ error: error instanceof SyncError ? error.key : 'syncFailed' })
  } finally {
    useSync.setState({ busy: null })
  }
}

/** 断开：清除本地的同步码与登录状态，云端数据保留 */
export const disconnectSync = () => {
  writeAuth(null)
  writeStorage(CODE_KEY, null)
  useSync.setState({ code: null, connected: false, busy: null, error: null })
}

export const clearSyncError = () => useSync.setState({ error: null })

/** 上传：加密全部会话后写入云端（覆盖同一同步码的记录） */
export const pushToCloud = async (): Promise<number> => {
  const { code, connected } = useSync.getState()
  if (!code || !connected) {
    throw new SyncError('syncBadCode')
  }
  useSync.setState({ busy: 'push', error: null })
  try {
    const key = await deriveCryptoKey(code)
    const sessions = await readAllSessions()
    if (sessions.length === 0) {
      throw new SyncError('syncEmptyLocal')
    }
    const payload = await encrypt(key, JSON.stringify({ version: 1, sessions }))
    const session = await ensureSession(code)
    await restRequest(code, 'snapshots', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: session.user_id,
        payload,
        updated_at: new Date().toISOString(),
      }),
    })
    markSynced()
    return sessions.length
  } catch (error) {
    useSync.setState({ error: error instanceof SyncError ? error.key : 'syncFailed' })
    throw error
  } finally {
    useSync.setState({ busy: null })
  }
}

/** 恢复：下载并解密后替换本地全部会话，调用方需要先获得用户确认 */
export const pullFromCloud = async (): Promise<number> => {
  const { code, connected } = useSync.getState()
  if (!code || !connected) {
    throw new SyncError('syncBadCode')
  }
  useSync.setState({ busy: 'pull', error: null })
  try {
    const key = await deriveCryptoKey(code)
    const session = await ensureSession(code)
    const response = await restRequest(
      code,
      `snapshots?select=payload&user_id=eq.${session.user_id}`,
      { method: 'GET' }
    )
    const rows = (await response.json()) as { payload: string }[]
    const remote = rows[0]?.payload
    if (!remote) {
      throw new SyncError('syncEmptyRemote')
    }
    const parsed = JSON.parse(await decrypt(key, remote)) as { sessions?: Session[] }
    const sessions = parsed.sessions ?? []
    if (sessions.length === 0) {
      throw new SyncError('syncEmptyRemote')
    }
    await replaceHistory(async () => {
      for (const item of sessions) {
        await db.addStagingSession(item)
      }
    })
    markSynced()
    return sessions.length
  } catch (error) {
    useSync.setState({ error: error instanceof SyncError ? error.key : 'syncFailed' })
    throw error
  } finally {
    useSync.setState({ busy: null })
  }
}