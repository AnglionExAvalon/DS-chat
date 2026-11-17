const pad = (value: number, length = 2): string => String(value).padStart(length, '0')

const toDate = (value: string | number | Date): Date | null => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatDate = (
  value: string | number | Date,
  separator: '/' | '-' = '-'
): string | null => {
  const date = toDate(value)
  if (!date) {
    return null
  }
  return [pad(date.getFullYear(), 4), pad(date.getMonth() + 1), pad(date.getDate())].join(separator)
}

export const monthKey = (value: string | number | Date): string | null => {
  const date = toDate(value)
  return date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}` : null
}

/** Token 数量按十进位缩写：1234 显示为 1.2k，1234567 显示为 1.2M；三位数以上取整。 */
export const formatTokenCount = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }
  const shorthand = (scaled: number, unit: string) =>
    `${(scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)).replace(/\.0$/, '')}${unit}`
  if (value >= 1_000_000) {
    return shorthand(value / 1_000_000, 'M')
  }
  if (value >= 1000) {
    return shorthand(value / 1000, 'k')
  }
  return String(Math.round(value))
}

/** 费用（元）：小额保留更多小数位，避免显示成 0 */
export const formatCost = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }
  if (value < 0.01) {
    return value.toFixed(4)
  }
  return value < 1 ? value.toFixed(3) : value.toFixed(2)
}

/** 本地时间的 时:分:秒，用于实时钟 */
export const formatClock = (value: number): string => {
  const date = new Date(value)
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => pad(part))
    .join(':')
}
