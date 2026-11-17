import { memo, useEffect, useMemo } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useBalance } from '../../services/balance.js'
import { estimateCost } from '../../services/chat/pricing.js'
import { useChatStore } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { useSettings } from '../../services/settings.js'
import { formatCost, formatTokenCount } from '../../utils/format.js'
import { Tooltip } from '../base/Tooltip.js'
import styles from './StatsPanel.module.css'

type Totals = {
  /** 输入总量，含缓存命中与缓存写入 */
  input: number
  output: number
  /** 输入中命中缓存的部分 */
  cached: number
  /** 估算消耗（元） */
  cost: number
}

const EMPTY_TOTALS: Totals = { input: 0, output: 0, cached: 0, cost: 0 }

const summarize = (session: Session | undefined): Totals => {
  if (!session) {
    return EMPTY_TOTALS
  }
  const totals = { ...EMPTY_TOTALS }
  // 各分支、重新生成与续写都真实扣费，一并计入
  for (const message of session.messages) {
    if (message.role !== 'assistant' || !message.usage) {
      continue
    }
    const { usage } = message
    totals.input +=
      usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens
    totals.output += usage.output_tokens
    totals.cached += usage.cache_read_input_tokens
    totals.cost += estimateCost(usage, message.model, message.createdAt)
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
  // 缓存命中率：命中部分占输入总量的比例，无输入时显示占位符
  const cachedPercent =
    totals.input > 0 ? `${Math.round((totals.cached / totals.input) * 100)}%` : '—'

  return (
    <div className={styles.panel}>
      <div className={styles.row}>
        <span className={styles.label}>{t('usageInput')}</span>
        <span className={styles.value}>{formatTokenCount(totals.input)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t('usageOutput')}</span>
        <span className={styles.value}>{formatTokenCount(totals.output)}</span>
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
        <span className={styles.label}>{t('usageCached')}</span>
        <span className={styles.value}>{cachedPercent}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t('usageBalanceLabel')}</span>
        <span className={styles.value}>
          {balance === null ? '—' : t('usageCost', { value: formatCost(balance) })}
        </span>
      </div>
    </div>
  )
})