// What cvsmith keeps in the browser between visits: the last LinkedIn import,
// the GitHub data, the user's changes to both and their contact details.

import { emptyEdits, pruneEdits, type Edits } from './edits'
import type { GitHubData } from './github/import'
import type { ImportResult } from './linkedin/import'
import type { Profile } from './profile'
import { load, remove, save } from './storage'

// Bump this when the saved shape changes, and teach upgrade() to read the
// old shape. Losing someone's edits to a version bump is not acceptable.
const VERSION = 2
const KEY = 'profile'

export interface Contact {
  firstName: string
  lastName: string
  email: string
  phone: string
  location: string
}

export interface SavedProfile {
  version: typeof VERSION
  importedAt: string
  result: ImportResult
  github: GitHubData | null
  // One set of changes covers LinkedIn and GitHub facts alike, since both
  // are keyed by evidence id.
  edits: Edits
  // Only the fields the user changed. Everything else comes from the import,
  // so a newer export can still update them.
  contact: Partial<Contact>
}

// LinkedIn facts and GitHub repos together, which is what the review screen
// and everything after it work from.
export function profileOf(saved: SavedProfile): Profile {
  return { ...saved.result.profile, repos: saved.github?.repos ?? [] }
}

export function contactOf(saved: SavedProfile): Contact & { emailFrom: 'export' | 'user' | null } {
  const p = saved.result.profile
  const c = saved.contact
  return {
    firstName: c.firstName ?? p.firstName,
    lastName: c.lastName ?? p.lastName,
    email: c.email ?? p.email,
    phone: c.phone ?? '',
    location: c.location ?? p.location,
    emailFrom: c.email !== undefined ? 'user' : saved.result.emailFrom,
  }
}

export function fresh(result: ImportResult, now = new Date()): SavedProfile {
  return { version: VERSION, importedAt: now.toISOString(), result, github: null, edits: emptyEdits(), contact: {} }
}

// A newer export replaces the old one. The user's changes carry over where
// their facts still exist, and GitHub data is kept as it is. The email
// follows whatever was chosen on this upload, so an earlier hand edit to it
// is let go.
export function replaceImport(
  old: SavedProfile,
  result: ImportResult,
  now = new Date(),
): { saved: SavedProfile; dropped: number } {
  const next: SavedProfile = { ...fresh(result, now), github: old.github }
  const { edits, dropped } = pruneEdits(old.edits, profileOf(next))
  const { email: _, ...contact } = old.contact
  return { saved: { ...next, edits, contact }, dropped }
}

// The same idea for GitHub. Passing null removes GitHub altogether, along
// with any changes made to its facts.
export function replaceGitHub(old: SavedProfile, github: GitHubData | null): { saved: SavedProfile; dropped: number } {
  const next: SavedProfile = { ...old, github }
  const { edits, dropped } = pruneEdits(old.edits, profileOf(next))
  return { saved: { ...next, edits }, dropped }
}

// Reads what an older version saved. Version 1 had no GitHub data, and
// profiles saved before honors and publications were read lack those lists.
interface Stored {
  version?: number
  importedAt?: string
  result?: ImportResult
  github?: GitHubData | null
  edits?: Edits
  contact?: Partial<Contact>
}

function upgrade(raw: unknown): SavedProfile | null {
  const s = raw as Stored | null
  if (!s || typeof s !== 'object' || !s.result?.profile || !s.edits) return null
  if (s.version !== 1 && s.version !== VERSION) return null
  const old: Partial<Profile> = s.result.profile
  const profile: Profile = { ...s.result.profile, honors: old.honors ?? [], publications: old.publications ?? [], repos: [] }
  return {
    version: VERSION,
    importedAt: s.importedAt ?? new Date().toISOString(),
    result: { ...s.result, profile },
    github: s.github ?? null,
    edits: s.edits,
    contact: s.contact ?? {},
  }
}

export function loadSaved(): SavedProfile | null {
  return upgrade(load<unknown>(KEY, null))
}

export function storeSaved(saved: SavedProfile): boolean {
  return save(KEY, saved)
}

export function forgetSaved(): void {
  remove(KEY)
}
