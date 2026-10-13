// 日历按「YYYY-MM」「YYYY-MM-DD」字符串计算，全部用 UTC，避免时区让日期错位一天。

export const weekdays = ['日', '一', '二', '三', '四', '五', '六'] as const

function parts(value: string) {
  const [y = 1970, m = 1, d = 1] = value.split('-').map(Number)
  return { y, m, d }
}

function format(date: Date, withDay: boolean) {
  const ym = `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return withDay ? `${ym}-${String(date.getUTCDate()).padStart(2, '0')}` : ym
}

/** 一个月的日历格子：月初前补空格子，每天一个日期。 */
export function monthDays(month: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return []
  const { y, m } = parts(month)
  const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return [
    ...Array<string>(offset).fill(''),
    ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ]
}

/** 这个月的最后一天，如 2026-02 → 2026-02-28。 */
export function monthEnd(month: string) {
  const { y, m } = parts(month)
  return format(new Date(Date.UTC(y, m, 0)), true)
}

export function shiftMonth(month: string, delta: number) {
  const { y, m } = parts(month)
  return format(new Date(Date.UTC(y, m - 1 + delta, 1)), false)
}

export function shiftDate(date: string, delta: number) {
  const { y, m, d } = parts(date)
  return format(new Date(Date.UTC(y, m - 1, d + delta)), true)
}
