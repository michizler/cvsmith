// Turns the lines of a LinkedIn "Save to PDF" file into a Profile.
//
// The PDF has no labels, only layout. What a line is comes from its font
// size and position. The name is the largest text, section headings come
// next, then company or school names, then job titles, and everything else
// is body text. Sizes are compared with each other rather than with fixed
// numbers, so a small restyle by LinkedIn does not break the parser. When
// the layout is not one we recognise, the user is told to use the data
// export instead of being handed a half-read profile.

import { IdMaker } from '../../ids'
import { emptyProfile, type Certification, type Education, type Named, type Position, type Profile, type Website } from '../../profile'
import { parseDate, type YearMonth } from '../dates'
import { ExportError, type ImportOptions, type ImportResult } from '../import'
import { educationId, looksLikeEmail, pointsFor, positionId, typedEmail } from '../shared'
import type { TextLine } from './lines'

const SOURCE = 'Profile.pdf'

// LinkedIn translates headings into the profile's language. Only English is
// supported for now. The data export is not affected.
const READ_MAIN = ['Summary', 'Experience', 'Education']
const SIDE_HEADINGS = ['Contact', 'Top Skills', 'Languages', 'Certifications', 'Honors-Awards', 'Publications', 'Patents']

// A gap between sidebar lines bigger than this many times the font size
// starts a new item. Lines of one wrapped item sit about 1.2 sizes apart and
// separate items about 1.7.
const NEW_ITEM_GAP = 1.45

// A line straight after a job's dates is its location when it sits closer
// than ordinary description lines do.
const LOCATION_GAP = 1.55

const DATE_LINE = /^(.+?)\s+-\s+(.+?)(?:\s*\([^)]*\))?$/

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.3
}

function mostCommonSize(lines: TextLine[]): number {
  const counts = new Map<number, number>()
  for (const l of lines) counts.set(l.size, (counts.get(l.size) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
}

// Vertical gap from one line to the next, or null across a page break where
// the gap means nothing.
function gap(a: TextLine, b: TextLine): number | null {
  return a.page === b.page ? a.y - b.y : null
}

// Joins wrapped lines back into one string. A line ending in a hyphen or a
// slash with no space before it was broken mid word, like "human-" then
// "feedback" or "UI/" then "UX", so no space goes in. A spaced dash is
// punctuation and keeps its space.
export function joinWrapped(texts: string[]): string {
  let out = ''
  for (const t of texts) {
    if (!out) out = t
    else if (/\S[-/]$/.test(out) && !t.startsWith('•')) out += t
    else out += ` ${t}`
  }
  return out.trim()
}

interface Section {
  title: string
  lines: TextLine[]
}

function sections(lines: TextLine[], isHeading: (l: TextLine) => boolean): Section[] {
  const out: Section[] = []
  for (const l of lines) {
    if (isHeading(l)) out.push({ title: l.text, lines: [] })
    else out[out.length - 1]?.lines.push(l)
  }
  return out
}

// Splits sidebar lines into items by the gaps between them.
function items(lines: TextLine[]): TextLine[][] {
  const out: TextLine[][] = []
  for (const l of lines) {
    const last = out[out.length - 1]
    const prev = last?.[last.length - 1]
    const g = prev ? gap(prev, l) : null
    if (last && g !== null && g <= NEW_ITEM_GAP * l.size) last.push(l)
    else out.push([l])
  }
  return out
}

export function parseProfileLines(all: TextLine[], options: ImportOptions = {}): ImportResult {
  const warnings: string[] = []
  const lines = all.filter((l) => !/^Page \d+ of \d+$/i.test(l.text))
  const main = lines.filter((l) => l.column === 'main')
  const side = lines.filter((l) => l.column === 'side')

  const known = main.filter((l) => READ_MAIN.includes(l.text))
  const headingSize = known[0]?.size
  if (headingSize === undefined || !known.some((l) => l.text === 'Experience' || l.text === 'Education')) {
    throw new ExportError(
      "This PDF doesn't look like a LinkedIn profile saved in English. Please use the data export zip instead, which works in any language.",
    )
  }
  const nameLine = main.filter((l) => l.page === 1).sort((a, b) => b.size - a.size)[0]
  if (!nameLine || nameLine.size <= headingSize) {
    throw new ExportError("We could not find your name in this PDF, so its layout is not one we recognise. Please use the data export zip instead.")
  }

  const ids = new IdMaker()
  const date = (raw: string): YearMonth | null => {
    const parsed = parseDate(raw)
    if (raw && !parsed && !/present/i.test(raw)) warnings.push(`Profile.pdf has a date we could not read, "${raw}". It was left blank.`)
    return parsed
  }

  // Everything between the name and the first heading is the headline,
  // which can wrap, then the location on its own last line.
  const firstHeadingAt = main.findIndex((l) => near(l.size, headingSize))
  const header = main.slice(main.indexOf(nameLine) + 1, firstHeadingAt === -1 ? undefined : firstHeadingAt)
  const location = header.length > 1 ? header[header.length - 1]!.text : ''
  const headlineText = joinWrapped((header.length > 1 ? header.slice(0, -1) : header).map((l) => l.text))

  const nameParts = nameLine.text.split(' ')
  const profile: Profile = {
    ...emptyProfile(),
    firstName: nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameLine.text,
    lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1]! : '',
    location,
    headline: headlineText ? { id: ids.make('headline', headlineText), source: SOURCE, text: headlineText } : null,
  }

  for (const section of sections(main.slice(Math.max(firstHeadingAt, 0)), (l) => near(l.size, headingSize))) {
    if (section.title === 'Summary') {
      profile.summary = pointsFor(ids, 'summary', SOURCE, joinWrapped(section.lines.map((l) => l.text)))
    } else if (section.title === 'Experience') {
      profile.positions = experience(section.lines, ids, date)
    } else if (section.title === 'Education') {
      profile.education = education(section.lines, ids, date)
    } else if (section.lines.length > 0) {
      warnings.push(`The "${section.title}" section of the PDF is not read yet. The data export zip includes it.`)
    }
  }

  let pdfEmail = ''
  const sideHeading = side.find((l) => SIDE_HEADINGS.includes(l.text))
  if (sideHeading) {
    for (const section of sections(side, (l) => near(l.size, sideHeading.size) && SIDE_HEADINGS.includes(l.text))) {
      const groups = items(section.lines)
      const text = (g: TextLine[]) => joinWrapped(g.map((l) => l.text))
      if (section.title === 'Contact') {
        const contact = readContact(section.lines)
        pdfEmail = contact.email
        profile.websites = contact.websites
      } else if (section.title === 'Top Skills') {
        profile.skills = groups.map((g): Named => ({ id: ids.make('skill', text(g)), source: SOURCE, name: text(g) }))
      } else if (section.title === 'Languages') {
        profile.languages = groups.map((g) => {
          const m = /^(.*?)\s*\(([^)]*)\)$/.exec(text(g))
          const name = m ? m[1]! : text(g)
          return { id: ids.make('language', name), source: SOURCE, name, proficiency: m ? m[2]! : '' }
        })
      } else if (section.title === 'Certifications') {
        profile.certifications = groups.map(
          (g): Certification => ({
            id: ids.make('certification', text(g), '', ''),
            source: SOURCE,
            name: text(g),
            authority: '',
            url: '',
            licenceNumber: '',
            issued: null,
            expires: null,
          }),
        )
      } else if (section.title === 'Honors-Awards') {
        profile.honors = groups.map((g) => ({ id: ids.make('honor', text(g), ''), source: SOURCE, title: text(g), issuer: '', issued: null, points: [] }))
      } else if (section.title === 'Publications') {
        profile.publications = groups.map((g) => ({
          id: ids.make('publication', text(g), ''),
          source: SOURCE,
          title: text(g),
          publisher: '',
          url: '',
          published: null,
          points: [],
        }))
      }
    }
  }

  const choice = options.email ?? { from: 'export' }
  profile.email = choice.from === 'user' ? typedEmail(choice.value, warnings) : pdfEmail

  return {
    profile,
    emailFrom: profile.email ? choice.from : null,
    warnings,
    filesRead: [SOURCE],
    format: 'pdf',
  }
}

// The contact block holds a phone number, an email address split across
// lines, and links with a label in brackets on the same or the next line.
// Gaps between these are too uneven to split on, so it is read line by line.
// The phone number is never read, the same as with the data export.
function readContact(lines: TextLine[]): { email: string; websites: Website[] } {
  let email = ''
  let emailDone = false
  let pending: string[] = []
  const websites: Website[] = []

  for (const l of lines) {
    const text = l.text.trim()
    const label = /\(([^)]+)\)\s*$/.exec(text)?.[1] ?? ''

    if (/mobile|home|work|phone|fax/i.test(label)) continue

    // The email starts at the line with an @ and continues until it is a
    // whole address, as in "name@gmail" followed by ".com".
    if (!emailDone && (text.includes('@') || (email && /^[^\s()]+$/.test(text)))) {
      email += text
      if (looksLikeEmail(email)) emailDone = true
      continue
    }

    pending.push(text.replace(/\s*\([^)]*\)\s*$/, ''))
    if (!label) continue
    const url = pending.join('').replace(/\s+/g, '')
    pending = []
    // A LinkedIn profile link is not in the data export's websites either,
    // and leaving it out keeps the two imports matching.
    if (/linkedin/i.test(label)) continue
    if (!/^[\w.-]+\.[a-z]{2,}(\/\S*)?$|^https?:\/\//i.test(url)) continue
    websites.push({ label: label.toLowerCase(), url: /^https?:\/\//i.test(url) ? url : `https://${url}` })
  }
  return { email: emailDone ? email : '', websites }
}

interface Role {
  company: string
  title: TextLine
  dates: string | null
  location: string
  description: TextLine[]
}

// Companies are the largest text in the section. A company with several
// roles has a line for its total time there, then each role's title, which
// sits between company and body text in size.
function experience(lines: TextLine[], ids: IdMaker, date: (raw: string) => YearMonth | null): Position[] {
  if (lines.length === 0) return []
  const body = mostCommonSize(lines)
  const companySize = Math.max(...lines.map((l) => l.size))
  const titleSize = lines.find((l) => l.size < companySize - 0.2 && l.size > body + 0.2)?.size ?? null

  const roles: Role[] = []
  let company = ''
  let role: Role | null = null
  let afterDates: TextLine | null = null

  for (const l of lines) {
    if (near(l.size, companySize)) {
      company = l.text
      role = null
      continue
    }
    if (titleSize !== null && near(l.size, titleSize)) {
      role = { company, title: l, dates: null, location: '', description: [] }
      roles.push(role)
      afterDates = null
      continue
    }
    // Before the first title of a company, body lines are its total time
    // there, which is not needed.
    if (!role) continue

    if (role.dates === null && role.description.length === 0 && !role.location && DATE_LINE.test(l.text)) {
      role.dates = l.text
      afterDates = l
      continue
    }
    if (afterDates && !role.location && role.description.length === 0) {
      const g = gap(afterDates, l)
      const looksLikePlace = !l.text.startsWith('•') && l.text.length < 80 && !/[.!?]$/.test(l.text)
      afterDates = null
      if (looksLikePlace && (g === null || g <= LOCATION_GAP * l.size)) {
        role.location = l.text
        continue
      }
    }
    role.description.push(l)
  }

  return roles.map((r) => {
    const m = r.dates ? DATE_LINE.exec(r.dates) : null
    const started = m ? m[1]!.trim() : ''
    const finished = m ? m[2]!.trim() : ''
    const id = positionId(ids, r.company, r.title.text, started)
    return {
      id,
      source: SOURCE,
      company: r.company,
      title: r.title.text,
      location: r.location,
      start: date(started),
      end: /present/i.test(finished) ? null : date(finished),
      current: /present/i.test(finished),
      points: pointsFor(ids, id, SOURCE, joinWrapped(r.description.map((l) => l.text))),
    }
  })
}

// Each school is followed by one line, sometimes wrapped, holding the degree
// and the dates: "Master of Science - MSc, Data Science · (2025 - 2026)".
function education(lines: TextLine[], ids: IdMaker, date: (raw: string) => YearMonth | null): Education[] {
  if (lines.length === 0) return []
  const schoolSize = Math.max(...lines.map((l) => l.size))
  const entries: { school: string; rest: TextLine[] }[] = []
  for (const l of lines) {
    if (near(l.size, schoolSize)) entries.push({ school: l.text, rest: [] })
    else entries[entries.length - 1]?.rest.push(l)
  }

  return entries.map((e) => {
    const joined = joinWrapped(e.rest.map((l) => l.text))
    const m = /^(.*?)\s*·\s*\(([^)]*)\)\s*(.*)$/.exec(joined)
    const degree = m ? m[1]!.trim() : joined
    const [started = '', finished = ''] = m ? m[2]!.split(/\s+-\s+/) : []
    const id = educationId(ids, e.school, degree, started)
    return {
      id,
      source: SOURCE,
      school: e.school,
      degree,
      start: date(started),
      end: date(finished),
      points: m && m[3] ? pointsFor(ids, id, SOURCE, m[3]) : [],
    }
  })
}
