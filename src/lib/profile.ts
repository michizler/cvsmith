// The profile shape that everything after import works from.
//
// Anything a CV line could rest on has an evidence id. That covers each role,
// degree, skill and certificate, and each separate point inside a
// description. Contact details and recommendations have no id, because they
// are not claims about the user's own work.

import { formatYearMonth, type YearMonth } from './linkedin/dates'

export interface Evidence {
  id: string
  // Where the text came from, such as an export file or a GitHub repo, so
  // the review screen can say where every fact was found.
  source: string
  text: string
  // True when the user changed the wording after import. The fact check
  // still accepts it, since the user wrote the LinkedIn text too, but the
  // review screen and any report say so plainly.
  edited?: boolean
  // Only set for GitHub facts. "observed" is something GitHub itself records,
  // like a repo's main language or a commit count. "stated" is text the user
  // wrote, like a README. READMEs can claim more than the code shows, so the
  // CV writer prefers observed facts when both would do.
  basis?: 'observed' | 'stated'
}

export interface Repo {
  id: string
  source: string
  fullName: string
  url: string
  homepage: string
  // "owner" for the user's own repos. "contributor" for someone else's repo
  // where GitHub lists the user as a contributor.
  relation: 'owner' | 'contributor'
  archived: boolean
  created: YearMonth | null
  lastPush: YearMonth | null
  description: Evidence[]
  // Things GitHub records, such as language, topics and commit counts.
  observed: Evidence[]
  readme: Evidence[]
}

export interface Website {
  // LinkedIn's own label, lower case, for example "personal" or "company".
  label: string
  url: string
}

export interface Position {
  id: string
  source: string
  company: string
  title: string
  location: string
  start: YearMonth | null
  end: YearMonth | null
  current: boolean
  points: Evidence[]
}

export interface Education {
  id: string
  source: string
  school: string
  degree: string
  start: YearMonth | null
  end: YearMonth | null
  points: Evidence[]
}

export interface Certification {
  id: string
  source: string
  name: string
  authority: string
  url: string
  licenceNumber: string
  issued: YearMonth | null
  expires: YearMonth | null
}

export interface Project {
  id: string
  source: string
  title: string
  url: string
  start: YearMonth | null
  end: YearMonth | null
  points: Evidence[]
}

export interface Volunteering {
  id: string
  source: string
  organisation: string
  role: string
  cause: string
  start: YearMonth | null
  end: YearMonth | null
  points: Evidence[]
}

export interface Honor {
  id: string
  source: string
  title: string
  issuer: string
  issued: YearMonth | null
  points: Evidence[]
}

export interface Publication {
  id: string
  source: string
  title: string
  publisher: string
  url: string
  published: YearMonth | null
  points: Evidence[]
}

export interface Named {
  id: string
  source: string
  name: string
}

export interface Language extends Named {
  proficiency: string
}

export interface Recommendation {
  author: string
  authorTitle: string
  company: string
  text: string
  date: YearMonth | null
}

export interface Profile {
  firstName: string
  lastName: string
  location: string
  email: string
  websites: Website[]
  headline: Evidence | null
  summary: Evidence[]
  positions: Position[]
  education: Education[]
  certifications: Certification[]
  projects: Project[]
  volunteering: Volunteering[]
  skills: Named[]
  languages: Language[]
  courses: Named[]
  honors: Honor[]
  publications: Publication[]
  // Filled from GitHub, not from the LinkedIn export, and empty until the
  // user adds their GitHub.
  repos: Repo[]
  // Shown for context only and never cited. They are someone else's words
  // about the user. See docs/DECISIONS.md.
  recommendations: Recommendation[]
}

export function emptyProfile(): Profile {
  return {
    firstName: '',
    lastName: '',
    location: '',
    email: '',
    websites: [],
    headline: null,
    summary: [],
    positions: [],
    education: [],
    certifications: [],
    projects: [],
    volunteering: [],
    skills: [],
    languages: [],
    courses: [],
    honors: [],
    publications: [],
    repos: [],
    recommendations: [],
  }
}

export function formatSpan(start: YearMonth | null, end: YearMonth | null, current = false): string {
  if (!start && !end) return ''
  const from = start ? formatYearMonth(start) : ''
  const to = end ? formatYearMonth(end) : current ? 'present' : ''
  return from && to ? `${from} to ${to}` : from || to
}

function line(...parts: string[]): string {
  return parts.filter(Boolean).join(', ')
}

// Every citable fact, keyed by id. Top level facts get a one line rendering
// of their fields, so the fact check can match employers, titles and dates
// against the same kind of text it matches points against.
export function evidenceIndex(p: Profile): Map<string, Evidence> {
  const index = new Map<string, Evidence>()
  const add = (e: Evidence) => index.set(e.id, e)
  const fact = (id: string, source: string, text: string) => add({ id, source, text })

  if (p.headline) add(p.headline)
  p.summary.forEach(add)

  for (const x of p.positions) {
    fact(x.id, x.source, line(x.title, x.company, x.location, formatSpan(x.start, x.end, x.current)))
    x.points.forEach(add)
  }
  for (const x of p.education) {
    fact(x.id, x.source, line(x.degree, x.school, formatSpan(x.start, x.end)))
    x.points.forEach(add)
  }
  for (const x of p.certifications) {
    const issued = x.issued ? `issued ${formatYearMonth(x.issued)}` : ''
    fact(x.id, x.source, line(x.name, x.authority, issued))
  }
  for (const x of p.projects) {
    fact(x.id, x.source, line(x.title, formatSpan(x.start, x.end)))
    x.points.forEach(add)
  }
  for (const x of p.volunteering) {
    fact(x.id, x.source, line(x.role, x.organisation, x.cause, formatSpan(x.start, x.end)))
    x.points.forEach(add)
  }
  for (const x of p.skills) fact(x.id, x.source, x.name)
  for (const x of p.languages) fact(x.id, x.source, x.proficiency ? `${x.name} (${x.proficiency})` : x.name)
  for (const x of p.courses) fact(x.id, x.source, x.name)
  for (const x of p.honors) {
    fact(x.id, x.source, line(x.title, x.issuer, x.issued ? formatYearMonth(x.issued) : ''))
    x.points.forEach(add)
  }
  for (const x of p.publications) {
    fact(x.id, x.source, line(x.title, x.publisher, x.published ? formatYearMonth(x.published) : ''))
    x.points.forEach(add)
  }
  for (const x of p.repos ?? []) {
    const kind = x.relation === 'owner' ? 'GitHub repository' : 'GitHub repository, as a contributor'
    add({ id: x.id, source: x.source, text: line(x.fullName, kind, formatSpan(x.created, x.lastPush)), basis: 'observed' })
    x.description.forEach(add)
    x.observed.forEach(add)
    x.readme.forEach(add)
  }

  return index
}
