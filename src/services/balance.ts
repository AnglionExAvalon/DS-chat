import { create } from 'zustand'
import type { UserBalance } from './api/types.js'
import { API_ORIGIN, request } from './api/client.js'
import { useSettings } from './settings.js'

/** 两次查询之间的最小间隔，避免页面初始化与流式结束同时触发重复请求 */
const MIN_INTERVAL = 3000

/** GET /user/balance：官方余额接口，只读不产生费用 */
export const fetchBalance = async (apiKey: string, signal?: AbortSignal): Promise<UserBalance> =>
  (await (
    await request(`${API_ORIGIN}/user/balance`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal,
    })
  ).json()) as UserBalance

type BalanceState = {
  /** 当前人民币总余额（元）；未查询或失败时为 null */
  amount: number | null
  /** 页面打开后首次查到的余额，用于计算真实扣费 */
  initial: number | null
  refreshing: boolean
  /** 刷新余额；失败时静默保留上次结果，余额只作为附加信息展示 */
  refresh: () => Promise<void>
}

let lastRequestAt = 0

export const useBalance = create<BalanceState>((set, get) => ({
  amount: null,
  initial: null,
  refreshing: false,
  refresh: async () => {
    const apiKey = useSettings.getState().apiKey
    const now = Date.now()
    if (!apiKey || get().refreshing || now - lastRequestAt < MIN_INTERVAL) {
      return
    }
    lastRequestAt = now
    set({ refreshing: true })
    try {
      const { balance_infos: infos } = await fetchBalance(apiKey)
      const cny = infos.find((info) => info.currency === 'CNY') ?? infos[0]
      const amount = cny ? Number.parseFloat(cny.total_balance) : Number.NaN
      if (Number.isFinite(amount)) {
        set((state) => ({ amount, initial: state.initial ?? amount }))
      }
    } catch {
      // 余额查询失败不影响对话，保留上次快照
    } finally {
      set({ refreshing: false })
    }
  },
}))