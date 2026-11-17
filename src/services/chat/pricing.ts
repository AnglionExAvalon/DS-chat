import type { ChatModel, MessageUsage } from '../api/types.js'

/**
 * 每百万 token 的人民币单价，依据官方价格页 2026-11 的公开数据。
 * 输入分缓存命中与未命中两档，高峰时段单价为空闲时段的两倍。
 * 价格可能调整，此处只用于界面估算，实际以官方账单为准。
 */
const PRICES: Record<ChatModel, { cacheHit: number; cacheMiss: number; output: number }> = {
  'deepseek-flash': { cacheHit: 0.02, cacheMiss: 1, output: 4 },
  'deepseek-v4-pro': { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
}

/** 高峰时段为空闲时段的两倍价 */
const PEAK_MULTIPLIER = 2

/** Search / Fetch 按成功请求计费：每 1,000 次 5 元，与时段无关 */
const SEARCH_PRICE = 0.005

/** 高峰时段窗口（UTC 小时，左闭右开）：工作日 01:00–04:00 与 06:00–10:00 */
export const PEAK_WINDOWS: readonly (readonly [number, number])[] = [
  [1, 4],
  [6, 10],
]

/** 高峰时段：工作日落在窗口内即高峰，周末全天空闲 */
export const isPeakHour = (time: number): boolean => {
  const date = new Date(time)
  const weekday = date.getUTCDay()
  if (weekday === 0 || weekday === 6) {
    return false
  }
  const hour = date.getUTCHours()
  return PEAK_WINDOWS.some(([start, end]) => hour >= start && hour < end)
}

const padHour = (value: number) => String(value).padStart(2, '0')

/** UTC 小时换算成当前时区的 HH:MM，跨天时取模 */
const localTime = (utcHour: number, offsetMinutes: number): string => {
  const minutes = (((utcHour * 60 + offsetMinutes) % 1440) + 1440) % 1440
  return `${padHour(Math.floor(minutes / 60))}:${padHour(minutes % 60)}`
}

/** 高峰窗口的本地时间文本，用于界面提示，形如 09:00-12:00 / 14:00-18:00 */
export const formatPeakWindows = (): string => {
  // getTimezoneOffset 返回 UTC 减本地，东八区为 -480
  const offset = -new Date().getTimezoneOffset()
  return PEAK_WINDOWS.map(
    ([start, end]) => `${localTime(start, offset)}-${localTime(end, offset)}`
  ).join(' / ')
}

/**
 * 估算一次请求的费用（元）：缓存写入按未命中价计，搜索按成功请求次数计。
 * 服务端未返回缓存写入明细时，input_tokens 已是不含缓存的未命中部分。
 */
export const estimateCost = (
  usage: MessageUsage,
  model: ChatModel | null,
  time: number
): number => {
  const price = PRICES[model ?? 'deepseek-flash']
  const multiplier = isPeakHour(time) ? PEAK_MULTIPLIER : 1
  const tokens =
    (usage.input_tokens + usage.cache_creation_input_tokens) * price.cacheMiss * multiplier +
    usage.cache_read_input_tokens * price.cacheHit * multiplier +
    usage.output_tokens * price.output * multiplier
  return tokens / 1_000_000 + (usage.server_tool_use?.web_search_requests ?? 0) * SEARCH_PRICE
}