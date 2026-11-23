// Rules both LinkedIn importers, the export zip and the profile PDF, must
// agree on. If they build ids the same way, someone who starts with the PDF
// and imports the zip later keeps their changes wherever a fact is the same.

import type { IdMaker } from '../ids'
import type { Evidence } from '../profile'
import { formatYearMonth, parseDate } from './dates'
import { splitPoints } from './points'

// The zip says "Apr 2022" and the PDF says "April 2022". Ids are built from
// the parsed date so both give the same id. Dates that cannot be parsed fall
// back to their raw text, which is also what older imports used, so ids from
// earlier zip imports do not change.
export function dateKey(raw: string): string {
  const parsed = parseDate(raw)
  return parsed ? formatYearMonth(parsed) : raw.trim()
}

export function positionId(ids: IdMaker, company: string, title: string, started: string): string {
  return ids.make('position', company, title, dateKey(started))
}

export function educationId(ids: IdMaker, school: string, degree: string, started: string): string {
  return ids.make('education', school, degree, dateKey(started))
}

export function pointsFor(ids: IdMaker, parentId: string, source: string, text: string): Evidence[] {
  return splitPoints(text).map((t) => ({ id: ids.child(parentId, t), source, text: t }))
}

// Deliberately loose. It is there to catch a typo like a missing @, not to
// decide what counts as a valid address.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// Where the CV's contact email comes from. Some people keep an old or work
// address as their LinkedIn primary, so they can type the one they want
// instead. When they do, the email in the file is not read at all.
export type EmailChoice = { from: 'export' } | { from: 'user'; value: string }

export function typedEmail(value: string, warnings: string[]): string {
  const email = value.trim()
  if (email && !looksLikeEmail(email)) {
    warnings.push(`"${email}" does not look like an email address. Check it before using it on a CV.`)
  }
  return email
}
