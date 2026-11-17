import clsx from 'clsx'
import { memo, useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useBalance } from '../../services/balance.js'
import { estimateCost, formatPeakWindows, isPeakHour } from '../../services/chat/pricing.js'
import { useChatStore } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { useSettings } from '../../services/settings.js'
import { formatClock, formatCost } from '../../utils/format.js'
import { Tooltip } from '../base/Tooltip.js'
import styles from './StatsPanel.module.css'

type Totals = {
  /** 估算消耗（元） */
  cost: number
}

const summarize = (session: Session | undefined): Totals => {
  const totals: Totals = { cost: 0 }
  if (!session) {
    return totals
  }
  // 各分支、重新生成与续写都真实扣费，一并计入
  for (const message of session.messages) {
    if (message.role !== 'assistant' || !message.usage) {
      continue
    }
    totals.cost += estimateCost(message.usage, message.model, message.createdAt)
  }
  return totals
}

/**
 * 输入框左侧的用量盒子：本会话累计的输入 / 输出 token、估算消耗、缓存命中与账户余额。
 * 余额来自官方 /user/balance 接口；悬停「已消耗」可看余额差值得到的真实扣费。
 */
export const StatsPanel = memo(function StatsPanel({ sessionId }: { sessionId: string | null }) {
  const t = useTranslate()
  const session = useChatStore((state) =>
    sessionId === null ? undefined : state.sessionCache[sessionId]
  )
  const streaming = useChatStore(
    (state) => sessionId !== null && Object.hasOwn(state.streaming, sessionId)
  )
  const apiKey = useSettings((state) => state.apiKey)
  const balance = useBalance((state) => state.amount)
  const initialBalance = useBalance((state) => state.initial)
  const refreshBalance = useBalance((state) => state.refresh)
  const totals = useMemo(() => summarize(session), [session])
  const peakWindows = useMemo(() => formatPeakWindows(), [])
  const [now, setNow] = useState(() => Date.now())

  // 顶部时钟每秒刷新，同时用于判断当前是否处在高峰时段
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const peak = isPeakHour(now)

  // 余额是账户级数据：有 API Key 时查询，并由定时器兜底刷新
  useEffect(() => {
    if (!apiKey) {
      return
    }
    void refreshBalance()
    const timer = setInterval(() => void refreshBalance(), 30_000)
    return () => clearInterval(timer)
  }, [apiKey, refreshBalance])

  // 每轮回答结束后再查一次，用余额差值得到真实扣费
  useEffect(() => {
    if (!streaming && apiKey) {
      void refreshBalance()
    }
  }, [streaming, apiKey, refreshBalance])

  // 余额只有两位小数，短会话看不出变化，因此按页面打开以来的差值展示
  const charged =
    balance === null || initialBalance === null ? null : Math.max(0, initialBalance - balance)

  return (
    <div className={styles.panel}>
      <div className={clsx(styles.clockRow, peak ? styles.peak : styles.offPeak)}>
        <span className={styles.clock}>{formatClock(now)}</span>
        <span>{t(peak ? 'usagePeakNow' : 'usageOffPeakNow')}</span>
      </div>
      <Tooltip
        content={charged === null ? null : t('usageRealCost', { value: formatCost(charged) })}
      >
        <div className={styles.row}>
          <span className={styles.label}>{t('usageConsumed')}</span>
          <span className={styles.value}>{t('usageCost', { value: formatCost(totals.cost) })}</span>
        </div>
      </Tooltip>
      <div className={styles.row}>
        <span className={styles.label}>{t('usageBalanceLabel')}</span>
        <span className={styles.value}>
          {balance === null ? '—' : t('usageCost', { value: formatCost(balance) })}
        </span>
      </div>
      <div className={styles.peakWindow}>{t('usagePeakWindow', { windows: peakWindows })}</div>
    </div>
  )
})