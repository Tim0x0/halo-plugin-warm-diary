import { describe, expect, it } from 'vitest'
import { monthDays, monthEnd, shiftDate, shiftMonth } from '../calendar'

describe('notebook calendar helpers', () => {
  it('pads the first week and lists every day of the month', () => {
    // 2026-09-01 是星期二，前面空两格。
    const days = monthDays('2026-09')
    expect(days.slice(0, 3)).toEqual(['', '', '2026-09-01'])
    expect(days[days.length - 1]).toBe('2026-09-30')
    expect(days.filter(Boolean)).toHaveLength(30)
    expect(monthDays('')).toEqual([])
  })

  it('finds month ends including leap years', () => {
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(monthEnd('2026-02')).toBe('2026-02-28')
    expect(monthEnd('2026-12')).toBe('2026-12-31')
  })

  it('moves across month and year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -12)).toBe('2025-01')
    expect(shiftDate('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-12-29', 7)).toBe('2027-01-05')
  })
})
