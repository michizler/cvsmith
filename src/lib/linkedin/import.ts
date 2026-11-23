// Turns a LinkedIn data export zip into a Profile.
//
// Runs entirely in the browser. The zip never leaves the user's machine.

import { unzipSync } from 'fflate'
import { IdMaker } from '../ids'
import type { Evidence, Profile, Website } from '../profile'
import { cell, normaliseHeader, toRows, type Row } from './csv'
import { parseDate, type YearMonth } from './dates'
import { educationId, looksLikeEmail, pointsFor, positionId, typedEmail, type EmailChoice } from './shared'

export { looksLikeEmail, type EmailChoice }

// The only files ever unpacked. An export also holds private messages,
// connections, phone numbers and payment receipts. None of that belongs on a
// CV, so it is left compressed and never read.
export const PROFILE_FILES = [
  'Profile.csv',
  'Positions.csv',
  'Education.csv',
  'Skills.csv',
  'Certifications.csv',
  'Projects.csv',
  'Volunteering.csv',
  'Languages.csv',
  'Courses.csv',
  'Honors.csv',
  'Publications.csv',
  'Recommendations_Received.csv',
  'Email Addresses.csv',
] as const

type ProfileFile = (typeof PROFILE_FILES)[number]

// Other names the same file has been seen under in exports from other
// accounts and years. We have not seen these in a real export ourselves, so
// they are matched but nothing else is assumed about them.
const FILE_ALIASES: Partial<Record<ProfileFile, string[]>> = {
  'Volunteering.csv': ['Volunteering_Experiences.csv', 'Volunteer Experience.csv'],
}

// Profile files are a few kilobytes. Anything this big is not one of them,
// and inflating it would only stall the tab.
const MAX_FILE_BYTES = 5 * 1024 * 1024

// Seeing at least one of these is how we tell an export from any other zip.
const CORE_FILES: ProfileFile[] = ['Profile.csv', 'Positions.csv', 'Education.csv', 'Skills.csv']

export class ExportError extends Error {
  override name = 'ExportError'
}

export interface ImportOptions {
  email?: EmailChoice
}

export interface ImportResult {
  profile: Profile
  // Null when the export had no email and none was typed.
  emailFrom: 'export' | 'user' | null
  // Plain sentences the review screen can show as they are.
  warnings: string[]
  filesRead: string[]
  // Set when the profile came from the "Save to PDF" file rather than the
  // data export. The PDF holds much less, and the review screen says so.
  format?: 'pdf'
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function profileFileFor(path: string): ProfileFile | undefined {
  const name = baseName(path).toLowerCase()
  return PROFILE_FILES.find(
    (f) => f.toLowerCase() === name || (FILE_ALIASES[f] ?? []).some((a) => a.toLowerCase() === name),
  )
}

export function isProfileFile(path: string): boolean {
  return profileFileFor(path) !== undefined
}

function checkLooksLikeZip(bytes: Uint8Array): void {
  const head = String.fromCharCode(...bytes.subarray(0, 4))
  if (head === 'PK\x03\x04' || head === 'PK\x05\x06') return
  if (head === '%PDF') {
    throw new ExportError(
      'This is a PDF. Please upload the data export zip from LinkedIn instead.',
    )
  }
  throw new ExportError(
    "This file isn't a zip. Please upload the data export LinkedIn emailed you, without unzipping it.",
  )
}

// LinkedIn writes websites as "[PERSONAL:https://example.com]", with more
// than one inside the same brackets when there are several.
function parseWebsites(raw: string): Website[] {
  const found: Website[] = []
  for (const m of raw.matchAll(/(?:([A-Za-z_]+):)?(https?:\/\/[^\s,\]]+)/g)) {
    found.push({ label: (m[1] ?? '').toLowerCase(), url: m[2]! })
  }
  return found
}

export function readLinkedInExport(zip: Uint8Array, options: ImportOptions = {}): ImportResult {
  checkLooksLikeZip(zip)
  const warnings: string[] = []
  const emailChoice = options.email ?? { from: 'export' }

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(zip, {
      filter: (file) => {
        const which = profileFileFor(file.name)
        if (!which) return false
        if (which === 'Email Addresses.csv' && emailChoice.from === 'user') return false
        if (file.originalSize > MAX_FILE_BYTES) {
          warnings.push(`${baseName(file.name)} is far too large to be profile data, so it was skipped.`)
          return false
        }
        return true
      },
    })
  } catch {
    throw new ExportError(
      'This zip could not be opened. It may be damaged or only partly downloaded. Try downloading the export from LinkedIn again.',
    )
  }

  const decoder = new TextDecoder('utf-8')
  const texts = new Map<ProfileFile, string>()
  for (const [path, bytes] of Object.entries(entries)) {
    const file = profileFileFor(path)
    if (file && !texts.has(file)) texts.set(file, decoder.decode(bytes))
  }

  if (!CORE_FILES.some((f) => texts.has(f))) {
    throw new ExportError(
      "This zip doesn't look like a LinkedIn data export. It has none of the profile files we expected, such as Profile.csv or Positions.csv.",
    )
  }

  // Files that are missing are treated as empty sections. LinkedIn leaves
  // out files for sections the user never filled in.
  // Each required entry can list several spellings of one column. Any of
  // them will do.
  const table = (file: ProfileFile, required: (string | string[])[]): Row[] => {
    const text = texts.get(file)
    if (text === undefined) return []
    const { headers, rows } = toRows(text)
    const missing = required
      .map((r) => (Array.isArray(r) ? r : [r]))
      .filter((names) => !names.some((n) => headers.includes(normaliseHeader(n))))
      .map((names) => names[0])
    if (missing.length > 0) {
      warnings.push(
        `${file} is missing the ${missing.join(' and ')} column, so it was skipped. LinkedIn may have changed its export format.`,
      )
      return []
    }
    return rows
  }

  const date = (file: ProfileFile, raw: string): YearMonth | null => {
    const parsed = parseDate(raw)
    if (raw && !parsed) warnings.push(`${file} has a date we could not read, "${raw}". It was left blank.`)
    return parsed
  }

  const ids = new IdMaker()
  const points = (parentId: string, source: ProfileFile, text: string): Evidence[] => pointsFor(ids, parentId, source, text)

  // Profile.csv also carries birth date, postal address, postcode and maiden
  // name. They are deliberately not read. A CV does not need them and the
  // less personal data we hold, the less there is to leak.
  const about = table('Profile.csv', ['First Name'])[0]
  const headline = about ? cell(about, 'Headline') : ''

  let email = ''
  if (emailChoice.from === 'user') {
    email = typedEmail(emailChoice.value, warnings)
  } else {
    const emails = table('Email Addresses.csv', ['Email Address'])
    const primary =
      emails.find((r) => cell(r, 'Primary').toLowerCase() === 'yes') ??
      emails.find((r) => cell(r, 'Confirmed').toLowerCase() === 'yes') ??
      emails[0]
    email = primary ? cell(primary, 'Email Address') : ''
  }
  const emailFrom = email ? emailChoice.from : null

  const profile: Profile = {
    firstName: about ? cell(about, 'First Name') : '',
    lastName: about ? cell(about, 'Last Name') : '',
    location: about ? cell(about, 'Geo Location') : '',
    email,
    websites: about ? parseWebsites(cell(about, 'Websites')) : [],
    headline: headline ? { id: ids.make('headline', headline), source: 'Profile.csv', text: headline } : null,
    summary: about ? points('summary', 'Profile.csv', cell(about, 'Summary')) : [],

    positions: table('Positions.csv', ['Title']).flatMap((r) => {
      const source = 'Positions.csv'
      const company = cell(r, 'Company Name')
      const title = cell(r, 'Title')
      if (!company && !title) return []
      const started = cell(r, 'Started On', 'Start Date')
      const finished = cell(r, 'Finished On', 'End Date')
      const id = positionId(ids, company, title, started)
      return [
        {
          id,
          source,
          company,
          title,
          location: cell(r, 'Location'),
          start: date(source, started),
          end: date(source, finished),
          current: finished === '',
          points: points(id, source, cell(r, 'Description')),
        },
      ]
    }),

    education: table('Education.csv', ['School Name']).flatMap((r) => {
      const source = 'Education.csv'
      const school = cell(r, 'School Name')
      if (!school) return []
      const degree = cell(r, 'Degree Name')
      const started = cell(r, 'Start Date', 'Started On')
      const id = educationId(ids, school, degree, started)
      return [
        {
          id,
          source,
          school,
          degree,
          start: date(source, started),
          end: date(source, cell(r, 'End Date', 'Finished On')),
          points: [...points(id, source, cell(r, 'Notes')), ...points(id, source, cell(r, 'Activities'))],
        },
      ]
    }),

    certifications: table('Certifications.csv', ['Name']).flatMap((r) => {
      const source = 'Certifications.csv'
      const name = cell(r, 'Name')
      if (!name) return []
      const authority = cell(r, 'Authority')
      const issued = cell(r, 'Started On')
      return [
        {
          id: ids.make('certification', name, authority, issued),
          source,
          name,
          authority,
          url: cell(r, 'Url'),
          licenceNumber: cell(r, 'License Number'),
          // For certificates a blank end date means it does not expire,
          // not that it is ongoing.
          issued: date(source, issued),
          expires: date(source, cell(r, 'Finished On')),
        },
      ]
    }),

    projects: table('Projects.csv', ['Title']).flatMap((r) => {
      const source = 'Projects.csv'
      const title = cell(r, 'Title')
      if (!title) return []
      const started = cell(r, 'Started On')
      const id = ids.make('project', title, started)
      return [
        {
          id,
          source,
          title,
          url: cell(r, 'Url'),
          start: date(source, started),
          end: date(source, cell(r, 'Finished On')),
          points: points(id, source, cell(r, 'Description')),
        },
      ]
    }),

    volunteering: table('Volunteering.csv', ['Role']).flatMap((r) => {
      const source = 'Volunteering.csv'
      const organisation = cell(r, 'Company Name', 'Organization')
      const role = cell(r, 'Role')
      if (!organisation && !role) return []
      const started = cell(r, 'Started On', 'Start Date')
      const id = ids.make('volunteering', organisation, role, started)
      return [
        {
          id,
          source,
          organisation,
          role,
          cause: cell(r, 'Cause'),
          start: date(source, started),
          end: date(source, cell(r, 'Finished On', 'End Date')),
          points: points(id, source, cell(r, 'Description')),
        },
      ]
    }),

    skills: table('Skills.csv', ['Name']).flatMap((r) => {
      const name = cell(r, 'Name')
      return name ? [{ id: ids.make('skill', name), source: 'Skills.csv', name }] : []
    }),

    languages: table('Languages.csv', ['Name']).flatMap((r) => {
      const name = cell(r, 'Name')
      return name
        ? [{ id: ids.make('language', name), source: 'Languages.csv', name, proficiency: cell(r, 'Proficiency') }]
        : []
    }),

    courses: table('Courses.csv', ['Name']).flatMap((r) => {
      const name = cell(r, 'Name')
      return name ? [{ id: ids.make('course', name), source: 'Courses.csv', name }] : []
    }),

    // We have no real export with honors or publications in it, so the
    // column names come from other open source importers, which do not fully
    // agree. Every spelling they use is accepted. If none match, the file is
    // skipped with a warning rather than read wrongly.
    honors: table('Honors.csv', [['Title', 'Name']]).flatMap((r) => {
      const source = 'Honors.csv'
      const title = cell(r, 'Title', 'Name')
      if (!title) return []
      const issued = cell(r, 'Issued On', 'Issued Date', 'Date')
      const id = ids.make('honor', title, issued)
      return [
        {
          id,
          source,
          title,
          issuer: cell(r, 'Issuer', 'Issued By'),
          issued: date(source, issued),
          points: points(id, source, cell(r, 'Description')),
        },
      ]
    }),

    publications: table('Publications.csv', [['Name', 'Title']]).flatMap((r) => {
      const source = 'Publications.csv'
      const title = cell(r, 'Name', 'Title')
      if (!title) return []
      const published = cell(r, 'Published On', 'Date Published', 'Date')
      const id = ids.make('publication', title, published)
      return [
        {
          id,
          source,
          title,
          publisher: cell(r, 'Publisher'),
          url: cell(r, 'Url', 'URL'),
          published: date(source, published),
          points: points(id, source, cell(r, 'Description')),
        },
      ]
    }),

    repos: [],

    // Recommendations the user hid on LinkedIn stay hidden here too.
    recommendations: table('Recommendations_Received.csv', ['Text']).flatMap((r) => {
      const text = cell(r, 'Text')
      const status = cell(r, 'Status').toUpperCase()
      if (!text || (status && status !== 'VISIBLE')) return []
      return [
        {
          author: [cell(r, 'First Name'), cell(r, 'Last Name')].filter(Boolean).join(' '),
          authorTitle: cell(r, 'Job Title'),
          company: cell(r, 'Company'),
          text,
          date: date('Recommendations_Received.csv', cell(r, 'Creation Date')),
        },
      ]
    }),
  }

  return { profile, emailFrom, warnings, filesRead: PROFILE_FILES.filter((f) => texts.has(f)) }
}
