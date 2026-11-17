import { deriveCredentials } from './crypto.js'
import { AUTH_KEY, readStorage, writeStorage } from './state.js'
import { SyncError, type AuthSession } from './types.js'

/** 构建时注入的 Supabase 项目地址与可公开的 publishable key */
const SUPABASE_URL = __SUPABASE_URL__
const SUPABASE_KEY = __SUPABASE_KEY__

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
export const signIn = async (code: string): Promise<AuthSession> => {
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
export const ensureSession = async (code: string): Promise<AuthSession> => {
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

export const clearAuth = () => writeAuth(null)

export const restRequest = async (code: string, path: string, init: RequestInit = {}) => {
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
    const detail = await response.text().catch(() => '')
    // 行级安全策略拒绝时给专门的提示，便于区分是配置问题而不是网络问题
    throw new SyncError(
      detail.includes('row-level security') ? 'syncRls' : 'syncFailed',
      detail.slice(0, 200)
    )
  }
  return response
}

export const restJson = async <T>(code: string, path: string, init: RequestInit = {}) =>
  (await restRequest(code, path, init)).json() as Promise<T>