import { normalizeSession } from '../chat/branches.js'
import * as db from '../chat/db.js'
import { applyRemoteSessions, useChatStore } from '../chat/store.js'
import type { Session } from '../chat/types.js'
import { clearAuth, ensureSession, restJson } from './api.js'
import { decrypt, encrypt, getCryptoKey, normalizeCode } from './crypto.js'
import { deviceId, deviceName } from './device.js'
import {
  AUTO_KEY,
  CODE_KEY,
  LAST_SYNC_KEY,
  MIGRATED_KEY,
  readDeletions,
  readMarks,
  readStorage,
  resetSyncBooks,
  useSync,
  writeMarks,
  writeStorage,
  type SyncMark,
} from './state.js'
import { setSyncTrigger } from './trigger.js'
import { SyncError, type DeviceLease } from './types.js'

/** 一次请求携带的会话数；单个会话通常只有几十 KB，批量太多会让单次请求过大 */
const BATCH = 8
/** 启动过渡至少展示这么久，避免检查太快时界面闪烁 */
const STARTUP_MIN_MS = 700
/** 改动后的合并等待；流式输出期间会不断重置，等于结束后再传一次 */
const DEBOUNCE_MS = 1500
/** 租约复核间隔：被另一台设备接管后最多一分钟内停写 */
const LEASE_CHECK_MS = 60_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const chunked = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

type RemoteRow = { session_id: string; version: number; deleted: boolean }
type RemotePayload = { session_id: string; payload: string; version: number }
type WrittenRow = { session_id: string; version: number }

type Plan = {
  push: string[]
  pushDeleted: string[]
  pull: string[]
  pullDelete: { id: string; version: number }[]
  conflicts: string[]
}

/** 冲突的人工选择：只在本轮会话有效，重新加载后会重新提示 */
const resolutions = new Map<string, 'local' | 'remote'>()

/** 统一把异常写入状态，保留可展示的细节 */
const reportError = (error: unknown) => {
  const key = error instanceof SyncError ? error.key : 'syncFailed'
  const detail =
    error instanceof SyncError ? (error.detail ?? null) : String(error).slice(0, 200)
  useSync.setState({ error: key, errorDetail: detail })
}

/** 等待本地会话初始化完成，避免恢复流程与初始化同时写库 */
const waitForChatReady = async (timeout = 15_000) => {
  const startedAt = Date.now()
  while (!useChatStore.getState().ready && Date.now() - startedAt < timeout) {
    await sleep(100)
  }
}

/**
 * 未完成的回答不进云端：页面中途关闭时留下的 pending / streaming 内容对另一台设备没有意义，
 * 拉下来也无法继续，按约定只保留完整的轮次。
 */
const stripUnfinished = (session: Session): Session => {
  const dropped = new Set(
    session.messages
      .filter(
        (message) =>
          message.role === 'assistant' &&
          (message.status === 'pending' || message.status === 'streaming')
      )
      .map((message) => message.id)
  )
  if (dropped.size === 0) {
    return session
  }
  return {
    ...session,
    messages: session.messages
      .filter((message) => !dropped.has(message.id))
      .map((message) =>
        message.selectedChildId && dropped.has(message.selectedChildId)
          ? { ...message, selectedChildId: undefined }
          : message
      ),
  }
}

const loadSessionForSync = async (id: string): Promise<Session | undefined> => {
  const { sessionCache } = useChatStore.getState()
  return Object.hasOwn(sessionCache, id) ? sessionCache[id] : db.loadSession(id)
}

const fetchRemoteRows = (code: string): Promise<RemoteRow[]> =>
  restJson<RemoteRow[]>(
    code,
    'session_snapshots?select=session_id,version,deleted&order=session_id',
    { method: 'GET' }
  )

const fetchPayloads = (code: string, ids: string[]): Promise<RemotePayload[]> => {
  const list = ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',')
  return restJson<RemotePayload[]>(
    code,
    `session_snapshots?select=session_id,payload,version&session_id=in.(${list})`,
    { method: 'GET' }
  )
}

type UpsertRow = { session_id: string; payload: string; deleted: boolean }

/** 写入若干会话（或删除墓碑），服务端触发器推进版本号并原样返回 */
const upsertRows = async (code: string, rows: UpsertRow[]): Promise<WrittenRow[]> => {
  const session = await ensureSession(code)
  return restJson<WrittenRow[]>(code, 'session_snapshots?on_conflict=user_id,session_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(
      rows.map((row) => ({
        ...row,
        user_id: session.user_id,
        device_id: deviceId(),
        device_name: deviceName(),
      }))
    ),
  })
}

/** 只比对元数据，不下载正文：决定这一轮要上传哪些、下载哪些 */
const planSync = async (code: string): Promise<Plan> => {
  const rows = await fetchRemoteRows(code)
  const marks = readMarks()
  const deletions = readDeletions()
  const summaries = useChatStore.getState().sessions
  const remoteById = new Map(rows.map((row) => [row.session_id, row]))
  const localById = new Map(summaries.map((item) => [item.id, item]))
  const plan: Plan = { push: [], pushDeleted: [], pull: [], pullDelete: [], conflicts: [] }
  const conflicted = new Set<string>()

  for (const summary of summaries) {
    const mark = marks[summary.id]
    const remote = remoteById.get(summary.id)
    const resolution = resolutions.get(summary.id)
    const localDirty = summary.updatedAt > (mark?.localAt ?? 0)
    const remoteDirty = remote !== undefined && remote.version > (mark?.version ?? 0)

    if (resolution === 'local') {
      plan.push.push(summary.id)
      continue
    }
    if (resolution === 'remote') {
      if (remote?.deleted) {
        plan.pullDelete.push({ id: summary.id, version: remote.version })
      } else if (remote) {
        plan.pull.push(summary.id)
      }
      continue
    }
    if (localDirty && remoteDirty) {
      conflicted.add(summary.id)
      continue
    }
    if (localDirty) {
      plan.push.push(summary.id)
      continue
    }
    if (remote && remoteDirty) {
      if (remote.deleted) {
        plan.pullDelete.push({ id: summary.id, version: remote.version })
      } else {
        plan.pull.push(summary.id)
      }
    }
  }

  for (const [id, deletedAt] of Object.entries(deletions)) {
    if (localById.has(id)) {
      continue
    }
    const mark = marks[id]
    const remote = remoteById.get(id)
    if (deletedAt <= (mark?.localAt ?? 0)) {
      continue
    }
    if (remote && remote.version > (mark?.version ?? 0)) {
      conflicted.add(id)
      continue
    }
    plan.pushDeleted.push(id)
  }

  for (const remote of rows) {
    if (localById.has(remote.session_id) || Object.hasOwn(deletions, remote.session_id)) {
      continue
    }
    if (remote.deleted) {
      continue
    }
    // 本机已经没有这个会话，且没走过删除流程：说明是另一台设备新建的
    if (remote.version > (marks[remote.session_id]?.version ?? 0)) {
      plan.pull.push(remote.session_id)
    }
  }

  plan.conflicts = [...conflicted]
  return plan
}

const isEmptyPlan = (plan: Plan) =>
  plan.push.length === 0 &&
  plan.pushDeleted.length === 0 &&
  plan.pull.length === 0 &&
  plan.pullDelete.length === 0

/** 执行一轮同步：先上传本地较新的，再下载云端较新的 */
const executePlan = async (code: string, key: CryptoKey, plan: Plan) => {
  const deletions = readDeletions()
  const upserts: { row: UpsertRow; localAt: number }[] = []

  for (const id of plan.push) {
    const session = await loadSessionForSync(id)
    if (!session) {
      continue
    }
    const clean = stripUnfinished(session)
    upserts.push({
      localAt: clean.updatedAt,
      row: {
        session_id: id,
        payload: await encrypt(key, JSON.stringify(clean)),
        deleted: false,
      },
    })
  }
  for (const id of plan.pushDeleted) {
    upserts.push({
      localAt: deletions[id] ?? Date.now(),
      row: { session_id: id, payload: '', deleted: true },
    })
  }

  for (const chunk of chunked(upserts, BATCH)) {
    const written = await upsertRows(
      code,
      chunk.map((item) => item.row)
    )
    const marks: [string, SyncMark][] = []
    for (const row of written) {
      const local = chunk.find((item) => item.row.session_id === row.session_id)
      if (local) {
        marks.push([row.session_id, { localAt: local.localAt, version: row.version }])
      }
    }
    writeMarks(marks)
  }

  if (plan.pull.length === 0 && plan.pullDelete.length === 0) {
    return
  }

  const updates: Session[] = []
  const marks: [string, SyncMark][] = []
  if (plan.pull.length > 0) {
    const rows = await fetchPayloads(code, plan.pull)
    for (const row of rows) {
      const parsed = JSON.parse(await decrypt(key, row.payload)) as Session
      const session = normalizeSession(parsed)
      updates.push(session)
      marks.push([session.id, { localAt: session.updatedAt, version: row.version }])
    }
  }
  for (const item of plan.pullDelete) {
    // 云端已删除：本地跟着删，并记录已同步到这一版，避免又被墓碑覆盖回去
    marks.push([item.id, { localAt: Date.now(), version: item.version }])
  }

  const skipped = new Set(
    await applyRemoteSessions(
      updates,
      plan.pullDelete.map((item) => item.id)
    )
  )
  // 被跳过的会话（正在生成或写入失败）不记进度，下一轮重新对齐
  writeMarks(marks.filter(([id]) => !skipped.has(id)))
}

const touchSyncedAt = (now: number) => {
  writeStorage(LAST_SYNC_KEY, String(now))
  useSync.setState({ lastSyncAt: now })
}

const settlePlan = async (code: string, key: CryptoKey, plan: Plan) => {
  if (plan.conflicts.length > 0) {
    useSync.setState({
      conflicts: plan.conflicts,
      conflict: true,
      startup: 'conflict',
      pending: true,
    })
    return
  }
  if (!isEmptyPlan(plan)) {
    await executePlan(code, key, plan)
  }
  for (const id of plan.push) {
    resolutions.delete(id)
  }
  for (const item of plan.pull) {
    resolutions.delete(item)
  }
  for (const item of plan.pullDelete) {
    resolutions.delete(item.id)
  }
  touchSyncedAt(Date.now())
  useSync.setState({ pending: false })
}

/** 旧版整包快照拆成会话级：新表为空且旧表有数据时执行一次 */
const migrateLegacy = async (code: string, key: CryptoKey, rows: RemoteRow[]) => {
  if (readStorage(MIGRATED_KEY) === '1') {
    return
  }
  if (rows.length > 0) {
    writeStorage(MIGRATED_KEY, '1')
    return
  }
  const legacy = await restJson<{ payload: string }[]>(code, 'snapshots?select=payload', {
    method: 'GET',
  }).catch(() => [] as { payload: string }[])
  const payload = legacy[0]?.payload
  if (!payload) {
    writeStorage(MIGRATED_KEY, '1')
    return
  }
  const parsed = JSON.parse(await decrypt(key, payload)) as { sessions?: Session[] }
  const sessions = (parsed.sessions ?? []).map(normalizeSession)
  for (const chunk of chunked(sessions, BATCH)) {
    const batch: UpsertRow[] = []
    for (const session of chunk) {
      batch.push({
        session_id: session.id,
        payload: await encrypt(key, JSON.stringify(stripUnfinished(session))),
        deleted: false,
      })
    }
    const written = await upsertRows(code, batch)
    // 本机的数据视为最新：标记成“本地有改动”，随后由上面的规则推上去
    writeMarks(written.map((row) => [row.session_id, { localAt: 0, version: row.version }]))
  }
  writeStorage(MIGRATED_KEY, '1')
  useSync.setState({ pending: true })
}

/* -------------------------------------------------------------------------- */
/* 设备租约                                                                    */
/* -------------------------------------------------------------------------- */

type LeaseRow = { device_id: string; device_name: string; seen_at: string }

const toLease = (row: LeaseRow | undefined): DeviceLease | null =>
  row
    ? {
        deviceId: row.device_id,
        deviceName: row.device_name,
        seenAt: new Date(row.seen_at).getTime(),
      }
    : null

const fetchLease = async (code: string): Promise<DeviceLease | null> => {
  const rows = await restJson<LeaseRow[]>(
    code,
    'sync_devices?select=device_id,device_name,seen_at',
    { method: 'GET' }
  )
  return toLease(rows[0])
}

/** 抢占租约（首次连接、心跳与接管共用） */
export const claimLease = async (code: string): Promise<DeviceLease | null> => {
  const session = await ensureSession(code)
  const rows = await restJson<LeaseRow[]>(code, 'sync_devices?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: session.user_id,
      device_id: deviceId(),
      device_name: deviceName(),
    }),
  })
  const lease = toLease(rows[0])
  useSync.setState({ lease, takenOver: false })
  return lease
}

let lastLeaseCheck = 0

/**
 * 复核本机是否仍持有租约。
 * 被另一台设备接管后停止写入，冲突检测是最后一道保护，租约只是让这件事更早被发现。
 */
const verifyLease = async (code: string): Promise<boolean> => {
  if (Date.now() - lastLeaseCheck < LEASE_CHECK_MS) {
    return true
  }
  lastLeaseCheck = Date.now()
  const lease = await fetchLease(code)
  if (!lease || lease.deviceId === deviceId()) {
    await claimLease(code)
    return true
  }
  useSync.setState({ lease, takenOver: true })
  return false
}

/* -------------------------------------------------------------------------- */
/* 对外操作                                                                    */
/* -------------------------------------------------------------------------- */

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
  useSync.setState({ busy: 'connect', error: null, errorDetail: null })
  try {
    await ensureSession(code)
    writeStorage(CODE_KEY, code)
    // 换了同步码，逐会话的同步记录全部失效
    resetSyncBooks()
    resolutions.clear()
    lastLeaseCheck = 0
    useSync.setState({
      code,
      connected: true,
      lastSyncAt: null,
      conflict: false,
      conflicts: [],
      pending: false,
      takenOver: false,
      lease: null,
    })
    // 首次连接就对齐一次：本地较新的推上去，云端较新的拉下来
    void runSync()
  } catch (error) {
    reportError(error)
  } finally {
    useSync.setState({ busy: null })
  }
}

/** 断开：清除本地的同步码与登录状态，云端数据保留 */
export const disconnectSync = () => {
  clearAuth()
  writeStorage(CODE_KEY, null)
  resolutions.clear()
  lastLeaseCheck = 0
  useSync.setState({
    code: null,
    connected: false,
    busy: null,
    error: null,
    errorDetail: null,
    lease: null,
    takenOver: false,
    conflict: false,
    conflicts: [],
    pending: false,
    startup: 'idle',
  })
}

export const clearSyncError = () => useSync.setState({ error: null, errorDetail: null })

/** 开关自动同步；关闭时同时清掉冲突提示 */
export const setAutoSync = (enabled: boolean) => {
  writeStorage(AUTO_KEY, String(enabled))
  useSync.setState({ auto: enabled })
  if (enabled) {
    void runSync()
  }
}

/** 手动上传：把本地全部会话推上去，用于确认本机内容为准 */
export const pushToCloud = async (): Promise<number> => {
  const { code } = useSync.getState()
  if (!code) {
    throw new SyncError('syncBadCode')
  }
  useSync.setState({ busy: 'sync', error: null, errorDetail: null })
  try {
    await waitForChatReady()
    const sessions = useChatStore.getState().sessions
    if (sessions.length === 0) {
      throw new SyncError('syncEmptyLocal')
    }
    const key = await getCryptoKey(code)
    await executePlan(code, key, {
      push: sessions.map((session) => session.id),
      pushDeleted: [],
      pull: [],
      pullDelete: [],
      conflicts: [],
    })
    resolutions.clear()
    touchSyncedAt(Date.now())
    useSync.setState({ pending: false, conflict: false, conflicts: [] })
    return sessions.length
  } catch (error) {
    reportError(error)
    throw error
  } finally {
    useSync.setState({ busy: null })
  }
}

/** 手动恢复：以云端为准整份替换本地，用于放弃本机改动 */
export const pullFromCloud = async (): Promise<number> => {
  const { code } = useSync.getState()
  if (!code) {
    throw new SyncError('syncBadCode')
  }
  useSync.setState({ busy: 'sync', error: null, errorDetail: null })
  try {
    await waitForChatReady()
    const key = await getCryptoKey(code)
    const rows = (await fetchRemoteRows(code)).filter((row) => !row.deleted)
    if (rows.length === 0) {
      throw new SyncError('syncEmptyRemote')
    }
    const payloads = await fetchPayloads(
      code,
      rows.map((row) => row.session_id)
    )
    const updates: Session[] = []
    const marks: [string, SyncMark][] = []
    for (const row of payloads) {
      const parsed = JSON.parse(await decrypt(key, row.payload)) as Session
      const session = normalizeSession(parsed)
      updates.push(session)
      marks.push([session.id, { localAt: session.updatedAt, version: row.version }])
    }
    const remoteIds = new Set(updates.map((session) => session.id))
    const removals = useChatStore
      .getState()
      .sessions.map((session) => session.id)
      .filter((id) => !remoteIds.has(id))
    const skipped = new Set(await applyRemoteSessions(updates, removals))
    writeMarks(marks.filter(([id]) => !skipped.has(id)))
    resolutions.clear()
    touchSyncedAt(Date.now())
    useSync.setState({ pending: false, conflict: false, conflicts: [] })
    return updates.length
  } catch (error) {
    reportError(error)
    throw error
  } finally {
    useSync.setState({ busy: null })
  }
}

/** 自动同步的一次执行：检测、写入，冲突时只提示不覆盖 */
const syncOnce = async () => {
  const { code, auto, takenOver, conflict, busy } = useSync.getState()
  if (!code || !auto || takenOver || conflict || busy !== null) {
    return
  }
  useSync.setState({ busy: 'sync', error: null, errorDetail: null })
  try {
    await waitForChatReady()
    if (!(await verifyLease(code))) {
      return
    }
    const key = await getCryptoKey(code)
    await migrateLegacy(code, key, await fetchRemoteRows(code))
    await settlePlan(code, key, await planSync(code))
  } catch (error) {
    reportError(error)
  } finally {
    useSync.setState({ busy: null })
  }
}

let running: Promise<void> | null = null

const runSync = (): Promise<void> => {
  if (running) {
    return running
  }
  running = syncOnce().finally(() => {
    running = null
  })
  return running
}

let timer = 0

/** 本地数据变化后延迟同步，避免流式输出期间频繁上传 */
export const scheduleAutoSync = () => {
  const state = useSync.getState()
  if (!state.code || !state.connected) {
    return
  }
  useSync.setState({ pending: true })
  if (!state.auto || state.takenOver || state.conflict) {
    return
  }
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void runSync(), DEBOUNCE_MS)
}

/**
 * 离开前的快速通道：省掉比对请求，只把本地判定为有改动的会话推上去。
 * 页面隐藏后浏览器给的时间很短，少一次往返就多一点成功率；没传完的由下次启动补上。
 */
const pushPending = async () => {
  const { code, takenOver, busy } = useSync.getState()
  if (!code || takenOver || busy !== null || running) {
    return
  }
  useSync.setState({ busy: 'sync', error: null, errorDetail: null })
  try {
    await waitForChatReady(2_000)
    const marks = readMarks()
    const summaries = useChatStore.getState().sessions
    const known = new Set(summaries.map((session) => session.id))
    const push = summaries
      .filter((session) => session.updatedAt > (marks[session.id]?.localAt ?? 0))
      .map((session) => session.id)
    const pushDeleted = Object.entries(readDeletions())
      .filter(([id, deletedAt]) => !known.has(id) && deletedAt > (marks[id]?.localAt ?? 0))
      .map(([id]) => id)
    if (push.length === 0 && pushDeleted.length === 0) {
      return
    }
    const key = await getCryptoKey(code)
    await executePlan(code, key, { push, pushDeleted, pull: [], pullDelete: [], conflicts: [] })
    touchSyncedAt(Date.now())
    useSync.setState({ pending: false })
  } catch (error) {
    reportError(error)
  } finally {
    useSync.setState({ busy: null })
  }
}

/** 取消防抖并立即同步：用于页面隐藏、关闭前把最后的改动尽量传上去 */
export const flushAutoSync = () => {
  window.clearTimeout(timer)
  void pushPending()
}

/** 发送消息后立即同步一次：此刻上传的内容已剔除未完成的回答 */
export const syncNow = () => runSync()

/**
 * 启动检查：在过渡动画期间把本地与云端对齐。
 * 单侧有改动时直接上传或下载，不再询问；只有两边都改过才停下来提示。
 */
export const checkStartupSync = async () => {
  const { code, connected } = useSync.getState()
  if (!code || !connected) {
    return
  }
  const startedAt = Date.now()
  const settle = () => sleep(Math.max(0, STARTUP_MIN_MS - (Date.now() - startedAt)))
  useSync.setState({ startup: 'checking', busy: 'sync', error: null, errorDetail: null })
  try {
    await waitForChatReady()
    const lease = await fetchLease(code)
    if (lease && lease.deviceId !== deviceId()) {
      useSync.setState({ lease, takenOver: true, startup: 'occupied' })
      await settle()
      return
    }
    await claimLease(code)
    const key = await getCryptoKey(code)
    await migrateLegacy(code, key, await fetchRemoteRows(code))
    const plan = await planSync(code)
    if (plan.conflicts.length > 0) {
      useSync.setState({ conflicts: plan.conflicts, conflict: true })
      await settle()
      useSync.setState({ startup: 'conflict', pending: true })
      return
    }
    if (!isEmptyPlan(plan)) {
      useSync.setState({ startup: 'syncing' })
      await executePlan(code, key, plan)
      touchSyncedAt(Date.now())
      useSync.setState({ pending: false })
    }
    await settle()
    useSync.setState({ startup: 'idle' })
  } catch (error) {
    reportError(error)
    await settle()
    useSync.setState({ startup: 'idle' })
  } finally {
    // 检查期间不允许防抖同步插手，避免两条路径同时写同一批会话
    useSync.setState({ busy: null })
  }
}

/** 接管：把租约抢到本机，然后重新走一遍启动检查 */
export const takeOverSync = async () => {
  const { code } = useSync.getState()
  if (!code) {
    return
  }
  useSync.setState({ busy: 'sync' })
  try {
    await claimLease(code)
    lastLeaseCheck = Date.now()
    useSync.setState({ takenOver: false, busy: null })
    await checkStartupSync()
  } catch (error) {
    reportError(error)
    useSync.setState({ busy: null })
  }
}

/** 暂不接管：本次浏览不再同步，也不再提示 */
export const dismissOccupied = () => useSync.setState({ startup: 'idle' })

/** 用户对冲突做出选择：以本机为准或让云端覆盖 */
export const resolveConflicts = (choice: 'local' | 'remote') => {
  const { conflicts } = useSync.getState()
  for (const id of conflicts) {
    resolutions.set(id, choice)
  }
  useSync.setState({ conflict: false, conflicts: [], startup: 'idle' })
  void runSync()
}

/** 从设置页重新打开冲突提示 */
export const openSyncConflict = () => {
  if (useSync.getState().conflicts.length > 0) {
    useSync.setState({ startup: 'conflict' })
  }
}

// 会话层发生变化时通知同步层：默认走防抖，发送消息时要求立刻执行
setSyncTrigger((request) => {
  scheduleAutoSync()
  if (request.immediate) {
    window.clearTimeout(timer)
    void runSync()
  }
})
