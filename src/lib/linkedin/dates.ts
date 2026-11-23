// Reads the date formats found in a LinkedIn data export.
//
// One export mixes several formats. Jobs and projects use "Apr 2022",
// education often has just "2018", and timestamps are US style
// "03/16/25, 12:21 PM". A CV only ever shows month and year, so that is all
// we keep.

export interface YearMonth {
  year: number
  // Null when the source only gave a year.
  month: number | null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Returns null for an empty string and for anything it cannot read. Callers
// tell the two apart, because a blank end date means something ("current")
// while an unreadable one is worth a warning.
export function parseDate(raw: string): YearMonth | null {
  const s = raw.trim()
  if (!s) return null

  let m = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s)
  if (m) {
    const month = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase())
    return month === -1 ? null : { year: Number(m[2]), month: month + 1 }
  }

  // "Mar 15, 2022". Not seen in a real export yet, but publication dates are
  // the kind of field that carries a day.
  m = /^([A-Za-z]{3,9})\.?\s+\d{1,2},?\s+(\d{4})$/.exec(s)
  if (m) {
    const month = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase())
    return month === -1 ? null : { year: Number(m[2]), month: month + 1 }
  }

  m = /^(\d{4})$/.exec(s)
  if (m) return { year: Number(m[1]), month: null }

  m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?/.exec(s)
  if (m) return withMonth(Number(m[1]), Number(m[2]))

  // US order, month first. LinkedIn uses it for timestamps even on accounts
  // set to UK English. Two digit years are this century, since LinkedIn
  // started in 2003.
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/.exec(s)
  if (m) {
    const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return withMonth(year, Number(m[1]))
  }

  return null
}

function withMonth(year: number, month: number): YearMonth | null {
  return month >= 1 && month <= 12 ? { year, month } : null
}

export function formatYearMonth(d: YearMonth): string {
  return d.month === null ? String(d.year) : `${SHORT_MONTHS[d.month - 1]} ${d.year}`
}
