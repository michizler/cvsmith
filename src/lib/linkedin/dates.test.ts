import { describe, expect, it } from 'vitest'
import { formatYearMonth, parseDate } from './dates'

describe('parseDate', () => {
  it.each([
    ['Apr 2022', { year: 2022, month: 4 }],
    ['September 2025', { year: 2025, month: 9 }],
    ['Sept. 2025', { year: 2025, month: 9 }],
    ['2018', { year: 2018, month: null }],
    ['Mar 15, 2022', { year: 2022, month: 3 }],
    ['March 15 2022', { year: 2022, month: 3 }],
    ['2024-03-01', { year: 2024, month: 3 }],
    ['03/16/25, 12:21 PM', { year: 2025, month: 3 }],
    ['7/7/20, 1:51 AM', { year: 2020, month: 7 }],
    ['12/01/2019', { year: 2019, month: 12 }],
  ])('reads %s', (raw, expected) => {
    expect(parseDate(raw)).toEqual(expected)
  })

  it.each(['', '   ', 'Jan 16', 'Smarch 2022', '13/01/22', 'soon'])('gives null for %j', (raw) => {
    expect(parseDate(raw)).toBeNull()
  })
})

describe('formatYearMonth', () => {
  it('shows month and year, or just the year', () => {
    expect(formatYearMonth({ year: 2022, month: 4 })).toBe('Apr 2022')
    expect(formatYearMonth({ year: 2018, month: null })).toBe('2018')
  })
})
